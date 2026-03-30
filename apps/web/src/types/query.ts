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

export interface ApproxProgressPayload {
  iteration: number;
  estimate: number;
  display_value: string;
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

export interface ApproxFinalPayload extends ApproxProgressPayload {
  approx_latency_ms: number;
  stopped_reason: ApproxFinalReason;
}

export interface ExactResultPayload {
  exact_value: number;
  display_value: string;
  exact_latency_ms: number;
  approx_latency_ms: number;
  delta: number;
  delta_pct: number;
  speedup: number;
}

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
