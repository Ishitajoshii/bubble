from __future__ import annotations

import json
import unittest

from app.core.config import get_settings
from app.schemas.query import CreateQuerySessionRequest
from app.services.approx.adaptive_sampling import run_adaptive_sampling
from app.services.datasets.catalog import get_dataset
from app.services.planner.parser import parse_adaptive_query
from app.services.planner.validator import validate_adaptive_query
from app.services.sessions.manager import create_query_session
from app.services.sessions.streamer import stream_session_events


class AdaptiveStreamingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        get_settings().stream_delays_ms = (0, 0, 0, 0, 0, 0, 0, 0)

    async def test_filtered_count_stream_emits_final_and_exact(self) -> None:
        session = await create_query_session(
            CreateQuerySessionRequest(
                prompt="How many delivered orders do we have?",
                dataset_id="orders_v1",
                live_mode=False,
                error_tolerance=0.05,
                confidence_level=0.95,
            )
        )

        events = [self._decode_event(chunk) async for chunk in stream_session_events(session)]
        event_types = [event["type"] for event in events]

        self.assertEqual(event_types[:2], ["sql_generated", "plan_ready"])
        self.assertIn("approx_final", event_types)
        self.assertEqual(event_types[-1], "exact_result")
        self.assertGreater(events[-1]["payload"]["exact_value"], 0)

    async def test_avg_stream_formats_non_currency_values(self) -> None:
        session = await create_query_session(
            CreateQuerySessionRequest(
                prompt="What is the average delivery delay?",
                dataset_id="shipments_v1",
                live_mode=False,
                error_tolerance=0.05,
                confidence_level=0.95,
            )
        )

        events = [self._decode_event(chunk) async for chunk in stream_session_events(session)]
        approx_final = next(event for event in events if event["type"] == "approx_final")
        exact_result = next(event for event in events if event["type"] == "exact_result")

        self.assertGreater(approx_final["payload"]["estimate"], 0)
        self.assertFalse(exact_result["payload"]["display_value"].startswith("$"))

    def test_tight_sum_target_produces_multiple_snapshots(self) -> None:
        dataset = get_dataset("orders_v1")
        assert dataset is not None

        query = validate_adaptive_query(
            parse_adaptive_query(
                "SELECT SUM(total_amount) AS total_revenue FROM orders_v1;"
            ),
            dataset,
        )
        result = run_adaptive_sampling(
            dataset=dataset,
            query=query,
            target_error=0.01,
            confidence_level=0.95,
            seed_material="orders-sum-test",
        )

        self.assertGreaterEqual(len(result.snapshots), 2)
        self.assertGreater(result.snapshots[-1].sample_rows, result.snapshots[0].sample_rows)

    def _decode_event(self, encoded_event: str) -> dict:
        for line in encoded_event.splitlines():
            if line.startswith("data: "):
                return json.loads(line[len("data: ") :])
        raise AssertionError("SSE event is missing a data payload.")
