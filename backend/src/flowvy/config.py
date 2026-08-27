"""Application settings loaded from environment variables."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Annotated

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from flowvy.beszel_target import normalize_beszel_base_url
from flowvy.kuma_target import normalize_kuma_base_url


class Settings(BaseSettings):
    """Flowvy configuration. All values from env vars or .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    version: str = "0.1.0"
    host: str = "127.0.0.1"
    port: int = Field(default=8001, ge=1, le=65_535)
    static_dir: Path | None = None
    allowed_hosts: Annotated[list[str], NoDecode] = []
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
    beszel_email: str = ""
    beszel_password: SecretStr = SecretStr("")
    beszel_allowed_private_origins: Annotated[list[str], NoDecode] = []
    beszel_max_response_bytes: int = Field(
        default=1_048_576,
        ge=1024,
        le=10_485_760,
    )
    tribute_api_key: SecretStr = SecretStr("")
    tribute_max_response_bytes: int = Field(
        default=1_048_576,
        ge=1024,
        le=10_485_760,
    )
    tribute_webhook_max_age_seconds: int = Field(
        default=90_000,
        ge=3600,
        le=172_800,
    )
    tribute_webhook_future_tolerance_seconds: int = Field(
        default=300,
        ge=0,
        le=900,
    )
    tribute_webhook_max_body_bytes: int = Field(
        default=65_536,
        ge=1024,
        le=1_048_576,
    )
    tribute_webhook_retention_days: int = Field(default=90, ge=1, le=365)
    tribute_entitlement_worker_interval_seconds: int = Field(default=10, ge=1, le=300)
    tribute_entitlement_lease_seconds: int = Field(default=120, ge=30, le=3600)
    tribute_entitlement_max_attempts: int = Field(default=5, ge=1, le=20)
    sponsor_checkout_pending_minutes: int = Field(default=30, ge=5, le=180)
    r2_account_id: str = ""
    r2_bucket_name: str = ""
    r2_access_key_id: SecretStr = SecretStr("")
    r2_secret_access_key: SecretStr = SecretStr("")
    support_attachment_max_file_bytes: int = Field(
        default=52_428_800,
        ge=1_048_576,
        le=536_870_912,
    )
    support_attachment_max_total_bytes: int = Field(
        default=104_857_600,
        ge=1_048_576,
        le=1_073_741_824,
    )
    support_upload_url_ttl_seconds: int = Field(default=600, ge=60, le=3600)
    support_pending_upload_ttl_seconds: int = Field(default=3600, ge=600, le=86_400)
    support_attachment_retention_days: int = Field(default=3, ge=1, le=30)
    support_request_retention_days: int = Field(default=90, ge=30, le=365)
    support_retention_cleanup_interval_seconds: int = Field(default=3600, ge=60, le=86_400)
    support_retention_cleanup_batch_size: int = Field(default=100, ge=1, le=1000)
    debug: bool = False
    admin_telegram_ids: Annotated[list[int], NoDecode] = []

    @field_validator("allowed_hosts", mode="before")
    @classmethod
    def parse_allowed_hosts(cls, value: object) -> list[str]:
        """Parse a comma-separated host allowlist for TrustedHostMiddleware."""
        if isinstance(value, str):
            if not value.strip():
                return []
            return [part.strip() for part in value.split(",")]
        return value  # type: ignore[return-value]

    @field_validator("allowed_hosts")
    @classmethod
    def validate_allowed_hosts(cls, values: list[str]) -> list[str]:
        """Reject malformed or URL-shaped host entries before startup."""
        normalized: list[str] = []
        for value in values:
            host = value.strip().lower()
            if not host or "://" in host or "/" in host or ":" in host:
                raise ValueError(
                    "ALLOWED_HOSTS entries must be hostnames without scheme, path, or port"
                )
            normalized.append(host)
        return list(dict.fromkeys(normalized))

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

    @field_validator("beszel_allowed_private_origins", mode="before")
    @classmethod
    def parse_beszel_private_origins(cls, value: object) -> list[str]:
        """Parse exact, operator-approved private Beszel origins."""
        if isinstance(value, str):
            if not value.strip():
                return []
            return [part.strip() for part in value.split(",")]
        return value  # type: ignore[return-value]

    @field_validator("beszel_allowed_private_origins")
    @classmethod
    def validate_beszel_private_origins(cls, values: list[str]) -> list[str]:
        """Fail startup on malformed private-origin exceptions."""
        return list(dict.fromkeys(normalize_beszel_base_url(value) for value in values))

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

    @model_validator(mode="after")
    def validate_r2_configuration(self) -> Settings:
        """Accept either no R2 configuration or one complete, fixed-origin setup."""
        if self.support_attachment_max_total_bytes < self.support_attachment_max_file_bytes:
            raise ValueError(
                "SUPPORT_ATTACHMENT_MAX_TOTAL_BYTES must be at least "
                "SUPPORT_ATTACHMENT_MAX_FILE_BYTES"
            )
        values = (
            self.r2_account_id.strip(),
            self.r2_bucket_name.strip(),
            self.r2_access_key_id.get_secret_value().strip(),
            self.r2_secret_access_key.get_secret_value().strip(),
        )
        if not any(values):
            return self
        if not all(values):
            raise ValueError(
                "R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID and "
                "R2_SECRET_ACCESS_KEY must be configured together"
            )
        if re.fullmatch(r"[0-9a-f]{32}", values[0]) is None:
            raise ValueError("R2_ACCOUNT_ID must be a 32-character lowercase hexadecimal ID")
        if re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", values[1]) is None:
            raise ValueError("R2_BUCKET_NAME must be a valid 3-63 character bucket name")
        self.r2_account_id = values[0]
        self.r2_bucket_name = values[1]
        return self

    @property
    def r2_configured(self) -> bool:
        return bool(self.r2_account_id and self.r2_bucket_name)

    @property
    def r2_endpoint(self) -> str | None:
        if not self.r2_configured:
            return None
        return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"
