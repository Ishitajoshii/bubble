from app.schemas.dataset import DatasetField, DatasetSummary

_DATASETS: dict[str, DatasetSummary] = {
    "orders_v1": DatasetSummary(
        dataset_id="orders_v1",
        label="Orders",
        description="E-commerce order facts for aggregate and group-by benchmarks.",
        row_count=1_200_000,
        capabilities=["count", "sum", "avg", "count_distinct", "group_by"],
        example_prompts=[
            "What is total revenue?",
            "What is total revenue by region?",
            "How many delivered orders do we have?",
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
    "shipments_v1": DatasetSummary(
        dataset_id="shipments_v1",
        label="Shipments",
        description="Shipment delivery facts for late-delivery and delay metrics.",
        row_count=640_000,
        capabilities=["count", "avg", "group_by"],
        example_prompts=[
            "How many late shipments are there?",
            "What is average delivery delay by carrier?",
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
}


def list_datasets() -> list[DatasetSummary]:
    return [dataset.model_copy(deep=True) for dataset in _DATASETS.values()]


def get_dataset(dataset_id: str) -> DatasetSummary | None:
    dataset = _DATASETS.get(dataset_id)
    if dataset is None:
        return None
    return dataset.model_copy(deep=True)
