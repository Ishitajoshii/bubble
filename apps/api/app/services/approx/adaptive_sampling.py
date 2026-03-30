from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from math import sqrt
from random import Random
from statistics import NormalDist
from time import perf_counter
from typing import Literal

from app.schemas.dataset import DatasetSummary
from app.services.exact.duckdb_runner import fetch_projection
from app.services.planner.parser import AdaptiveAggregateQuery, FilterPredicate

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


def run_adaptive_sampling(
    *,
    dataset: DatasetSummary,
    query: AdaptiveAggregateQuery,
    target_error: float,
    confidence_level: float,
    seed_material: str,
) -> AdaptiveSamplingResult:
    started_at = perf_counter()
    projection = fetch_projection(dataset=dataset, projection_sql=query.projection_sql())
    values, weights = _build_population_vectors(query=query, projection=projection)
    total_rows = len(values)

    if total_rows == 0:
        return AdaptiveSamplingResult(
            snapshots=[
                AdaptiveSamplingSnapshot(
                    iteration=1,
                    estimate=0.0,
                    relative_error=0.0,
                    sample_rows=0,
                    total_rows=0,
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

    rng = Random(_seed_from_text(seed_material))
    sample_order = list(range(total_rows))
    rng.shuffle(sample_order)

    z_value = NormalDist().inv_cdf((1 + confidence_level) / 2)
    sampled_values: list[float] = []
    sampled_weights: list[int] | None = [] if weights is not None else None
    snapshots: list[AdaptiveSamplingSnapshot] = []

    sample_rows = 0
    batch_rows = min(sample_cap_rows, _INITIAL_BATCH_ROWS)

    while sample_rows < sample_cap_rows:
        next_rows = min(batch_rows, sample_cap_rows - sample_rows)
        next_indices = sample_order[sample_rows : sample_rows + next_rows]
        sample_rows += next_rows
        sampled_values.extend(values[index] for index in next_indices)

        if sampled_weights is not None and weights is not None:
            sampled_weights.extend(weights[index] for index in next_indices)

        estimate, relative_error = _estimate_with_error(
            aggregate_function=query.aggregate_function,
            sampled_values=sampled_values,
            sampled_weights=sampled_weights,
            total_rows=total_rows,
            z_value=z_value,
        )
        snapshots.append(
            AdaptiveSamplingSnapshot(
                iteration=len(snapshots) + 1,
                estimate=estimate,
                relative_error=relative_error,
                sample_rows=sample_rows,
                total_rows=total_rows,
                elapsed_ms=max(1, int((perf_counter() - started_at) * 1000)),
            )
        )

        if relative_error <= target_error:
            return AdaptiveSamplingResult(
                snapshots=snapshots,
                stopped_reason="target_reached",
            )

        if sample_rows >= sample_cap_rows:
            break

        next_total = min(sample_cap_rows, max(sample_rows + _INITIAL_BATCH_ROWS, int(sample_rows * _BATCH_GROWTH_FACTOR)))
        batch_rows = max(1, next_total - sample_rows)

    return AdaptiveSamplingResult(
        snapshots=snapshots,
        stopped_reason="sample_cap",
    )


def _build_population_vectors(
    *, query: AdaptiveAggregateQuery, projection
) -> tuple[list[float], list[int] | None]:
    column_positions = {
        column_name: index for index, column_name in enumerate(projection.column_names)
    }
    values: list[float] = []
    weights: list[int] | None = [] if query.aggregate_function == "avg" else None

    for row in projection.rows:
        matches_filters = _row_matches_filters(
            row=row,
            query=query,
            column_positions=column_positions,
        )

        aggregate_value = None
        if query.aggregate_column is not None:
            aggregate_value = row[column_positions[query.aggregate_column]]

        if query.aggregate_function == "count":
            include_row = matches_filters and (
                query.aggregate_column is None or aggregate_value is not None
            )
            values.append(1.0 if include_row else 0.0)
            continue

        if query.aggregate_function == "sum":
            if matches_filters and aggregate_value is not None:
                values.append(float(aggregate_value))
            else:
                values.append(0.0)
            continue

        include_row = matches_filters and aggregate_value is not None
        values.append(float(aggregate_value) if include_row else 0.0)
        if weights is not None:
            weights.append(1 if include_row else 0)

    return values, weights


def _row_matches_filters(
    *,
    row: tuple[object, ...],
    query: AdaptiveAggregateQuery,
    column_positions: dict[str, int],
) -> bool:
    for predicate in query.filters:
        row_value = row[column_positions[predicate.column]]
        if not _apply_filter_predicate(row_value=row_value, predicate=predicate):
            return False
    return True


def _apply_filter_predicate(*, row_value: object, predicate: FilterPredicate) -> bool:
    if row_value is None:
        return False

    if predicate.operator == "=":
        return row_value == predicate.value
    if predicate.operator == "!=":
        return row_value != predicate.value
    if predicate.operator == "<":
        return row_value < predicate.value
    if predicate.operator == "<=":
        return row_value <= predicate.value
    if predicate.operator == ">":
        return row_value > predicate.value
    return row_value >= predicate.value


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


def _seed_from_text(value: str) -> int:
    return int.from_bytes(sha256(value.encode("utf-8")).digest()[:8], byteorder="big")
