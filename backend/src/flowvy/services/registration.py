"""Invite lifecycle and policy-controlled user registration."""

from __future__ import annotations

import asyncio
import datetime
import re
import secrets
import uuid
from dataclasses import dataclass

from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from flowvy.config import Settings
from flowvy.models.access_profile import AccessProfile
from flowvy.models.invite import Invite
from flowvy.models.user import User
from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.invite import InviteRepository
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.schemas.registration import (
    AccessProfileInput,
    AccessProfileResponse,
    OnboardingStatusResponse,
    ProviderSquad,
    RegistrationOptionsResponse,
    RegistrationSettingsPatch,
    RegistrationSettingsResponse,
    UserInviteResponse,
)
from flowvy.schemas.remnawave import RemnawaveCreateUserRequest, RemnawaveUserData
from flowvy.services.access_profile_snapshot import (
    access_profile_input,
    access_profile_snapshot,
)
from flowvy.services.remnawave import RemnawaveClient, RemnawaveError
from flowvy.services.user import UserService

_INVITE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_INVITE_RANDOM_LENGTH = 20
_INVITE_ATTEMPT_LIMIT = 10
_INVITE_ATTEMPT_WINDOW_SECONDS = 3600
_BOT_START_LEASE_SECONDS = 120
_BOT_START_COOLDOWN_SECONDS = 5
_PROVIDER_LOOKUP_RETRY_DELAY_SECONDS = 0.2
_LIFETIME_EXPIRES_AT = datetime.datetime(2099, 12, 31, 23, 59, 59, tzinfo=datetime.UTC)
_FINISH_BOT_START_SCRIPT = """
if redis.call('get', KEYS[1]) ~= ARGV[1] then
    return 0
end
if ARGV[2] == '1' then
    redis.call('set', KEYS[1], 'done', 'EX', ARGV[3])
    return 1
end
return redis.call('del', KEYS[1])
"""


@dataclass(frozen=True, slots=True)
class RegistrationIdentity:
    """Trusted Telegram identity extracted from signed initData or bot Update."""

    telegram_id: int
    username: str | None
    full_name: str


class RegistrationError(Exception):
    """Stable registration failure safe to map at transport boundaries."""

    code = "registration_failed"
    message = "Registration could not be completed"


class RegistrationRequiredError(RegistrationError):
    """Raised when a local account does not exist yet."""

    code = "registration_required"
    message = "Registration is required"


class InviteRequiredError(RegistrationError):
    """Raised when open registration is disabled."""

    code = "invite_required"
    message = "An invite code is required"


class InvalidInviteError(RegistrationError):
    """Use one response for missing, inactive, and disabled-owner codes."""

    code = "invalid_invite"
    message = "This invite code is invalid or no longer available"


class InviteRateLimitError(RegistrationError):
    """Raised after too many redemption attempts from one Telegram identity."""

    code = "invite_rate_limited"
    message = "Too many attempts. Try again later"


class RegistrationUnavailableError(RegistrationError):
    """Raised when a security-critical dependency or grant is unavailable."""

    code = "registration_unavailable"
    message = "Registration is temporarily unavailable"


class RegistrationAdminError(ValueError):
    """Safe validation failure for admin registration configuration."""


def normalize_invite_code(code: str) -> str:
    """Normalize visual separators without creating a case-sensitive trap."""
    return re.sub(r"[\s-]+", "", code).upper()


def _generate_invite_code() -> str:
    random_part = "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(_INVITE_RANDOM_LENGTH))
    return f"FVY{random_part}"


def format_invite_code(code: str) -> str:
    """Format the canonical compact code for human copying."""
    normalized = normalize_invite_code(code)
    prefix = normalized[:3]
    suffix = normalized[3:]
    return prefix + "-" + "-".join(suffix[index : index + 4] for index in range(0, len(suffix), 4))


