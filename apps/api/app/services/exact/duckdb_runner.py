from __future__ import annotations

from dataclasses import dataclass
from contextlib import contextmanager
from pathlib import Path
from time import perf_counter
from typing import Iterator
from threading import Lock

import duckdb

from app.schemas.dataset import DatasetSummary
from app.services.datasets.catalog import get_dataset_file_path

_API_ROOT = Path(__file__).resolve().parents[3]
_APPROX_CACHE_DIR = _API_ROOT / ".tmp" / "duckdb_cache"
_APPROX_CACHE_LOCK = Lock()


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
class TabularQueryResult:
    column_names: tuple[str, ...]
    rows: list[tuple[object, ...]]
    latency_ms: int


@dataclass(slots=True)
class ProjectionBatch:
    column_names: tuple[str, ...]
    rows: list[tuple[object, ...]]
    latency_ms: int


@dataclass(slots=True)
class GroupPopulation:
    group_value: object
    population_rows: int


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


def run_tabular_query(*, dataset: DatasetSummary, sql: str) -> TabularQueryResult:
    with _dataset_connection(dataset) as connection:
        started_at = perf_counter()
        cursor = connection.execute(sql)
        rows = cursor.fetchall()
        latency_ms = max(1, int((perf_counter() - started_at) * 1000))
        return TabularQueryResult(
            column_names=tuple(column[0] for column in cursor.description),
            rows=rows,
            latency_ms=latency_ms,
        )


def fetch_group_populations(
    *, dataset: DatasetSummary, sql: str
) -> tuple[list[GroupPopulation], int]:
    result = run_cached_tabular_query(dataset=dataset, sql=sql)
    populations = [
        GroupPopulation(
            group_value=row[0],
            population_rows=int(row[1]),
        )
        for row in result.rows
    ]
    return populations, result.latency_ms


@contextmanager
def stream_projection(
    *, dataset: DatasetSummary, projection_sql: str
) -> Iterator["_projection_stream"]:
    with _approx_dataset_connection(dataset) as connection:
        yield _projection_stream(connection=connection, projection_sql=projection_sql)


def run_cached_exact_query(*, dataset: DatasetSummary, sql: str) -> ExactQueryResult:
    with _approx_dataset_connection(dataset) as connection:
        started_at = perf_counter()
        row = connection.execute(sql).fetchone()
        latency_ms = max(1, int((perf_counter() - started_at) * 1000))
        value = 0.0 if row is None or row[0] is None else float(row[0])
        return ExactQueryResult(value=value, latency_ms=latency_ms)


def run_cached_tabular_query(*, dataset: DatasetSummary, sql: str) -> TabularQueryResult:
    with _approx_dataset_connection(dataset) as connection:
        started_at = perf_counter()
        cursor = connection.execute(sql)
        rows = cursor.fetchall()
        latency_ms = max(1, int((perf_counter() - started_at) * 1000))
        return TabularQueryResult(
            column_names=tuple(column[0] for column in cursor.description),
            rows=rows,
            latency_ms=latency_ms,
        )


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


class _approx_dataset_connection:
    def __init__(self, dataset: DatasetSummary) -> None:
        self.dataset = dataset
        self.connection: duckdb.DuckDBPyConnection | None = None

    def __enter__(self) -> duckdb.DuckDBPyConnection:
        cache_path = _ensure_approx_cache(self.dataset)
        self.connection = duckdb.connect(database=str(cache_path), read_only=True)
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


def _ensure_approx_cache(dataset: DatasetSummary) -> Path:
    source_path = get_dataset_file_path(dataset.dataset_id)
    _APPROX_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = _APPROX_CACHE_DIR / f"{dataset.dataset_id}.duckdb"

    with _APPROX_CACHE_LOCK:
        cache_is_fresh = (
            cache_path.exists()
            and cache_path.stat().st_mtime >= source_path.stat().st_mtime
        )
        if cache_is_fresh:
            return cache_path

        temp_path = cache_path.with_suffix(".tmp.duckdb")
        if temp_path.exists():
            temp_path.unlink()

        connection = duckdb.connect(database=str(temp_path))
        try:
            escaped_path = str(source_path).replace("\\", "/").replace("'", "''")
            connection.execute(
                f"CREATE TABLE {dataset.dataset_id} AS "
                f"SELECT * FROM read_csv_auto('{escaped_path}', header = TRUE);"
            )
        finally:
            connection.close()

        if cache_path.exists():
            cache_path.unlink()
        temp_path.replace(cache_path)

    return cache_path


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
