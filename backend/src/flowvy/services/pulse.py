"""Business logic for Pulse status page aggregation."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from pydantic import ValidationError
from redis.asyncio import Redis

from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.schemas.beszel import BeszelSnapshot, BeszelSystemStat
from flowvy.schemas.kuma import KumaHeartbeatPage, KumaStatusPage
from flowvy.schemas.pulse import (
    PulseGroup,
    PulseHeartbeat,
    PulseIncident,
    PulseMonitor,
    PulseResponse,
)
from flowvy.services.beszel import BeszelClient
from flowvy.services.kuma import UptimeKumaClient

CACHE_KEY = "pulse:data"
CACHE_TTL = 60
MAX_BEATS = 40

STATUS_MAP = {0: "down", 1: "up", 2: "pending", 3: "maintenance"}
BESZEL_STATUS_MAP = {
    "up": "up",
    "down": "down",
    "paused": "maintenance",
    "pending": "pending",
}
MINUTE_SECONDS = 60
DAILY_SLOT_SECONDS = 20 * 60
DAILY_SLOTS = 72


class PulseService:
    """Aggregate the selected status provider into a stable Pulse response."""

    def __init__(
        self,
        kuma: UptimeKumaClient,
        beszel: BeszelClient,
        ps_repo: ProviderSettingsRepository,
        redis: Redis,
    ) -> None:
        self._kuma = kuma
        self._beszel = beszel
        self._ps_repo = ps_repo
        self._redis = redis

    async def get_pulse(self) -> PulseResponse | None:
        """Return aggregated pulse data, or None if Pulse is disabled."""
        ps = await self._ps_repo.get()
        if ps.pulse_provider == "disabled":
            return None
        if ps.pulse_provider == "kuma" and (not ps.kuma_url or not ps.kuma_slug):
            return None
        if ps.pulse_provider == "beszel" and not ps.beszel_url:
            return None

        cached = await self._redis.get(CACHE_KEY)
        if cached:
            try:
                return PulseResponse.model_validate_json(cached)
            except (ValidationError, ValueError):
                await self._redis.delete(CACHE_KEY)

        if ps.pulse_provider == "kuma":
            status_data, heartbeat_data = await asyncio.gather(
                self._kuma.get_status_page(ps.kuma_url, ps.kuma_slug),
                self._kuma.get_heartbeats(ps.kuma_url, ps.kuma_slug),
            )
            response = self._aggregate_kuma(status_data, heartbeat_data)
        elif ps.pulse_provider == "beszel":
            snapshot = await self._beszel.get_snapshot(ps.beszel_url)
            response = self._aggregate_beszel(snapshot)
        else:
            return None

        await self._redis.set(
            CACHE_KEY,
            response.model_dump_json(by_alias=True),
            ex=CACHE_TTL,
        )
        return response

    def _aggregate_kuma(
        self,
        status_data: KumaStatusPage,
        heartbeat_data: KumaHeartbeatPage,
    ) -> PulseResponse:
        """Transform validated Kuma data into PulseResponse."""

        groups: list[PulseGroup] = []
        all_statuses: list[str] = []

        for group in status_data.public_group_list:
            monitors: list[PulseMonitor] = []
            for monitor in group.monitor_list:
                mid = monitor.id
                raw_beats = heartbeat_data.heartbeat_list.get(str(mid), [])[-MAX_BEATS:]
                heartbeats = [
                    PulseHeartbeat(status=beat.status, ping=beat.ping) for beat in raw_beats
                ]

                current = raw_beats[-1].status if raw_beats else 2
                status_str = STATUS_MAP.get(current, "pending")
                all_statuses.append(status_str)

                uptime_key = f"{mid}_24"
                uptime_24h = heartbeat_data.uptime_list.get(uptime_key, 0.0)

                monitors.append(
                    PulseMonitor(
                        id=mid,
                        name=monitor.name,
                        status=status_str,
                        uptime_24h=uptime_24h,
                        heartbeats=heartbeats,
                    )
                )
            groups.append(PulseGroup(name=group.name, monitors=monitors))

        overall = self._compute_overall(all_statuses)

        incidents: list[PulseIncident] = []
        for incident in status_data.active_incidents:
            incidents.append(
                PulseIncident(
                    title=incident.title,
                    created_at=incident.created_date,
                )
            )

        return PulseResponse(
            overall_status=overall,
            groups=groups,
            incidents=incidents,
        )

    def _aggregate_beszel(self, snapshot: BeszelSnapshot) -> PulseResponse:
        """Transform validated Beszel systems and stats into PulseResponse."""
        now = self._as_utc(snapshot.captured_at)
        minute_start = now - timedelta(minutes=MAX_BEATS)
        daily_start = now - timedelta(hours=24)
        monitors: list[PulseMonitor] = []
        all_statuses: list[str] = []

        for system in snapshot.systems:
            current = BESZEL_STATUS_MAP[system.status]
            all_statuses.append(current)
            minute_presence = self._sample_presence(
                snapshot.minute_stats,
                system.id,
                start=minute_start,
                interval_seconds=MINUTE_SECONDS,
                slots=MAX_BEATS,
            )
            created = self._as_utc(system.created)
            heartbeats: list[PulseHeartbeat] = []
            for index in range(MAX_BEATS):
                slot_end = minute_start + timedelta(seconds=(index + 1) * MINUTE_SECONDS)
                if slot_end <= created:
                    status_code = 2
                else:
                    status_code = 1 if index in minute_presence else 0
                heartbeats.append(PulseHeartbeat(status=status_code))
            heartbeats[-1] = PulseHeartbeat(status=self._beszel_status_code(system.status))

            uptime_24h = self._beszel_uptime(
                snapshot.daily_stats,
                system_id=system.id,
                created=created,
                current_status=system.status,
                start=daily_start,
            )
            monitors.append(
                PulseMonitor(
                    id=system.id,
                    name=system.name,
                    status=current,
                    uptime_24h=uptime_24h,
                    heartbeats=heartbeats,
                )
            )

        return PulseResponse(
            overall_status=self._compute_overall(all_statuses),
            groups=[PulseGroup(name="Systems", monitors=monitors)],
            incidents=[],
        )

    def _beszel_uptime(
        self,
        stats: list[BeszelSystemStat],
        *,
        system_id: str,
        created: datetime,
        current_status: str,
        start: datetime,
    ) -> float:
        """Estimate 24-hour availability from Beszel's native 20-minute samples."""
        present = self._sample_presence(
            stats,
            system_id,
            start=start,
            interval_seconds=DAILY_SLOT_SECONDS,
            slots=DAILY_SLOTS,
        )
        active = {
            index
            for index in range(DAILY_SLOTS)
            if start + timedelta(seconds=(index + 1) * DAILY_SLOT_SECONDS) > created
        }
        latest = DAILY_SLOTS - 1
        if current_status == "up":
            active.add(latest)
            present.add(latest)
        elif current_status == "down":
            active.add(latest)
            present.discard(latest)
        else:
            active.discard(latest)
            present.discard(latest)
        if not active:
            return 1.0 if current_status == "up" else 0.0
        return len(present.intersection(active)) / len(active)

    @classmethod
    def _sample_presence(
        cls,
        stats: list[BeszelSystemStat],
        system_id: str,
        *,
        start: datetime,
        interval_seconds: int,
        slots: int,
    ) -> set[int]:
        """Return unique time buckets containing a native Beszel stats record."""
        present: set[int] = set()
        for stat in stats:
            if stat.system != system_id:
                continue
            offset = (cls._as_utc(stat.created) - start).total_seconds()
            if offset < 0:
                continue
            index = min(int(offset // interval_seconds), slots - 1)
            present.add(index)
        return present

    @staticmethod
    def _beszel_status_code(status: str) -> int:
        return {"up": 1, "down": 0, "pending": 2, "paused": 3}.get(status, 2)

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    @staticmethod
    def _compute_overall(
        statuses: list[str],
    ) -> str:
        """Derive overall status from individual monitor statuses."""
        if not statuses:
            return "partial"
        if all(status == "down" for status in statuses):
            return "down"
        if "down" in statuses:
            return "partial"
        if "pending" in statuses:
            return "partial"
        if "maintenance" in statuses:
            return "maintenance"
        return "operational"
