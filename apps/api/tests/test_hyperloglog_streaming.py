from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from app.core.config import get_settings
from app.schemas.query import CreateQuerySessionRequest
from app.services.approx.hyperloglog import run_hyperloglog
from app.services.datasets.uploads import register_uploaded_file
from app.services.datasets.catalog import get_dataset
from app.services.exact.duckdb_runner import TabularQueryResult
from app.services.planner.parser import parse_adaptive_query
from app.services.planner.validator import validate_adaptive_query
from app.services.sessions.manager import create_query_session
from app.services.sessions.streamer import stream_session_events


class HyperLogLogStreamingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        get_settings().stream_delays_ms = (0, 0, 0, 0, 0, 0, 0, 0)

    async def test_unique_customer_query_uses_hyperloglog(self) -> None:
        session = await create_query_session(
            CreateQuerySessionRequest(
                prompt="How many unique customers placed orders?",
                dataset_id="orders_v1",
                live_mode=False,
                error_tolerance=0.05,
                confidence_level=0.95,
            )
        )

        self.assertEqual(session.planner.strategy, "hyperloglog")

        events = [self._decode_event(chunk) async for chunk in stream_session_events(session)]
        approx_final = next(event for event in events if event["type"] == "approx_final")
        exact_result = next(event for event in events if event["type"] == "exact_result")

        self.assertEqual(approx_final["payload"]["result_scope"], "scalar")
        self.assertEqual(exact_result["payload"]["result_scope"], "scalar")
        self.assertGreater(exact_result["payload"]["exact_value"], 0)
        self.assertLess(exact_result["payload"]["delta_pct"], 0.1)

    async def test_uploaded_dataset_unique_prompt_routes_to_hyperloglog(self) -> None:
        dataset = register_uploaded_file(
            file_name="customers.csv",
            content=(
                b"customer_id,status\n"
                b"1001,active\n"
                b"1002,active\n"
                b"1001,inactive\n"
                b"1003,active\n"
            ),
            content_type="text/csv",
        )[0]

        session = await create_query_session(
            CreateQuerySessionRequest(
                prompt="How many unique customer_id values are there?",
                dataset_id=dataset.dataset_id,
                live_mode=False,
                error_tolerance=0.05,
                confidence_level=0.95,
            )
        )

        self.assertEqual(session.planner.strategy, "hyperloglog")

    async def test_grouped_unique_prompt_routes_to_grouped_hyperloglog(self) -> None:
        dataset = register_uploaded_file(
            file_name="customers_by_status.csv",
            content=(
                b"customer_id,status\n"
                b"1001,active\n"
                b"1002,active\n"
                b"1001,inactive\n"
                b"1003,active\n"
                b"1004,inactive\n"
            ),
            content_type="text/csv",
        )[0]

        session = await create_query_session(
            CreateQuerySessionRequest(
                prompt="How many unique customer_id values by status?",
                dataset_id=dataset.dataset_id,
                live_mode=False,
                error_tolerance=0.05,
                confidence_level=0.95,
            )
        )

        self.assertEqual(session.planner.strategy, "hyperloglog")

        events = [self._decode_event(chunk) async for chunk in stream_session_events(session)]
        approx_final = next(event for event in events if event["type"] == "approx_final")
        exact_result = next(event for event in events if event["type"] == "exact_result")

        self.assertEqual(approx_final["payload"]["result_scope"], "grouped")
        self.assertEqual(exact_result["payload"]["result_scope"], "grouped")
        self.assertEqual(exact_result["payload"]["group_count"], 2)

    @patch("app.services.approx.hyperloglog.run_tabular_query")
    def test_hyperloglog_projection_hashes_distinct_column(self, run_tabular_query_mock) -> None:
        dataset = get_dataset("orders_v1")
        assert dataset is not None

        query = validate_adaptive_query(
            parse_adaptive_query(
                "SELECT COUNT(DISTINCT customer_id) AS unique_customers FROM orders_v1;"
            ),
            dataset,
        )

        run_tabular_query_mock.return_value = TabularQueryResult(
            column_names=("register_index", "register_rank"),
            rows=[(11, 3), (17, 2), (23, 4)],
            latency_ms=7,
        )

        result = run_hyperloglog(
            dataset=dataset,
            query=query,
            target_error=0.05,
        )

        self.assertEqual(run_tabular_query_mock.call_count, 1)
        projection_sql = run_tabular_query_mock.call_args.kwargs["sql"]
        self.assertIn("hash(customer_id)", projection_sql)
        self.assertIn("register_index", projection_sql)
        self.assertEqual(len(result.snapshots), 1)
        self.assertGreater(result.snapshots[0].estimate, 0)
        self.assertEqual(result.snapshots[0].elapsed_ms, 7)

    def _decode_event(self, encoded_event: str) -> dict:
        for line in encoded_event.splitlines():
            if line.startswith("data: "):
                return json.loads(line[len("data: ") :])
        raise AssertionError("SSE event is missing a data payload.")
