from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import uuid4

from app.schemas.dataset import DatasetSummary
from app.schemas.events import PlannerOutput, TranslationMetadata
from app.schemas.query import CreateQuerySessionRequest
from app.services.datasets.catalog import get_dataset
from app.services.nl_sql.translator import QueryTranslator
from app.services.planner.router import route_query


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class QuerySessionState:
    session_id: str
    request: CreateQuerySessionRequest
    dataset: DatasetSummary
    sql: str
    translation: TranslationMetadata
    planner: PlannerOutput
    created_at: datetime = field(default_factory=utc_now)


_translator = QueryTranslator()
_sessions: dict[str, QuerySessionState] = {}


async def create_query_session(request: CreateQuerySessionRequest) -> QuerySessionState:
    dataset = get_dataset(request.dataset_id)
    if dataset is None:
        raise LookupError(f"Unknown dataset '{request.dataset_id}'.")

    translation = await _translator.translate(prompt=request.prompt, dataset=dataset)
    planner = route_query(
        sql=translation.sql,
        live_mode=request.live_mode,
        error_tolerance=request.error_tolerance,
        confidence_level=request.confidence_level,
    )

    session = QuerySessionState(
        session_id=f"qs_{uuid4().hex[:12]}",
        request=request,
        dataset=dataset,
        sql=translation.sql,
        translation=translation.metadata,
        planner=planner,
    )
    _sessions[session.session_id] = session
    return session


def get_query_session(session_id: str) -> QuerySessionState | None:
    return _sessions.get(session_id)
