from __future__ import annotations

from dataclasses import dataclass, field
from statistics import NormalDist
from time import perf_counter
from typing import Literal

from app.schemas.dataset import DatasetSummary
from app.services.approx.adaptive_sampling import (
    _SampleAccumulator,
    _estimate_with_error,
)
from app.services.exact.duckdb_runner import GroupPopulation, ProjectionBatch, stream_projection
from app.services.planner.parser import AdaptiveAggregateQuery

_INITIAL_BATCH_ROWS = 512
_BATCH_GROWTH_FACTOR = 1.75
_MIN_SAMPLE_CAP_ROWS = 2_048
_SAMPLE_CAP_FRACTION = 0.4


@dataclass(slots=True)
class StratifiedGroupSnapshot:
    group_value: object
    estimate: float
    relative_error: float
    sample_rows: int
    population_rows: int


@dataclass(slots=True)
class StratifiedSamplingSnapshot:
    iteration: int
    group_estimates: list[StratifiedGroupSnapshot]
    relative_error: float
    sample_rows: int
    total_rows: int
    elapsed_ms: int


@dataclass(slots=True)
class StratifiedSamplingResult:
    snapshots: list[StratifiedSamplingSnapshot]
    stopped_reason: Literal["target_reached", "sample_cap"]


@dataclass(slots=True)
class _StratumAccumulator:
    group_value: object
    population_rows: int
    accumulator: _SampleAccumulator = field(default_factory=_SampleAccumulator)
    estimate: float = 0.0
    relative_error: float = 1.0


def run_stratified_sampling(
    *,
    dataset: DatasetSummary,
    query: AdaptiveAggregateQuery,
    group_populations: list[GroupPopulation],
    target_error: float,
    confidence_level: float,
) -> StratifiedSamplingResult:
    if not query.is_grouped:
        raise ValueError("Stratified sampling requires a grouped aggregate query.")

    started_at = perf_counter()
    total_rows = sum(group.population_rows for group in group_populations)

    if total_rows == 0 or len(group_populations) == 0:
        return StratifiedSamplingResult(
            snapshots=[
                StratifiedSamplingSnapshot(
                    iteration=1,
                    group_estimates=[],
                    relative_error=0.0,
                    sample_rows=0,
                    total_rows=total_rows,
                    elapsed_ms=max(1, int((perf_counter() - started_at) * 1000)),
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
    snapshots: list[StratifiedSamplingSnapshot] = []
    scanned_rows = 0
    batch_rows = min(sample_cap_rows, _INITIAL_BATCH_ROWS)
    sampling_sql = query.projection_sql()
    states = {
        group_population.group_value: _StratumAccumulator(
            group_value=group_population.group_value,
            population_rows=group_population.population_rows,
        )
        for group_population in group_populations
    }

    with stream_projection(dataset=dataset, projection_sql=sampling_sql) as projection_stream:
        while scanned_rows < sample_cap_rows:
            next_rows = min(batch_rows, sample_cap_rows - scanned_rows)
            projection_batch = projection_stream.fetch(next_rows)
            if len(projection_batch.rows) == 0:
                if scanned_rows == 0:
                    return StratifiedSamplingResult(
                        snapshots=[
                            StratifiedSamplingSnapshot(
                                iteration=1,
                                group_estimates=[],
                                relative_error=0.0,
                                sample_rows=0,
                                total_rows=total_rows,
                                elapsed_ms=max(1, int((perf_counter() - started_at) * 1000)),
                            )
                        ],
                        stopped_reason="target_reached",
                    )
                break

            _accumulate_projection_rows(
                query=query,
                projection_batch=projection_batch,
                states=states,
            )
            scanned_rows += len(projection_batch.rows)
            _refresh_estimates(
                states=list(states.values()),
                aggregate_function=query.aggregate_function,
                z_value=z_value,
            )

            snapshots.append(
                _build_snapshot(
                    states=list(states.values()),
                    iteration=len(snapshots) + 1,
                    scanned_rows=scanned_rows,
                    total_rows=total_rows,
                    elapsed_ms=projection_batch.latency_ms,
                )
            )

            if snapshots[-1].relative_error <= target_error:
                return StratifiedSamplingResult(
                    snapshots=snapshots,
                    stopped_reason="target_reached",
                )

            if scanned_rows >= sample_cap_rows:
                break

            next_total = min(
                sample_cap_rows,
                max(scanned_rows + _INITIAL_BATCH_ROWS, int(scanned_rows * _BATCH_GROWTH_FACTOR)),
            )
            batch_rows = max(1, next_total - scanned_rows)

    return StratifiedSamplingResult(
        snapshots=snapshots,
        stopped_reason="sample_cap",
    )


def _accumulate_projection_rows(
    *,
    query: AdaptiveAggregateQuery,
    projection_batch: ProjectionBatch,
    states: dict[object, _StratumAccumulator],
) -> None:
    column_positions = {
        column_name: index for index, column_name in enumerate(projection_batch.column_names)
    }
    group_position = column_positions[query.group_by_column or ""]
    aggregate_position = (
        None
        if query.aggregate_column is None
        else column_positions[query.aggregate_column]
    )

    for row in projection_batch.rows:
        state = states.get(row[group_position])
        if state is None:
            continue

        aggregate_value = None
        if aggregate_position is not None:
            aggregate_value = row[aggregate_position]

        if query.aggregate_function == "count":
            state.accumulator.add(value=1.0)
        elif query.aggregate_function == "sum":
            state.accumulator.add(
                value=0.0 if aggregate_value is None else float(aggregate_value)
            )
        else:
            include_row = aggregate_value is not None
            state.accumulator.add(
                value=float(aggregate_value) if include_row else 0.0,
                weight=1.0 if include_row else 0.0,
            )


def _refresh_estimates(
    *,
    states: list[_StratumAccumulator],
    aggregate_function: str,
    z_value: float,
) -> None:
    for state in states:
        state.estimate, state.relative_error = _estimate_with_error(
            aggregate_function=aggregate_function,
            accumulator=state.accumulator,
            total_rows=state.population_rows,
            z_value=z_value,
        )


def _build_snapshot(
    *,
    states: list[_StratumAccumulator],
    iteration: int,
    scanned_rows: int,
    total_rows: int,
    elapsed_ms: int,
) -> StratifiedSamplingSnapshot:
    group_estimates = [
        StratifiedGroupSnapshot(
            group_value=state.group_value,
            estimate=state.estimate,
            relative_error=state.relative_error,
            sample_rows=state.accumulator.sample_rows,
            population_rows=state.population_rows,
        )
        for state in states
    ]
    relative_error = max(
        (group.relative_error for group in group_estimates),
        default=0.0,
    )
    return StratifiedSamplingSnapshot(
        iteration=iteration,
        group_estimates=group_estimates,
        relative_error=relative_error,
        sample_rows=scanned_rows,
        total_rows=total_rows,
        elapsed_ms=elapsed_ms,
    )
