"""
Regex-based fallback when Gemini is unreachable or returns invalid SQL.
"""

import re


def fallback_sql(prompt: str, table: str = "sales") -> str:
    """
    Simple keyword matching — always returns something useful
    even when the LLM is unavailable.
    """
    p = prompt.lower()

    if re.search(r"\bcount\b", p):
        return f"SELECT COUNT(*) FROM {table};"

    if re.search(r"\b(average|avg|mean)\b", p):
        return f"SELECT AVG(amount) FROM {table};"

    if re.search(r"\b(sum|total)\b", p):
        return f"SELECT SUM(amount) FROM {table};"

    if re.search(r"\b(max|maximum|highest|largest)\b", p):
        return f"SELECT MAX(amount) FROM {table};"

    if re.search(r"\b(min|minimum|lowest|smallest)\b", p):
        return f"SELECT MIN(amount) FROM {table};"

    return f"SELECT * FROM {table} LIMIT 10;"
from dataclasses import dataclass, field


@dataclass(slots=True)
class FallbackTemplateResult:
    sql: str
    warnings: list[str] = field(default_factory=list)


def build_fallback_sql(prompt: str, dataset_id: str) -> FallbackTemplateResult:
    normalized = " ".join(prompt.lower().split())

    if dataset_id == "orders_v1":
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

        return FallbackTemplateResult(
            sql="SELECT SUM(total_amount) AS total_revenue FROM orders_v1;",
            warnings=[
                "Prompt did not match a named demo template; used default total revenue query."
            ],
        )

    if dataset_id == "shipments_v1":
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

        return FallbackTemplateResult(
            sql="SELECT AVG(delay_minutes) AS average_delay_minutes FROM shipments_v1;",
            warnings=[
                "Prompt did not match a named demo template; used default delay query."
            ],
        )

    return FallbackTemplateResult(
        sql="SELECT COUNT(*) AS row_count FROM orders_v1;",
        warnings=[
            f"Unknown dataset '{dataset_id}' for fallback templates; used safe default query."
        ],
    )
