---
name: integrations
description: External service integrations for Flowvy. Use when working on Remnawave API client, Uptime Kuma webhook handler, VictoriaMetrics/cAdvisor monitoring queries, or any external HTTP API integration.
---

## Remnawave API

Full OpenAPI spec: `docs/api-remnawave.json` (141 endpoints). Below are only the endpoints Flowvy uses.

Auth: `Authorization: Bearer <REMNAWAVE_API_TOKEN>` header on every request.
Base URL: configured via `REMNAWAVE_URL` env var.
All responses wrapped: `{ "response": <actual_data> }`.

### User / Subscription (Home page)

```
GET /api/users/{uuid}
→ response: {
    uuid, shortUuid, username, status: "ACTIVE"|"DISABLED"|"LIMITED"|"EXPIRED",
    trafficLimitBytes: int (0 = unlimited),
    trafficLimitStrategy: "NO_RESET"|"DAY"|"WEEK"|"MONTH"|"MONTH_ROLLING",
    usedTrafficBytes: int, lifetimeUsedTrafficBytes: int,
    expireAt: datetime, createdAt: datetime, updatedAt: datetime,
    telegramId: int|null, email: string|null,
    hwidDeviceLimit: int, onlineAt: datetime|null,
    lastTrafficResetAt: datetime|null,
    description: string|null, tag: string|null,
    subscriptionUrl: string, subLastOpenedAt: datetime|null,
    activeUserInbounds: [{uuid, tag, type}],
    hasActiveSubscription: bool
  }

GET /api/sub/{shortUuid}/info  (public, no auth needed)
→ response: {
    isFound: bool,
    user: {
      shortUuid, daysLeft: number, username,
      trafficUsed: string (human), trafficLimit: string (human),
      trafficUsedBytes: string, trafficLimitBytes: string,
      lifetimeTrafficUsed: string, lifetimeTrafficUsedBytes: string,
      expiresAt: datetime, isActive: bool,
      userStatus: "ACTIVE"|"DISABLED"|"LIMITED"|"EXPIRED",
      trafficLimitStrategy: string, lastTrafficResetAt: datetime|null,
      hwidDeviceLimit: number, hwidDeviceCount: number
    }
  }
```

### Devices (Devices page)

```
GET /api/hwid/devices?size=N&start=N
→ response: {
    devices: [{
      hwid: string, userUuid: uuid,
      platform: string|null, osVersion: string|null,
      deviceModel: string|null, userAgent: string|null,
      createdAt: datetime, updatedAt: datetime
    }],
    total: number
  }

GET /api/hwid/devices/stats
→ response: {
    byPlatform: [{ platform: string, count: number }],
    byApp: [{ app: string, count: number }],
    stats: { totalUniqueDevices, totalHwidDevices, averageHwidDevicesPerUser }
  }

POST /api/hwid/devices/delete
← { userUuid: string, hwid: string }

POST /api/hwid/devices/delete-all
← { userUuid: string }
```

### Nodes (Pulse page)

```
GET /api/nodes
→ response: [{
    uuid, name, address, port: int|null,
    isConnected: bool, isDisabled: bool, isConnecting: bool,
    lastStatusChange: datetime|null, lastStatusMessage: string|null,
    trafficUsedBytes: number|null, trafficLimitBytes: number|null,
    countryCode: string, onlineUsers: number|null,
    viewPosition: int, isTrafficTrackingActive: bool
  }]

GET /api/nodes/{uuid}
→ response: { ...same fields, expanded }

GET /api/system/stats/nodes
→ response: { node-level statistics }
```

### Admin — Users

```
GET /api/users?size=N&start=N
→ response: { users: [...], total: number }

POST /api/users
← {
    username: string (required), status: "ACTIVE"|"DISABLED",
    expireAt: datetime (required), trafficLimitBytes: int,
    trafficLimitStrategy: string, telegramId: int, email: string,
    hwidDeviceLimit: int, tag: string, description: string
  }

PATCH /api/users
← { uuid: string, ...fields to update }

DELETE /api/users/{uuid}
```

