"""Business logic for Pulse status page aggregation."""

from __future__ import annotations

import asyncio
from typing import Any

from redis.asyncio import Redis

from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.schemas.pulse import (
    PulseGroup,
    PulseHeartbeat,
    PulseIncident,
    PulseMonitor,
    PulseResponse,
)
from flowvy.services.kuma import UptimeKumaClient

CACHE_KEY = "pulse:data"
CACHE_TTL = 60
MAX_BEATS = 40

STATUS_MAP = {0: "down", 1: "up", 2: "pending", 3: "maintenance"}


class PulseService:
    """Aggregates Kuma status page data into PulseResponse."""

    def __init__(
        self,
        kuma: UptimeKumaClient,
        ps_repo: ProviderSettingsRepository,
        redis: Redis,
    ) -> None:
        self._kuma = kuma
        self._ps_repo = ps_repo
        self._redis = redis

    async def get_pulse(self) -> PulseResponse | None:
        """Return aggregated pulse data, or None if Kuma is disabled."""
        ps = await self._ps_repo.get()
        if not ps.kuma_enabled or not ps.kuma_url or not ps.kuma_slug:
            return None

        cached = await self._redis.get(CACHE_KEY)
        if cached:
            return PulseResponse.model_validate_json(cached)

        status_data, heartbeat_data = await asyncio.gather(
            self._kuma.get_status_page(ps.kuma_url, ps.kuma_slug),
            self._kuma.get_heartbeats(ps.kuma_url, ps.kuma_slug),
        )

        response = self._aggregate(status_data, heartbeat_data)

        await self._redis.set(
            CACHE_KEY,
            response.model_dump_json(by_alias=True),
            ex=CACHE_TTL,
        )
        return response

    def _aggregate(
        self,
        status_data: dict[str, Any],
        heartbeat_data: dict[str, Any],
    ) -> PulseResponse:
        """Transform raw Kuma JSON into PulseResponse."""
        hb_list: dict[str, list[dict]] = heartbeat_data.get("heartbeatList", {})
        uptime_list: dict[str, float] = heartbeat_data.get("uptimeList", {})

        groups: list[PulseGroup] = []
        all_statuses: list[str] = []

        for group in status_data.get("publicGroupList", []):
            monitors: list[PulseMonitor] = []
            for mon in group.get("monitorList", []):
                mid = mon["id"]
                raw_beats = hb_list.get(str(mid), [])[-MAX_BEATS:]
                heartbeats = [
                    PulseHeartbeat(status=b["status"], ping=b.get("ping")) for b in raw_beats
                ]

                current = raw_beats[-1]["status"] if raw_beats else 2
                status_str = STATUS_MAP.get(current, "pending")
                all_statuses.append(status_str)

                uptime_key = f"{mid}_24"
                uptime_24h = uptime_list.get(uptime_key, 0.0)

                monitors.append(
                    PulseMonitor(
                        id=mid,
                        name=mon.get("name", f"Monitor {mid}"),
                        status=status_str,
                        uptime_24h=uptime_24h,
                        heartbeats=heartbeats,
                    )
                )
            groups.append(PulseGroup(name=group.get("name", ""), monitors=monitors))

        overall = self._compute_overall(all_statuses)

        incidents: list[PulseIncident] = []
        for inc in status_data.get("incident", {}).get("list", []):
            incidents.append(
                PulseIncident(
                    title=inc.get("title", ""),
                    created_at=inc.get("createdDate", ""),
                )
            )

        return PulseResponse(
            overall_status=overall,
            groups=groups,
            incidents=incidents,
        )

    @staticmethod
    def _compute_overall(
        statuses: list[str],
    ) -> str:
        """Derive overall status from individual monitor statuses."""
        if not statuses:
            return "operational"
        if "down" in statuses:
            return "partial"
        if "maintenance" in statuses:
            return "maintenance"
        if "pending" in statuses:
            return "operational"
        return "operational"
