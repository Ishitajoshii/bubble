from __future__ import annotations

from app.schemas.dataset import DatasetSummary
from app.schemas.events import (
    ApproxFinalPayload,
    ApproxProgressPayload,
    ApproxProgressStatus,
    ConvergencePoint,
    ExactResultPayload,
)
from app.services.approx.adaptive_sampling import AdaptiveSamplingSnapshot
from app.services.planner.parser import AdaptiveAggregateQuery

_CURRENCY_COLUMNS = {"amount", "total_amount", "revenue"}


def build_progress_payload(
    *,
    snapshot: AdaptiveSamplingSnapshot,
    query: AdaptiveAggregateQuery,
    dataset: DatasetSummary,
    confidence_level: float,
    target_error_pct: float,
) -> ApproxProgressPayload:
    estimate = _round_value(value=snapshot.estimate, query=query, dataset=dataset)
    data_scanned_pct = _safe_percentage(snapshot.sample_rows, snapshot.total_rows)
    target_met = snapshot.relative_error <= target_error_pct / 100
    status: ApproxProgressStatus

    if target_met:
        status = "target_met"
    elif snapshot.iteration == 1:
        status = "warming_up"
    else:
        status = "converging"

    return ApproxProgressPayload(
        iteration=snapshot.iteration,
        estimate=estimate,
        display_value=_format_value(value=estimate, query=query, dataset=dataset),
        sample_fraction=_safe_fraction(snapshot.sample_rows, snapshot.total_rows),
        sample_rows=snapshot.sample_rows,
        data_scanned_pct=data_scanned_pct,
        compute_saved_pct=round(max(0.0, 100 - data_scanned_pct), 2),
        relative_error=round(snapshot.relative_error, 6),
        confidence_level=confidence_level,
        target_error_pct=target_error_pct,
        target_met=target_met,
        status=status,
        elapsed_ms=snapshot.elapsed_ms,
        convergence_point=ConvergencePoint(
            iteration=snapshot.iteration,
            data_scanned_pct=data_scanned_pct,
            relative_error=round(snapshot.relative_error, 6),
            elapsed_ms=snapshot.elapsed_ms,
        ),
    )


def build_final_payload(
    *, progress: ApproxProgressPayload, stopped_reason: str
) -> ApproxFinalPayload:
    return ApproxFinalPayload(
        **progress.model_dump(),
        approx_latency_ms=progress.elapsed_ms,
        stopped_reason=stopped_reason,
    )


def build_exact_result_payload(
    *,
    exact_value: float,
    exact_latency_ms: int,
    approx_final: ApproxFinalPayload,
    query: AdaptiveAggregateQuery,
    dataset: DatasetSummary,
) -> ExactResultPayload:
    rounded_exact_value = _round_value(value=exact_value, query=query, dataset=dataset)
    delta = abs(rounded_exact_value - approx_final.estimate)
    delta_pct = 0.0
    if abs(rounded_exact_value) > 1e-9:
        delta_pct = delta / abs(rounded_exact_value)

    speedup = 0.0
    if approx_final.approx_latency_ms > 0:
        speedup = exact_latency_ms / approx_final.approx_latency_ms

    return ExactResultPayload(
        exact_value=rounded_exact_value,
        display_value=_format_value(
            value=rounded_exact_value,
            query=query,
            dataset=dataset,
        ),
        exact_latency_ms=exact_latency_ms,
        approx_latency_ms=approx_final.approx_latency_ms,
        delta=_round_value(value=delta, query=query, dataset=dataset),
        delta_pct=round(delta_pct, 6),
        speedup=round(speedup, 2),
    )


def _round_value(
    *, value: float, query: AdaptiveAggregateQuery, dataset: DatasetSummary
) -> float:
    if query.aggregate_function == "count":
        return float(round(value))

    column_type = _column_type(dataset=dataset, column_name=query.aggregate_column)
    if query.aggregate_function == "avg":
        if column_type in {"INTEGER", "BIGINT"} and not _is_currency(query):
            return round(value, 2)
        return round(value, 2)

    if column_type in {"INTEGER", "BIGINT"} and not _is_currency(query):
        return float(round(value))

    return round(value, 2)


def _format_value(
    *, value: float, query: AdaptiveAggregateQuery, dataset: DatasetSummary
) -> str:
    if query.aggregate_function == "count":
        return f"{value:,.0f}"

    if _is_currency(query):
        if query.aggregate_function == "sum":
            return f"${value:,.2f}"
        return f"${value:,.2f}"

    if _column_type(dataset=dataset, column_name=query.aggregate_column) in {
        "INTEGER",
        "BIGINT",
    } and query.aggregate_function == "sum":
        return f"{value:,.0f}"

    return f"{value:,.2f}"


def _column_type(*, dataset: DatasetSummary, column_name: str | None) -> str | None:
    if column_name is None:
        return None

    for field in dataset.schema_fields:
        if field.name == column_name:
            return field.type.upper()
    return None


def _is_currency(query: AdaptiveAggregateQuery) -> bool:
    if query.aggregate_column is None:
        return False
    return query.aggregate_column.lower() in _CURRENCY_COLUMNS or "revenue" in query.alias


def _safe_fraction(sample_rows: int, total_rows: int) -> float:
    if total_rows <= 0:
        return 0.0
    return round(sample_rows / total_rows, 4)


def _safe_percentage(sample_rows: int, total_rows: int) -> float:
    if total_rows <= 0:
        return 0.0
    return round((sample_rows / total_rows) * 100, 2)
