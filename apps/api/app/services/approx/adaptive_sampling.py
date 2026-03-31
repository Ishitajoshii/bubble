from __future__ import annotations

from dataclasses import dataclass
from math import sqrt
from statistics import NormalDist
from time import perf_counter
from typing import Literal

from app.schemas.dataset import DatasetSummary
from app.services.exact.duckdb_runner import run_cached_exact_query, stream_projection
from app.services.planner.parser import AdaptiveAggregateQuery

_INITIAL_BATCH_ROWS = 512
_BATCH_GROWTH_FACTOR = 1.75
_MIN_SAMPLE_CAP_ROWS = 2_048
_SAMPLE_CAP_FRACTION = 0.4


@dataclass(slots=True)
class AdaptiveSamplingSnapshot:
    iteration: int
    estimate: float
    relative_error: float
    sample_rows: int
    total_rows: int
    elapsed_ms: int


@dataclass(slots=True)
class AdaptiveSamplingResult:
    snapshots: list[AdaptiveSamplingSnapshot]
    stopped_reason: Literal["target_reached", "sample_cap"]


@dataclass(slots=True)
class _SampleAccumulator:
    sample_rows: int = 0
    sum_y: float = 0.0
    sum_y_sq: float = 0.0
    sum_x: float = 0.0
    sum_x_sq: float = 0.0
    sum_xy: float = 0.0

    def add(self, *, value: float, weight: float | None = None) -> None:
        self.sample_rows += 1
        self.sum_y += value
        self.sum_y_sq += value * value

        if weight is not None:
            self.sum_x += weight
            self.sum_x_sq += weight * weight
            self.sum_xy += value * weight


def run_adaptive_sampling(
    *,
    dataset: DatasetSummary,
    query: AdaptiveAggregateQuery,
    target_error: float,
    confidence_level: float,
    seed_material: str,
) -> AdaptiveSamplingResult:
    started_at = perf_counter()
    exact_count_result = _exact_count_fast_path(
        dataset=dataset,
        query=query,
        started_at=started_at,
    )
    if exact_count_result is not None:
        return exact_count_result

    total_rows, population_latency_ms = _resolve_population_rows(
        dataset=dataset,
        query=query,
    )

    if total_rows == 0:
        return AdaptiveSamplingResult(
            snapshots=[
                AdaptiveSamplingSnapshot(
                    iteration=1,
                    estimate=0.0,
                    relative_error=0.0,
                    sample_rows=0,
                    total_rows=0,
                    elapsed_ms=max(
                        population_latency_ms,
                        int((perf_counter() - started_at) * 1000),
                    ),
                )
            ],
            stopped_reason="target_reached",
        )

    sample_cap_rows = min(
        total_rows,
        max(_MIN_SAMPLE_CAP_ROWS, int(total_rows * _SAMPLE_CAP_FRACTION)),
    )
    sample_cap_rows = max(1, sample_cap_rows)

    z_value = NormalDist().inv_cdf((1 + confidence_level) / 2)
    accumulator = _SampleAccumulator()
    snapshots: list[AdaptiveSamplingSnapshot] = []

    batch_rows = min(sample_cap_rows, _INITIAL_BATCH_ROWS)
    sampling_sql = query.projection_sql()

    with stream_projection(dataset=dataset, projection_sql=sampling_sql) as projection_stream:
        while accumulator.sample_rows < sample_cap_rows:
            next_rows = min(batch_rows, sample_cap_rows - accumulator.sample_rows)
            projection_batch = projection_stream.fetch(next_rows)
            if len(projection_batch.rows) == 0:
                if accumulator.sample_rows == 0:
                    return AdaptiveSamplingResult(
                        snapshots=[
                            AdaptiveSamplingSnapshot(
                                iteration=1,
                                estimate=0.0,
                                relative_error=0.0,
                                sample_rows=0,
                                total_rows=total_rows,
                                elapsed_ms=max(
                                    population_latency_ms,
                                    int((perf_counter() - started_at) * 1000),
                                ),
                            )
                        ],
                        stopped_reason="target_reached",
                    )
                break

            _accumulate_projection_rows(
                query=query,
                projection=projection_batch,
                accumulator=accumulator,
            )
            estimate, relative_error = _estimate_with_error(
                aggregate_function=query.aggregate_function,
                accumulator=accumulator,
                total_rows=total_rows,
                z_value=z_value,
            )
            snapshots.append(
                AdaptiveSamplingSnapshot(
                    iteration=len(snapshots) + 1,
                    estimate=estimate,
                    relative_error=relative_error,
                    sample_rows=accumulator.sample_rows,
                    total_rows=total_rows,
                    elapsed_ms=population_latency_ms + projection_batch.latency_ms,
                )
            )

            if relative_error <= target_error:
                return AdaptiveSamplingResult(
                    snapshots=snapshots,
                    stopped_reason="target_reached",
                )

            if accumulator.sample_rows >= sample_cap_rows:
                break

            next_total = min(
                sample_cap_rows,
                max(
                    accumulator.sample_rows + _INITIAL_BATCH_ROWS,
                    int(accumulator.sample_rows * _BATCH_GROWTH_FACTOR),
                ),
            )
            batch_rows = max(1, next_total - accumulator.sample_rows)

    return AdaptiveSamplingResult(
        snapshots=snapshots,
        stopped_reason="sample_cap",
    )


