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
        return _exact_fallback(
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
            reason="Live mode is not implemented yet.",
        )

    unsupported_patterns = (
        "count(distinct",
        "group by",
        "order by",
        "having",
        " join ",
        " union ",
        " distinct ",
    )
    if any(pattern in normalized for pattern in unsupported_patterns):
        return _exact_fallback(
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
            reason="Only COUNT, SUM, and AVG without GROUP BY are supported by adaptive sampling right now.",
        )

    if normalized.startswith("select") and any(
        aggregate in normalized for aggregate in ("count(", "sum(", "avg(")
    ):
        return PlannerOutput(
            strategy="adaptive_sampling",
            rationale="COUNT, SUM, and AVG without GROUP BY currently use adaptive sampling.",
            confidence_level=confidence_level,
            target_error_pct=target_error_pct,
            target_summary=target_summary,
            planner_version="adaptive-planner-v1",
        )

    return _exact_fallback(
        confidence_level=confidence_level,
        target_error_pct=target_error_pct,
        target_summary=target_summary,
        reason="Query is outside the supported adaptive-sampling subset.",
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
        planner_version="adaptive-planner-v1",
    )
