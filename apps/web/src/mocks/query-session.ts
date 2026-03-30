import type {
  AnyQuerySessionEvent,
  CreateQuerySessionRequest,
  CreateQuerySessionResponse,
  DatasetSummary,
  TimedMockQuerySessionEvent,
} from "../types/query";

export const mockQueryDataset: DatasetSummary = {
  dataset_id: "orders_v1",
  label: "Orders",
  description: "E-commerce order facts for aggregate and group-by benchmarks.",
  row_count: 1200000,
  capabilities: ["count", "sum", "avg", "count_distinct", "group_by"],
  example_prompts: [
    "What is total revenue?",
    "What is total revenue by region?",
    "How many delivered orders do we have?",
    "How many unique customers placed orders?",
  ],
  schema: [
    {
      name: "order_id",
      type: "INTEGER",
      description: "Primary key for the order row",
      example_values: ["100045", "100046"],
    },
    {
      name: "order_date",
      type: "DATE",
      description: "Calendar date for the order",
      example_values: ["2026-03-01", "2026-03-02"],
    },
    {
      name: "region",
      type: "TEXT",
      description: "Sales region",
      example_values: ["North", "West"],
    },
    {
      name: "status",
      type: "TEXT",
      description: "Order lifecycle status",
      example_values: ["processing", "delivered"],
    },
    {
      name: "customer_id",
      type: "INTEGER",
      description: "Customer foreign key",
      example_values: ["5012", "5013"],
    },
    {
      name: "total_amount",
      type: "DOUBLE",
      description: "Order revenue amount",
      example_values: ["129.50", "342.10"],
    },
  ],
};

export const mockCreateQuerySessionRequest: CreateQuerySessionRequest = {
  prompt: "What is total revenue?",
  dataset_id: mockQueryDataset.dataset_id,
  live_mode: false,
  error_tolerance: 0.05,
  confidence_level: 0.95,
};

export const mockCreateQuerySessionResponse: CreateQuerySessionResponse = {
  session_id: "qs_mock_001",
};