def _accumulate_projection_rows(
    *, query: AdaptiveAggregateQuery, projection, accumulator: _SampleAccumulator
) -> None:
    column_positions = {
        column_name: index for index, column_name in enumerate(projection.column_names)
    }
    aggregate_position = (
        None if query.aggregate_column is None else column_positions[query.aggregate_column]
    )

    for row in projection.rows:
        if query.aggregate_function == "count":
            if aggregate_position is None:
                accumulator.add(value=1.0)
            else:
                aggregate_value = row[aggregate_position]
                accumulator.add(value=1.0 if aggregate_value is not None else 0.0)
            continue

        aggregate_value = row[aggregate_position] if aggregate_position is not None else None
        if query.aggregate_function == "sum":
            accumulator.add(
                value=0.0 if aggregate_value is None else float(aggregate_value)
            )
            continue

        include_row = aggregate_value is not None
        accumulator.add(
            value=float(aggregate_value) if include_row else 0.0,
            weight=1.0 if include_row else 0.0,
        )


def _estimate_with_error(
    *,
    aggregate_function: str,
    accumulator: _SampleAccumulator,
    total_rows: int,
    z_value: float,
) -> tuple[float, float]:
    if aggregate_function in {"count", "sum"}:
        return _estimate_total(
            accumulator=accumulator,
            total_rows=total_rows,
            z_value=z_value,
        )

    return _estimate_average(
        accumulator=accumulator,
        total_rows=total_rows,
        z_value=z_value,
    )


def _estimate_total(
    *, accumulator: _SampleAccumulator, total_rows: int, z_value: float
) -> tuple[float, float]:
    sample_rows = accumulator.sample_rows
    if sample_rows == 0:
        return 0.0, 1.0

    sample_mean = accumulator.sum_y / sample_rows
    estimate = total_rows * sample_mean

    if sample_rows == total_rows:
        return estimate, 0.0

    if sample_rows < 2:
        return estimate, 1.0

    sample_variance = _sample_variance_from_totals(
        sample_rows=sample_rows,
        value_sum=accumulator.sum_y,
        value_sum_sq=accumulator.sum_y_sq,
    )
    standard_error = total_rows * sqrt(
        max(0.0, (1 - sample_rows / total_rows) * sample_variance / sample_rows)
    )
    return estimate, _relative_error(estimate=estimate, margin=z_value * standard_error)


def _estimate_average(
    *,
    accumulator: _SampleAccumulator,
    total_rows: int,
    z_value: float,
) -> tuple[float, float]:
    sample_rows = accumulator.sample_rows
    if sample_rows == 0:
        return 0.0, 1.0

    denominator = accumulator.sum_x
    if denominator == 0:
        if sample_rows == total_rows:
            return 0.0, 0.0
        return 0.0, 1.0

    estimate = accumulator.sum_y / denominator

    if sample_rows == total_rows:
        return estimate, 0.0

    if sample_rows < 2:
        return estimate, 1.0

    mean_weight = denominator / sample_rows
    if mean_weight <= 0:
        return estimate, 1.0

    residual_sum_sq = (
        accumulator.sum_y_sq
        - (2 * estimate * accumulator.sum_xy)
        + (estimate * estimate * accumulator.sum_x_sq)
    )
    residual_variance = max(0.0, residual_sum_sq / (sample_rows - 1))
    standard_error = sqrt(
        max(
            0.0,
            (1 - sample_rows / total_rows)
            * residual_variance
            / (sample_rows * mean_weight * mean_weight),
        )
    )
    return estimate, _relative_error(estimate=estimate, margin=z_value * standard_error)


def _sample_variance_from_totals(
    *, sample_rows: int, value_sum: float, value_sum_sq: float
) -> float:
    if sample_rows < 2:
        return 0.0

    mean = value_sum / sample_rows
    return max(
        0.0,
        (value_sum_sq - (sample_rows * mean * mean)) / (sample_rows - 1),
    )


def _resolve_population_rows(
    *, dataset: DatasetSummary, query: AdaptiveAggregateQuery
) -> tuple[int, int]:
    if not query.filters:
        return dataset.row_count, 0

    result = run_cached_exact_query(dataset=dataset, sql=query.population_sql())
    return max(0, int(round(result.value))), result.latency_ms


def _exact_count_fast_path(
    *,
    dataset: DatasetSummary,
    query: AdaptiveAggregateQuery,
    started_at: float,
) -> AdaptiveSamplingResult | None:
    if query.aggregate_function != "count":
        return None

    if query.aggregate_column is None and not query.filters:
        total_rows = dataset.row_count
        return AdaptiveSamplingResult(
            snapshots=[
                AdaptiveSamplingSnapshot(
                    iteration=1,
                    estimate=float(total_rows),
                    relative_error=0.0,
                    sample_rows=0,
                    total_rows=total_rows,
                    elapsed_ms=max(1, int((perf_counter() - started_at) * 1000)),
                )
            ],
            stopped_reason="target_reached",
        )

    result = run_cached_exact_query(dataset=dataset, sql=query.exact_sql())
    exact_value = max(0.0, result.value)
    total_rows = max(1, int(round(exact_value)))
    return AdaptiveSamplingResult(
        snapshots=[
            AdaptiveSamplingSnapshot(
                iteration=1,
                estimate=exact_value,
                relative_error=0.0,
                sample_rows=total_rows,
                total_rows=total_rows,
                elapsed_ms=result.latency_ms,
            )
        ],
        stopped_reason="target_reached",
    )


def _relative_error(*, estimate: float, margin: float) -> float:
    if margin <= 0:
        return 0.0

    absolute_estimate = abs(estimate)
    if absolute_estimate <= 1e-9:
        return 1.0

    return margin / absolute_estimate
