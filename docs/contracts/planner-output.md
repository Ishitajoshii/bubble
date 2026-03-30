# Planner Output Contract

## Purpose

The planner decides whether a query can be approximated and which strategy should drive the progressive stream. The planner output is emitted inside the `plan_ready` event and should remain stable even while the planner internals evolve.

## Output Object

```json
{
  "strategy": "stratified_sampling",
  "rationale": "GROUP BY detected; use stratified sampling to protect skewed groups.",
  "confidence_level": 0.95,
  "target_error_pct": 5.0,
  "target_summary": "Within 5% at 95% confidence",
  "approx_supported": true,
  "fallback_reason": null,
  "planner_version": "mock-planner-v1"
}
```

## Fields

- `strategy`: one of `adaptive_sampling`, `stratified_sampling`, `hyperloglog`, `reservoir_sampling`, `exact_fallback`
- `rationale`: short user-facing explanation for the chosen route
- `confidence_level`: decimal fraction carried from the request
- `target_error_pct`: requested tolerance rendered as a percentage value
- `target_summary`: compact human-readable target text
- `approx_supported`: whether approximation is allowed for this query
- `fallback_reason`: explicit reason when `approx_supported` is `false`
- `planner_version`: contract version string for observability

## Stub Routing Rules

The initial router can be deterministic and simple:

- `live_mode == true` -> `reservoir_sampling`
- `COUNT DISTINCT` detected -> `hyperloglog`
- `GROUP BY` detected -> `stratified_sampling`
- aggregate without `GROUP BY` -> `adaptive_sampling`
- anything outside the supported subset -> `exact_fallback`

These rules are intentionally easy to replace later with real parsing, skew detection, and pilot-sample signals.

## Rationale Guidance

Rationale text should answer "why this route?" in one sentence and should be safe to show directly in the UI.

Good examples:

- `GROUP BY detected; use stratified sampling to protect skewed groups.`
- `COUNT DISTINCT is routed to mergeable sketch estimation.`
- `Single-table aggregate without GROUP BY fits adaptive sampling.`
- `Query is outside the supported approximation subset.`

## Fallback Example

```json
{
  "strategy": "exact_fallback",
  "rationale": "Query is outside the supported approximation subset.",
  "confidence_level": 0.95,
  "target_error_pct": 5.0,
  "target_summary": "Within 5% at 95% confidence",
  "approx_supported": false,
  "fallback_reason": "Unsupported SQL subset for v1.",
  "planner_version": "mock-planner-v1"
}
```

## Non-Goals For This Phase

The first planner contract does not require:

- AST-level SQL validation
- pilot samples
- skew estimates
- cost modeling
- live DuckDB integration

Those can arrive later as long as the output fields above remain stable.
