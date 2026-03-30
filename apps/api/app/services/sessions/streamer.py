import asyncio
import json
from datetime import datetime, timezone
from typing import AsyncIterator

from app.core.config import get_settings
from app.schemas.events import (
    ApproxFinalPayload,
    ApproxProgressPayload,
    ConvergencePoint,
    ErrorPayload,
    ExactResultPayload,
    PlanReadyPayload,
    QuerySessionEvent,
    SqlGeneratedPayload,
)
from app.services.sessions.manager import QuerySessionState


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _round_for_sql(value: float, sql: str) -> float:
    normalized = sql.lower()
    if "avg(" in normalized:
        return round(value, 2)
    return round(value)


def _format_value(value: float, sql: str) -> str:
    normalized = sql.lower()
    if "avg(" in normalized or "sum(" in normalized:
        if "avg(" in normalized:
            return f"${value:,.2f}"
        return f"${value:,.0f}"
    return f"{value:,.0f}"


def _mock_exact_value(sql: str) -> float:
    return _mock_measure(sql)["exact_value"]


def _mock_measure(sql: str) -> dict[str, tuple[float, ...] | float]:
    normalized = sql.lower()
    if "count(distinct" in normalized:
        return {
            "exact_value": 18_240.0,
            "estimates": (14_950.0, 16_820.0, 17_420.0, 17_547.0),
        }
    if "avg(" in normalized:
        return {
            "exact_value": 84.37,
            "estimates": (69.15, 75.09, 79.22, 81.16),
        }
    if "count(" in normalized:
        return {
            "exact_value": 12_847.0,
            "estimates": (10_410.0, 11_470.0, 12_120.0, 12_359.0),
        }
    return {
        "exact_value": 129_104.0,
        "estimates": (104_200.0, 118_900.0, 123_950.0, 124_197.0),
    }


def _build_progress_payloads(
    session: QuerySessionState,
) -> tuple[list[ApproxProgressPayload], ApproxFinalPayload]:
    measure = _mock_measure(session.sql)
    error_curve = (0.19, 0.11, 0.061, 0.038)
    scan_curve = (3.0, 7.5, 13.8, 19.4)
    elapsed_curve = (640, 1230, 1810, 2480)
    statuses = ("warming_up", "converging", "converging", "target_met")
    target_error_pct = round(session.request.error_tolerance * 100, 2)
    estimates = measure["estimates"]

    progress_events: list[ApproxProgressPayload] = []

    for index, relative_error in enumerate(error_curve, start=1):
        estimate = _round_for_sql(estimates[index - 1], session.sql)
        data_scanned_pct = scan_curve[index - 1]
        payload = ApproxProgressPayload(
            iteration=index,
            estimate=estimate,
            display_value=_format_value(estimate, session.sql),
            sample_fraction=round(data_scanned_pct / 100, 3),
            sample_rows=int(session.dataset.row_count * (data_scanned_pct / 100)),
            data_scanned_pct=data_scanned_pct,
            compute_saved_pct=round(100 - data_scanned_pct, 1),
            relative_error=relative_error,
            confidence_level=session.request.confidence_level,
            target_error_pct=target_error_pct,
            target_met=relative_error <= session.request.error_tolerance,
            status=statuses[index - 1],
            elapsed_ms=elapsed_curve[index - 1],
            convergence_point=ConvergencePoint(
                iteration=index,
                data_scanned_pct=data_scanned_pct,
                relative_error=relative_error,
                elapsed_ms=elapsed_curve[index - 1],
            ),
        )
        progress_events.append(payload)

    final_progress = progress_events[-1]
    approx_final = ApproxFinalPayload(
        **final_progress.model_dump(),
        approx_latency_ms=final_progress.elapsed_ms,
        stopped_reason="target_reached",
    )
    return progress_events, approx_final


def _build_exact_result(
    session: QuerySessionState, approx_final: ApproxFinalPayload
) -> ExactResultPayload:
    exact_value = _mock_exact_value(session.sql)
    delta = abs(exact_value - approx_final.estimate)
    approx_latency_ms = approx_final.approx_latency_ms
    exact_latency_ms = 11_120
    speedup = round(exact_latency_ms / approx_latency_ms, 2)
    return ExactResultPayload(
        exact_value=exact_value,
        display_value=_format_value(exact_value, session.sql),
        exact_latency_ms=exact_latency_ms,
        approx_latency_ms=approx_latency_ms,
        delta=_round_for_sql(delta, session.sql),
        delta_pct=round(delta / exact_value, 3),
        speedup=speedup,
    )


def _make_event(
    *, session_id: str, sequence: int, event_type: str, payload: dict
) -> QuerySessionEvent:
    return QuerySessionEvent(
        session_id=session_id,
        type=event_type,
        sequence=sequence,
        sent_at=utc_now(),
        payload=payload,
    )


def build_session_events(session: QuerySessionState) -> list[QuerySessionEvent]:
    if not session.planner.approx_supported:
        return [
            _make_event(
                session_id=session.session_id,
                sequence=1,
                event_type="sql_generated",
                payload=SqlGeneratedPayload(
                    prompt=session.request.prompt,
                    sql=session.sql,
                    translation=session.translation,
                ).model_dump(mode="json"),
            ),
            _make_event(
                session_id=session.session_id,
                sequence=2,
                event_type="plan_ready",
                payload=PlanReadyPayload(planner=session.planner).model_dump(mode="json"),
            ),
            _make_event(
                session_id=session.session_id,
                sequence=3,
                event_type="error",
                payload=ErrorPayload(
                    code="unsupported_query",
                    message=session.planner.fallback_reason
                    or "Query is outside the supported approximation subset.",
                    retryable=False,
                ).model_dump(mode="json"),
            ),
        ]

    progress_events, approx_final = _build_progress_payloads(session)
    exact_result = _build_exact_result(session, approx_final)

    events: list[QuerySessionEvent] = [
        _make_event(
            session_id=session.session_id,
            sequence=1,
            event_type="sql_generated",
            payload=SqlGeneratedPayload(
                prompt=session.request.prompt,
                sql=session.sql,
                translation=session.translation,
            ).model_dump(mode="json"),
        ),
        _make_event(
            session_id=session.session_id,
            sequence=2,
            event_type="plan_ready",
            payload=PlanReadyPayload(planner=session.planner).model_dump(mode="json"),
        ),
    ]

    for offset, progress_event in enumerate(progress_events, start=3):
        events.append(
            _make_event(
                session_id=session.session_id,
                sequence=offset,
                event_type="approx_progress",
                payload=progress_event.model_dump(mode="json"),
            )
        )

    events.append(
        _make_event(
            session_id=session.session_id,
            sequence=3 + len(progress_events),
            event_type="approx_final",
            payload=approx_final.model_dump(mode="json"),
        )
    )
    events.append(
        _make_event(
            session_id=session.session_id,
            sequence=4 + len(progress_events),
            event_type="exact_result",
            payload=exact_result.model_dump(mode="json"),
        )
    )
    return events


async def stream_session_events(session: QuerySessionState) -> AsyncIterator[str]:
    events = build_session_events(session)
    delays = get_settings().stream_delays_ms

    for index, event in enumerate(events):
        delay_ms = delays[min(index, len(delays) - 1)]
        await asyncio.sleep(delay_ms / 1000)
        yield encode_sse_event(event)


def encode_sse_event(event: QuerySessionEvent) -> str:
    body = json.dumps(event.model_dump(mode="json"))
    return f"id: {event.sequence}\nevent: {event.type}\ndata: {body}\n\n"
