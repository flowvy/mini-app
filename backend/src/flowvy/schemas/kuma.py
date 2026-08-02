"""Uptime Kuma public status-page response contracts used by Flowvy."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class KumaContractModel(BaseModel):
    """Ignore additive upstream fields while validating fields Flowvy consumes."""

    model_config = ConfigDict(extra="ignore")


class KumaMonitor(KumaContractModel):
    id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=512)


class KumaGroup(KumaContractModel):
    name: str = Field(default="", max_length=512)
    monitor_list: list[KumaMonitor] = Field(alias="monitorList")


class KumaIncident(KumaContractModel):
    title: str = Field(min_length=1, max_length=512)
    created_date: str = Field(alias="createdDate", min_length=1, max_length=128)


class KumaStatusPage(KumaContractModel):
    # Kuma 2.x uses ``incidents``; supported Kuma 1.x uses ``incident``.
    incidents: list[KumaIncident] | None = None
    incident: KumaIncident | None = None
    public_group_list: list[KumaGroup] = Field(alias="publicGroupList")

    @model_validator(mode="after")
    def validate_incident_contract(self) -> KumaStatusPage:
        """Require one documented incident representation."""
        if "incidents" not in self.model_fields_set and "incident" not in self.model_fields_set:
            raise ValueError("Kuma response is missing its incident field")
        return self

    @property
    def active_incidents(self) -> list[KumaIncident]:
        """Normalize the Kuma 1.x and 2.x incident representations."""
        if self.incidents is not None:
            return self.incidents
        return [self.incident] if self.incident is not None else []


class KumaHeartbeat(KumaContractModel):
    status: int
    ping: float | None = None


class KumaHeartbeatPage(KumaContractModel):
    heartbeat_list: dict[str, list[KumaHeartbeat]] = Field(alias="heartbeatList")
    uptime_list: dict[str, float] = Field(alias="uptimeList")

    @field_validator("uptime_list")
    @classmethod
    def validate_uptime_values(cls, value: dict[str, float]) -> dict[str, float]:
        """Reject corrupt percentages before they reach the public API."""
        if any(not 0 <= uptime <= 1 for uptime in value.values()):
            raise ValueError("Kuma uptime value is outside 0..1")
        return value
