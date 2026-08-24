"""Product copy, recipients and transaction ordering for Support notifications."""

from __future__ import annotations

import datetime
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, call

import pytest

from flowvy.api.routes.support_requests import (
    create_support_request,
    reply_to_support_request,
)
from flowvy.config import Settings
from flowvy.repositories.user import UserRepository
from flowvy.schemas.support_requests import (
    CreateSupportRequestInput,
    ReplySupportRequestInput,
    SupportAttachmentResponse,
    SupportMessageResponse,
    SupportRequestContextResponse,
    SupportRequesterResponse,
    SupportRequestResponse,
)
from flowvy.services.message_sender import MessageSender
from flowvy.services.support_notifications import SupportNotificationService
from flowvy.services.support_requests import SupportRequestService


def _request(
    *,
    author: str,
    body: str = "Please try again.",
    subject: str = "Connection drops",
    attachment_count: int = 0,
) -> SupportRequestResponse:
    now = datetime.datetime.now(datetime.UTC)
    attachments = [
        SupportAttachmentResponse(
            id=uuid.uuid4(),
            name=f"private-{index}.zip",
            kind="zip",
            size_bytes=42,
        )
        for index in range(attachment_count)
    ]
    return SupportRequestResponse(
        id=uuid.uuid4(),
        number=1042,
        topic="connection",
        subject=subject,
        status="waiting_user" if author == "support" else "needs_reply",
        updated_at=now,
        last_message_preview=body[:160],
        unread_count=0,
        requester=SupportRequesterResponse(
            id=700_001,
            full_name="Alex <Owner>",
            username="alex_owner",
        ),
        messages=[
            SupportMessageResponse(
                id=uuid.uuid4(),
                author=author,  # type: ignore[arg-type]
                author_name="Flowvy Support" if author == "support" else "Alex",
                body=body,
                created_at=now,
                attachments=attachments,
            )
        ],
        context=SupportRequestContextResponse(),
    )


def _notifications(
    *,
    webapp_url: str = "https://app.example.com",
) -> tuple[SupportNotificationService, AsyncMock, AsyncMock]:
    sender = AsyncMock(spec=MessageSender)
    users = AsyncMock(spec=UserRepository)
    settings = Settings(
        _env_file=None,
        webapp_url=webapp_url,
        admin_telegram_ids=[800_001, 800_002, 700_001],
    )
    return SupportNotificationService(sender, users, settings), sender, users


@pytest.mark.asyncio
async def test_new_request_notifies_every_active_admin_except_requester() -> None:
    notifications, sender, users = _notifications()
    users.get_active_admins.return_value = [
        SimpleNamespace(id=800_001),
        SimpleNamespace(id=800_002),
    ]
    request = _request(
        author="user",
        body="My <b>profile</b> stopped & will not reconnect.",
        subject="Cannot use <Flowvy>",
        attachment_count=2,
    )

    await notifications.notify_new_request(request, actor_telegram_id=request.requester.id)

    users.get_active_admins.assert_awaited_once_with(
        [800_001, 800_002, 700_001],
        exclude_telegram_id=700_001,
    )
    assert {item.kwargs["chat_id"] for item in sender.send.await_args_list} == {
        800_001,
        800_002,
    }
    sent = sender.send.await_args_list[0].kwargs
    assert "🆕 <b>New support request</b>" in sent["text"]
    assert "<b>Cannot use &lt;Flowvy&gt;</b>" in sent["text"]
    assert (
        "<blockquote>My &lt;b&gt;profile&lt;/b&gt; stopped &amp; will not reconnect.</blockquote>"
        in sent["text"]
    )
    assert "👤 <b>Alex &lt;Owner&gt; (@alex_owner)</b>" in sent["text"]
    assert "🎫 <b>Request #1042</b> · Connection" in sent["text"]
    assert "📎 2 attachments" in sent["text"]
    assert "private-0.zip" not in sent["text"]
    assert sent["buttons"][0].text == "Open"
    assert sent["buttons"][0].web_app_url == (
        f"https://app.example.com/support/requests/{request.id}"
    )


