"""Registration policy, user-owned invites, and provider provisioning tests."""

from __future__ import annotations

import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from flowvy.config import Settings
from flowvy.models.user import User
from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.invite import InviteRepository
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.registration import AccessProfileInput, RegistrationSettingsPatch
from flowvy.schemas.remnawave import RemnawaveUserData
from flowvy.services.registration import (
    InvalidInviteError,
    InviteRateLimitError,
    InviteRequiredError,
    RegistrationAdminError,
    RegistrationAdminService,
    RegistrationIdentity,
    RegistrationService,
    RegistrationUnavailableError,
    normalize_invite_code,
)
from flowvy.services.remnawave import RemnawaveError
from flowvy.services.user import UserService

IDENTITY = RegistrationIdentity(telegram_id=123456, username="alice", full_name="Alice")


def _provider_user(telegram_id: int = IDENTITY.telegram_id) -> RemnawaveUserData:
    return RemnawaveUserData.from_raw(
        {
            "id": 42,
            "shortUuid": "abc123",
            "username": f"tg_{telegram_id}",
            "status": "ACTIVE",
            "trafficLimitBytes": 10_000_000_000,
            "trafficLimitStrategy": "MONTH",
            "expireAt": "2026-09-01T00:00:00Z",
            "createdAt": "2026-08-02T00:00:00Z",
            "updatedAt": "2026-08-02T00:00:00Z",
            "subscriptionUrl": "https://panel.example.com/sub/abc123",
            "telegramId": telegram_id,
            "hwidDeviceLimit": 2,
            "userTraffic": {"usedTrafficBytes": 0, "lifetimeUsedTrafficBytes": 0},
        },
    )


def _service(
    session: AsyncSession,
    remnawave: AsyncMock | None = None,
    redis: AsyncMock | None = None,
) -> RegistrationService:
    provider = remnawave or AsyncMock()
    if remnawave is None:
        provider.get_user_by_telegram_id = AsyncMock(return_value=None)
    return RegistrationService(
        session,
        UserService(UserRepository(session), Settings()),
        InviteRepository(session),
        AccessProfileRepository(session),
        ProviderSettingsRepository(session),
        SubscriptionRepository(session),
        provider,
        redis or AsyncMock(),
        Settings(
            remnawave_url="https://panel.example.test",
            remnawave_api_token="test-token",
        ),
    )


async def _seed_owner(
    session: AsyncSession,
    *,
    owner_id: int = 900001,
    code: str = "FVY-2345-6789-ABCD-EFGH-JKMN",
    active: bool = True,
) -> User:
    owner = await UserRepository(session).create(
        id=owner_id,
        username="owner",
        full_name="Invite Owner",
        is_active=active,
    )
    await InviteRepository(session).create(
        code=normalize_invite_code(code),
        created_by_id=owner.id,
    )
    return owner


async def _seed_default_profile(session: AsyncSession) -> uuid.UUID:
    profile = await AccessProfileRepository(session).create(
        name="Free",
        description="Flowvy free access",
        validity_mode="duration",
        validity_days=30,
        traffic_limit_bytes=10_000_000_000,
        traffic_limit_strategy="MONTH",
        hwid_device_limit=2,
        tag="FREE",
        status="ACTIVE",
        internal_squad_uuids=[],
    )
    await ProviderSettingsRepository(session).update_partial(
        {"default_access_profile_id": profile.id},
    )
    return profile.id


@pytest.mark.asyncio
async def test_open_registration_creates_personal_invite(session: AsyncSession) -> None:
    remnawave = AsyncMock()
    remnawave.get_user_by_telegram_id = AsyncMock(return_value=None)

    user = await _service(session, remnawave).register_open(IDENTITY)
    invite = await InviteRepository(session).get_by_owner(user.id)

    assert user.id == IDENTITY.telegram_id
    assert invite is not None and invite.code.startswith("FVY")
    remnawave.get_user_by_telegram_id.assert_awaited_once_with(IDENTITY.telegram_id)
    remnawave.create_user.assert_not_awaited()


