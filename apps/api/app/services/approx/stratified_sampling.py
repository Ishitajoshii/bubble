from __future__ import annotations

from contextlib import ExitStack
from dataclasses import dataclass, field
from math import sqrt
from statistics import NormalDist
from time import perf_counter
from typing import Literal

from app.schemas.dataset import DatasetSummary
from app.services.exact.duckdb_runner import GroupPopulation, ProjectionBatch, stream_projection
from app.services.planner.parser import AdaptiveAggregateQuery

_INITIAL_STRATUM_BATCH_ROWS = 64
_BATCH_GROWTH_FACTOR = 1.75
_MIN_STRATUM_SAMPLE_CAP_ROWS = 512
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
class _StratumState:
    group_value: object
    population_rows: int
    sample_cap_rows: int
    batch_rows: int
    stream: object
    sampled_values: list[float] = field(default_factory=list)
    sampled_weights: list[int] | None = None
    sample_rows: int = 0
    estimate: float = 0.0
    relative_error: float = 1.0
    exhausted: bool = False


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
    if total_rows <= 0:
        return StratifiedSamplingResult(
            snapshots=[
                StratifiedSamplingSnapshot(
                    iteration=1,
                    group_estimates=[],
                    relative_error=0.0,
                    sample_rows=0,
                    total_rows=0,
                    elapsed_ms=max(1, int((perf_counter() - started_at) * 1000)),
                )
            ],
            stopped_reason="target_reached",
        )

    z_value = NormalDist().inv_cdf((1 + confidence_level) / 2)
    snapshots: list[StratifiedSamplingSnapshot] = []

    with ExitStack() as stack:
        states = [
            _open_stratum_state(
                stack=stack,
                dataset=dataset,
                query=query,
                group_population=group_population,
            )
            for group_population in group_populations
        ]

        while True:
            made_progress = False

            for state in states:
                if not _needs_more_rows(state=state, target_error=target_error):
                    continue

                next_rows = min(
                    state.batch_rows,
                    max(0, state.sample_cap_rows - state.sample_rows),
                )
                if next_rows <= 0:
                    continue

                projection_batch = state.stream.fetch(next_rows)
                if len(projection_batch.rows) == 0:
                    state.exhausted = True
                    continue

                values, weights = _build_stratum_vectors(
                    query=query,
                    projection=projection_batch,
                )
                state.sampled_values.extend(values)
                if state.sampled_weights is not None and weights is not None:
                    state.sampled_weights.extend(weights)

                state.sample_rows += len(values)
                state.estimate, state.relative_error = _estimate_with_error(
                    aggregate_function=query.aggregate_function,
                    sampled_values=state.sampled_values,
                    sampled_weights=state.sampled_weights,
                    total_rows=state.population_rows,
                    z_value=z_value,
                )
                state.batch_rows = _next_batch_size(state=state)
                made_progress = True

            snapshot = _build_snapshot(
                states=states,
                started_at=started_at,
                snapshot_index=len(snapshots) + 1,
            )
            snapshots.append(snapshot)

            if snapshot.relative_error <= target_error:
                return StratifiedSamplingResult(
                    snapshots=snapshots,
                    stopped_reason="target_reached",
                )

            if not made_progress or not any(
                _needs_more_rows(state=state, target_error=target_error) for state in states
            ):
                break

    return StratifiedSamplingResult(
        snapshots=snapshots,
        stopped_reason="sample_cap",
    )


def _open_stratum_state(
    *,
    stack: ExitStack,
    dataset: DatasetSummary,
    query: AdaptiveAggregateQuery,
    group_population: GroupPopulation,
) -> _StratumState:
    sample_cap_rows = min(
        group_population.population_rows,
        max(
            _MIN_STRATUM_SAMPLE_CAP_ROWS,
            int(group_population.population_rows * _SAMPLE_CAP_FRACTION),
        ),
    )
    sample_cap_rows = max(1, sample_cap_rows)
    batch_rows = min(sample_cap_rows, _INITIAL_STRATUM_BATCH_ROWS)
    stream = stack.enter_context(
        stream_projection(
            dataset=dataset,
            projection_sql=query.stratum_projection_sql(group_population.group_value),
        )
    )
    return _StratumState(
        group_value=group_population.group_value,
        population_rows=group_population.population_rows,
        sample_cap_rows=sample_cap_rows,
        batch_rows=batch_rows,
        stream=stream,
        sampled_weights=[] if query.aggregate_function == "avg" else None,
    )


def _needs_more_rows(*, state: _StratumState, target_error: float) -> bool:
    if state.exhausted or state.sample_rows >= state.sample_cap_rows:
        return False
    if state.sample_rows == 0:
        return True
    return state.relative_error > target_error


