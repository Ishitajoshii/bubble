from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import uuid4

from app.schemas.dataset import DatasetSummary
from app.schemas.events import PlannerOutput, TranslationMetadata
from app.schemas.query import CreateQuerySessionRequest, QueryHistoryItem
from app.services.datasets.catalog import get_dataset
from app.services.exact.duckdb_runner import GroupPopulation, fetch_group_populations
from app.services.nl_sql.translator import QueryTranslator
from app.services.planner.parser import AdaptiveAggregateQuery, parse_adaptive_query
from app.services.planner.router import route_query
from app.services.planner.validator import validate_adaptive_query


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
    approx_query: AdaptiveAggregateQuery | None = None
    group_populations: list[GroupPopulation] | None = None
    created_at: datetime = field(default_factory=utc_now)


_translator = QueryTranslator()
_sessions: dict[str, QuerySessionState] = {}
_history: list[QueryHistoryItem] = []


async def create_query_session(request: CreateQuerySessionRequest) -> QuerySessionState:
    dataset = get_dataset(request.dataset_id)
    if dataset is None:
        raise LookupError(f"Unknown dataset '{request.dataset_id}'.")

    translation = await _translator.translate(prompt=request.prompt, dataset=dataset)
    approx_query: AdaptiveAggregateQuery | None = None
    group_populations: list[GroupPopulation] | None = None
    unsupported_reason: str | None = None

    try:
        approx_query = validate_adaptive_query(
            parse_adaptive_query(translation.sql), dataset
        )
    except ValueError as exc:
        unsupported_reason = str(exc)
        approx_query = None

    if approx_query is not None and approx_query.is_grouped:
        try:
            group_populations, _latency_ms = fetch_group_populations(
                dataset=dataset,
                sql=approx_query.group_population_sql(),
            )
        except Exception as exc:
            unsupported_reason = f"Failed to analyze grouped strata: {exc}"
            approx_query = None
            group_populations = None

    planner = route_query(
        query=approx_query,
        live_mode=request.live_mode,
        error_tolerance=request.error_tolerance,
        confidence_level=request.confidence_level,
        group_populations=group_populations,
        unsupported_reason=unsupported_reason,
    )

    if not planner.approx_supported:
        approx_query = None
        group_populations = None

    session = QuerySessionState(
        session_id=f"qs_{uuid4().hex[:12]}",
        request=request,
        dataset=dataset,
        sql=translation.sql,
        translation=translation.metadata,
        planner=planner,
        approx_query=approx_query,
        group_populations=group_populations,
    )
    _sessions[session.session_id] = session
    _history.insert(
        0,
        QueryHistoryItem(
            session_id=session.session_id,
            prompt=request.prompt,
            dataset_id=dataset.dataset_id,
            dataset_label=dataset.label,
            live_mode=request.live_mode,
            error_tolerance=request.error_tolerance,
            confidence_level=request.confidence_level,
            created_at=session.created_at,
        ),
    )
    return session


def get_query_session(session_id: str) -> QuerySessionState | None:
    return _sessions.get(session_id)


def list_query_history(limit: int = 50) -> list[QueryHistoryItem]:
    return _history[:limit]


def clear_query_sessions() -> None:
    _sessions.clear()
    _history.clear()