@pytest.mark.asyncio
async def test_provider_only_user_is_imported_without_invite_or_provider_mutation(
    session: AsyncSession,
) -> None:
    owner = await _seed_owner(session)
    await _seed_default_profile(session)
    provider_user = _provider_user()
    remnawave = AsyncMock()
    remnawave.get_user_by_telegram_id = AsyncMock(return_value=provider_user)
    redis = AsyncMock()

    user = await _service(session, remnawave, redis).redeem(
        IDENTITY,
        "FVY-2345-6789-ABCD-EFGH-JKMN",
    )

    assert user.invited_by_id is None
    assert await UserRepository(session).count_invited_by(owner.id) == 0
    assert await InviteRepository(session).get_by_owner(user.id) is not None
    subscriptions = await SubscriptionRepository(session).get_by_user_id(user.id)
    assert len(subscriptions) == 1
    assert subscriptions[0].remnawave_user_id == provider_user.provider_id
    remnawave.create_user.assert_not_awaited()
    redis.incr.assert_not_awaited()


@pytest.mark.asyncio
async def test_provider_lookup_failure_does_not_fall_through_to_registration(
    session: AsyncSession,
) -> None:
    remnawave = AsyncMock()
    remnawave.get_user_by_telegram_id = AsyncMock(
        side_effect=RemnawaveError(502, "Provider connection failed"),
    )

    with pytest.raises(RegistrationUnavailableError):
        await _service(session, remnawave).resolve_existing(IDENTITY)

    assert await UserRepository(session).get_by_telegram_id(IDENTITY.telegram_id) is None
    remnawave.get_user_by_telegram_id.assert_awaited_once_with(IDENTITY.telegram_id)
    remnawave.create_user.assert_not_awaited()


@pytest.mark.asyncio
async def test_provider_lookup_retries_one_transient_read_before_import(
    session: AsyncSession,
) -> None:
    remnawave = AsyncMock()
    remnawave.get_user_by_telegram_id = AsyncMock(
        side_effect=[
            RemnawaveError(504, "Provider request timed out", retryable=True),
            _provider_user(),
        ],
    )

    with patch("flowvy.services.registration.asyncio.sleep", new=AsyncMock()) as sleep:
        user = await _service(session, remnawave).resolve_existing(IDENTITY)

    assert user is not None and user.id == IDENTITY.telegram_id
    assert remnawave.get_user_by_telegram_id.await_count == 2
    sleep.assert_awaited_once()
    remnawave.create_user.assert_not_awaited()


@pytest.mark.asyncio
async def test_bot_start_lease_is_exclusive_and_finishes_token_safely(
    session: AsyncSession,
) -> None:
    redis = AsyncMock()
    redis.set = AsyncMock(side_effect=[True, None])
    service = _service(session, redis=redis)

    token = await service.begin_bot_start(IDENTITY.telegram_id)
    duplicate = await service.begin_bot_start(IDENTITY.telegram_id)
    assert token is not None
    assert duplicate is None

    await service.finish_bot_start(
        IDENTITY.telegram_id,
        token,
        stable_response=True,
    )

    redis.eval.assert_awaited_once()
    eval_args = redis.eval.await_args.args
    assert eval_args[1:] == (
        1,
        f"registration:bot-start:{IDENTITY.telegram_id}",
        token,
        "1",
        "5",
    )


@pytest.mark.asyncio
async def test_bot_start_lease_fails_closed_when_redis_is_unavailable(
    session: AsyncSession,
) -> None:
    redis = AsyncMock()
    redis.set = AsyncMock(side_effect=RedisConnectionError("private connection detail"))

    with pytest.raises(RegistrationUnavailableError):
        await _service(session, redis=redis).begin_bot_start(IDENTITY.telegram_id)


@pytest.mark.asyncio
async def test_invite_only_rejects_open_registration(session: AsyncSession) -> None:
    await ProviderSettingsRepository(session).update_partial({"registration_mode": "invite_only"})

    with pytest.raises(InviteRequiredError):
        await _service(session).register_open(IDENTITY)

    assert await UserRepository(session).get_by_telegram_id(IDENTITY.telegram_id) is None


