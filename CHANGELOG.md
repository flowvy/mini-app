# Changelog

Flowvy release notes are user-facing and describe the net change from the previous stable release.
Keep this file synchronized with `CHANGELOG.ru.md` by version, date, category order, and item count.

## Unreleased

Move reviewed entries into `## X.Y.Z — YYYY-MM-DD` only after the release version is agreed. Use
only the categories `New`, `Improved`, `Fixed`, and `Security`, in that order, and omit empty ones.

## 0.1.0 — 2026-08-30

### New

- Added a Telegram Mini App and bot for viewing Remnawave subscriptions, traffic, connection links and devices, with separate user and administrator modes.
- Added open and invite-only registration, reusable personal invites, referral benefits and administrator-managed access profiles.
- Added provider branding, bilingual operator content, Pulse monitoring through Uptime Kuma or Beszel, an in-app FAQ and support conversations.
- Added Tribute donation and subscription offers backed by authenticated provider events, durable access operations and restoration of the previous access profile.
- Added an owner-controlled legacy-user import that preserves existing Remnawave access without inventing Tribute payment history.
- Added a GHCR production image, health-gated Docker Compose installation and copy-paste server deployment/update guide.

### Improved

- Reworked the Russian README with clearer terminology, provider wording and Claude/Codex credit.
- Added complete Russian and English interfaces, responsive Telegram WebView behavior, accessible light/dark themes and faster virtualized administrator user lists.

### Security

- Added server-side Telegram authentication, fail-closed administrator authorization and ownership revalidation before sensitive user and device operations.
- Added signed, replay-protected Telegram, Remnawave and Tribute webhooks with bounded external requests and server-only provider credentials.
