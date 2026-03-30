from datetime import date

from app.schemas.dataset import DatasetSummary
from app.services.planner.parser import AdaptiveAggregateQuery

NUMERIC_TYPES = {"INTEGER", "BIGINT", "DOUBLE", "DECIMAL", "FLOAT", "REAL"}


def validate_adaptive_query(
    query: AdaptiveAggregateQuery, dataset: DatasetSummary
) -> AdaptiveAggregateQuery:
    columns = {field.name: field.type.upper() for field in dataset.schema_fields}

    if query.table_name != dataset.dataset_id:
        raise ValueError("The query table must match the selected dataset.")

    if query.aggregate_column is not None and query.aggregate_column not in columns:
        raise ValueError(f"Unknown aggregate column '{query.aggregate_column}'.")

    if (
        query.aggregate_function in {"sum", "avg"}
        and query.aggregate_column is not None
        and columns[query.aggregate_column] not in NUMERIC_TYPES
    ):
        raise ValueError(f"{query.aggregate_function.upper()} requires a numeric column.")

    if query.group_by_column is not None and query.group_by_column not in columns:
        raise ValueError(f"Unknown GROUP BY column '{query.group_by_column}'.")

    for predicate in query.filters:
        if predicate.column not in columns:
            raise ValueError(f"Unknown filter column '{predicate.column}'.")

        predicate.value = cast_literal(predicate.value, columns[predicate.column])

        if columns[predicate.column] == "TEXT" and predicate.operator not in {"=", "!="}:
            raise ValueError("Text filters only support '=' and '!=' operators.")

    if query.order_by is not None:
        allowed_order_columns = {query.alias}
        if query.group_by_column is not None:
            allowed_order_columns.add(query.group_by_column)
        if query.order_by.column not in allowed_order_columns:
            raise ValueError(
                "ORDER BY for approximate queries must use either the aggregate alias or the GROUP BY column."
            )

    return query


def cast_literal(value: object, column_type: str) -> object:
    if column_type == "BOOLEAN":
        if isinstance(value, bool):
            return value
        raise ValueError("Boolean filters must use TRUE or FALSE.")

    if column_type == "DATE":
        if not isinstance(value, str):
            raise ValueError("Date filters must use quoted ISO date strings.")
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("Date filters must use YYYY-MM-DD values.") from exc

    if column_type in NUMERIC_TYPES:
        if isinstance(value, (int, float)):
            return value
        raise ValueError("Numeric filters must use numeric literals.")

    if not isinstance(value, str):
        return str(value)
    return value
