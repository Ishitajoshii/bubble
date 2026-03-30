from functools import lru_cache

from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "swiftquery-api"
    api_prefix: str = "/api"
    default_error_tolerance: float = 0.05
    default_confidence_level: float = 0.95
    stream_delays_ms: tuple[int, ...] = (150, 250, 420, 520, 620, 700, 240, 1400)


@lru_cache
def get_settings() -> Settings:
    return Settings()
