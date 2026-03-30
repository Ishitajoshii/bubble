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
ApproxResultScope = Literal["scalar", "grouped"]


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


class ApproxGroupEstimate(BaseModel):
    group_value: str
    estimate: float
    display_value: str
    relative_error: float
    sample_rows: int
    population_rows: int


class ApproxPayloadBase(BaseModel):
    result_scope: ApproxResultScope
    iteration: int
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


class ScalarApproxProgressPayload(ApproxPayloadBase):
    result_scope: Literal["scalar"] = "scalar"
    estimate: float
    display_value: str


class GroupedApproxProgressPayload(ApproxPayloadBase):
    result_scope: Literal["grouped"] = "grouped"
    group_by_column: str
    group_count: int
    group_rows: list[ApproxGroupEstimate] = Field(default_factory=list)
    summary_label: str
    error_metric_label: str = "Max group relative error"


class ScalarApproxFinalPayload(ScalarApproxProgressPayload):
    approx_latency_ms: int
    stopped_reason: ApproxFinalReason


class GroupedApproxFinalPayload(GroupedApproxProgressPayload):
    approx_latency_ms: int
    stopped_reason: ApproxFinalReason


ApproxProgressPayload = ScalarApproxProgressPayload | GroupedApproxProgressPayload
ApproxFinalPayload = ScalarApproxFinalPayload | GroupedApproxFinalPayload


class ScalarExactResultPayload(BaseModel):
    result_scope: Literal["scalar"] = "scalar"
    exact_value: float
    display_value: str
    exact_latency_ms: int
    approx_latency_ms: int
    delta: float
    delta_pct: float
    speedup: float


class ExactGroupComparison(BaseModel):
    group_value: str
    approx_estimate: float
    approx_display_value: str
    exact_value: float
    exact_display_value: str
    delta: float
    delta_pct: float


class GroupedExactResultPayload(BaseModel):
    result_scope: Literal["grouped"] = "grouped"
    group_by_column: str
    group_count: int
    rows: list[ExactGroupComparison] = Field(default_factory=list)
    max_delta_pct: float
    mean_delta_pct: float
    exact_latency_ms: int
    approx_latency_ms: int
    speedup: float


ExactResultPayload = ScalarExactResultPayload | GroupedExactResultPayload


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
