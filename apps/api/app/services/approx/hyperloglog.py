from __future__ import annotations

from dataclasses import dataclass
from math import ceil, log, log2, sqrt
from time import perf_counter
from typing import Literal

from app.schemas.dataset import DatasetSummary
from app.services.exact.duckdb_runner import GroupPopulation, run_tabular_query
from app.services.planner.parser import AdaptiveAggregateQuery

_MIN_PRECISION = 4
_MAX_PRECISION = 18
_PRECISION_SAFETY_FACTOR = 0.5


@dataclass(slots=True)
class HyperLogLogSnapshot:
    iteration: int
    estimate: float
    relative_error: float
    sample_rows: int
    total_rows: int
    elapsed_ms: int


@dataclass(slots=True)
class HyperLogLogGroupSnapshot:
    group_value: object
    estimate: float
    relative_error: float
    sample_rows: int
    population_rows: int


@dataclass(slots=True)
class GroupedHyperLogLogSnapshot:
    iteration: int
    group_estimates: list[HyperLogLogGroupSnapshot]
    relative_error: float
    sample_rows: int
    total_rows: int
    elapsed_ms: int


@dataclass(slots=True)
class HyperLogLogResult:
    snapshots: list[HyperLogLogSnapshot]
    stopped_reason: Literal["target_reached", "sample_cap"]


@dataclass(slots=True)
class GroupedHyperLogLogResult:
    snapshots: list[GroupedHyperLogLogSnapshot]
    stopped_reason: Literal["target_reached", "sample_cap"]


def run_hyperloglog(
    *,
    dataset: DatasetSummary,
    query: AdaptiveAggregateQuery,
    target_error: float,
    group_populations: list[GroupPopulation] | None = None,
) -> HyperLogLogResult | GroupedHyperLogLogResult:
    if not query.is_distinct_count or query.aggregate_column is None:
        raise ValueError("HyperLogLog requires a COUNT(DISTINCT column) query.")

    if query.is_grouped:
        return _run_grouped_hyperloglog(
            dataset=dataset,
            query=query,
            target_error=target_error,
            group_populations=group_populations,
        )

    return _run_scalar_hyperloglog(
        dataset=dataset,
        query=query,
        target_error=target_error,
    )


