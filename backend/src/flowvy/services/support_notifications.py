"""Product-owned Telegram notifications for durable Support conversations."""

from __future__ import annotations

import asyncio
import html
import logging
import uuid
from urllib.parse import quote, urlsplit

from flowvy.config import Settings
from flowvy.localization import product_text, render_placeholders
from flowvy.repositories.user import UserRepository
from flowvy.schemas.support_requests import SupportRequestResponse
from flowvy.services.message_sender import InlineButton, MessageSender

logger = logging.getLogger(__name__)

_MAX_PREVIEW_CHARS = 1200
_MAX_PARALLEL_DELIVERIES = 5
_DELIVERY_TIMEOUT_SECONDS = 10.0
_TOPIC_KEYS = {
    "connection": "connection",
    "subscription": "subscription",
    "devices": "devices",
    "payment": "payment",
    "other": "other",
}


class SupportNotificationService:
    """Render fixed service copy and isolate best-effort Telegram delivery."""

    def __init__(
        self,
        sender: MessageSender,
        users: UserRepository,
        settings: Settings,
    ) -> None:
        self._sender = sender
        self._users = users
        self._settings = settings

    async def notify_new_request(
        self,
        request: SupportRequestResponse,
        *,
        actor_telegram_id: int,
    ) -> None:
        """Notify every active authorized admin except the requester themselves."""
        try:
            if not request.messages:
                return
            await self._notify_admins(
                request,
                template_key="supportNotifications.adminNewRequest",
                actor_telegram_id=actor_telegram_id,
            )
        except Exception:
            logger.exception("Support admin notification dispatch failed")

    async def notify_reply(
        self,
        request: SupportRequestResponse,
        *,
        actor_telegram_id: int,
    ) -> None:
        """Route one persisted reply to the requester or all current administrators."""
        try:
            if not request.messages:
                return
            message = request.messages[-1]
            if message.author == "support":
                if request.requester.id == actor_telegram_id:
                    return
                await self._deliver(
                    request.requester.id,
                    text=self._user_text(request),
                    buttons=self._buttons(request.id, "supportNotifications.replyButton"),
                    event="support_reply",
                )
                return
            await self._notify_admins(
                request,
                template_key="supportNotifications.adminUserReply",
                actor_telegram_id=actor_telegram_id,
            )
        except Exception:
            logger.exception("Support reply notification dispatch failed")

    async def _notify_admins(
        self,
        request: SupportRequestResponse,
        *,
        template_key: str,
        actor_telegram_id: int,
    ) -> None:
        admins = await self._users.get_active_admins(
            self._settings.admin_telegram_ids,
            exclude_telegram_id=actor_telegram_id,
        )
        if not admins:
            return
        text = self._admin_text(request, template_key)
        buttons = self._buttons(request.id, "supportNotifications.openButton")
        semaphore = asyncio.Semaphore(_MAX_PARALLEL_DELIVERIES)

        async def deliver(admin_id: int) -> None:
            async with semaphore:
                await self._deliver(
                    admin_id,
                    text=text,
                    buttons=buttons,
                    event="user_message",
                )

        await asyncio.gather(*(deliver(admin.id) for admin in admins))

    async def _deliver(
        self,
        chat_id: int,
        *,
        text: str,
        buttons: list[InlineButton] | None,
        event: str,
    ) -> None:
        try:
            async with asyncio.timeout(_DELIVERY_TIMEOUT_SECONDS):
                await self._sender.send(chat_id=chat_id, text=text, buttons=buttons)
        except TimeoutError:
            logger.warning("Support notification timed out", extra={"event": event})
        except Exception:
            logger.exception("Support notification delivery failed", extra={"event": event})

    def _user_text(self, request: SupportRequestResponse) -> str:
        message = request.messages[-1]
        return self._render(
            "supportNotifications.userReply",
            request,
            message=self._preview(message.body),
            requester="",
            attachment_count=len(message.attachments),
        )

    def _admin_text(self, request: SupportRequestResponse, template_key: str) -> str:
        message = request.messages[-1]
        requester = html.escape(request.requester.full_name)
        if request.requester.username:
            username = html.escape(request.requester.username.lstrip("@"))
            requester = f"{requester} (@{username})"
        return self._render(
            template_key,
            request,
            message=self._preview(message.body),
            requester=requester,
            attachment_count=len(message.attachments),
        )

    @staticmethod
    def _preview(value: str) -> str:
        text = value.strip()
        if len(text) <= _MAX_PREVIEW_CHARS:
            return text
        candidate = text[: _MAX_PREVIEW_CHARS - 1].rstrip()
        boundary = max(candidate.rfind(" "), candidate.rfind("\n"), candidate.rfind("\t"))
        if boundary >= _MAX_PREVIEW_CHARS // 2:
            candidate = candidate[:boundary].rstrip()
        return f"{candidate}…"

    def _render(
        self,
        template_key: str,
        request: SupportRequestResponse,
        *,
        message: str,
        requester: str,
        attachment_count: int,
    ) -> str:
        topic_key = _TOPIC_KEYS.get(request.topic, "other")
        return render_placeholders(
            product_text(None, template_key),
            {
                "subject": html.escape(request.subject),
                "message": html.escape(message),
                "requester": requester,
                "requestNumber": str(request.number),
                "topic": html.escape(
                    product_text(None, f"supportNotifications.topics.{topic_key}")
                ),
                "attachments": self._attachments(attachment_count),
            },
        )

    @staticmethod
    def _attachments(count: int) -> str:
        if count < 1:
            return ""
        key = (
            "supportNotifications.oneAttachment"
            if count == 1
            else "supportNotifications.manyAttachments"
        )
        return "\n" + render_placeholders(product_text(None, key), {"count": str(count)})

    def _buttons(self, request_id: uuid.UUID, label_key: str) -> list[InlineButton] | None:
        base_url = self._settings.webapp_url.rstrip("/")
        parsed = urlsplit(base_url)
        if (
            parsed.scheme != "https"
            or not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            return None
        request_path = f"support/requests/{quote(str(request_id), safe='')}"
        url = f"{base_url}/{request_path}"
        return [InlineButton(text=product_text(None, label_key), web_app_url=url)]


__all__ = ["SupportNotificationService"]
