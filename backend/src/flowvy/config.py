"""Application settings loaded from environment variables."""

from __future__ import annotations

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
    debug: bool = True
