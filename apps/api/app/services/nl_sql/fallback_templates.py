from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.schemas.dataset import DatasetField, DatasetSummary

_NUMERIC_TYPES = {"INTEGER", "BIGINT", "DOUBLE", "DECIMAL", "FLOAT", "REAL"}
_TRUE_TOKENS = {"true", "yes", "y", "1"}
_FALSE_TOKENS = {"false", "no", "n", "0"}


@dataclass(slots=True)
class FallbackTemplateResult:
    sql: str
    warnings: list[str] = field(default_factory=list)


def build_fallback_sql(prompt: str, dataset: DatasetSummary) -> FallbackTemplateResult:
    normalized = " ".join(prompt.lower().split())

    if dataset.dataset_id == "orders_v1":
        if "revenue by region" in normalized or (
            "region" in normalized and ("revenue" in normalized or "sales" in normalized)
        ):
            return FallbackTemplateResult(
                sql=(
                    "SELECT region, SUM(total_amount) AS revenue "
                    "FROM orders_v1 GROUP BY region ORDER BY revenue DESC;"
                )
            )
        if "total revenue" in normalized or "total sales" in normalized:
            return FallbackTemplateResult(
                sql="SELECT SUM(total_amount) AS total_revenue FROM orders_v1;"
            )
        if "average order value" in normalized or "avg order value" in normalized:
            return FallbackTemplateResult(
                sql="SELECT AVG(total_amount) AS average_order_value FROM orders_v1;"
            )
        if "unique customer" in normalized or "count distinct" in normalized:
            return FallbackTemplateResult(
                sql="SELECT COUNT(DISTINCT customer_id) AS unique_customers FROM orders_v1;"
            )
        if "delivered orders" in normalized:
            return FallbackTemplateResult(
                sql=(
                    "SELECT COUNT(*) AS delivered_orders "
                    "FROM orders_v1 WHERE status = 'delivered';"
                )
            )

    if dataset.dataset_id == "shipments_v1":
        if "delay by carrier" in normalized:
            return FallbackTemplateResult(
                sql=(
                    "SELECT carrier, AVG(delay_minutes) AS average_delay_minutes "
                    "FROM shipments_v1 GROUP BY carrier ORDER BY average_delay_minutes DESC;"
                )
            )
        if "late shipment" in normalized:
            return FallbackTemplateResult(
                sql=(
                    "SELECT COUNT(*) AS late_shipments "
                    "FROM shipments_v1 WHERE is_late = TRUE;"
                )
            )

    return _build_schema_aware_fallback(prompt=normalized, dataset=dataset)


def _build_schema_aware_fallback(
    *, prompt: str, dataset: DatasetSummary
) -> FallbackTemplateResult:
    aggregate = _choose_aggregate(prompt)
    filters = _extract_filters(prompt=prompt, dataset=dataset)
    numeric_field = _pick_numeric_field(prompt=prompt, dataset=dataset)
    warnings: list[str] = []

    if aggregate in {"sum", "avg"} and numeric_field is None:
        warnings.append(
            "Prompt suggested a numeric aggregate, but the dataset has no numeric columns; used COUNT(*)."
        )
        aggregate = "count"

    if aggregate == "count":
        sql = f"SELECT COUNT(*) AS row_count FROM {dataset.dataset_id}"
    else:
        assert numeric_field is not None
        alias = (
            f"total_{numeric_field.name}"
            if aggregate == "sum"
            else f"average_{numeric_field.name}"
        )
        sql = (
            f"SELECT {aggregate.upper()}({numeric_field.name}) AS {alias} "
            f"FROM {dataset.dataset_id}"
        )

    if filters:
        sql += " WHERE " + " AND ".join(filters)

    sql += ";"

    if len(warnings) == 0 and aggregate == "count" and len(filters) == 0:
        warnings.append(
            "Prompt did not map cleanly to a numeric aggregate or filter; used COUNT(*)."
        )

    return FallbackTemplateResult(sql=sql, warnings=warnings)


def _choose_aggregate(prompt: str) -> str:
    if any(token in prompt for token in ("average", "avg", "mean")):
        return "avg"
    if any(token in prompt for token in ("total", "sum")):
        return "sum"
    return "count"


def _pick_numeric_field(prompt: str, dataset: DatasetSummary) -> DatasetField | None:
    numeric_fields = [
        field for field in dataset.schema_fields if field.type.upper() in _NUMERIC_TYPES
    ]
    if len(numeric_fields) == 0:
        return None

    prompt_tokens = _tokenize(prompt)
    best_field = numeric_fields[0]
    best_score = -1

    for field in numeric_fields:
        field_tokens = _tokenize(
            " ".join([field.name, field.description, *field.example_values])
        )
        score = len(prompt_tokens & field_tokens)
        if score > best_score:
            best_score = score
            best_field = field

    return best_field


def _extract_filters(*, prompt: str, dataset: DatasetSummary) -> list[str]:
    filters: list[str] = []
    filtered_columns: set[str] = set()

    for field in dataset.schema_fields:
        if field.name in filtered_columns:
            continue

        field_type = field.type.upper()
        field_tokens = _tokenize(" ".join([field.name, field.description]))

        if field_type == "BOOLEAN":
            if len(field_tokens & _tokenize(prompt)) > 0:
                if any(token in _tokenize(prompt) for token in _TRUE_TOKENS):
                    filters.append(f"{field.name} = TRUE")
                    filtered_columns.add(field.name)
                    continue
                if any(token in _tokenize(prompt) for token in _FALSE_TOKENS):
                    filters.append(f"{field.name} = FALSE")
                    filtered_columns.add(field.name)
                    continue

        if field_type in {"TEXT", "DATE", "BOOLEAN"}:
            for example_value in field.example_values:
                normalized_example = example_value.lower()
                if normalized_example and normalized_example in prompt:
                    if field_type == "BOOLEAN":
                        filters.append(
                            f"{field.name} = {'TRUE' if normalized_example in _TRUE_TOKENS else 'FALSE'}"
                        )
                    else:
                        escaped = example_value.replace("'", "''")
                        filters.append(f"{field.name} = '{escaped}'")
                    filtered_columns.add(field.name)
                    break

    return filters


def _tokenize(value: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", value.lower()))