export const mockTimedQuerySessionEvents: TimedMockQuerySessionEvent[] = [
  {
    session_id: mockCreateQuerySessionResponse.session_id,
    type: "sql_generated",
    sequence: 1,
    sent_at: "2026-03-30T12:10:01.120000Z",
    mockDelayMs: 150,
    payload: {
      prompt: mockCreateQuerySessionRequest.prompt,
      sql: "SELECT SUM(total_amount) AS total_revenue FROM orders_v1;",
      dialect: "duckdb",
      translation: {
        translator: "fallback_templates",
        provider: "noop_provider",
        fallback_used: true,
        latency_ms: 4,
        warnings: [],
      },
    },
  },
  {
    session_id: mockCreateQuerySessionResponse.session_id,
    type: "plan_ready",
    sequence: 2,
    sent_at: "2026-03-30T12:10:01.370000Z",
    mockDelayMs: 250,
    payload: {
      planner: {
        strategy: "adaptive_sampling",
        rationale:
          "Single-table aggregate without GROUP BY fits adaptive sampling.",
        confidence_level: 0.95,
        target_error_pct: 5,
        target_summary: "Within 5% at 95% confidence",
        approx_supported: true,
        fallback_reason: null,
        planner_version: "mock-planner-v1",
      },
    },
  },
  {
    session_id: mockCreateQuerySessionResponse.session_id,
    type: "approx_progress",
    sequence: 3,
    sent_at: "2026-03-30T12:10:02.010000Z",
    mockDelayMs: 420,
    payload: {
      iteration: 1,
      estimate: 104200,
      display_value: "$104,200",
      sample_fraction: 0.03,
      sample_rows: 36000,
      data_scanned_pct: 3,
      compute_saved_pct: 97,
      relative_error: 0.19,
      confidence_level: 0.95,
      target_error_pct: 5,
      target_met: false,
      status: "warming_up",
      elapsed_ms: 640,
      convergence_point: {
        iteration: 1,
        data_scanned_pct: 3,
        relative_error: 0.19,
        elapsed_ms: 640,
      },
    },
  },
  {
    session_id: mockCreateQuerySessionResponse.session_id,
    type: "approx_progress",
    sequence: 4,
    sent_at: "2026-03-30T12:10:02.730000Z",
    mockDelayMs: 520,
    payload: {
      iteration: 2,
      estimate: 118900,
      display_value: "$118,900",
      sample_fraction: 0.075,
      sample_rows: 90000,
      data_scanned_pct: 7.5,
      compute_saved_pct: 92.5,
      relative_error: 0.11,
      confidence_level: 0.95,
      target_error_pct: 5,
      target_met: false,
      status: "converging",
      elapsed_ms: 1230,
      convergence_point: {
        iteration: 2,
        data_scanned_pct: 7.5,
        relative_error: 0.11,
        elapsed_ms: 1230,
      },
    },
  },
  {
    session_id: mockCreateQuerySessionResponse.session_id,
    type: "approx_progress",
    sequence: 5,
    sent_at: "2026-03-30T12:10:03.460000Z",
    mockDelayMs: 620,
    payload: {
      iteration: 3,
      estimate: 123950,
      display_value: "$123,950",
      sample_fraction: 0.138,
      sample_rows: 165600,
      data_scanned_pct: 13.8,
      compute_saved_pct: 86.2,
      relative_error: 0.061,
      confidence_level: 0.95,
      target_error_pct: 5,
      target_met: false,
      status: "converging",
      elapsed_ms: 1810,
      convergence_point: {
        iteration: 3,
        data_scanned_pct: 13.8,
        relative_error: 0.061,
        elapsed_ms: 1810,
      },
    },
  },
  {
    session_id: mockCreateQuerySessionResponse.session_id,
    type: "approx_progress",
    sequence: 6,
    sent_at: "2026-03-30T12:10:04.160000Z",
    mockDelayMs: 700,
    payload: {
      iteration: 4,
      estimate: 124197,
      display_value: "$124,197",
      sample_fraction: 0.194,
      sample_rows: 232800,
      data_scanned_pct: 19.4,
      compute_saved_pct: 80.6,
      relative_error: 0.038,
      confidence_level: 0.95,
      target_error_pct: 5,
      target_met: true,
      status: "target_met",
      elapsed_ms: 2480,
      convergence_point: {
        iteration: 4,
        data_scanned_pct: 19.4,
        relative_error: 0.038,
        elapsed_ms: 2480,
      },
    },
  },
  {
    session_id: mockCreateQuerySessionResponse.session_id,
    type: "approx_final",
    sequence: 7,
    sent_at: "2026-03-30T12:10:04.420000Z",
    mockDelayMs: 240,
    payload: {
      iteration: 4,
      estimate: 124197,
      display_value: "$124,197",
      sample_fraction: 0.194,
      sample_rows: 232800,
      data_scanned_pct: 19.4,
      compute_saved_pct: 80.6,
      relative_error: 0.038,
      confidence_level: 0.95,
      target_error_pct: 5,
      target_met: true,
      status: "target_met",
      elapsed_ms: 2480,
      convergence_point: {
        iteration: 4,
        data_scanned_pct: 19.4,
        relative_error: 0.038,
        elapsed_ms: 2480,
      },
      approx_latency_ms: 2480,
      stopped_reason: "target_reached",
    },
  },
  {
    session_id: mockCreateQuerySessionResponse.session_id,
    type: "exact_result",
    sequence: 8,
    sent_at: "2026-03-30T12:10:05.810000Z",
    mockDelayMs: 1400,
    payload: {
      exact_value: 129104,
      display_value: "$129,104",
      exact_latency_ms: 11120,
      approx_latency_ms: 2480,
      delta: 4907,
      delta_pct: 0.038,
      speedup: 4.48,
    },
  },
];

function stripMockDelay(event: TimedMockQuerySessionEvent): AnyQuerySessionEvent {
  const { mockDelayMs: _mockDelayMs, ...rest } = event;
  return rest as AnyQuerySessionEvent;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

export const mockQuerySessionEvents: AnyQuerySessionEvent[] =
  mockTimedQuerySessionEvents.map(stripMockDelay);

export async function* streamMockQuerySessionEvents(
  speedMultiplier = 1,
): AsyncGenerator<AnyQuerySessionEvent> {
  const safeMultiplier = speedMultiplier > 0 ? speedMultiplier : 1;

  for (const event of mockTimedQuerySessionEvents) {
    await sleep(Math.round(event.mockDelayMs / safeMultiplier));
    yield stripMockDelay(event);
  }
}
