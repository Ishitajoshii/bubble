# Bubble v1 — Web App Plan

## Summary

Build Bubble as a single hosted web app where users type a natural-language prompt and receive a fast approximate answer first; the exact result arrives later for comparison. The product should remain explainable and visibly adaptive (prompt→SQL, validation, planner routing, progressive approximation updates, and DuckDB benchmarking).

Live mode is a secondary demo feature and must not reshape the core batch approximate-query pipeline.

## Core Product Flow

- Default UX: prompt-first with example prompts, dataset selector, and simple speed/accuracy presets.
- After submission the UI renders in this order:
	1. Generated SQL
	2. Planner rationale
	3. Progressive approx updates (per iteration)
	4. Final approximate result with error bound and target status
	5. Exact result and speedup (when available)

SQL remains visible in an inspectable panel for trust; prompt entry is the primary interaction. Live mode is in a separate tab and reuses display patterns without being part of the primary benchmark flow.

## UI Specifics

### Progressive Approximation Panel

- Emit updates after every sampling iteration (not just at completion).
- Show for each update: current estimate, relative error, confidence level, sample size, data scanned %, and elapsed time.
- Stop updates when the target error threshold is met or a sample cap is reached.

### Planner Rationale Card

- Show `Strategy` and `Reason` beside the result.
- Example:

	- Strategy: Stratified Sampling
	- Reason: GROUP BY with skew detected

- If approximation is declined, show the explicit fallback reason.

### Target Met Indicator

- Show active target and whether it was achieved.
- Example:

	- Target Accuracy: 95%
	- Status: Achieved

- Expanded details panel must expose confidence level and measured error.

### Data Scanned / Compute Saved Metrics

- Display `scanned %` and `compute saved %` on every update and in the final summary.
- Values must come from actual engine progress, not rough heuristics.

### Convergence Graph

- X-axis: data scanned %; Y-axis: error (%)
- Plot error at each iteration and animate a moving dot that advances per iteration until stopping.
- Draw a horizontal target-error line so users can see when the error becomes acceptable.
- Show elapsed time in tooltip for each point.

### Comparison Panel

- Show approximate result first; exact result fills in asynchronously with delta, exact latency, approximate latency, and speedup.

## Implementation Changes

- Serve React frontend and FastAPI backend together as one hosted app.
- Use a query-session model with SSE or WebSocket so the UI can render streamed events: `sql_generated`, `plan_ready`, repeated `approx_progress`, `approx_final`, and `exact_result`.

## Query pipeline

1. Prompt translator: NL → SQL (LLM adapter with deterministic fallback templates)
2. SQL validator/parser: enforce supported subset
3. Planner: choose one of `adaptive_sampling`, `stratified_sampling`, `hyperloglog`, `reservoir_sampling`, or `exact_fallback`
4. Approximate engine: emit iteration-by-iteration progress updates
5. Exact DuckDB query: run asynchronously for final comparison

## Supported SQL subset (v1)

- Single-table `SELECT` with `WHERE`
- Aggregates: `COUNT`, `SUM`, `AVG`, `COUNT DISTINCT`
- Optional single-column `GROUP BY`
- Live-window aggregations for the separate Live mode

## GROUP BY planning

- Use a pilot sample to estimate skew, cardinality pressure, and group coverage.
- If the planner cannot reliably approximate group distribution, fall back to exact execution (avoid expensive key-discovery pre-passes).

## COUNT DISTINCT

- Use a custom HyperLogLog implementation with mergeable registers and prebuilt sketches for benchmarking datasets.

## Live mode

- Separate append-only event feed plus reservoir/HLL-based summaries.
- Isolated from the core batch flow and reuses UI components where appropriate.

## APIs / Interfaces

### Create query session

`POST /api/query-sessions`

Request:

```json
{
	"prompt": "...",
	"dataset_id": "orders_v1",
	"live_mode": false,
	"error_tolerance": 0.05,
	"confidence_level": 0.95
}
```

Response:

```json
{ "session_id": "<uuid>" }
```

### Session events (stream)

`GET /api/query-sessions/:id/events`

Streamed event types:

- `sql_generated`
- `plan_ready`
- `approx_progress` (repeated)
- `approx_final`
- `exact_result`
- `error`

`approx_progress` payload (example fields):

```json
{
	"rows": 123,
	"strategy": "stratified",
	"rationale": "GROUP BY skew detected",
	"sample_fraction": 0.12,
	"sample_rows": 12000,
	"data_scanned_pct": 12.0,
	"compute_saved_pct": 88.0,
	"relative_error": 0.032,
	"confidence_level": 0.95,
	"target_summary": "5% target",
	"target_met": false,
	"elapsed_ms": 2350,
	"convergence_point": {
		"iteration": 3,
		"data_scanned_pct": 12.0,
		"relative_error": 0.032,
		"elapsed_ms": 2350
	}
}
```

### Other endpoints

- `POST /api/sql/run` — run SQL through the same planner/execution path (advanced users)
- `GET /api/datasets` and `GET /api/datasets/:id/schema` — return schema, descriptions, example prompts, and supported capabilities

## Test Plan

- Unit tests: planner routing, SQL subset validation, CI/error calculations, HLL correctness, reservoir behavior, GROUP BY fallback logic
- Integration tests: event ordering (`approx_progress` → `approx_final` → `exact_result`), prompt→SQL fallbacks, target-met transitions
- Statistical tests: seeded datasets to validate thresholds, rare-group handling, and measured speedup vs DuckDB
- UI acceptance: progressive updates, planner rationale, target-met states, scanned/saved accuracy, convergence graph behavior, asynchronous exact comparison

## Assumptions & Defaults

- v1 is a hosted demo app with built-in datasets only (no auth) and a prompt-first UX
- Defaults: `error_tolerance = 5%`, `confidence_level = 95%`
- Exact comparison is always secondary and asynchronous; approximate answers should feel immediate
- Live mode is secondary and isolated from the core batch approximate flow

---

This plan is intended as a runnable spec for the v1 demo; next steps: create minimal backend and frontend skeletons and wire a simple sample dataset.