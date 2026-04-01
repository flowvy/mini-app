---
name: integrations
description: External service integrations for Flowvy. Use when working on Remnawave API client, Uptime Kuma webhook handler, VictoriaMetrics/cAdvisor monitoring queries, or any external HTTP API integration.
---

## Remnawave

VPN panel based on Xray-core. REST API at `{REMNAWAVE_URL}/api/`.

Auth: API token in header `Authorization: Bearer <token>` or cookie-based auth.

Key endpoints (from Remnawave docs at docs.rw):
- `GET /api/users` — list users with pagination
- `GET /api/users/{uuid}` — user details (traffic, subscription, devices)
- `POST /api/users` — create user
- `PATCH /api/users/{uuid}` — update user (enable/disable, reset traffic, update expiry)
- `DELETE /api/users/{uuid}` — delete user
- `GET /api/nodes` — list nodes (servers) with status
- `POST /api/nodes/{uuid}/restart` — restart node
- `GET /api/inbounds` — list inbounds

Client pattern: `RemnawaveClient` class in `services/remnawave.py` using `httpx.AsyncClient`. All methods async. Errors wrapped in custom exceptions. Response models as Pydantic schemas.

## Uptime Kuma

Self-hosted monitoring. Sends webhook notifications on monitor state changes.

Webhook payload (POST, application/json):
```json
{
  "heartbeat": {
    "monitorID": 1,
    "status": 0,        // 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE
    "time": "2024-01-01 12:00:00",
    "msg": "Connection refused",
    "ping": null,
    "duration": 300
  },
  "monitor": {
    "id": 1,
    "name": "Frankfurt DE-1",
    "url": "https://fra1.example.com",
    "type": "http"
  },
  "msg": "[Frankfurt DE-1] [🔴 Down] Connection refused"
}
```

Handler at `api/routes/webhooks/uptime_kuma.py`. Validate source (shared secret in header or IP whitelist). Parse payload, notify admins via bot.

## VictoriaMetrics

Prometheus-compatible TSDB. Query via HTTP (no auth by default, add if configured):

```
GET {VM_URL}/api/v1/query?query=<promql>
GET {VM_URL}/api/v1/query_range?query=<promql>&start=<ts>&end=<ts>&step=<duration>
```

Useful queries for VPN monitoring:
- Node traffic: `rate(xray_traffic_total{node="fra1"}[5m])`
- Active connections: `xray_active_connections{node="fra1"}`
- Container CPU: `rate(container_cpu_usage_seconds_total{name="xray-fra1"}[5m])`
- Container memory: `container_memory_usage_bytes{name="xray-fra1"}`

Client: `MonitoringService` using `httpx.AsyncClient`. Cache results in Redis (TTL 60s) to avoid hammering VM on dashboard refreshes.

## cAdvisor

Container metrics. REST API at `{CADVISOR_URL}/api/v2.0/`:
- `GET /api/v2.0/stats/<container>?type=docker` — container stats
- `GET /api/v2.0/machine` — host machine info

Also exposes `/metrics` in Prometheus format (scraped by VictoriaMetrics).

For the Flowvy dashboard, prefer querying VictoriaMetrics (which already scrapes cAdvisor) over querying cAdvisor directly. Direct cAdvisor queries only for real-time data not yet in VM.

## General Integration Patterns

- All HTTP clients: `httpx.AsyncClient` with timeout (10s default), retry (3x with backoff)
- All clients registered in Dishka as APP-scope providers
- All external API errors wrapped: `IntegrationError(service, status, detail)`
- Health checks: each integration has a `ping()` method called at startup
