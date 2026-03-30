# SwiftQuery v1 Architecture

## Goal

Ship a single hosted app with a prompt-first UI, a mocked-but-stable streaming contract first, then replace the mocked approximation stream with real adaptive sampling without breaking the frontend.

## Delivery Order

1. Lock contracts and one shared mock stream.
2. Build the static UI and animated convergence graph against mock data only.
3. Stand up a FastAPI stub that emits the same event shapes over SSE.
4. Replace mocked `approx_progress` events with real planner and sampling output.
5. Add exact DuckDB execution last because it is asynchronous and does not block the approximation UX.

## Runtime Components

### Frontend

- Prompt-first page with dataset selector and example prompts
- Cards for generated SQL, planner rationale, target status, approximate result, and exact comparison
- Convergence graph driven by repeated `approx_progress` events
- One stable mock file: `apps/web/src/mocks/query-session.ts`

### Backend

- FastAPI app under `apps/api/app`
- In-memory query-session manager for the stub phase
- SSE stream at `GET /api/query-sessions/{session_id}/events`
- Deterministic NL-to-SQL fallback translator for demo prompts
- Deterministic planner router that returns a stable strategy and rationale

## Session Flow

1. Client posts a prompt and dataset selection to `POST /api/query-sessions`.
2. Backend creates a session, translates prompt to SQL, and computes a planner result.
3. Client opens the SSE stream for that session.
4. Backend emits events in this order:
   - `sql_generated`
   - `plan_ready`
   - repeated `approx_progress`
   - `approx_final`
   - `exact_result`
5. The frontend renders each card as soon as its event arrives.

## Ownership Split

- Design work can proceed from the static mock dataset and query-session events only.
- Animation work should use only the repeated `approx_progress` events plus `approx_final`.
- NL-to-SQL work should stay behind `translator.py`, `provider.py`, and `fallback_templates.py`.
- Approximation engine work should only replace the mocked progress emitter, not the event contract.
- Exact execution should attach only to `exact_result` and must not change the earlier event order.

## Contract Stability Rules

- Request payloads use decimal fractions for `error_tolerance` and `confidence_level`.
- Progress payloads expose `relative_error` as a decimal fraction and `data_scanned_pct` / `compute_saved_pct` as percentages.
- Event envelopes are stable across mock and real backends: `session_id`, `type`, `sequence`, `sent_at`, `payload`.
- Mock timing metadata exists only in the frontend mock file and is not part of the API contract.

## Immediate Next Replacements

- Keep `sql_generated` and `plan_ready` shapes as-is when the real translator and planner arrive.
- Replace only the fake timed `approx_progress` and `approx_final` values from the session streamer with real adaptive-loop measurements.
- Add real `exact_result` from DuckDB after the frontend is already integrated and the approximation path is stable.
