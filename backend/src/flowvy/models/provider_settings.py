"""Provider-level settings — singleton row (id=1)."""

from __future__ import annotations

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from flowvy.models.base import Base, updated_at


class ProviderSettings(Base):
    """Runtime-configurable settings managed via Admin UI."""

    __tablename__ = "provider_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kuma_enabled: Mapped[bool] = mapped_column(default=False)
    kuma_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    kuma_slug: Mapped[str | None] = mapped_column(String(255), nullable=True)
    support_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    renew_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    app_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    welcome_text: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    welcome_media_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    welcome_media_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    welcome_button_text: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_at: Mapped[updated_at]