def _profile_response(profile: AccessProfile) -> AccessProfileResponse:
    return AccessProfileResponse(
        **access_profile_input(profile).model_dump(),
        id=profile.id,
        is_active=profile.is_active,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


class RegistrationAdminService:
    """Admin configuration for registration policy and provider grants."""

    def __init__(
        self,
        profiles: AccessProfileRepository,
        settings: ProviderSettingsRepository,
        remnawave: RemnawaveClient,
    ) -> None:
        self._profiles = profiles
        self._settings = settings
        self._remnawave = remnawave

    async def get_settings(self) -> RegistrationSettingsResponse:
        row = await self._settings.get()
        return RegistrationSettingsResponse(
            registration_mode=row.registration_mode,
            default_access_profile_id=row.default_access_profile_id,
        )

    async def update_settings(
        self,
        patch: RegistrationSettingsPatch,
    ) -> RegistrationSettingsResponse:
        data = patch.model_dump(exclude_unset=True)
        profile_id = data.get("default_access_profile_id")
        if profile_id is not None and await self._profiles.get_active(profile_id) is None:
            raise RegistrationAdminError("Default access profile is unavailable")
        await self._settings.update_partial(data)
        return await self.get_settings()

    async def list_profiles(self) -> list[AccessProfileResponse]:
        return [_profile_response(profile) for profile in await self._profiles.list_all()]

    async def create_profile(
        self,
        payload: AccessProfileInput,
        admin_id: int,
    ) -> AccessProfileResponse:
        await self._validate_profile(payload)
        if await self._profiles.name_exists(payload.name):
            raise RegistrationAdminError("An access profile with this name already exists")
        profile = await self._profiles.create(
            **self._profile_values(payload),
            created_by_id=admin_id,
        )
        return _profile_response(profile)

    async def update_profile(
        self,
        profile_id: uuid.UUID,
        payload: AccessProfileInput,
    ) -> AccessProfileResponse:
        profile = await self._profiles.get_by_id(profile_id)
        if profile is None:
            raise RegistrationAdminError("Access profile was not found")
        await self._validate_profile(payload, existing=profile)
        if await self._profiles.name_exists(payload.name, exclude_id=profile_id):
            raise RegistrationAdminError("An access profile with this name already exists")
        updated = await self._profiles.update(profile, **self._profile_values(payload))
        return _profile_response(updated)

    async def deactivate_profile(self, profile_id: uuid.UUID) -> None:
        profile = await self._profiles.get_by_id(profile_id)
        if profile is None:
            raise RegistrationAdminError("Access profile was not found")
        settings = await self._settings.get()
        if settings.default_access_profile_id == profile_id:
            raise RegistrationAdminError("Change the default access profile before disabling it")
        await self._profiles.update(profile, is_active=False)

    async def get_options(self) -> RegistrationOptionsResponse:
        internal, external, tags = await asyncio.gather(
            self._remnawave.get_internal_squads(),
            self._remnawave.get_external_squads(),
            self._remnawave.get_user_tags(),
        )
        return RegistrationOptionsResponse(
            internal_squads=[ProviderSquad.model_validate(item) for item in internal],
            external_squads=[ProviderSquad.model_validate(item) for item in external],
            tags=tags,
        )

    async def _validate_profile(
        self,
        payload: AccessProfileInput,
        *,
        existing: AccessProfile | None = None,
    ) -> None:
        if (
            payload.validity_mode == "fixed"
            and payload.fixed_expire_at is not None
            and payload.fixed_expire_at <= datetime.datetime.now(datetime.UTC)
        ):
            raise RegistrationAdminError("Fixed expiration must be in the future")
        requested_internal = [str(item) for item in payload.internal_squad_uuids]
        squads_unchanged = (
            existing is not None
            and requested_internal == existing.internal_squad_uuids
            and payload.external_squad_uuid == existing.external_squad_uuid
        )
        validate_squads = not squads_unchanged and bool(
            payload.internal_squad_uuids or payload.external_squad_uuid is not None
        )
        tag_unchanged = existing is not None and payload.tag == existing.tag
        validate_tag = payload.tag is not None and not tag_unchanged
        if not validate_squads and not validate_tag:
            return

        if validate_squads and validate_tag:
            options = await self.get_options()
            internal = options.internal_squads
            external = options.external_squads
            tags = options.tags
        elif validate_squads:
            internal_raw, external_raw = await asyncio.gather(
                self._remnawave.get_internal_squads(),
                self._remnawave.get_external_squads(),
            )
            internal = [ProviderSquad.model_validate(item) for item in internal_raw]
            external = [ProviderSquad.model_validate(item) for item in external_raw]
            tags = []
        else:
            internal = []
            external = []
            tags = await self._remnawave.get_user_tags()

        if validate_squads:
            internal_ids = {item.uuid for item in internal}
            external_ids = {item.uuid for item in external}
            if any(item not in internal_ids for item in payload.internal_squad_uuids):
                raise RegistrationAdminError("One or more internal squads are unavailable")
            if (
                payload.external_squad_uuid is not None
                and payload.external_squad_uuid not in external_ids
            ):
                raise RegistrationAdminError("External squad is unavailable")
        if validate_tag and payload.tag not in tags:
            raise RegistrationAdminError("Tag is unavailable in Remnawave")

    @staticmethod
    def _profile_values(payload: AccessProfileInput) -> dict[str, object]:
        data = payload.model_dump()
        data["internal_squad_uuids"] = [str(item) for item in payload.internal_squad_uuids]
        return data


class RegistrationService:
    """Atomically authorise local registration and reconcile provider provisioning."""

    def __init__(
        self,
        session: AsyncSession,
        users: UserService,
        invites: InviteRepository,
        profiles: AccessProfileRepository,
        settings: ProviderSettingsRepository,
        subscriptions: SubscriptionRepository,
        remnawave: RemnawaveClient,
        redis: Redis,
        config: Settings,
    ) -> None:
        self._session = session
        self._users = users
        self._invites = invites
        self._profiles = profiles
        self._settings = settings
        self._subscriptions = subscriptions
        self._remnawave = remnawave
        self._redis = redis
        self._config = config

    async def get_existing(self, identity: RegistrationIdentity) -> User | None:
        return await self._users.get_existing(
            identity.telegram_id,
            identity.username,
            identity.full_name,
        )

    async def begin_bot_start(self, telegram_id: int) -> str | None:
        """Claim one distributed lease for concurrent ``/start`` updates."""
        key = self._bot_start_key(telegram_id)
        token = secrets.token_urlsafe(16)
        try:
            claimed = await self._redis.set(
                key,
                token,
                ex=_BOT_START_LEASE_SECONDS,
                nx=True,
            )
        except RedisError as exc:
            raise RegistrationUnavailableError from exc
        return token if claimed else None

    async def finish_bot_start(
        self,
        telegram_id: int,
        token: str,
        *,
        stable_response: bool,
    ) -> None:
        """Release a lease or retain a short cooldown after a stable response."""
        try:
            await self._redis.eval(
                _FINISH_BOT_START_SCRIPT,
                1,
                self._bot_start_key(telegram_id),
                token,
                "1" if stable_response else "0",
                str(_BOT_START_COOLDOWN_SECONDS),
            )
        except RedisError:
            # The finite lease remains the recovery path if Redis disappears mid-handler.
            return

    async def resolve_existing(self, identity: RegistrationIdentity) -> User | None:
        """Resolve a local or exact provider user without changing provider access."""
        existing = await self.get_existing(identity)
        if existing is not None or not self._provider_configured():
            return existing

        await self._acquire_registration_lock(identity.telegram_id)
        existing = await self.get_existing(identity)
        if existing is not None:
            return existing

        try:
            provider_user = await self._get_provider_user(identity.telegram_id)
        except RemnawaveError as exc:
            raise RegistrationUnavailableError from exc
        if provider_user is None:
            return None

        return await self._import_provider_user(identity, provider_user)

    async def get_status(self, identity: RegistrationIdentity) -> OnboardingStatusResponse:
        existing = await self.resolve_existing(identity)
        settings = await self._settings.get()
        state = (
            "registered"
            if existing is not None
            else ("open" if settings.registration_mode == "open" else "invite_required")
        )
        return OnboardingStatusResponse(
            state=state,  # type: ignore[arg-type]
            registration_mode=settings.registration_mode,  # type: ignore[arg-type]
            app_name=settings.app_name,
            logo_url=settings.logo_url,
        )

    async def register_open(self, identity: RegistrationIdentity) -> User:
        existing = await self.resolve_existing(identity)
        if existing is not None:
            return existing
        settings = await self._settings.get()
        if settings.registration_mode != "open" and not self._users.is_admin_identity(
            identity.telegram_id,
        ):
            raise InviteRequiredError
        snapshot = await self._default_profile_snapshot(settings.default_access_profile_id)
        return await self._register(identity, snapshot)

    async def bootstrap_admin(self, identity: RegistrationIdentity) -> User:
        if not self._users.is_admin_identity(identity.telegram_id):
            raise RegistrationRequiredError
        return await self._register(identity, None)

    async def redeem(self, identity: RegistrationIdentity, code: str) -> User:
        existing = await self.resolve_existing(identity)
        if existing is not None:
            return existing
        await self._check_attempt_limit(identity.telegram_id)
        await self._acquire_registration_lock(identity.telegram_id)
        existing = await self.get_existing(identity)
        if existing is not None:
            return existing
        invite = await self._invites.get_by_code(normalize_invite_code(code))
        if invite is None or not invite.is_active:
            raise InvalidInviteError
        inviter = await self._users.get_active_by_id(invite.created_by_id)
        if inviter is None:
            raise InvalidInviteError
        settings = await self._settings.get()
        snapshot = await self._default_profile_snapshot(settings.default_access_profile_id)
        return await self._register_locked(identity, snapshot, invited_by_id=inviter.id)

    async def _import_provider_user(
        self,
        identity: RegistrationIdentity,
        provider_user: RemnawaveUserData,
    ) -> User:
        user = await self._users.create_registered(
            identity.telegram_id,
            identity.username,
            identity.full_name,
        )
        await self._ensure_user_invite(user.id)
        await self._link_subscription(user.id, provider_user)
        return user

    async def get_user_invite(self, identity: RegistrationIdentity) -> UserInviteResponse:
        """Return a stable reusable code and direct referral count for its owner."""
        await self._acquire_registration_lock(identity.telegram_id)
        user = await self.get_existing(identity)
        if user is None:
            raise RegistrationRequiredError
        invite = await self._ensure_user_invite(user.id)
        return UserInviteResponse(
            code=format_invite_code(invite.code),
            invited_count=await self._users.count_invited_by(user.id),
        )

    async def _register(
        self,
        identity: RegistrationIdentity,
        snapshot: dict[str, object] | None,
    ) -> User:
        await self._acquire_registration_lock(identity.telegram_id)
        existing = await self.get_existing(identity)
        if existing is not None:
            return existing
        return await self._register_locked(identity, snapshot)

    async def _register_locked(
        self,
        identity: RegistrationIdentity,
        snapshot: dict[str, object] | None,
        *,
        invited_by_id: int | None = None,
    ) -> User:
        provider_user: RemnawaveUserData | None = None
        if snapshot is not None:
            profile = AccessProfileInput.model_validate(snapshot)
            request = self._provider_request(identity, profile)
            provider_user = await self._ensure_provider_user(request)

        user = await self._users.create_registered(
            identity.telegram_id,
            identity.username,
            identity.full_name,
            invited_by_id=invited_by_id,
        )
        await self._ensure_user_invite(user.id)
        if provider_user is not None:
            await self._link_subscription(user.id, provider_user)
        return user

    async def _link_subscription(
        self,
        user_id: int,
        provider_user: RemnawaveUserData,
    ) -> None:
        await self._subscriptions.upsert_from_remnawave(
            user_id=user_id,
            remnawave_user_id=provider_user.provider_id,
            remnawave_uuid=provider_user.uuid,
            status=provider_user.status,
            device_limit=provider_user.hwid_device_limit,
            expires_at=provider_user.expire_at,
        )

    def _provider_configured(self) -> bool:
        return bool(
            self._config.remnawave_url.strip() and self._config.remnawave_api_token.strip()
        )

    async def _default_profile_snapshot(
        self,
        profile_id: uuid.UUID | None,
    ) -> dict[str, object] | None:
        if profile_id is None:
            return None
        profile = await self._profiles.get_active(profile_id)
        if profile is None:
            raise RegistrationUnavailableError
        return access_profile_snapshot(profile)

    async def _ensure_user_invite(self, user_id: int) -> Invite:
        existing = await self._invites.get_by_owner(user_id)
        if existing is not None:
            return existing
        for _attempt in range(5):
            code = _generate_invite_code()
            if await self._invites.get_by_code(code) is None:
                return await self._invites.create(
                    code=code,
                    created_by_id=user_id,
                )
        raise RegistrationUnavailableError

    async def _ensure_provider_user(
        self,
        request: RemnawaveCreateUserRequest,
    ) -> RemnawaveUserData:
        try:
            existing = await self._get_provider_user(request.telegram_id)
        except RemnawaveError as exc:
            raise RegistrationUnavailableError from exc
        if existing is not None:
            return existing
        try:
            return await self._remnawave.create_user(request)
        except RemnawaveError as exc:
            if exc.status not in {502, 504}:
                raise RegistrationUnavailableError from exc
            try:
                reconciled = await self._get_provider_user(request.telegram_id)
            except RemnawaveError as lookup_exc:
                raise RegistrationUnavailableError from lookup_exc
            if reconciled is not None:
                return reconciled
            raise RegistrationUnavailableError from exc

    async def _get_provider_user(self, telegram_id: int) -> RemnawaveUserData | None:
        """Retry one idempotent lookup only for explicit transport/transient failures."""
        for attempt in range(2):
            try:
                return await self._remnawave.get_user_by_telegram_id(telegram_id)
            except RemnawaveError as exc:
                if attempt == 1 or not exc.retryable:
                    raise
                await asyncio.sleep(_PROVIDER_LOOKUP_RETRY_DELAY_SECONDS)
        raise AssertionError("provider lookup retry loop did not return")  # pragma: no cover

    @staticmethod
    def _provider_request(
        identity: RegistrationIdentity,
        profile: AccessProfileInput,
    ) -> RemnawaveCreateUserRequest:
        now = datetime.datetime.now(datetime.UTC)
        if profile.validity_mode == "duration":
            if profile.validity_days is None:  # pragma: no cover - schema invariant
                raise RegistrationUnavailableError
            expire_at = now + datetime.timedelta(days=profile.validity_days)
        elif profile.validity_mode == "fixed":
            if profile.fixed_expire_at is None:  # pragma: no cover - schema invariant
                raise RegistrationUnavailableError
            expire_at = profile.fixed_expire_at
        else:
            expire_at = _LIFETIME_EXPIRES_AT
        if expire_at <= now:
            raise RegistrationUnavailableError
        return RemnawaveCreateUserRequest(
            username=f"tg_{identity.telegram_id}",
            status=profile.status,
            traffic_limit_bytes=profile.traffic_limit_bytes,
            traffic_limit_strategy=profile.traffic_limit_strategy,
            expire_at=expire_at,
            description=profile.description,
            tag=profile.tag,
            telegram_id=identity.telegram_id,
            hwid_device_limit=profile.hwid_device_limit,
            active_internal_squads=profile.internal_squad_uuids,
            external_squad_uuid=profile.external_squad_uuid,
        )

    async def _acquire_registration_lock(self, telegram_id: int) -> None:
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(:telegram_id)"),
            {"telegram_id": telegram_id},
        )

    async def _check_attempt_limit(self, telegram_id: int) -> None:
        key = f"registration:invite-attempts:{telegram_id}"
        try:
            count = await self._redis.incr(key)
            if count == 1:
                await self._redis.expire(key, _INVITE_ATTEMPT_WINDOW_SECONDS)
        except RedisError as exc:
            raise RegistrationUnavailableError from exc
        if count > _INVITE_ATTEMPT_LIMIT:
            raise InviteRateLimitError

    @staticmethod
    def _bot_start_key(telegram_id: int) -> str:
        return f"registration:bot-start:{telegram_id}"


__all__ = [
    "InvalidInviteError",
    "InviteRateLimitError",
    "InviteRequiredError",
    "RegistrationAdminError",
    "RegistrationAdminService",
    "RegistrationError",
    "RegistrationIdentity",
    "RegistrationRequiredError",
    "RegistrationService",
    "RegistrationUnavailableError",
    "format_invite_code",
    "normalize_invite_code",
]
