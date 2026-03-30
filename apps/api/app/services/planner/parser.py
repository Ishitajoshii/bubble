from dataclasses import dataclass, field
import re
from typing import Any, Literal

AGGREGATE_PATTERN = re.compile(
    r"^select\s+"
    r"(?:(?P<select_group>[a-z_][a-z0-9_]*)\s*,\s*)?"
    r"(?P<aggregate>count\(\*\)|count\([a-z_][a-z0-9_]*\)|sum\([a-z_][a-z0-9_]*\)|avg\([a-z_][a-z0-9_]*\))"
    r"(?:\s+as\s+(?P<alias>[a-z_][a-z0-9_]*))?"
    r"\s+from\s+(?P<table>[a-z_][a-z0-9_]*)"
    r"(?:\s+where\s+(?P<where>.+?))?"
    r"(?:\s+group\s+by\s+(?P<group_by>[a-z_][a-z0-9_]*))?"
    r"(?:\s+order\s+by\s+(?P<order_by>[a-z_][a-z0-9_]*)(?:\s+(?P<order_direction>asc|desc))?)?"
    r"\s*;?\s*$",
    re.IGNORECASE,
)
PREDICATE_PATTERN = re.compile(
    r"^(?P<column>[a-z_][a-z0-9_]*)\s*(?P<operator><=|>=|!=|=|<|>)\s*(?P<value>.+)$",
    re.IGNORECASE,
)


@dataclass(slots=True)
class FilterPredicate:
    column: str
    operator: Literal["=", "!=", "<", "<=", ">", ">="]
    value: Any

    def to_sql(self) -> str:
        return f"{self.column} {self.operator} {sql_literal(self.value)}"


@dataclass(slots=True)
class OrderBySpec:
    column: str
    direction: Literal["asc", "desc"] = "asc"

    def to_sql(self) -> str:
        return f"{self.column} {self.direction.upper()}"


@dataclass(slots=True)
class AdaptiveAggregateQuery:
    raw_sql: str
    table_name: str
    aggregate_function: Literal["count", "sum", "avg"]
    aggregate_column: str | None
    alias: str
    filters: list[FilterPredicate] = field(default_factory=list)
    group_by_column: str | None = None
    order_by: OrderBySpec | None = None

    @property
    def is_grouped(self) -> bool:
        return self.group_by_column is not None

    def projection_sql(self) -> str:
        projections: list[str] = []

        if self.group_by_column is not None:
            projections.append(self.group_by_column)

        if self.aggregate_column is not None:
            projections.append(self.aggregate_column)

        for predicate in self.filters:
            if predicate.column not in projections:
                projections.append(predicate.column)

        if not projections:
            projections.append("1 AS __row_marker")

        return f"SELECT {', '.join(projections)} FROM {self.table_name}"

    def exact_sql(self) -> str:
        aggregate = self.aggregate_function.upper()
        aggregate_expression = (
            f"{aggregate}(*)"
            if self.aggregate_column is None
            else f"{aggregate}({self.aggregate_column})"
        )
        select_list = [f"{aggregate_expression} AS {self.alias}"]
        if self.group_by_column is not None:
            select_list.insert(0, self.group_by_column)

        sql = f"SELECT {', '.join(select_list)} FROM {self.table_name}"
        if self.filters:
            sql += " WHERE " + " AND ".join(predicate.to_sql() for predicate in self.filters)
        if self.group_by_column is not None:
            sql += f" GROUP BY {self.group_by_column}"
        if self.order_by is not None:
            sql += f" ORDER BY {self.order_by.to_sql()}"
        return sql + ";"

    def group_population_sql(self) -> str:
        if self.group_by_column is None:
            raise ValueError("GROUP BY population SQL requires a grouped aggregate query.")

        sql = (
            f"SELECT {self.group_by_column}, COUNT(*) AS population_rows "
            f"FROM {self.table_name}"
        )
        if self.filters:
            sql += " WHERE " + " AND ".join(predicate.to_sql() for predicate in self.filters)
        sql += f" GROUP BY {self.group_by_column} ORDER BY population_rows DESC;"
        return sql

    def stratum_projection_sql(self, group_value: Any) -> str:
        if self.group_by_column is None:
            raise ValueError("Stratum projection SQL requires a grouped aggregate query.")

        projections = (
            [self.aggregate_column]
            if self.aggregate_column is not None
            else ["1 AS __row_marker"]
        )
        predicates = [predicate.to_sql() for predicate in self.filters]
        predicates.append(f"{self.group_by_column} = {sql_literal(group_value)}")
        return (
            f"SELECT {', '.join(projections)} FROM {self.table_name} "
            f"WHERE {' AND '.join(predicates)}"
        )


