# NL-to-SQL Contract

## Goal

Translate a user prompt into a supported SQL query while preserving provenance so the UI can show how the SQL was produced.

## Supported v1 SQL Subset

- Single-table `SELECT` with optional `WHERE`
- Aggregates: `COUNT`, `SUM`, `AVG`, `COUNT DISTINCT`
- Optional single-column `GROUP BY`
- No joins, subqueries, CTEs, or multi-table logic in the first pass

## Translator Interface

The translator module should expose one orchestration surface:

```python
async def translate(prompt: str, dataset, provider=None) -> TranslationResult
```

Suggested result shape:

```json
{
  "sql": "SELECT region, SUM(total_amount) AS revenue FROM orders_v1 GROUP BY region ORDER BY revenue DESC;",
  "metadata": {
    "translator": "fallback_templates",
    "provider": "noop_provider",
    "fallback_used": true,
    "latency_ms": 4,
    "warnings": []
  }
}
```

## Provider Adapter Contract

`provider.py` should define:

- an `NL2SQLProvider` interface or protocol
- one concrete adapter implementation
- a simple provider result object with `sql`, optional raw response, and warnings

The initial scaffold uses a no-op provider adapter so the rest of the stack can be wired before external API work starts.

## Fallback Template Contract

`fallback_templates.py` should:

- accept `prompt` and `dataset_id`
- map known demo prompts to deterministic SQL
- return stable aliases for result columns
- avoid unsupported SQL features
- return a default safe aggregate query when no named prompt pattern matches

This module is the first reliable path and should work without network access.

## Provenance Rules

Every translation should tell the UI:

- which translator path produced the SQL
- which provider was attempted, if any
- whether fallback templates were used
- how long translation took
- any warnings worth surfacing in an inspect panel

## Failure Behavior

- Translation must never execute SQL.
- Unsupported prompts should degrade to deterministic fallback behavior where possible.
- If neither provider nor fallback can produce safe SQL, the backend should surface an `error` event rather than guessing.

## Initial Demo Prompt Coverage

`orders_v1`

- `What is total revenue by region?`
- `How many delivered orders do we have?`
- `How many unique customers placed orders?`
- `What is the average order value?`

`shipments_v1`

- `How many late shipments are there?`
- `What is average delivery delay by carrier?`

## Handoff Rule

The NL-to-SQL teammate can replace the no-op provider adapter with a real LLM-backed adapter later, but the `TranslationResult` shape and fallback template behavior should stay stable for the frontend and planner.
