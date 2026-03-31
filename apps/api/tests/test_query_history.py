from __future__ import annotations

import unittest

from app.schemas.query import CreateQuerySessionRequest
from app.services.sessions.manager import (
    clear_query_sessions,
    create_query_session,
    list_query_history,
)


class QueryHistoryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        clear_query_sessions()

    async def test_history_returns_latest_sessions_with_query_metadata(self) -> None:
        await create_query_session(
            CreateQuerySessionRequest(
                prompt="How many delivered orders do we have?",
                dataset_id="orders_v1",
                live_mode=False,
                error_tolerance=0.05,
                confidence_level=0.95,
            )
        )
        await create_query_session(
            CreateQuerySessionRequest(
                prompt="What is revenue by region?",
                dataset_id="orders_v1",
                live_mode=True,
                error_tolerance=0.1,
                confidence_level=0.9,
            )
        )

        history = list_query_history()
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0].prompt, "What is revenue by region?")
        self.assertEqual(history[0].dataset_id, "orders_v1")
        self.assertEqual(history[0].dataset_label, "Orders")
        self.assertTrue(history[0].live_mode)
        self.assertAlmostEqual(history[0].error_tolerance, 0.1)
        self.assertAlmostEqual(history[0].confidence_level, 0.9)
        self.assertEqual(history[1].prompt, "How many delivered orders do we have?")


if __name__ == "__main__":
    unittest.main()
