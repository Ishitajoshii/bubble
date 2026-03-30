from __future__ import annotations

from dataclasses import dataclass
from contextlib import contextmanager
from pathlib import Path
from time import perf_counter
from typing import Iterator

import duckdb

from app.schemas.dataset import DatasetSummary
from app.services.datasets.catalog import get_dataset_file_path


@dataclass(slots=True)
class ProjectionResult:
    column_names: tuple[str, ...]
    rows: list[tuple[object, ...]]
    latency_ms: int


@dataclass(slots=True)
class ExactQueryResult:
    value: float
    latency_ms: int


@dataclass(slots=True)
class ProjectionBatch:
    column_names: tuple[str, ...]
    rows: list[tuple[object, ...]]
    latency_ms: int


def fetch_projection(
    *, dataset: DatasetSummary, projection_sql: str
) -> ProjectionResult:
    with _dataset_connection(dataset) as connection:
        started_at = perf_counter()
        cursor = connection.execute(projection_sql)
        rows = cursor.fetchall()
        latency_ms = max(1, int((perf_counter() - started_at) * 1000))
        return ProjectionResult(
            column_names=tuple(column[0] for column in cursor.description),
            rows=rows,
            latency_ms=latency_ms,
        )


def run_exact_query(*, dataset: DatasetSummary, sql: str) -> ExactQueryResult:
    with _dataset_connection(dataset) as connection:
        started_at = perf_counter()
        row = connection.execute(sql).fetchone()
        latency_ms = max(1, int((perf_counter() - started_at) * 1000))
        value = 0.0 if row is None or row[0] is None else float(row[0])
        return ExactQueryResult(value=value, latency_ms=latency_ms)


@contextmanager
def stream_projection(
    *, dataset: DatasetSummary, projection_sql: str
) -> Iterator["_projection_stream"]:
    with _dataset_connection(dataset) as connection:
        yield _projection_stream(connection=connection, projection_sql=projection_sql)


class _dataset_connection:
    def __init__(self, dataset: DatasetSummary) -> None:
        self.dataset = dataset
        self.connection: duckdb.DuckDBPyConnection | None = None

    def __enter__(self) -> duckdb.DuckDBPyConnection:
        path = get_dataset_file_path(self.dataset.dataset_id)
        self.connection = duckdb.connect(database=":memory:")
        self.connection.execute(_create_view_sql(self.dataset.dataset_id, path))
        return self.connection

    def __exit__(self, exc_type, exc, tb) -> None:
        if self.connection is not None:
            self.connection.close()
            self.connection = None


def _create_view_sql(dataset_id: str, path: Path) -> str:
    escaped_path = str(path).replace("\\", "/").replace("'", "''")
    return (
        f"CREATE VIEW {dataset_id} AS "
        f"SELECT * FROM read_csv_auto('{escaped_path}', header = TRUE);"
    )


class _projection_stream:
    def __init__(
        self, *, connection: duckdb.DuckDBPyConnection, projection_sql: str
    ) -> None:
        self.started_at = perf_counter()
        self.cursor = connection.execute(projection_sql)
        self.column_names = tuple(column[0] for column in self.cursor.description)

    def fetch(self, row_count: int) -> ProjectionBatch:
        rows = self.cursor.fetchmany(row_count)
        latency_ms = max(1, int((perf_counter() - self.started_at) * 1000))
        return ProjectionBatch(
            column_names=self.column_names,
            rows=rows,
            latency_ms=latency_ms,
        )