def _next_batch_size(*, state: _StratumState) -> int:
    next_total = min(
        state.sample_cap_rows,
        max(
            state.sample_rows + _INITIAL_STRATUM_BATCH_ROWS,
            int(state.sample_rows * _BATCH_GROWTH_FACTOR),
        ),
    )
    return max(1, next_total - state.sample_rows)


def _build_snapshot(
    *,
    states: list[_StratumState],
    started_at: float,
    snapshot_index: int,
) -> StratifiedSamplingSnapshot:
    group_estimates = [
        StratifiedGroupSnapshot(
            group_value=state.group_value,
            estimate=state.estimate,
            relative_error=state.relative_error,
            sample_rows=state.sample_rows,
            population_rows=state.population_rows,
        )
        for state in states
    ]
    total_rows = sum(state.population_rows for state in states)
    sample_rows = sum(state.sample_rows for state in states)
    relative_error = 0.0
    if len(group_estimates) > 0:
        relative_error = max(group.relative_error for group in group_estimates)

    return StratifiedSamplingSnapshot(
        iteration=snapshot_index,
        group_estimates=group_estimates,
        relative_error=relative_error,
        sample_rows=sample_rows,
        total_rows=total_rows,
        elapsed_ms=max(1, int((perf_counter() - started_at) * 1000)),
    )


def _build_stratum_vectors(
    *, query: AdaptiveAggregateQuery, projection: ProjectionBatch
) -> tuple[list[float], list[int] | None]:
    values: list[float] = []
    weights: list[int] | None = [] if query.aggregate_function == "avg" else None

    for row in projection.rows:
        aggregate_value = row[0] if len(row) > 0 else None

        if query.aggregate_function == "count":
            values.append(1.0)
            continue

        if query.aggregate_function == "sum":
            values.append(0.0 if aggregate_value is None else float(aggregate_value))
            continue

        include_row = aggregate_value is not None
        values.append(float(aggregate_value) if include_row else 0.0)
        if weights is not None:
            weights.append(1 if include_row else 0)

    return values, weights


def _estimate_with_error(
    *,
    aggregate_function: str,
    sampled_values: list[float],
    sampled_weights: list[int] | None,
    total_rows: int,
    z_value: float,
) -> tuple[float, float]:
    if aggregate_function in {"count", "sum"}:
        return _estimate_total(
            sampled_values=sampled_values,
            total_rows=total_rows,
            z_value=z_value,
        )

    if sampled_weights is None:
        raise ValueError("AVG estimation requires denominator weights.")

    return _estimate_average(
        sampled_values=sampled_values,
        sampled_weights=sampled_weights,
        total_rows=total_rows,
        z_value=z_value,
    )


def _estimate_total(
    *, sampled_values: list[float], total_rows: int, z_value: float
) -> tuple[float, float]:
    sample_rows = len(sampled_values)
    if sample_rows == 0:
        return 0.0, 1.0

    sample_mean = sum(sampled_values) / sample_rows
    estimate = total_rows * sample_mean

    if sample_rows == total_rows:
        return estimate, 0.0

    if sample_rows < 2:
        return estimate, 1.0

    sample_variance = _sample_variance(sampled_values)
    standard_error = total_rows * sqrt(
        max(0.0, (1 - sample_rows / total_rows) * sample_variance / sample_rows)
    )
    return estimate, _relative_error(estimate=estimate, margin=z_value * standard_error)


def _estimate_average(
    *,
    sampled_values: list[float],
    sampled_weights: list[int],
    total_rows: int,
    z_value: float,
) -> tuple[float, float]:
    sample_rows = len(sampled_values)
    if sample_rows == 0:
        return 0.0, 1.0

    denominator = sum(sampled_weights)
    if denominator == 0:
        if sample_rows == total_rows:
            return 0.0, 0.0
        return 0.0, 1.0

    estimate = sum(sampled_values) / denominator

    if sample_rows == total_rows:
        return estimate, 0.0

    if sample_rows < 2:
        return estimate, 1.0

    mean_weight = denominator / sample_rows
    if mean_weight <= 0:
        return estimate, 1.0

    residuals = [
        value - (estimate * weight)
        for value, weight in zip(sampled_values, sampled_weights, strict=False)
    ]
    residual_variance = _sample_variance(residuals)
    standard_error = sqrt(
        max(
            0.0,
            (1 - sample_rows / total_rows)
            * residual_variance
            / (sample_rows * mean_weight * mean_weight),
        )
    )
    return estimate, _relative_error(estimate=estimate, margin=z_value * standard_error)


def _sample_variance(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0

    mean = sum(values) / len(values)
    return sum((value - mean) ** 2 for value in values) / (len(values) - 1)


def _relative_error(*, estimate: float, margin: float) -> float:
    if margin <= 0:
        return 0.0

    absolute_estimate = abs(estimate)
    if absolute_estimate <= 1e-9:
        return 1.0

    return margin / absolute_estimate