def parse_adaptive_query(sql: str) -> AdaptiveAggregateQuery:
    normalized = " ".join(sql.strip().split())
    match = AGGREGATE_PATTERN.match(normalized)
    if match is None:
        raise ValueError(
            "Only single-table COUNT, SUM, and AVG queries with an optional single GROUP BY column are supported right now."
        )

    aggregate_expression = match.group("aggregate").lower()
    aggregate_function, aggregate_column = _parse_aggregate_expression(aggregate_expression)
    alias = match.group("alias") or default_alias(aggregate_function, aggregate_column)
    where_clause = match.group("where")
    select_group = _normalize_identifier(match.group("select_group"))
    group_by_column = _normalize_identifier(match.group("group_by"))

    if select_group != group_by_column:
        raise ValueError(
            "Grouped approximate queries must select exactly one GROUP BY column and group by the same column."
        )

    order_by = parse_order_by(
        column=match.group("order_by"),
        direction=match.group("order_direction"),
    )
    if order_by is not None and group_by_column is None:
        raise ValueError("ORDER BY is only supported for grouped approximate queries.")

    query = AdaptiveAggregateQuery(
        raw_sql=normalized,
        table_name=match.group("table"),
        aggregate_function=aggregate_function,
        aggregate_column=aggregate_column,
        alias=alias,
        filters=parse_predicates(where_clause),
        group_by_column=group_by_column,
        order_by=order_by,
    )
    return query


def parse_predicates(where_clause: str | None) -> list[FilterPredicate]:
    if where_clause is None:
        return []

    predicates: list[FilterPredicate] = []
    parts = re.split(r"\s+and\s+", where_clause, flags=re.IGNORECASE)

    for part in parts:
        stripped = part.strip()
        if not stripped:
            continue

        match = PREDICATE_PATTERN.match(stripped)
        if match is None:
            raise ValueError("Only simple WHERE predicates joined by AND are supported.")

        predicates.append(
            FilterPredicate(
                column=match.group("column"),
                operator=match.group("operator"),
                value=parse_literal(match.group("value")),
            )
        )

    return predicates


def parse_literal(token: str) -> Any:
    value = token.strip().rstrip(";").strip()
    if len(value) >= 2 and value[0] == "'" and value[-1] == "'":
        return value[1:-1].replace("''", "'")

    upper = value.upper()
    if upper == "TRUE":
        return True
    if upper == "FALSE":
        return False

    try:
        return int(value)
    except ValueError:
        pass

    try:
        return float(value)
    except ValueError:
        return value


def default_alias(aggregate_function: str, aggregate_column: str | None) -> str:
    if aggregate_function == "count" and aggregate_column is None:
        return "row_count"
    if aggregate_column is None:
        return aggregate_function
    return f"{aggregate_function}_{aggregate_column}"


def sql_literal(value: Any) -> str:
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"


def _parse_aggregate_expression(
    aggregate_expression: str,
) -> tuple[Literal["count", "sum", "avg"], str | None]:
    function_name = aggregate_expression.split("(", 1)[0]
    column = aggregate_expression[aggregate_expression.find("(") + 1 : -1].strip()
    if function_name == "count" and column == "*":
        return "count", None
    return function_name, column


def parse_order_by(
    *, column: str | None, direction: str | None
) -> OrderBySpec | None:
    normalized_column = _normalize_identifier(column)
    if normalized_column is None:
        return None
    return OrderBySpec(
        column=normalized_column,
        direction=(direction or "asc").lower(),
    )


def _normalize_identifier(identifier: str | None) -> str | None:
    if identifier is None:
        return None
    return identifier.lower()
