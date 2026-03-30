from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from threading import Lock

from app.schemas.dataset import DatasetField, DatasetSummary
from app.services.datasets.bootstrap import DATASET_ROW_COUNTS, ensure_dataset_file


@dataclass(slots=True)
class DatasetRegistration:
    summary: DatasetSummary
    file_path: Path


_REGISTRY_LOCK = Lock()
_DATASETS: dict[str, DatasetRegistration] = {}


def list_datasets() -> list[DatasetSummary]:
    with _REGISTRY_LOCK:
        return [
            registration.summary.model_copy(deep=True)
            for registration in _DATASETS.values()
        ]


def get_dataset(dataset_id: str) -> DatasetSummary | None:
    with _REGISTRY_LOCK:
        registration = _DATASETS.get(dataset_id)
        if registration is None:
            return None
        return registration.summary.model_copy(deep=True)


def get_dataset_file_path(dataset_id: str) -> Path:
    with _REGISTRY_LOCK:
        registration = _DATASETS.get(dataset_id)
        if registration is None:
            raise LookupError(f"Unknown dataset '{dataset_id}'.")
        return registration.file_path


def register_dataset(*, summary: DatasetSummary, file_path: Path) -> DatasetSummary:
    with _REGISTRY_LOCK:
        registration = DatasetRegistration(
            summary=summary.model_copy(deep=True),
            file_path=file_path,
        )
        _DATASETS[summary.dataset_id] = registration
        return registration.summary.model_copy(deep=True)


def _register_builtin_datasets() -> None:
    builtin_summaries = (
        DatasetSummary(
            dataset_id="orders_v1",
            label="Orders",
            description="E-commerce order facts for aggregate and group-by benchmarks.",
            row_count=DATASET_ROW_COUNTS["orders_v1"],
            capabilities=["count", "sum", "avg", "group_by"],
            example_prompts=[
                "What is total revenue?",
                "What is revenue by region?",
                "How many delivered orders do we have?",
                "What is the average order value?",
                "How many unique customers placed orders?",
            ],
            schema=[
                DatasetField(
                    name="order_id",
                    type="INTEGER",
                    description="Primary key for the order row",
                    example_values=["100045", "100046"],
                ),
                DatasetField(
                    name="order_date",
                    type="DATE",
                    description="Calendar date for the order",
                    example_values=["2026-03-01", "2026-03-02"],
                ),
                DatasetField(
                    name="region",
                    type="TEXT",
                    description="Sales region",
                    example_values=["North", "West"],
                ),
                DatasetField(
                    name="status",
                    type="TEXT",
                    description="Order lifecycle status",
                    example_values=["processing", "delivered"],
                ),
                DatasetField(
                    name="customer_id",
                    type="INTEGER",
                    description="Customer foreign key",
                    example_values=["5012", "5013"],
                ),
                DatasetField(
                    name="total_amount",
                    type="DOUBLE",
                    description="Order revenue amount",
                    example_values=["129.50", "342.10"],
                ),
            ],
        ),
        DatasetSummary(
            dataset_id="shipments_v1",
            label="Shipments",
            description="Shipment delivery facts for late-delivery and delay metrics.",
            row_count=DATASET_ROW_COUNTS["shipments_v1"],
            capabilities=["count", "avg", "group_by"],
            example_prompts=[
                "How many late shipments are there?",
                "What is the average delivery delay?",
                "What is the average delivery delay by carrier?",
            ],
            schema=[
                DatasetField(
                    name="shipment_id",
                    type="INTEGER",
                    description="Primary key for the shipment row",
                    example_values=["70014", "70015"],
                ),
                DatasetField(
                    name="carrier",
                    type="TEXT",
                    description="Shipping carrier",
                    example_values=["DHL", "FedEx"],
                ),
                DatasetField(
                    name="delay_minutes",
                    type="INTEGER",
                    description="Positive delay in minutes",
                    example_values=["0", "37"],
                ),
                DatasetField(
                    name="is_late",
                    type="BOOLEAN",
                    description="Late delivery indicator",
                    example_values=["false", "true"],
                ),
            ],
        ),
    )

    for summary in builtin_summaries:
        register_dataset(
            summary=summary,
            file_path=ensure_dataset_file(summary.dataset_id),
        )


_register_builtin_datasets()
