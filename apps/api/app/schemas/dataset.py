from pydantic import BaseModel, Field


class DatasetField(BaseModel):
    name: str
    type: str
    description: str
    example_values: list[str] = Field(default_factory=list)


class DatasetSummary(BaseModel):
    dataset_id: str
    label: str
    description: str
    row_count: int
    capabilities: list[str] = Field(default_factory=list)
    example_prompts: list[str] = Field(default_factory=list)
    schema: list[DatasetField] = Field(default_factory=list)


class DatasetListResponse(BaseModel):
    items: list[DatasetSummary]
