from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.schemas.query import (
    CreateQuerySessionRequest,
    CreateQuerySessionResponse,
    QueryHistoryListResponse,
)
from app.services.sessions.manager import (
    create_query_session,
    get_query_session,
    list_query_history,
)
from app.services.sessions.streamer import stream_session_events

router = APIRouter(prefix="/query-sessions", tags=["query-sessions"])


@router.post("", response_model=CreateQuerySessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    request: CreateQuerySessionRequest,
) -> CreateQuerySessionResponse:
    try:
        session = await create_query_session(request)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return CreateQuerySessionResponse(session_id=session.session_id)


@router.get("/history", response_model=QueryHistoryListResponse)
async def get_query_history() -> QueryHistoryListResponse:
    return QueryHistoryListResponse(items=list_query_history())


@router.get("/{session_id}/events")
async def get_session_events(session_id: str) -> StreamingResponse:
    session = get_query_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown session '{session_id}'.",
        )

    return StreamingResponse(
        stream_session_events(session),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
