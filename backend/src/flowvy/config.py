"""Application settings loaded from environment variables."""

from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Flowvy configuration. All values from env vars or .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    version: str = "0.1.0"
    bot_token: str = ""
    database_url: str = "postgresql+asyncpg://flowvy:flowvy_dev@localhost:5432/flowvy"
    redis_url: str = "redis://localhost:6379/0"
    webhook_url: str = ""
    webapp_url: str = ""
    remnawave_url: str = ""
    remnawave_api_token: str = ""
    init_data_ttl: int = 86400
    metrics_snapshot_interval_seconds: int = 600
    remnawave_webhook_secret: str | None = None
    debug: bool = True
    admin_telegram_ids: list[int] = []

    @field_validator("admin_telegram_ids", mode="before")
    @classmethod
    def parse_admin_ids(cls, v: object) -> list[int]:
        """Parse comma-separated string into list of ints."""
        if isinstance(v, str):
            if not v.strip():
                return []
            return [int(x.strip()) for x in v.split(",")]
        if isinstance(v, int):
            return [v]
        return v  # type: ignore[return-value]
