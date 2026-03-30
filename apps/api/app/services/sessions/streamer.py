from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import AsyncIterator

from app.core.config import get_settings
from app.schemas.events import (
    ErrorPayload,
    PlanReadyPayload,
    QuerySessionEvent,
    SqlGeneratedPayload,
)
from app.services.approx.adaptive_sampling import run_adaptive_sampling
from app.services.approx.progress import (
    build_exact_result_payload,
    build_final_payload,
    build_progress_payload,
)
from app.services.exact.duckdb_runner import run_exact_query
from app.services.sessions.manager import QuerySessionState


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def stream_session_events(session: QuerySessionState) -> AsyncIterator[str]:
    event_index = 0

    async for encoded_event in _stream_initial_events(session=session, event_index_start=event_index):
        event_index += 1
        yield encoded_event

    if not session.planner.approx_supported or session.adaptive_query is None:
        await _sleep_before_event(event_index)
        yield encode_sse_event(
            _make_event(
                session_id=session.session_id,
                sequence=event_index + 1,
                event_type="error",
                payload=ErrorPayload(
                    code="unsupported_query",
                    message=session.planner.fallback_reason
                    or "Query is outside the supported approximation subset.",
                    retryable=False,
                ).model_dump(mode="json"),
            )
        )
        return

    try:
        sampling_result = run_adaptive_sampling(
            dataset=session.dataset,
            query=session.adaptive_query,
            target_error=session.request.error_tolerance,
            confidence_level=session.request.confidence_level,
            seed_material=f"{session.session_id}:{session.adaptive_query.raw_sql}",
        )
    except Exception as exc:
        await _sleep_before_event(event_index)
        yield encode_sse_event(
            _make_event(
                session_id=session.session_id,
                sequence=event_index + 1,
                event_type="error",
                payload=ErrorPayload(
                    code="approx_execution_failed",
                    message=f"Adaptive sampling failed: {exc}",
                    retryable=False,
                ).model_dump(mode="json"),
            )
        )
        return

    progress_payloads = [
        build_progress_payload(
            snapshot=snapshot,
            query=session.adaptive_query,
            dataset=session.dataset,
            confidence_level=session.request.confidence_level,
            target_error_pct=session.planner.target_error_pct,
        )
        for snapshot in sampling_result.snapshots
    ]
    final_payload = build_final_payload(
        progress=progress_payloads[-1],
        stopped_reason=sampling_result.stopped_reason,
    )

    for progress_payload in progress_payloads[:-1]:
        await _sleep_before_event(event_index)
        event_index += 1
        yield encode_sse_event(
            _make_event(
                session_id=session.session_id,
                sequence=event_index,
                event_type="approx_progress",
                payload=progress_payload.model_dump(mode="json"),
            )
        )

    await _sleep_before_event(event_index)
    event_index += 1
    yield encode_sse_event(
        _make_event(
            session_id=session.session_id,
            sequence=event_index,
            event_type="approx_final",
            payload=final_payload.model_dump(mode="json"),
        )
    )

    try:
        exact_result = run_exact_query(
            dataset=session.dataset,
            sql=session.adaptive_query.exact_sql(),
        )
    except Exception as exc:
        await _sleep_before_event(event_index)
        yield encode_sse_event(
            _make_event(
                session_id=session.session_id,
                sequence=event_index + 1,
                event_type="error",
                payload=ErrorPayload(
                    code="exact_execution_failed",
                    message=f"Exact execution failed: {exc}",
                    retryable=False,
                ).model_dump(mode="json"),
            )
        )
        return

    await _sleep_before_event(event_index)
    event_index += 1
    yield encode_sse_event(
        _make_event(
            session_id=session.session_id,
            sequence=event_index,
            event_type="exact_result",
            payload=build_exact_result_payload(
                exact_value=exact_result.value,
                exact_latency_ms=exact_result.latency_ms,
                approx_final=final_payload,
                query=session.adaptive_query,
                dataset=session.dataset,
            ).model_dump(mode="json"),
        )
    )


async def _stream_initial_events(
    *, session: QuerySessionState, event_index_start: int
) -> AsyncIterator[str]:
    initial_events = (
        (
            "sql_generated",
            SqlGeneratedPayload(
                prompt=session.request.prompt,
                sql=session.sql,
                translation=session.translation,
            ).model_dump(mode="json"),
        ),
        (
            "plan_ready",
            PlanReadyPayload(planner=session.planner).model_dump(mode="json"),
        ),
    )

    event_index = event_index_start
    for event_type, payload in initial_events:
        await _sleep_before_event(event_index)
        event_index += 1
        yield encode_sse_event(
            _make_event(
                session_id=session.session_id,
                sequence=event_index,
                event_type=event_type,
                payload=payload,
            )
        )


async def _sleep_before_event(event_index: int) -> None:
    delays = get_settings().stream_delays_ms
    delay_ms = delays[min(event_index, len(delays) - 1)]
    await asyncio.sleep(delay_ms / 1000)


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


def encode_sse_event(event: QuerySessionEvent) -> str:
    body = json.dumps(event.model_dump(mode="json"))
    return f"id: {event.sequence}\nevent: {event.type}\ndata: {body}\n\n"
