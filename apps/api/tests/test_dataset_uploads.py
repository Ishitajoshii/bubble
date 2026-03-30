from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.core.config import get_settings
from app.schemas.query import CreateQuerySessionRequest
from app.services.datasets.uploads import register_uploaded_file
from app.services.sessions.manager import create_query_session
from app.services.sessions.streamer import stream_session_events


class DatasetUploadTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        get_settings().stream_delays_ms = (0, 0, 0, 0, 0, 0, 0, 0)

    async def test_uploaded_csv_runs_through_query_session_pipeline(self) -> None:
        datasets = register_uploaded_file(
            file_name="sales.csv",
            content=(
                b"order total,status\n"
                b"10.5,paid\n"
                b"18.0,paid\n"
                b"4.5,refunded\n"
            ),
            content_type="text/csv",
        )
        dataset = datasets[0]
        self.assertEqual(dataset.row_count, 3)

        session = await create_query_session(
            CreateQuerySessionRequest(
                prompt="What is the total order total?",
                dataset_id=dataset.dataset_id,
                live_mode=False,
                error_tolerance=0.05,
                confidence_level=0.95,
            )
        )

        events = [self._decode_event(chunk) async for chunk in stream_session_events(session)]
        self.assertIn("approx_final", [event["type"] for event in events])
        self.assertEqual(events[-1]["type"], "exact_result")
        self.assertAlmostEqual(events[-1]["payload"]["exact_value"], 33.0)

    def test_uploaded_tsv_is_registered(self) -> None:
        dataset = register_uploaded_file(
            file_name="cities.tsv",
            content=b"city\tcount\nDelhi\t3\nMumbai\t5\n",
            content_type="text/tab-separated-values",
        )[0]
        self.assertEqual(dataset.row_count, 2)
        self.assertEqual(dataset.schema_fields[1].type, "INTEGER")

    def test_uploaded_json_is_registered(self) -> None:
        dataset = register_uploaded_file(
            file_name="regions.json",
            content=json.dumps(
                [
                    {"region": "North", "sales": 12.5},
                    {"region": "South", "sales": 18.0},
                ]
            ).encode("utf-8"),
            content_type="application/json",
        )[0]
        self.assertEqual(dataset.row_count, 2)
        self.assertEqual(dataset.schema_fields[1].name, "sales")
        self.assertEqual(dataset.schema_fields[1].type, "DOUBLE")

    def test_uploaded_xml_is_registered(self) -> None:
        dataset = register_uploaded_file(
            file_name="segments.xml",
            content=(
                b"<rows>"
                b"<row><segment>consumer</segment><revenue>12.0</revenue></row>"
                b"<row><segment>enterprise</segment><revenue>25.5</revenue></row>"
                b"</rows>"
            ),
            content_type="application/xml",
        )[0]
        self.assertEqual(dataset.row_count, 2)
        self.assertEqual(dataset.schema_fields[1].type, "DOUBLE")

    def test_uploaded_sqlite_registers_each_table(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as handle:
            database_path = Path(handle.name)

        try:
            connection = sqlite3.connect(str(database_path))
            connection.execute("CREATE TABLE orders (amount REAL, status TEXT)")
            connection.execute(
                "INSERT INTO orders (amount, status) VALUES (14.5, 'paid'), (3.0, 'void')"
            )
            connection.execute("CREATE TABLE customers (customer_id INTEGER, active BOOLEAN)")
            connection.execute(
                "INSERT INTO customers (customer_id, active) VALUES (1, 1), (2, 0)"
            )
            connection.commit()
            connection.close()

            datasets = register_uploaded_file(
                file_name="warehouse.sqlite",
                content=database_path.read_bytes(),
                content_type="application/vnd.sqlite3",
            )
            self.assertEqual(len(datasets), 2)
            self.assertTrue(any(dataset.label.startswith("customers") for dataset in datasets))
            self.assertTrue(any(dataset.label.startswith("orders") for dataset in datasets))
        finally:
            database_path.unlink(missing_ok=True)

    def _decode_event(self, encoded_event: str) -> dict:
        for line in encoded_event.splitlines():
            if line.startswith("data: "):
                return json.loads(line[len("data: ") :])
        raise AssertionError("SSE event is missing a data payload.")
