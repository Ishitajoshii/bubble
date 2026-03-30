from __future__ import annotations

import csv
from datetime import date, timedelta
from pathlib import Path
from random import Random

DATASET_ROW_COUNTS = {
    "orders_v1": 40_000,
    "shipments_v1": 20_000,
}
DATASET_FILENAMES = {
    "orders_v1": "orders_v1.csv",
    "shipments_v1": "shipments_v1.csv",
}

_REPO_ROOT = Path(__file__).resolve().parents[5]
_GENERATED_DATA_DIR = _REPO_ROOT / "data" / "generated"


def ensure_dataset_file(dataset_id: str) -> Path:
    filename = DATASET_FILENAMES.get(dataset_id)
    if filename is None:
        raise LookupError(f"Unknown dataset '{dataset_id}'.")

    path = _GENERATED_DATA_DIR / filename
    if path.exists() and path.stat().st_size > 0:
        return path

    _GENERATED_DATA_DIR.mkdir(parents=True, exist_ok=True)

    if dataset_id == "orders_v1":
        _build_orders_dataset(path)
        return path

    if dataset_id == "shipments_v1":
        _build_shipments_dataset(path)
        return path

    raise LookupError(f"Unknown dataset '{dataset_id}'.")


def _build_orders_dataset(path: Path) -> None:
    rng = Random(20260330)
    regions = ("North", "South", "East", "West")
    region_weights = (0.26, 0.19, 0.22, 0.33)
    statuses = ("delivered", "processing", "cancelled", "returned", "shipped")
    status_weights = (0.61, 0.12, 0.06, 0.05, 0.16)
    region_multipliers = {
        "North": 1.07,
        "South": 0.94,
        "East": 1.01,
        "West": 1.13,
    }
    status_multipliers = {
        "delivered": 1.0,
        "processing": 0.92,
        "cancelled": 0.41,
        "returned": 0.53,
        "shipped": 0.97,
    }
    start_date = date(2025, 1, 1)
    temp_path = path.with_suffix(".tmp")

    with temp_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            ["order_id", "order_date", "region", "status", "customer_id", "total_amount"]
        )

        for row_number in range(DATASET_ROW_COUNTS["orders_v1"]):
            region = rng.choices(regions, weights=region_weights, k=1)[0]
            status = rng.choices(statuses, weights=status_weights, k=1)[0]
            order_date = start_date + timedelta(days=rng.randrange(365))
            customer_id = 5_000 + rng.randrange(8_200)

            seasonal_boost = 1.0 + ((order_date.month - 6) / 24)
            raw_amount = rng.lognormvariate(4.25, 0.42)
            total_amount = round(
                max(
                    12.0,
                    raw_amount
                    * region_multipliers[region]
                    * status_multipliers[status]
                    * seasonal_boost,
                ),
                2,
            )

            writer.writerow(
                [
                    100_000 + row_number,
                    order_date.isoformat(),
                    region,
                    status,
                    customer_id,
                    f"{total_amount:.2f}",
                ]
            )

    temp_path.replace(path)


def _build_shipments_dataset(path: Path) -> None:
    rng = Random(20260331)
    carriers = ("DHL", "FedEx", "UPS", "BlueDart")
    carrier_weights = (0.24, 0.29, 0.31, 0.16)
    carrier_offsets = {
        "DHL": 6,
        "FedEx": 4,
        "UPS": 2,
        "BlueDart": 9,
    }
    temp_path = path.with_suffix(".tmp")

    with temp_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["shipment_id", "carrier", "delay_minutes", "is_late"])

        for row_number in range(DATASET_ROW_COUNTS["shipments_v1"]):
            carrier = rng.choices(carriers, weights=carrier_weights, k=1)[0]
            delay_minutes = max(0, int(rng.gauss(8 + carrier_offsets[carrier], 18)))
            is_late = delay_minutes > 15
            writer.writerow(
                [
                    70_000 + row_number,
                    carrier,
                    delay_minutes,
                    "true" if is_late else "false",
                ]
            )

    temp_path.replace(path)
