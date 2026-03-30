from pydantic import BaseModel, ConfigDict, Field


class DatasetField(BaseModel):
    name: str
    type: str
    description: str
    example_values: list[str] = Field(default_factory=list)


class DatasetSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    dataset_id: str
    label: str
    description: str
    row_count: int
    capabilities: list[str] = Field(default_factory=list)
    example_prompts: list[str] = Field(default_factory=list)
    schema_fields: list[DatasetField] = Field(default_factory=list, alias="schema")


class DatasetListResponse(BaseModel):
    items: list[DatasetSummary]
