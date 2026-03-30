from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

QueryStrategy = Literal[
    "adaptive_sampling",
    "stratified_sampling",
    "hyperloglog",
    "reservoir_sampling",
    "exact_fallback",
]
QuerySessionEventType = Literal[
    "sql_generated",
    "plan_ready",
    "approx_progress",
    "approx_final",
    "exact_result",
    "error",
]
ApproxProgressStatus = Literal["warming_up", "converging", "target_met"]
ApproxFinalReason = Literal["target_reached", "sample_cap", "exact_fallback"]


class TranslationMetadata(BaseModel):
    translator: str
    provider: str | None = None
    fallback_used: bool = False
    latency_ms: int = 0
    warnings: list[str] = Field(default_factory=list)


class PlannerOutput(BaseModel):
    strategy: QueryStrategy
    rationale: str
    confidence_level: float
    target_error_pct: float
    target_summary: str
    approx_supported: bool = True
    fallback_reason: str | None = None
    planner_version: str = "mock-planner-v1"


class ConvergencePoint(BaseModel):
    iteration: int
    data_scanned_pct: float
    relative_error: float
    elapsed_ms: int


class SqlGeneratedPayload(BaseModel):
    prompt: str
    sql: str
    dialect: str = "duckdb"
    translation: TranslationMetadata


class PlanReadyPayload(BaseModel):
    planner: PlannerOutput


class ApproxProgressPayload(BaseModel):
    iteration: int
    estimate: float
    display_value: str
    sample_fraction: float
    sample_rows: int
    data_scanned_pct: float
    compute_saved_pct: float
    relative_error: float
    confidence_level: float
    target_error_pct: float
    target_met: bool
    status: ApproxProgressStatus
    elapsed_ms: int
    convergence_point: ConvergencePoint


class ApproxFinalPayload(ApproxProgressPayload):
    approx_latency_ms: int
    stopped_reason: ApproxFinalReason


class ExactResultPayload(BaseModel):
    exact_value: float
    display_value: str
    exact_latency_ms: int
    approx_latency_ms: int
    delta: float
    delta_pct: float
    speedup: float


class ErrorPayload(BaseModel):
    code: str
    message: str
    retryable: bool = False


class QuerySessionEvent(BaseModel):
    session_id: str
    type: QuerySessionEventType
    sequence: int
    sent_at: datetime
    payload: dict[str, Any]
