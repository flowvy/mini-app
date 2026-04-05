"""Application settings loaded from environment variables."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Flowvy configuration. All values from env vars or .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    bot_token: str = ""
    database_url: str = "postgresql+asyncpg://flowvy:flowvy_dev@localhost:5432/flowvy"
    redis_url: str = "redis://localhost:6379/0"
    webhook_url: str = ""
    webapp_url: str = ""
    remnawave_url: str = ""
    remnawave_api_token: str = ""
    support_url: str | None = None
    renew_url: str | None = None
    init_data_ttl: int = 86400
    debug: bool = True
