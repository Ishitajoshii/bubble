# Query Sessions Contract

## Scope

This contract covers the stub-to-real path for:

- `GET /api/health`
- `GET /api/datasets`
- `POST /api/query-sessions`
- `GET /api/query-sessions/{session_id}/events`

The FastAPI route uses `{session_id}` path syntax even though earlier planning notes used `:id`.

## Health

`GET /api/health`

Response:

```json
{
  "status": "ok",
  "service": "bubble-api"
}
```

## Datasets

`GET /api/datasets`

Response:

```json
{
  "items": [
    {
      "dataset_id": "orders_v1",
      "label": "Orders",
      "description": "E-commerce order facts for aggregate and group-by benchmarks.",
      "row_count": 1200000,
      "capabilities": [
        "count",
        "sum",
        "avg",
        "count_distinct",
        "group_by"
      ],
      "example_prompts": [
        "What is total revenue?",
        "What is total revenue by region?",
        "How many delivered orders do we have?",
        "How many unique customers placed orders?"
      ],
      "schema": [
        {
          "name": "order_id",
          "type": "INTEGER",
          "description": "Primary key for the order row",
          "example_values": ["100045", "100046"]
        }
      ]
    }
  ]
}
```

## Create Session

`POST /api/query-sessions`

Request:

```json
{
  "prompt": "What is total revenue?",
  "dataset_id": "orders_v1",
  "live_mode": false,
  "error_tolerance": 0.05,
  "confidence_level": 0.95
}
```

Notes:

- `error_tolerance` is a decimal fraction. `0.05` means `5%`.
- `confidence_level` is a decimal fraction. `0.95` means `95%`.

Response:

```json
{
  "session_id": "qs_4b7719162de2"
}
```

## Session Events Stream

`GET /api/query-sessions/{session_id}/events`

Transport:

- Server-Sent Events (`text/event-stream`)
- One event envelope per SSE message
- `event:` matches the envelope `type`
- `id:` matches the envelope `sequence`

SSE example:

```text
event: approx_progress
id: 3
data: {"session_id":"qs_4b7719162de2","type":"approx_progress","sequence":3,"sent_at":"2026-03-30T12:10:02.410000Z","payload":{"iteration":1,"estimate":104200.0,"display_value":"$104,200","sample_fraction":0.03,"sample_rows":36000,"data_scanned_pct":3.0,"compute_saved_pct":97.0,"relative_error":0.19,"confidence_level":0.95,"target_error_pct":5.0,"target_met":false,"status":"warming_up","elapsed_ms":640,"convergence_point":{"iteration":1,"data_scanned_pct":3.0,"relative_error":0.19,"elapsed_ms":640}}}
```

## Stable Event Order

The stub backend and the real backend should both emit events in this order:

1. `sql_generated`
2. `plan_ready`
3. repeated `approx_progress`
4. `approx_final`
5. `exact_result`

If a fatal error occurs, the stream may emit `error` and stop.

## Event Envelope

Every streamed event uses this envelope:

```json
{
  "session_id": "qs_4b7719162de2",
  "type": "approx_progress",
  "sequence": 3,
  "sent_at": "2026-03-30T12:10:02.410000Z",
  "payload": {}
}
```

Envelope fields:

- `session_id`: unique query-session identifier
- `type`: one of `sql_generated`, `plan_ready`, `approx_progress`, `approx_final`, `exact_result`, `error`
- `sequence`: monotonically increasing integer within a session
- `sent_at`: UTC timestamp in ISO 8601 format
- `payload`: event-specific object

## Payload Contracts

### `sql_generated`

```json
{
  "prompt": "What is total revenue?",
  "sql": "SELECT SUM(total_amount) AS total_revenue FROM orders_v1;",
  "dialect": "duckdb",
  "translation": {
    "translator": "fallback_templates",
    "provider": "noop_provider",
    "fallback_used": true,
    "latency_ms": 4,
    "warnings": []
  }
}
```

### `plan_ready`

```json
{
  "planner": {
    "strategy": "adaptive_sampling",
    "rationale": "Single-table aggregate without GROUP BY fits adaptive sampling.",
    "confidence_level": 0.95,
    "target_error_pct": 5.0,
    "target_summary": "Within 5% at 95% confidence",
    "approx_supported": true,
    "fallback_reason": null,
    "planner_version": "mock-planner-v1"
  }
}
```

### `approx_progress`

```json
{
  "iteration": 3,
  "estimate": 123950.0,
  "display_value": "$123,950",
  "sample_fraction": 0.138,
  "sample_rows": 165600,
  "data_scanned_pct": 13.8,
  "compute_saved_pct": 86.2,
  "relative_error": 0.061,
  "confidence_level": 0.95,
  "target_error_pct": 5.0,
  "target_met": false,
  "status": "converging",
  "elapsed_ms": 1810,
  "convergence_point": {
    "iteration": 3,
    "data_scanned_pct": 13.8,
    "relative_error": 0.061,
    "elapsed_ms": 1810
  }
}
```

### `approx_final`

```json
{
  "iteration": 4,
  "estimate": 124197.0,
  "display_value": "$124,197",
  "sample_fraction": 0.194,
  "sample_rows": 232800,
  "data_scanned_pct": 19.4,
  "compute_saved_pct": 80.6,
  "relative_error": 0.038,
  "confidence_level": 0.95,
  "target_error_pct": 5.0,
  "target_met": true,
  "status": "target_met",
  "elapsed_ms": 2480,
  "convergence_point": {
    "iteration": 4,
    "data_scanned_pct": 19.4,
    "relative_error": 0.038,
    "elapsed_ms": 2480
  },
  "approx_latency_ms": 2480,
  "stopped_reason": "target_reached"
}
```

### `exact_result`

```json
{
  "exact_value": 129104.0,
  "display_value": "$129,104",
  "exact_latency_ms": 11120,
  "approx_latency_ms": 2480,
  "delta": 4907.0,
  "delta_pct": 0.038,
  "speedup": 4.48
}
```

### `error`

```json
{
  "code": "unsupported_query",
  "message": "Query is outside the supported approximation subset.",
  "retryable": false
}
```

## Stub Phase Rule

The initial FastAPI implementation is allowed to emit fake timed values as long as:

- the event order stays stable
- field names and units stay stable
- frontend code can switch from mock file to SSE without changing card or graph props
