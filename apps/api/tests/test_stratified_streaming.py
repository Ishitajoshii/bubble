from __future__ import annotations

import json
import unittest

from app.core.config import get_settings
from app.schemas.query import CreateQuerySessionRequest
from app.services.datasets.uploads import register_uploaded_file
from app.services.exact.duckdb_runner import fetch_group_populations
from app.services.planner.parser import parse_adaptive_query
from app.services.planner.router import route_query
from app.services.planner.validator import validate_adaptive_query
from app.services.sessions.manager import create_query_session
from app.services.sessions.streamer import stream_session_events


class StratifiedStreamingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        get_settings().stream_delays_ms = (0, 0, 0, 0, 0, 0, 0, 0)

    async def test_grouped_sum_stream_uses_stratified_sampling(self) -> None:
        session = await create_query_session(
            CreateQuerySessionRequest(
                prompt="What is revenue by region?",
                dataset_id="orders_v1",
                live_mode=False,
                error_tolerance=0.05,
                confidence_level=0.95,
            )
        )

        self.assertEqual(session.planner.strategy, "stratified_sampling")
        self.assertIsNotNone(session.group_populations)

        events = [self._decode_event(chunk) async for chunk in stream_session_events(session)]
        event_types = [event["type"] for event in events]
        self.assertIn("approx_final", event_types)
        self.assertEqual(event_types[-1], "exact_result")

        approx_final = next(event for event in events if event["type"] == "approx_final")
        exact_result = next(event for event in events if event["type"] == "exact_result")

        self.assertEqual(approx_final["payload"]["result_scope"], "grouped")
        self.assertEqual(approx_final["payload"]["group_by_column"], "region")
        self.assertGreater(len(approx_final["payload"]["group_rows"]), 1)
        self.assertEqual(exact_result["payload"]["result_scope"], "grouped")
        self.assertEqual(
            exact_result["payload"]["group_count"],
            len(exact_result["payload"]["rows"]),
        )

    def test_small_grouped_dataset_falls_back_to_exact(self) -> None:
        dataset = register_uploaded_file(
            file_name="tiny_sales.csv",
            content=(
                b"region,amount\n"
                b"north,10\n"
                b"north,15\n"
                b"south,9\n"
                b"south,21\n"
            ),
            content_type="text/csv",
        )[0]

        query = validate_adaptive_query(
            parse_adaptive_query(
                f"SELECT region, SUM(amount) AS total_amount FROM {dataset.dataset_id} "
                "GROUP BY region ORDER BY total_amount DESC;"
            ),
            dataset,
        )
        group_populations, _latency_ms = fetch_group_populations(
            dataset=dataset,
            sql=query.group_population_sql(),
        )
        planner = route_query(
            query=query,
            live_mode=False,
            error_tolerance=0.05,
            confidence_level=0.95,
            group_populations=group_populations,
        )

        self.assertEqual(planner.strategy, "exact_fallback")
        self.assertIn("below 5,000 filtered rows", planner.fallback_reason or "")

    def _decode_event(self, encoded_event: str) -> dict:
        for line in encoded_event.splitlines():
            if line.startswith("data: "):
                return json.loads(line[len("data: ") :])
        raise AssertionError("SSE event is missing a data payload.")
