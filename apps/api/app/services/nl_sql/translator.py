from time import perf_counter

from pydantic import BaseModel

from app.schemas.dataset import DatasetSummary
from app.schemas.events import TranslationMetadata
from app.services.nl_sql.fallback_templates import build_fallback_sql
from app.services.nl_sql.provider import NL2SQLProvider, NoopProviderAdapter


class TranslationResult(BaseModel):
    sql: str
    metadata: TranslationMetadata


class QueryTranslator:
    def __init__(self, provider: NL2SQLProvider | None = None) -> None:
        self.provider = provider or NoopProviderAdapter()

    async def translate(self, *, prompt: str, dataset: DatasetSummary) -> TranslationResult:
        started_at = perf_counter()
        provider_result = await self.provider.translate(prompt=prompt, dataset=dataset)

        if provider_result is not None and provider_result.sql:
            latency_ms = max(1, int((perf_counter() - started_at) * 1000))
            return TranslationResult(
                sql=provider_result.sql,
                metadata=TranslationMetadata(
                    translator="provider",
                    provider=self.provider.name,
                    fallback_used=False,
                    latency_ms=latency_ms,
                    warnings=provider_result.warnings,
                ),
            )

        fallback_result = build_fallback_sql(prompt=prompt, dataset_id=dataset.dataset_id)
        latency_ms = max(1, int((perf_counter() - started_at) * 1000))
        return TranslationResult(
            sql=fallback_result.sql,
            metadata=TranslationMetadata(
                translator="fallback_templates",
                provider=self.provider.name,
                fallback_used=True,
                latency_ms=latency_ms,
                warnings=fallback_result.warnings,
            ),
        )
