from app.schemas.events import PlannerOutput


def route_query(
    *, sql: str, live_mode: bool, error_tolerance: float, confidence_level: float
) -> PlannerOutput:
    normalized = " ".join(sql.lower().split())
    target_error_pct = round(error_tolerance * 100, 2)
    target_summary = (
        f"Within {target_error_pct:g}% at {round(confidence_level * 100):.0f}% confidence"
    )

    if live_mode:
        return PlannerOutput(
            strategy="reservoir_sampling",
            rationale="Live mode sessions use reservoir summaries for append-only updates.",
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
        )

    if "count(distinct" in normalized:
        return PlannerOutput(
            strategy="hyperloglog",
            rationale="COUNT DISTINCT is routed to mergeable sketch estimation.",
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
        )

    if "group by" in normalized:
        return PlannerOutput(
            strategy="stratified_sampling",
            rationale="GROUP BY detected; use stratified sampling to protect skewed groups.",
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
        )

    if normalized.startswith("select") and any(
        aggregate in normalized for aggregate in ("count(", "sum(", "avg(")
    ):
        return PlannerOutput(
            strategy="adaptive_sampling",
            rationale="Single-table aggregate without GROUP BY fits adaptive sampling.",
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
        )

    return PlannerOutput(
        strategy="exact_fallback",
        rationale="Query is outside the supported approximation subset.",
        confidence_level=confidence_level,
        target_error_pct=target_error_pct,
        target_summary=target_summary,
        approx_supported=False,
        fallback_reason="Unsupported SQL subset for v1.",
    )
