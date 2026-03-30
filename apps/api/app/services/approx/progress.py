from __future__ import annotations

from datetime import date

from app.schemas.dataset import DatasetSummary
from app.schemas.events import (
    ApproxFinalReason,
    ApproxGroupEstimate,
    ApproxProgressStatus,
    ConvergencePoint,
    ExactGroupComparison,
    GroupedApproxFinalPayload,
    GroupedApproxProgressPayload,
    GroupedExactResultPayload,
    ScalarApproxFinalPayload,
    ScalarApproxProgressPayload,
    ScalarExactResultPayload,
)
from app.services.approx.adaptive_sampling import AdaptiveSamplingSnapshot
from app.services.approx.stratified_sampling import (
    StratifiedGroupSnapshot,
    StratifiedSamplingSnapshot,
)
from app.services.exact.duckdb_runner import TabularQueryResult
from app.services.planner.parser import AdaptiveAggregateQuery

_CURRENCY_COLUMNS = {"amount", "total_amount", "revenue"}


def build_scalar_progress_payload(
    *,
    snapshot: AdaptiveSamplingSnapshot,
    query: AdaptiveAggregateQuery,
    dataset: DatasetSummary,
    confidence_level: float,
    target_error_pct: float,
) -> ScalarApproxProgressPayload:
    estimate = _round_value(value=snapshot.estimate, query=query, dataset=dataset)
    data_scanned_pct = _safe_percentage(snapshot.sample_rows, snapshot.total_rows)
    target_met = snapshot.relative_error <= target_error_pct / 100
    status = _status_for_snapshot(
        iteration=snapshot.iteration,
        target_met=target_met,
    )

    return ScalarApproxProgressPayload(
        result_scope="scalar",
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


def build_grouped_progress_payload(
    *,
    snapshot: StratifiedSamplingSnapshot,
    query: AdaptiveAggregateQuery,
    dataset: DatasetSummary,
    confidence_level: float,
    target_error_pct: float,
) -> GroupedApproxProgressPayload:
    data_scanned_pct = _safe_percentage(snapshot.sample_rows, snapshot.total_rows)
    target_met = snapshot.relative_error <= target_error_pct / 100
    status = _status_for_snapshot(
        iteration=snapshot.iteration,
        target_met=target_met,
    )
    group_rows = [
        ApproxGroupEstimate(
            group_value=_format_group_value(group.group_value),
            estimate=_round_value(value=group.estimate, query=query, dataset=dataset),
            display_value=_format_value(
                value=_round_value(value=group.estimate, query=query, dataset=dataset),
                query=query,
                dataset=dataset,
            ),
            relative_error=round(group.relative_error, 6),
            sample_rows=group.sample_rows,
            population_rows=group.population_rows,
        )
        for group in _sort_group_snapshots(snapshot.group_estimates, query=query)
    ]

    return GroupedApproxProgressPayload(
        result_scope="grouped",
        iteration=snapshot.iteration,
        group_by_column=query.group_by_column or "",
        group_count=len(group_rows),
        group_rows=group_rows,
        summary_label=f"{len(group_rows)} groups estimated",
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


def build_scalar_final_payload(
    *, progress: ScalarApproxProgressPayload, stopped_reason: ApproxFinalReason
) -> ScalarApproxFinalPayload:
    return ScalarApproxFinalPayload(
        **progress.model_dump(),
        approx_latency_ms=progress.elapsed_ms,
        stopped_reason=stopped_reason,
    )


def build_grouped_final_payload(
    *, progress: GroupedApproxProgressPayload, stopped_reason: ApproxFinalReason
) -> GroupedApproxFinalPayload:
    return GroupedApproxFinalPayload(
        **progress.model_dump(),
        approx_latency_ms=progress.elapsed_ms,
        stopped_reason=stopped_reason,
    )


def build_scalar_exact_result_payload(
    *,
    exact_value: float,
    exact_latency_ms: int,
    approx_final: ScalarApproxFinalPayload,
    query: AdaptiveAggregateQuery,
    dataset: DatasetSummary,
) -> ScalarExactResultPayload:
    rounded_exact_value = _round_value(value=exact_value, query=query, dataset=dataset)
    delta = abs(rounded_exact_value - approx_final.estimate)
    delta_pct = 0.0
    if abs(rounded_exact_value) > 1e-9:
        delta_pct = delta / abs(rounded_exact_value)

    speedup = 0.0
    if approx_final.approx_latency_ms > 0:
        speedup = exact_latency_ms / approx_final.approx_latency_ms

    return ScalarExactResultPayload(
        result_scope="scalar",
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


def build_grouped_exact_result_payload(
    *,
    exact_result: TabularQueryResult,
    approx_final: GroupedApproxFinalPayload,
    query: AdaptiveAggregateQuery,
    dataset: DatasetSummary,
) -> GroupedExactResultPayload:
    approx_rows = {
        row.group_value: row
        for row in approx_final.group_rows
    }
    comparisons: list[ExactGroupComparison] = []
    delta_pcts: list[float] = []

    for row in exact_result.rows:
        group_value = _format_group_value(row[0])
        raw_exact_value = 0.0 if len(row) < 2 or row[1] is None else float(row[1])
        rounded_exact_value = _round_value(
            value=raw_exact_value,
            query=query,
            dataset=dataset,
        )
        approx_row = approx_rows.get(group_value)
        approx_estimate = 0.0 if approx_row is None else approx_row.estimate
        approx_display_value = (
            _format_value(value=approx_estimate, query=query, dataset=dataset)
            if approx_row is None
            else approx_row.display_value
        )
        delta = abs(rounded_exact_value - approx_estimate)
        delta_pct = 0.0
        if abs(rounded_exact_value) > 1e-9:
            delta_pct = delta / abs(rounded_exact_value)
        delta_pcts.append(delta_pct)
        comparisons.append(
            ExactGroupComparison(
                group_value=group_value,
                approx_estimate=approx_estimate,
                approx_display_value=approx_display_value,
                exact_value=rounded_exact_value,
                exact_display_value=_format_value(
                    value=rounded_exact_value,
                    query=query,
                    dataset=dataset,
                ),
                delta=_round_value(value=delta, query=query, dataset=dataset),
                delta_pct=round(delta_pct, 6),
            )
        )

    speedup = 0.0
    if approx_final.approx_latency_ms > 0:
        speedup = exact_result.latency_ms / approx_final.approx_latency_ms

    mean_delta_pct = 0.0
    if len(delta_pcts) > 0:
        mean_delta_pct = sum(delta_pcts) / len(delta_pcts)

    return GroupedExactResultPayload(
        result_scope="grouped",
        group_by_column=approx_final.group_by_column,
        group_count=len(comparisons),
        rows=comparisons,
        max_delta_pct=round(max(delta_pcts, default=0.0), 6),
        mean_delta_pct=round(mean_delta_pct, 6),
        exact_latency_ms=exact_result.latency_ms,
        approx_latency_ms=approx_final.approx_latency_ms,
        speedup=round(speedup, 2),
    )


def _status_for_snapshot(*, iteration: int, target_met: bool) -> ApproxProgressStatus:
    if target_met:
        return "target_met"
    if iteration == 1:
        return "warming_up"
    return "converging"


def _sort_group_snapshots(
    snapshots: list[StratifiedGroupSnapshot], *, query: AdaptiveAggregateQuery
) -> list[StratifiedGroupSnapshot]:
    if query.order_by is None:
        return sorted(
            snapshots,
            key=lambda snapshot: _format_group_value(snapshot.group_value),
        )

    reverse = query.order_by.direction == "desc"
    if query.order_by.column == query.alias:
        return sorted(
            snapshots,
            key=lambda snapshot: snapshot.estimate,
            reverse=reverse,
        )

    return sorted(
        snapshots,
        key=lambda snapshot: _format_group_value(snapshot.group_value),
        reverse=reverse,
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


def _format_group_value(value: object) -> str:
    if isinstance(value, date):
        return value.isoformat()
    if value is None:
        return "NULL"
    return str(value)
