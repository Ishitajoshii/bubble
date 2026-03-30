from app.schemas.events import PlannerOutput
from app.services.exact.duckdb_runner import GroupPopulation
from app.services.planner.parser import AdaptiveAggregateQuery

_MIN_APPROX_ROWS = 5_000
_MAX_STRATA = 16
_PLANNER_VERSION = "adaptive-planner-v2"


def route_query(
    *,
    query: AdaptiveAggregateQuery | None,
    live_mode: bool,
    error_tolerance: float,
    confidence_level: float,
    group_populations: list[GroupPopulation] | None = None,
    unsupported_reason: str | None = None,
) -> PlannerOutput:
    target_error_pct = round(error_tolerance * 100, 2)
    target_summary = (
        f"Within {target_error_pct:g}% at {round(confidence_level * 100):.0f}% confidence"
    )

    if live_mode:
        return _exact_fallback(
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
            reason="Live mode is not implemented yet.",
        )

    if query is None:
        return _exact_fallback(
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
            reason=unsupported_reason
            or "Query is outside the supported approximation subset.",
        )

    if query.is_distinct_count:
        if query.is_grouped:
            if group_populations is None:
                return _exact_fallback(
                    confidence_level=confidence_level,
                    target_error_pct=target_error_pct,
                    target_summary=target_summary,
                    reason="Could not determine grouped strata for grouped HyperLogLog.",
                )

            distinct_groups = len(group_populations)
            if distinct_groups == 0:
                return _exact_fallback(
                    confidence_level=confidence_level,
                    target_error_pct=target_error_pct,
                    target_summary=target_summary,
                    reason="The grouped distinct query has no rows after filtering.",
                )

            if distinct_groups > _MAX_STRATA:
                return _exact_fallback(
                    confidence_level=confidence_level,
                    target_error_pct=target_error_pct,
                    target_summary=target_summary,
                    reason=(
                        f"Grouped HyperLogLog is limited to {_MAX_STRATA} groups, "
                        f"but this dataset produced {distinct_groups} groups."
                    ),
                )

            return PlannerOutput(
                strategy="hyperloglog",
                rationale=(
                    f"Grouped COUNT(DISTINCT ...) over {distinct_groups} groups uses "
                    "HyperLogLog registers instead of sampling."
                ),
                confidence_level=confidence_level,
                target_error_pct=target_error_pct,
                target_summary=target_summary,
                planner_version=_PLANNER_VERSION,
            )

        return PlannerOutput(
            strategy="hyperloglog",
            rationale=(
                "COUNT(DISTINCT ...) queries use HyperLogLog instead of sampling; "
                "precision is sized to the requested error target."
            ),
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
            planner_version=_PLANNER_VERSION,
        )

    if not query.is_grouped:
        return PlannerOutput(
            strategy="adaptive_sampling",
            rationale="Single-table COUNT, SUM, and AVG queries without DISTINCT or GROUP BY use adaptive sampling.",
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
            planner_version=_PLANNER_VERSION,
        )

    if query.aggregate_function not in {"sum", "avg"}:
        return _exact_fallback(
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
            reason="Grouped approximation currently supports SUM and AVG only.",
        )

    if group_populations is None:
        return _exact_fallback(
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
            reason="Could not determine grouped stratum sizes for stratified sampling.",
        )

    distinct_groups = len(group_populations)
    filtered_rows = sum(group.population_rows for group in group_populations)

    if distinct_groups == 0:
        return _exact_fallback(
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
            reason="The grouped query has no rows after filtering, so approximation is skipped.",
        )

    if distinct_groups > _MAX_STRATA:
        return _exact_fallback(
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
            reason=(
                f"Grouped approximation is limited to {_MAX_STRATA} strata, "
                f"but this dataset produced {distinct_groups} groups."
            ),
        )

    if filtered_rows < _MIN_APPROX_ROWS:
        return _exact_fallback(
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
            reason=(
                f"Grouped approximation is skipped below {_MIN_APPROX_ROWS:,} filtered rows; "
                f"this query only touches {filtered_rows:,} rows."
            ),
        )

    return PlannerOutput(
        strategy="stratified_sampling",
        rationale=(
            f"Grouped {query.aggregate_function.upper()} over {distinct_groups} strata "
            f"and {filtered_rows:,} filtered rows uses stratified sampling."
        ),
        confidence_level=confidence_level,
        target_error_pct=target_error_pct,
        target_summary=target_summary,
        planner_version=_PLANNER_VERSION,
    )


def _exact_fallback(
    *, confidence_level: float, target_error_pct: float, target_summary: str, reason: str
) -> PlannerOutput:
    return PlannerOutput(
        strategy="exact_fallback",
        rationale=reason,
        confidence_level=confidence_level,
        target_error_pct=target_error_pct,
        target_summary=target_summary,
        approx_supported=False,
        fallback_reason=reason,
        planner_version=_PLANNER_VERSION,
    )
