"""Application settings loaded from environment variables."""

from __future__ import annotations

import re
from typing import Annotated

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from flowvy.kuma_target import normalize_kuma_base_url


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
    telegram_webhook_secret: str = ""
    webapp_url: str = ""
    remnawave_url: str = ""
    remnawave_api_token: str = ""
    init_data_ttl: int = 86400
    metrics_snapshot_interval_seconds: int = 600
    remnawave_webhook_secret: str | None = None
    remnawave_webhook_max_age_seconds: int = Field(default=300, ge=1, le=3600)
    remnawave_webhook_future_tolerance_seconds: int = Field(default=30, ge=0, le=300)
    remnawave_webhook_max_body_bytes: int = Field(
        default=262_144,
        ge=1024,
        le=1_048_576,
    )
    remnawave_webhook_retention_days: int = Field(default=30, ge=1, le=365)
    remnawave_webhook_cleanup_interval_seconds: int = Field(
        default=21_600,
        ge=60,
        le=86_400,
    )
    remnawave_webhook_cleanup_batch_size: int = Field(default=1000, ge=1, le=10_000)
    kuma_allowed_private_origins: Annotated[list[str], NoDecode] = []
    kuma_max_response_bytes: int = Field(
        default=1_048_576,
        ge=1024,
        le=10_485_760,
    )
    debug: bool = False
    admin_telegram_ids: Annotated[list[int], NoDecode] = []

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

    @field_validator("kuma_allowed_private_origins", mode="before")
    @classmethod
    def parse_kuma_private_origins(cls, value: object) -> list[str]:
        """Parse exact, operator-approved private Kuma origins."""
        if isinstance(value, str):
            if not value.strip():
                return []
            return [part.strip() for part in value.split(",")]
        return value  # type: ignore[return-value]

    @field_validator("kuma_allowed_private_origins")
    @classmethod
    def validate_kuma_private_origins(cls, values: list[str]) -> list[str]:
        """Fail startup on malformed private-origin exceptions."""
        return list(dict.fromkeys(normalize_kuma_base_url(value) for value in values))

    @field_validator("telegram_webhook_secret")
    @classmethod
    def validate_telegram_webhook_secret(cls, value: str) -> str:
        """Validate Telegram's documented webhook secret-token format."""
        secret = value.strip()
        if secret and (
            not 1 <= len(secret) <= 256 or re.fullmatch(r"[A-Za-z0-9_-]+", secret) is None
        ):
            msg = (
                "TELEGRAM_WEBHOOK_SECRET must be 1-256 characters using only "
                "A-Z, a-z, 0-9, underscore, or hyphen"
            )
            raise ValueError(msg)
        return secret

    @field_validator("remnawave_webhook_secret")
    @classmethod
    def validate_remnawave_webhook_secret(cls, value: str | None) -> str | None:
        """Match the secret accepted by the locked Remnawave webhook contract."""
        if value is None or not value.strip():
            return None
        secret = value.strip()
        if len(secret) < 32 or re.fullmatch(r"[A-Za-z0-9]+", secret) is None:
            msg = (
                "REMNAWAVE_WEBHOOK_SECRET must be at least 32 characters and use only "
                "A-Z, a-z, or 0-9"
            )
            raise ValueError(msg)
        return secret

    @model_validator(mode="after")
    def validate_telegram_webhook_configuration(self) -> Settings:
        """Require one complete, fail-closed Telegram webhook configuration."""
        if not self.webhook_url.strip():
            return self
        if not self.bot_token.strip():
            msg = "BOT_TOKEN is required when WEBHOOK_URL is configured"
            raise ValueError(msg)
        if not self.telegram_webhook_secret:
            msg = "TELEGRAM_WEBHOOK_SECRET is required when WEBHOOK_URL is configured"
            raise ValueError(msg)
        return self