@pytest.mark.asyncio
async def test_reusable_invite_attributes_users_and_uses_global_default_access(
    session: AsyncSession,
) -> None:
    owner = await _seed_owner(session)
    await _seed_default_profile(session)
    remnawave = AsyncMock()
    remnawave.get_user_by_telegram_id = AsyncMock(return_value=None)
    remnawave.create_user = AsyncMock(return_value=_provider_user())
    redis = AsyncMock()
    redis.incr = AsyncMock(return_value=1)

    user = await _service(session, remnawave, redis).redeem(
        IDENTITY,
        "fvy 2345 6789 abcd efgh jkmn",
    )

    request = remnawave.create_user.await_args.args[0]
    assert user.invited_by_id == owner.id
    assert request.traffic_limit_bytes == 10_000_000_000
    assert request.hwid_device_limit == 2
    assert request.tag == "FREE"
    assert len(await SubscriptionRepository(session).get_by_user_id(user.id)) == 1
    assert (await InviteRepository(session).get_by_owner(owner.id)).is_active is True  # type: ignore[union-attr]
    assert await UserRepository(session).count_invited_by(owner.id) == 1


@pytest.mark.asyncio
async def test_invalid_and_inactive_owner_codes_share_one_error(session: AsyncSession) -> None:
    await _seed_owner(session, active=False)
    redis = AsyncMock()
    redis.incr = AsyncMock(return_value=1)
    service = _service(session, redis=redis)

    for code in ("FVY-2345-6789-ABCD-EFGH-JKMN", "FVY-NOT-FOUND"):
        with pytest.raises(InvalidInviteError) as exc_info:
            await service.redeem(IDENTITY, code)
        assert exc_info.value.message == "This invite code is invalid or no longer available"


@pytest.mark.asyncio
async def test_timeout_reconciles_provider_user_before_local_write(session: AsyncSession) -> None:
    await _seed_owner(session)
    await _seed_default_profile(session)
    remnawave = AsyncMock()
    remnawave.get_user_by_telegram_id = AsyncMock(side_effect=[None, None, _provider_user()])
    remnawave.create_user = AsyncMock(side_effect=RemnawaveError(504, "timeout"))
    redis = AsyncMock()
    redis.incr = AsyncMock(return_value=1)

    user = await _service(session, remnawave, redis).redeem(
        IDENTITY,
        "FVY-2345-6789-ABCD-EFGH-JKMN",
    )

    assert user.id == IDENTITY.telegram_id
    assert remnawave.get_user_by_telegram_id.await_count == 3


@pytest.mark.asyncio
async def test_redemption_limiter_fails_closed(session: AsyncSession) -> None:
    redis = AsyncMock()
    redis.incr = AsyncMock(return_value=11)
    with pytest.raises(InviteRateLimitError):
        await _service(session, redis=redis).redeem(IDENTITY, "FVY-ANY-CODE")

    redis.incr = AsyncMock(side_effect=RedisConnectionError("private connection detail"))
    with pytest.raises(RegistrationUnavailableError):
        await _service(session, redis=redis).redeem(IDENTITY, "FVY-ANY-CODE")


@pytest.mark.asyncio
async def test_personal_code_registers_multiple_people_concurrently(engine: AsyncEngine) -> None:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as seed:
        await _seed_owner(seed)
        await seed.commit()

    async def redeem(user_id: int) -> User:
        async with factory() as current:
            redis = AsyncMock()
            redis.incr = AsyncMock(return_value=1)
            identity = RegistrationIdentity(user_id, f"user{user_id}", f"User {user_id}")
            user = await _service(current, redis=redis).redeem(
                identity,
                "FVY-2345-6789-ABCD-EFGH-JKMN",
            )
            await current.commit()
            return user

    results = await asyncio.gather(redeem(500001), redeem(500002))

    assert all(item.invited_by_id == 900001 for item in results)
    async with factory() as check:
        assert await UserRepository(check).count_invited_by(900001) == 2


