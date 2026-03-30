export type QueryStrategy =
  | "adaptive_sampling"
  | "stratified_sampling"
  | "hyperloglog"
  | "reservoir_sampling"
  | "exact_fallback";

export type QuerySessionEventType =
  | "sql_generated"
  | "plan_ready"
  | "approx_progress"
  | "approx_final"
  | "exact_result"
  | "error";

export type ApproxProgressStatus = "warming_up" | "converging" | "target_met";

export type ApproxFinalReason =
  | "target_reached"
  | "sample_cap"
  | "exact_fallback";

export interface CreateQuerySessionRequest {
  prompt: string;
  dataset_id: string;
  live_mode: boolean;
  error_tolerance: number;
  confidence_level: number;
}

export interface CreateQuerySessionResponse {
  session_id: string;
}

export interface DatasetField {
  name: string;
  type: string;
  description: string;
  example_values: string[];
}

export interface DatasetSummary {
  dataset_id: string;
  label: string;
  description: string;
  row_count: number;
  capabilities: string[];
  example_prompts: string[];
  schema: DatasetField[];
}

export interface DatasetListResponse {
  items: DatasetSummary[];
}

export interface TranslationMetadata {
  translator: string;
  provider: string | null;
  fallback_used: boolean;
  latency_ms: number;
  warnings: string[];
}

export interface PlannerOutput {
  strategy: QueryStrategy;
  rationale: string;
  confidence_level: number;
  target_error_pct: number;
  target_summary: string;
  approx_supported: boolean;
  fallback_reason: string | null;
  planner_version: string;
}

export interface ConvergencePoint {
  iteration: number;
  data_scanned_pct: number;
  relative_error: number;
  elapsed_ms: number;
}

export interface SqlGeneratedPayload {
  prompt: string;
  sql: string;
  dialect: string;
  translation: TranslationMetadata;
}

export interface PlanReadyPayload {
  planner: PlannerOutput;
}

export interface ApproxGroupEstimate {
  group_value: string;
  estimate: number;
  display_value: string;
  relative_error: number;
  sample_rows: number;
  population_rows: number;
}

interface ApproxPayloadBase {
  result_scope: "scalar" | "grouped";
  iteration: number;
  sample_fraction: number;
  sample_rows: number;
  data_scanned_pct: number;
  compute_saved_pct: number;
  relative_error: number;
  confidence_level: number;
  target_error_pct: number;
  target_met: boolean;
  status: ApproxProgressStatus;
  elapsed_ms: number;
  convergence_point: ConvergencePoint;
}

export interface ScalarApproxProgressPayload extends ApproxPayloadBase {
  result_scope: "scalar";
  estimate: number;
  display_value: string;
}

export interface GroupedApproxProgressPayload extends ApproxPayloadBase {
  result_scope: "grouped";
  group_by_column: string;
  group_count: number;
  group_rows: ApproxGroupEstimate[];
  summary_label: string;
  error_metric_label: string;
}

export type ApproxProgressPayload =
  | ScalarApproxProgressPayload
  | GroupedApproxProgressPayload;

export interface ScalarApproxFinalPayload extends ScalarApproxProgressPayload {
  approx_latency_ms: number;
  stopped_reason: ApproxFinalReason;
}

export interface GroupedApproxFinalPayload extends GroupedApproxProgressPayload {
  approx_latency_ms: number;
  stopped_reason: ApproxFinalReason;
}

export type ApproxFinalPayload =
  | ScalarApproxFinalPayload
  | GroupedApproxFinalPayload;

export interface ScalarExactResultPayload {
  result_scope: "scalar";
  exact_value: number;
  display_value: string;
  exact_latency_ms: number;
  approx_latency_ms: number;
  delta: number;
  delta_pct: number;
  speedup: number;
}

export interface ExactGroupComparison {
  group_value: string;
  approx_estimate: number;
  approx_display_value: string;
  exact_value: number;
  exact_display_value: string;
  delta: number;
  delta_pct: number;
}

export interface GroupedExactResultPayload {
  result_scope: "grouped";
  group_by_column: string;
  group_count: number;
  rows: ExactGroupComparison[];
  max_delta_pct: number;
  mean_delta_pct: number;
  exact_latency_ms: number;
  approx_latency_ms: number;
  speedup: number;
}

export type ExactResultPayload =
  | ScalarExactResultPayload
  | GroupedExactResultPayload;

export interface ErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
}

export interface QuerySessionEventMap {
  sql_generated: SqlGeneratedPayload;
  plan_ready: PlanReadyPayload;
  approx_progress: ApproxProgressPayload;
  approx_final: ApproxFinalPayload;
  exact_result: ExactResultPayload;
  error: ErrorPayload;
}

export interface QuerySessionEvent<T extends QuerySessionEventType = QuerySessionEventType> {
  session_id: string;
  type: T;
  sequence: number;
  sent_at: string;
  payload: QuerySessionEventMap[T];
}

export type AnyQuerySessionEvent = {
  [Type in QuerySessionEventType]: QuerySessionEvent<Type>;
}[QuerySessionEventType];

export type TimedMockQuerySessionEvent = AnyQuerySessionEvent & {
  mockDelayMs: number;
};
