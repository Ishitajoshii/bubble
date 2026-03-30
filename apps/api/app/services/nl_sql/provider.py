from dataclasses import dataclass, field
from typing import Protocol

from app.schemas.dataset import DatasetSummary


@dataclass(slots=True)
class ProviderTranslation:
    sql: str
    warnings: list[str] = field(default_factory=list)
    raw_response: str | None = None


class NL2SQLProvider(Protocol):
    name: str

    async def translate(
        self, *, prompt: str, dataset: DatasetSummary
    ) -> ProviderTranslation | None:
        ...


class NoopProviderAdapter:
    name = "noop_provider"

    async def translate(
        self, *, prompt: str, dataset: DatasetSummary
    ) -> ProviderTranslation | None:
        return None