### Admin — Dashboard

```
GET /api/system/stats
→ response: {
    cpu: { cores },
    memory: { total, free, used },
    uptime: number,
    users: { statusCounts: { ACTIVE: N, ... }, totalUsers: N },
    onlineStats: { lastDay, lastWeek, lastMonth, now }
  }

GET /api/system/stats/bandwidth
→ response: {
    bandwidthLastTwoDays: { current, previous, difference },
    bandwidthLastSevenDays: { current, previous, difference },
    bandwidthLast30Days: { current, previous, difference },
    bandwidthCalendarMonth: { current, previous, difference }
  }

GET /api/system/metadata
→ response: { version, build info }

GET /api/bandwidth-stats/nodes?topNodesLimit=N&start=DATE&end=DATE
GET /api/bandwidth-stats/users/{uuid}?topNodesLimit=N&start=DATE&end=DATE
```

### Auth

```
GET /api/auth/status → 200 if valid, 401 if not
```

## Remnawave Webhooks

Config in Remnawave .env:
```
WEBHOOK_ENABLED=true
WEBHOOK_URL=https://flowvy-instance.com/api/webhooks/remnawave
WEBHOOK_SECRET_HEADER=your-secret
```

Headers: `X-Remnawave-Signature` (HMAC-SHA256), `X-Remnawave-Timestamp`.

Verification (Python):
```python
import hmac, hashlib
def verify(body: bytes, secret: str, signature: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

Payload: `{ scope, event, timestamp, data }`.

### Webhook Events
- **user**: created, modified, deleted, revoked, disabled, enabled, limited, expired, traffic_reset, first_connected, expires_in_72h/48h/24h, expired_24h_ago, bandwidth_threshold, not_connected
- **user_hwid_devices**: added, deleted
- **node**: created, modified, disabled, enabled, deleted, connection_lost, connection_restored, traffic_notify
- **service**: panel_started, login_attempt_failed/success
- **crm**: infra_billing payment reminders (7d, 48h, 24h, today, overdue)

## Client Pattern

```python
class RemnawaveClient:
    def __init__(self, base_url: str, token: str, http: httpx.AsyncClient): ...
    async def get_user(self, uuid: str) -> UserData: ...
    async def get_subscription_info(self, short_uuid: str) -> SubInfo: ...
    async def get_devices(self, size=50, start=0) -> DeviceList: ...
    async def get_nodes(self) -> list[NodeData]: ...
    async def get_system_stats(self) -> SystemStats: ...
    async def create_user(self, data: CreateUserRequest) -> UserData: ...
    async def update_user(self, data: UpdateUserRequest) -> UserData: ...
    async def delete_user(self, uuid: str) -> None: ...
```

All methods async, typed Pydantic models, `RemnawaveError` on non-2xx.
APP-scope in Dishka. httpx.AsyncClient, 10s timeout, 3 retries.
For full details: `docs/api-remnawave.json`.

## Uptime Kuma

Webhook payload:
```json
{
  "heartbeat": { "monitorID": 1, "status": 0, "msg": "...", "ping": null, "duration": 300 },
  "monitor": { "id": 1, "name": "Frankfurt DE-1", "url": "...", "type": "http" },
  "msg": "[Frankfurt DE-1] [Down] Connection refused"
}
```
Status: 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE.

## VictoriaMetrics

```
GET {VM_URL}/api/v1/query?query=<promql>
GET {VM_URL}/api/v1/query_range?query=<promql>&start=<ts>&end=<ts>&step=<duration>
```

## General Patterns

- All HTTP clients: `httpx.AsyncClient`, 10s timeout, 3x retry
- All clients: APP-scope in Dishka
- All errors: `IntegrationError(service, status, detail)`
- Health checks: each client has `ping()` method
