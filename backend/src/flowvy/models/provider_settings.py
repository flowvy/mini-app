"""Provider-level settings — singleton row (id=1)."""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from flowvy.models.base import Base, updated_at


class ProviderSettings(Base):
    """Runtime-configurable settings managed via Admin UI."""

    __tablename__ = "provider_settings"
    __table_args__ = (
        CheckConstraint(
            "pulse_provider IN ('disabled', 'kuma', 'beszel')",
            name="ck_provider_settings_pulse_provider",
        ),
        CheckConstraint(
            "registration_mode IN ('open', 'invite_only')",
            name="ck_provider_settings_registration_mode",
        ),
        CheckConstraint(
            "jsonb_typeof(tribute_subscription_urls) = 'object'",
            name="ck_provider_settings_tribute_subscription_urls_object",
        ),
        CheckConstraint(
            "jsonb_typeof(content_locales) = 'object'",
            name="ck_provider_settings_content_locales_object",
        ),
        CheckConstraint(
            "(invite_share_media_file_id IS NULL AND invite_share_media_type IS NULL) OR "
            "(invite_share_media_file_id IS NOT NULL AND "
            "invite_share_media_type IN ('photo', 'animation', 'video'))",
            name="ck_provider_settings_invite_share_media",
        ),
        CheckConstraint(
            "invite_share_preview_mode IN ('auto', 'hidden', 'small', 'large')",
            name="ck_provider_settings_invite_share_preview_mode",
        ),
        CheckConstraint(
            "invite_share_allow_user_chats OR invite_share_allow_bot_chats OR "
            "invite_share_allow_group_chats OR invite_share_allow_channel_chats",
            name="ck_provider_settings_invite_share_audience",
        ),
        CheckConstraint(
            "referral_reward_days IS NULL OR referral_reward_days BETWEEN 1 AND 3650",
            name="ck_provider_settings_referral_reward_days",
        ),
        CheckConstraint(
            "welcome_discount_percent IS NULL OR welcome_discount_percent BETWEEN 1 AND 99",
            name="ck_provider_settings_welcome_discount_percent",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    registration_mode: Mapped[str] = mapped_column(String(16), default="open")
    default_access_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("access_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    pulse_provider: Mapped[str] = mapped_column(String(16), default="disabled")
    kuma_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    kuma_slug: Mapped[str | None] = mapped_column(String(255), nullable=True)
    beszel_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    app_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    welcome_text: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    welcome_media_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    welcome_media_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    welcome_media_file_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    welcome_media_file_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    welcome_button_text: Mapped[str | None] = mapped_column(String(100), nullable=True)
    content_default_locale: Mapped[str] = mapped_column(
        String(35),
        default="en",
        server_default="en",
    )
    content_locales: Mapped[dict[str, dict[str, str]]] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    invite_share_media_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    invite_share_media_file_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    invite_share_media_file_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    invite_share_preview_mode: Mapped[str] = mapped_column(
        String(16), default="auto", server_default="auto"
    )
    invite_share_allow_user_chats: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true")
    )
    invite_share_allow_bot_chats: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )
    invite_share_allow_group_chats: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true")
    )
    invite_share_allow_channel_chats: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )
    tribute_donation_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    tribute_subscription_urls: Mapped[dict[str, str]] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    referral_reward_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
    )
    referral_reward_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    referral_reward_access_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("access_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    welcome_discount_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
    )
    welcome_discount_offer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sponsor_offers.id", ondelete="SET NULL"),
        nullable=True,
    )
    welcome_discount_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    welcome_discount_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[updated_at]