def _run_scalar_hyperloglog(
    *,
    dataset: DatasetSummary,
    query: AdaptiveAggregateQuery,
    target_error: float,
) -> HyperLogLogResult:
    total_rows = dataset.row_count
    if total_rows == 0:
        started_at = perf_counter()
        return HyperLogLogResult(
            snapshots=[
                HyperLogLogSnapshot(
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

    precision = _choose_precision(target_error)
    register_count = 1 << precision
    register_rows = run_tabular_query(
        dataset=dataset,
        sql=_register_sql(query=query, precision=precision),
    )
    registers = _materialize_registers(register_count=register_count, rows=register_rows.rows)
    relative_error = _standard_error(register_count)

    return HyperLogLogResult(
        snapshots=[
            HyperLogLogSnapshot(
                iteration=1,
                estimate=_estimate_cardinality(registers),
                relative_error=relative_error,
                sample_rows=total_rows,
                total_rows=total_rows,
                elapsed_ms=max(register_rows.latency_ms, 1),
            )
        ],
        stopped_reason=_stopped_reason(relative_error=relative_error, target_error=target_error),
    )


def _run_grouped_hyperloglog(
    *,
    dataset: DatasetSummary,
    query: AdaptiveAggregateQuery,
    target_error: float,
    group_populations: list[GroupPopulation] | None,
) -> GroupedHyperLogLogResult:
    if group_populations is None:
        raise ValueError("Grouped HyperLogLog requires grouped population metadata.")

    total_rows = dataset.row_count
    if total_rows == 0 or len(group_populations) == 0:
        started_at = perf_counter()
        return GroupedHyperLogLogResult(
            snapshots=[
                GroupedHyperLogLogSnapshot(
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

    precision = _choose_precision(target_error)
    register_count = 1 << precision
    register_rows = run_tabular_query(
        dataset=dataset,
        sql=_register_sql(query=query, precision=precision),
    )
    grouped_registers = _materialize_grouped_registers(
        register_count=register_count,
        rows=register_rows.rows,
    )
    relative_error = _standard_error(register_count)
    group_row_counts = {
        group_population.group_value: group_population.population_rows
        for group_population in group_populations
    }
    group_estimates = [
        HyperLogLogGroupSnapshot(
            group_value=group_population.group_value,
            estimate=_estimate_cardinality(
                grouped_registers.get(
                    group_population.group_value,
                    [0] * register_count,
                )
            ),
            relative_error=relative_error,
            sample_rows=group_row_counts[group_population.group_value],
            population_rows=group_row_counts[group_population.group_value],
        )
        for group_population in group_populations
    ]

    return GroupedHyperLogLogResult(
        snapshots=[
            GroupedHyperLogLogSnapshot(
                iteration=1,
                group_estimates=group_estimates,
                relative_error=relative_error,
                sample_rows=sum(group_row_counts.values()),
                total_rows=total_rows,
                elapsed_ms=max(register_rows.latency_ms, 1),
            )
        ],
        stopped_reason=_stopped_reason(relative_error=relative_error, target_error=target_error),
    )


def _register_sql(*, query: AdaptiveAggregateQuery, precision: int) -> str:
    if query.aggregate_column is None:
        raise ValueError("HyperLogLog register SQL requires a distinct-count column.")

    hash_expression = f"hash({query.aggregate_column})"
    register_count = 1 << precision
    register_mask = register_count - 1
    remaining_bits = 64 - precision
    remainder_expression = f"({hash_expression} >> {precision})"
    rank_expression = (
        f"CASE WHEN {remainder_expression} = 0 THEN {remaining_bits + 1} "
        f"ELSE {remaining_bits} - CAST(floor(log2(CAST({remainder_expression} AS DOUBLE))) AS BIGINT) END"
    )
    where_clauses = [predicate.to_sql() for predicate in query.filters]
    where_clauses.append(f"{query.aggregate_column} IS NOT NULL")
    where_sql = " WHERE " + " AND ".join(where_clauses)

    if query.is_grouped and query.group_by_column is not None:
        return (
            "WITH hll_inputs AS ("
            f"SELECT {query.group_by_column} AS group_value, "
            f"({hash_expression} & {register_mask}) AS register_index, "
            f"{rank_expression} AS register_rank "
            f"FROM {query.table_name}{where_sql}"
            ") "
            "SELECT group_value, register_index, MAX(register_rank) AS register_rank "
            "FROM hll_inputs "
            "GROUP BY group_value, register_index;"
        )

    return (
        "WITH hll_inputs AS ("
        f"SELECT ({hash_expression} & {register_mask}) AS register_index, "
        f"{rank_expression} AS register_rank "
        f"FROM {query.table_name}{where_sql}"
        ") "
        "SELECT register_index, MAX(register_rank) AS register_rank "
        "FROM hll_inputs "
        "GROUP BY register_index;"
    )


def _materialize_registers(
    *, register_count: int, rows: list[tuple[object, ...]]
) -> list[int]:
    registers = [0] * register_count
    for row in rows:
        index = int(row[0])
        rank = int(row[1])
        registers[index] = rank
    return registers


def _materialize_grouped_registers(
    *, register_count: int, rows: list[tuple[object, ...]]
) -> dict[object, list[int]]:
    grouped_registers: dict[object, list[int]] = {}
    for row in rows:
        group_value = row[0]
        index = int(row[1])
        rank = int(row[2])
        registers = grouped_registers.get(group_value)
        if registers is None:
            registers = [0] * register_count
            grouped_registers[group_value] = registers
        registers[index] = rank
    return grouped_registers


def _choose_precision(target_error: float) -> int:
    effective_target = max(target_error * _PRECISION_SAFETY_FACTOR, 1e-9)
    required_registers = (1.04 / effective_target) ** 2
    precision = ceil(log2(required_registers))
    return max(_MIN_PRECISION, min(_MAX_PRECISION, precision))


def _estimate_cardinality(registers: list[int]) -> float:
    register_count = len(registers)
    harmonic_sum = sum(2.0 ** (-register) for register in registers)
    if harmonic_sum <= 0:
        return 0.0

    raw_estimate = _alpha(register_count) * register_count * register_count / harmonic_sum
    zero_registers = registers.count(0)

    if raw_estimate <= 2.5 * register_count and zero_registers > 0:
        return register_count * log(register_count / zero_registers)

    if raw_estimate > ((1 << 32) / 30):
        return -(1 << 32) * log(1 - (raw_estimate / (1 << 32)))

    return raw_estimate


def _alpha(register_count: int) -> float:
    if register_count == 16:
        return 0.673
    if register_count == 32:
        return 0.697
    if register_count == 64:
        return 0.709
    return 0.7213 / (1 + 1.079 / register_count)


def _standard_error(register_count: int) -> float:
    return 1.04 / sqrt(register_count)


def _stopped_reason(
    *, relative_error: float, target_error: float
) -> Literal["target_reached", "sample_cap"]:
    if relative_error <= target_error:
        return "target_reached"
    return "sample_cap"