@pytest.mark.asyncio
async def test_support_reply_notifies_only_requester_with_bounded_escaped_copy() -> None:
    notifications, sender, users = _notifications()
    request = _request(
        author="support",
        body=("Use <Settings> & reconnect. " * 100),
        attachment_count=1,
    )

    await notifications.notify_reply(request, actor_telegram_id=800_001)

    users.get_active_admins.assert_not_awaited()
    sender.send.assert_awaited_once()
    sent = sender.send.await_args.kwargs
    assert sent["chat_id"] == request.requester.id
    assert "💬 <b>Flowvy Support replied</b>" in sent["text"]
    assert "<blockquote>Use &lt;Settings&gt; &amp; reconnect." in sent["text"]
    assert "</blockquote>" in sent["text"]
    assert "🎫 <b>Request #1042</b> · Connection" in sent["text"]
    assert "📎 1 attachment" in sent["text"]
    assert "private-0.zip" not in sent["text"]
    assert "…" in sent["text"]
    assert len(sent["text"]) < 4096
    assert sent["buttons"][0].text == "Reply"
    assert sent["buttons"][0].web_app_url == (
        f"https://app.example.com/support/requests/{request.id}"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("webapp_url", ["", "http://localhost:5173"])
async def test_user_reply_uses_reply_heading_and_provider_failure_is_isolated(
    webapp_url: str,
) -> None:
    notifications, sender, users = _notifications(webapp_url=webapp_url)
    users.get_active_admins.return_value = [
        SimpleNamespace(id=800_001),
        SimpleNamespace(id=800_002),
    ]
    sender.send.side_effect = [RuntimeError("provider body must stay hidden"), None]

    await notifications.notify_reply(_request(author="user"), actor_telegram_id=700_001)

    assert sender.send.await_count == 2
    assert all(item.kwargs["buttons"] is None for item in sender.send.await_args_list)
    assert all(
        "💬 <b>New user reply</b>" in item.kwargs["text"] for item in sender.send.await_args_list
    )


@pytest.mark.asyncio
async def test_recipient_lookup_failure_never_breaks_persisted_support_response() -> None:
    notifications, sender, users = _notifications()
    users.get_active_admins.side_effect = RuntimeError("database unavailable")

    await notifications.notify_new_request(_request(author="user"), actor_telegram_id=700_001)

    sender.send.assert_not_awaited()


@pytest.mark.asyncio
async def test_routes_commit_before_dispatching_notifications() -> None:
    actor_id = 700_001
    request = _request(author="user")
    user = SimpleNamespace(user=SimpleNamespace(id=actor_id))
    service = AsyncMock(spec=SupportRequestService)
    service.create_request.return_value = request
    service.reply.return_value = request
    notifications = AsyncMock(spec=SupportNotificationService)
    session = SimpleNamespace(commit=AsyncMock())
    calls = Mock()
    calls.attach_mock(session.commit, "commit")
    calls.attach_mock(notifications.notify_new_request, "notify_new")
    calls.attach_mock(notifications.notify_reply, "notify_reply")

    await create_support_request(
        CreateSupportRequestInput(
            topic="connection",
            subject="Connection drops",
            message="Please help.",
        ),
        user,  # type: ignore[arg-type]
        service,
        notifications,
        session,  # type: ignore[arg-type]
    )
    await reply_to_support_request(
        request.id,
        ReplySupportRequestInput(message="Still broken."),
        user,  # type: ignore[arg-type]
        service,
        notifications,
        session,  # type: ignore[arg-type]
    )

    assert calls.mock_calls == [
        call.commit(),
        call.notify_new(request, actor_telegram_id=actor_id),
        call.commit(),
        call.notify_reply(request, actor_telegram_id=actor_id),
    ]