@pytest.mark.asyncio
async def test_admin_configures_one_global_registration_profile(session: AsyncSession) -> None:
    internal_id = uuid.uuid4()
    remnawave = AsyncMock()
    remnawave.get_internal_squads = AsyncMock(
        return_value=[{"uuid": str(internal_id), "name": "Primary"}],
    )
    remnawave.get_external_squads = AsyncMock(return_value=[])
    remnawave.get_user_tags = AsyncMock(return_value=["FREE"])
    admin = await UserService(UserRepository(session), Settings()).create_registered(
        900002,
        "admin",
        "Admin",
    )
    service = RegistrationAdminService(
        AccessProfileRepository(session),
        ProviderSettingsRepository(session),
        remnawave,
    )
    profile = await service.create_profile(
        AccessProfileInput(
            name="Free 30 days",
            validity_mode="duration",
            validity_days=30,
            traffic_limit_bytes=50 * 1024**3,
            traffic_limit_strategy="MONTH",
            tag="FREE",
            internal_squad_uuids=[internal_id],
        ),
        admin.id,
    )

    settings = await service.update_settings(
        RegistrationSettingsPatch(
            registration_mode="invite_only",
            default_access_profile_id=profile.id,
        ),
    )

    assert settings.registration_mode == "invite_only"
    assert settings.default_access_profile_id == profile.id
    assert profile.tag == "FREE"


@pytest.mark.asyncio
async def test_profile_without_squads_does_not_require_live_options(session: AsyncSession) -> None:
    remnawave = AsyncMock()
    admin = await UserService(UserRepository(session), Settings()).create_registered(
        900003,
        "admin2",
        "Admin Two",
    )
    service = RegistrationAdminService(
        AccessProfileRepository(session),
        ProviderSettingsRepository(session),
        remnawave,
    )

    profile = await service.create_profile(
        AccessProfileInput(name="Basic grant", validity_mode="duration", validity_days=7),
        admin.id,
    )

    assert profile.name == "Basic grant"
    remnawave.get_internal_squads.assert_not_awaited()
    remnawave.get_external_squads.assert_not_awaited()
    remnawave.get_user_tags.assert_not_awaited()


@pytest.mark.asyncio
async def test_profile_tag_must_exist_in_remnawave(session: AsyncSession) -> None:
    remnawave = AsyncMock()
    remnawave.get_user_tags = AsyncMock(return_value=["FREE", "PREMIUM"])
    admin = await UserService(UserRepository(session), Settings()).create_registered(
        900004,
        "admin3",
        "Admin Three",
    )
    service = RegistrationAdminService(
        AccessProfileRepository(session),
        ProviderSettingsRepository(session),
        remnawave,
    )

    with pytest.raises(RegistrationAdminError, match="Tag is unavailable"):
        await service.create_profile(
            AccessProfileInput(
                name="Unknown tag",
                validity_mode="lifetime",
                tag="MISSING",
            ),
            admin.id,
        )

    remnawave.get_internal_squads.assert_not_awaited()
    remnawave.get_external_squads.assert_not_awaited()


@pytest.mark.asyncio
async def test_unchanged_profile_tag_does_not_require_live_catalogue(
    session: AsyncSession,
) -> None:
    remnawave = AsyncMock()
    remnawave.get_user_tags = AsyncMock(return_value=["FREE"])
    admin = await UserService(UserRepository(session), Settings()).create_registered(
        900005,
        "admin4",
        "Admin Four",
    )
    service = RegistrationAdminService(
        AccessProfileRepository(session),
        ProviderSettingsRepository(session),
        remnawave,
    )
    profile = await service.create_profile(
        AccessProfileInput(name="Free", validity_mode="lifetime", tag="FREE"),
        admin.id,
    )
    remnawave.reset_mock()
    remnawave.get_user_tags = AsyncMock(side_effect=RemnawaveError(502, "unavailable"))

    updated = await service.update_profile(
        profile.id,
        AccessProfileInput(name="Free forever", validity_mode="lifetime", tag="FREE"),
    )

    assert updated.name == "Free forever"
    remnawave.get_user_tags.assert_not_awaited()
