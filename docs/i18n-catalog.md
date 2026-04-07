# i18n String Catalog

Comprehensive catalog of all hardcoded English strings in `frontend/src/`.

---

## common.*

Shared UI strings: auth guard, header, tab bar, loading states, confirm dialogs.

| Key | English | File | Context |
|-----|---------|------|---------|
| common.loading | `Loading...` | components/auth-guard.tsx:29 | JSX text, auth loading state |
| common.notAuthenticated | `Not authenticated` | components/auth-guard.tsx:36 | fallback error text |
| common.retry | `Retry` | components/auth-guard.tsx:38 | button label |
| common.appName | `Flowvy` | components/layout/header.tsx:48 | fallback header title |
| common.header.pulse | `Pulse` | components/layout/header.tsx:17 | PAGE_META title |
| common.header.devices | `Devices` | components/layout/header.tsx:18 | PAGE_META title |
| common.header.support | `Support` | components/layout/header.tsx:19 | PAGE_META title |
| common.header.users | `Users` | components/layout/header.tsx:20 | PAGE_META title |
| common.header.broadcast | `Broadcast` | components/layout/header.tsx:21 | PAGE_META title |
| common.header.userModeLabel | `User mode` | components/layout/header.tsx:56 | aria-label |
| common.header.adminModeLabel | `Admin mode` | components/layout/header.tsx:63 | aria-label |
| common.tab.home | `Home` | components/layout/tab-bar.tsx:27 | tab label |
| common.tab.pulse | `Pulse` | components/layout/tab-bar.tsx:28 | tab label |
| common.tab.devices | `Devices` | components/layout/tab-bar.tsx:29 | tab label |
| common.tab.support | `Support` | components/layout/tab-bar.tsx:30 | tab label |
| common.tab.dashboard | `Dashboard` | components/layout/tab-bar.tsx:34 | tab label |
| common.tab.users | `Users` | components/layout/tab-bar.tsx:35 | tab label |
| common.tab.broadcast | `Broadcast` | components/layout/tab-bar.tsx:36 | tab label |
| common.tab.settings | `Settings` | components/layout/tab-bar.tsx:37 | tab label |
| common.confirmDialog.closeLabel | `Close` | components/ui/confirm-dialog.tsx:49 | aria-label |
| common.comingSoon | `Coming soon` | pages/support.tsx:10 | stub page text |

---

## home.*

Home page: hero card, detail sections, subscription states.

| Key | English | File | Context |
|-----|---------|------|---------|
| home.loading | `Loading...` | pages/home.tsx:13 | JSX text, loading state |
| home.error | `Failed to load subscription` | pages/home.tsx:21 | error message |
| home.noSubscription | `No active subscription` | pages/home.tsx:29 | empty state text |
| home.heroCard.expiresLabel | `Expires` | components/home/hero-card.tsx:58 | KPI label |
| home.heroCard.devicesLabel | `Devices` | components/home/hero-card.tsx:69 | KPI label |
| home.heroCard.trafficUnlimited | `Unlimited` | components/home/hero-card.tsx:78 | traffic total display |
| home.heroCard.usedPercent | `Used {pct}%` | components/home/hero-card.tsx:94 | bar label (template) |
| home.heroCard.trafficResetLabel | `Traffic Reset` | components/home/hero-card.tsx:112 | stat label |
| home.heroCard.nextResetLabel | `Next Reset` | components/home/hero-card.tsx:118 | stat label |
| home.heroCard.allTimeLabel | `All Time` | components/home/hero-card.tsx:126 | stat label |
| home.heroCard.lastUpdatedLabel | `Last Updated` | components/home/hero-card.tsx:131 | stat label |
| home.heroCard.copied | `Copied` | components/home/hero-card.tsx:140 | button label after copy |
| home.heroCard.copyLink | `Copy subscription link` | components/home/hero-card.tsx:140 | button label |
| home.detail.accountInfo | `Account Info` | components/home/detail-section.tsx:19 | section divider |
| home.detail.created | `Created` | components/home/detail-section.tsx:21 | row label |
| home.detail.createdHint | `When your account was created` | components/home/detail-section.tsx:22 | row hint |
| home.detail.expires | `Expires` | components/home/detail-section.tsx:27 | row label |
| home.detail.expiresHint | `When this subscription expires` | components/home/detail-section.tsx:28 | row hint |
| home.detail.expiresUnlimited | `Unlimited` | components/home/detail-section.tsx:31 | row value |
| home.detail.email | `Email` | components/home/detail-section.tsx:37 | row label |
| home.detail.emailHint | `Account email address` | components/home/detail-section.tsx:38 | row hint |
| home.detail.telegramId | `Telegram ID` | components/home/detail-section.tsx:43 | row label |
| home.detail.telegramIdHint | `Linked Telegram account` | components/home/detail-section.tsx:44 | row hint |
| home.detail.devices | `Devices` | components/home/detail-section.tsx:49 | row label |
| home.detail.devicesHint | `Max devices connected at the same time` | components/home/detail-section.tsx:50 | row hint |
| home.detail.devicesUnlimited | `Unlimited` | components/home/detail-section.tsx:13 | row value |
| home.detail.devicesCount | `{n} devices` | components/home/detail-section.tsx:14 | row value (template) |
| home.detail.profileSettings | `Profile Settings` | components/home/detail-section.tsx:58 | section divider |
| home.detail.autoUpdate | `Auto-update` | components/home/detail-section.tsx:60 | row label |
| home.detail.autoUpdateHint | `Fetch profile updates automatically` | components/home/detail-section.tsx:61 | row hint |
| home.detail.autoUpdateOn | `On` | components/home/detail-section.tsx:62 | row value |
| home.detail.autoUpdateOff | `Off` | components/home/detail-section.tsx:62 | row value |
| home.detail.updateInterval | `Update interval` | components/home/detail-section.tsx:65 | row label |
| home.detail.updateIntervalHint | `How often to check for updates` | components/home/detail-section.tsx:66 | row hint |
| home.detail.updateIntervalValue | `Every {n}h` | components/home/detail-section.tsx:67 | row value (template) |
| home.detail.quickLinks | `Quick Links` | components/home/detail-section.tsx:73 | section divider |
| home.detail.support | `Support` | components/home/detail-section.tsx:74 | link row label |
| home.detail.renew | `Renew` | components/home/detail-section.tsx:75 | link row label |
| home.detail.notSpecified | `Not specified` | components/home/detail-section.tsx:95 | fallback row value |

---

## devices.*

Devices page and device row component.

| Key | English | File | Context |
|-----|---------|------|---------|
| devices.error | `Failed to load devices` | pages/devices.tsx:25 | error message |
| devices.hint | `Devices that have connected to your VPN subscription. Remove unused devices to free up slots.` | pages/devices.tsx:56-57 | page hint text |
| devices.empty.ariaLabel | `No devices` | pages/devices.tsx:89 | aria-label on icon |
| devices.empty.title | `No devices` | pages/devices.tsx:93 | empty state title |
| devices.empty.desc | `Connect a device to your VPN to see it here` | pages/devices.tsx:94 | empty state description |
| devices.removeAll | `Remove all devices` | pages/devices.tsx:100 | danger button label |
| devices.confirmAll | `Remove all {n} devices?` | pages/devices.tsx:106 | confirm bar text (template) |
| devices.cancel | `Cancel` | pages/devices.tsx:109 | ghost button label |
| devices.removeLoading | `...` | pages/devices.tsx:117 | button loading text |
| devices.remove | `Remove` | pages/devices.tsx:117 | button label |
| devices.row.added | `Added {date}` | components/devices/device-row.tsx:44 | date prefix (template) |
| devices.row.removeConfirm | `Remove` | components/devices/device-row.tsx:53 | confirm button label |
| devices.row.deleteLabel | `Delete device` | components/devices/device-row.tsx:67 | aria-label on icon |
| devices.fallback.android | `Android Device` | components/devices/device-row.tsx:17 | fallback device name |
| devices.fallback.ios | `iOS Device` | components/devices/device-row.tsx:18 | fallback device name |
| devices.fallback.macos | `Mac` | components/devices/device-row.tsx:19 | fallback device name |
| devices.fallback.windows | `Windows PC` | components/devices/device-row.tsx:20 | fallback device name |
| devices.fallback.linux | `Linux` | components/devices/device-row.tsx:21 | fallback device name |
| devices.fallback.unknown | `Unknown device` | components/devices/device-row.tsx:26 | fallback device name |
| devices.platform.mobile | `Mobile device` | components/devices/platform-icon.tsx:12 | aria-label |
| devices.platform.desktop | `Desktop device` | components/devices/platform-icon.tsx:14 | aria-label |
| devices.platform.unknown | `Unknown device` | components/devices/platform-icon.tsx:15 | aria-label |

---

## pulse.*

Pulse/status page, status banner, monitor components.

| Key | English | File | Context |
|-----|---------|------|---------|
| pulse.error.title | `Unable to load status` | pages/pulse.tsx:26 | error state title |
| pulse.error.desc | `Status page is temporarily unavailable. Please try again.` | pages/pulse.tsx:28 | error state description |
| pulse.error.retry | `Retry` | pages/pulse.tsx:31 | retry button label |
| pulse.hint | `Service availability and planned maintenance updates.` | pages/pulse.tsx:40 | page hint text |
| pulse.noIncidents | `No active incidents` | pages/pulse.tsx:52 | empty incidents text |
| pulse.banner.operational | `All systems operational` | components/pulse/status-banner.tsx:16 | banner label |
| pulse.banner.partial | `Partial system outage` | components/pulse/status-banner.tsx:20 | banner label |
| pulse.banner.maintenance | `Scheduled maintenance` | components/pulse/status-banner.tsx:24 | banner label |
| pulse.banner.down | `Major outage` | components/pulse/status-banner.tsx:28 | banner label |
| pulse.timeline.past | `40m` | components/pulse/monitor-row.tsx:37 | timeline label |
| pulse.timeline.now | `now` | components/pulse/monitor-row.tsx:38 | timeline label |

---

## settings.*

Admin settings page, Kuma config, quick links.

| Key | English | File | Context |
|-----|---------|------|---------|
| settings.title | `Settings` | pages/admin/settings.tsx:24 | page header title |
| settings.loading | `Loading...` | pages/admin/settings.tsx:26 | loading state text |
| settings.error | `Failed to load settings` | pages/admin/settings.tsx:38 | error message |
| settings.integrations | `Integrations` | pages/admin/settings.tsx:65 | section divider |
| settings.uptimeKuma | `Uptime Kuma` | pages/admin/settings.tsx:69 | row label |
| settings.uptimeKumaDesc | `Status page monitoring` | pages/admin/settings.tsx:70 | row description |
| settings.configure | `Configure` | pages/admin/settings.tsx:82 | tool row label |
| settings.configureDesc | `URL, slug, connection test` | pages/admin/settings.tsx:83 | tool row description |
| settings.configured | `Configured` | pages/admin/settings.tsx:86 | status value |
| settings.quickLinksSection | `Quick Links` | pages/admin/settings.tsx:97 | section divider |
| settings.supportAndRenew | `Support & Renew` | pages/admin/settings.tsx:101 | tool row label |
| settings.supportAndRenewDesc | `Links shown to users` | pages/admin/settings.tsx:102 | tool row description |
| settings.system | `System` | pages/admin/settings.tsx:112 | section divider |
| settings.remnawave | `Remnawave` | pages/admin/settings.tsx:116 | row label |
| settings.remnawaveDesc | `VPN panel` | pages/admin/settings.tsx:117 | row description |
| settings.flowvy | `Flowvy` | pages/admin/settings.tsx:126 | row label |
| settings.flowvyDesc | `Application version` | pages/admin/settings.tsx:127 | row description |
| settings.kuma.title | `Uptime Kuma` | components/admin/kuma-config.tsx:72 | sub-screen header |
| settings.kuma.urlLabel | `URL` | components/admin/kuma-config.tsx:78 | input label |
| settings.kuma.urlDesc | `Status page address` | components/admin/kuma-config.tsx:79 | input description |
| settings.kuma.urlPlaceholder | `https://status.example.com` | components/admin/kuma-config.tsx:87 | input placeholder |
| settings.kuma.slugLabel | `Slug` | components/admin/kuma-config.tsx:93 | input label |
| settings.kuma.slugDesc | `Status page identifier` | components/admin/kuma-config.tsx:94 | input description |
| settings.kuma.slugPlaceholder | `service` | components/admin/kuma-config.tsx:102 | input placeholder |
| settings.kuma.statusLabel | `Status` | components/admin/kuma-config.tsx:108 | row label |
| settings.kuma.connected | `Connected` | components/admin/kuma-config.tsx:61 | connection status |
| settings.kuma.notTested | `Not tested` | components/admin/kuma-config.tsx:64 | connection status |
| settings.kuma.test | `Test` | components/admin/kuma-config.tsx:119 | button label |
| settings.kuma.saved | `Saved` | components/admin/kuma-config.tsx:127 | saved confirmation |
| settings.kuma.saveChanges | `Save changes` | components/admin/kuma-config.tsx:132 | button label |
| settings.kuma.discardTitle | `Discard changes?` | components/admin/kuma-config.tsx:141 | dialog title |
| settings.kuma.discardConfirm | `Discard` | components/admin/kuma-config.tsx:142 | dialog confirm label |
| settings.kuma.discardCancel | `Keep editing` | components/admin/kuma-config.tsx:143 | dialog cancel label |
| settings.kuma.discardBody | `You have unsaved changes that will be lost.` | components/admin/kuma-config.tsx:147 | dialog body |
| settings.links.title | `Quick Links` | components/admin/quick-links.tsx:59 | sub-screen header |
| settings.links.supportLabel | `Support` | components/admin/quick-links.tsx:65 | input label |
| settings.links.supportDesc | `Link shown to users on Support page` | components/admin/quick-links.tsx:66 | input description |
| settings.links.supportPlaceholder | `https://t.me/support` | components/admin/quick-links.tsx:74 | input placeholder |
| settings.links.renewLabel | `Renew` | components/admin/quick-links.tsx:80 | input label |
| settings.links.renewDesc | `Subscription renewal link` | components/admin/quick-links.tsx:81 | input description |
| settings.links.renewPlaceholder | `https://example.com/renew` | components/admin/quick-links.tsx:89 | input placeholder |
| settings.links.saved | `Saved` | components/admin/quick-links.tsx:97 | saved confirmation |
| settings.links.save | `Save` | components/admin/quick-links.tsx:101 | button label |
| settings.links.discardTitle | `Discard changes?` | components/admin/quick-links.tsx:110 | dialog title |
| settings.links.discardConfirm | `Discard` | components/admin/quick-links.tsx:111 | dialog confirm label |
| settings.links.discardCancel | `Keep editing` | components/admin/quick-links.tsx:112 | dialog cancel label |
| settings.links.discardBody | `You have unsaved changes that will be lost.` | components/admin/quick-links.tsx:117 | dialog body |

---

## admin.*

Admin pages: users list, user detail, user actions, dashboard, broadcast.

| Key | English | File | Context |
|-----|---------|------|---------|
| admin.dashboard.comingSoon | `Coming soon` | pages/admin/dashboard.tsx:10 | stub page text |
| admin.broadcast.comingSoon | `Coming soon` | pages/admin/broadcast.tsx:10 | stub page text |
| admin.users.title | `Users` | pages/admin/users.tsx:112 | page header title |
| admin.users.error | `Failed to load users` | pages/admin/users.tsx:103 | error message |
| admin.users.searchPlaceholder | `Search by name, ID or email` | pages/admin/users.tsx:123 | input placeholder |
| admin.users.clearSearchLabel | `Clear search` | pages/admin/users.tsx:131 | aria-label |
| admin.users.searchFailed | `Search failed` | pages/admin/users.tsx:146 | error message |
| admin.users.notFound | `User not found` | pages/admin/users.tsx:153 | empty state title |
| admin.users.notFoundDesc | `Try a different username, Telegram ID, or email` | pages/admin/users.tsx:154 | empty state description |
| admin.users.loadingMore | `Loading...` | pages/admin/users.tsx:175 | load more button loading |
| admin.users.loadMore | `Load more` | pages/admin/users.tsx:175 | load more button label |
| admin.userDetail.accountInfo | `Account Info` | components/admin/admin-user-detail.tsx:56 | section divider |
| admin.userDetail.created | `Created` | components/admin/admin-user-detail.tsx:57 | row label |
| admin.userDetail.expires | `Expires` | components/admin/admin-user-detail.tsx:59 | row label |
| admin.userDetail.expiresUnlimited | `Unlimited` | components/admin/admin-user-detail.tsx:60 | row value |
| admin.userDetail.email | `Email` | components/admin/admin-user-detail.tsx:63 | row label |
| admin.userDetail.telegramId | `Telegram ID` | components/admin/admin-user-detail.tsx:64 | row label |
| admin.userDetail.devices | `Devices` | components/admin/admin-user-detail.tsx:66 | row label |
| admin.userDetail.devicesUnlimited | `Unlimited` | components/admin/admin-user-detail.tsx:68 | row value |
| admin.userDetail.devicesCount | `{n} devices` | components/admin/admin-user-detail.tsx:68 | row value (template) |
| admin.userDetail.tag | `Tag` | components/admin/admin-user-detail.tsx:72 | row label |
| admin.userDetail.description | `Description` | components/admin/admin-user-detail.tsx:73 | row label |
| admin.userDetail.squads | `Squads` | components/admin/admin-user-detail.tsx:75 | section divider |
| admin.userDetail.internal | `Internal` | components/admin/admin-user-detail.tsx:76 | row label |
| admin.userDetail.external | `External` | components/admin/admin-user-detail.tsx:77 | row label |
| admin.userDetail.connection | `Connection` | components/admin/admin-user-detail.tsx:79 | section divider |
| admin.userDetail.firstConnected | `First connected` | components/admin/admin-user-detail.tsx:81 | row label |
| admin.userDetail.lastSeen | `Last seen` | components/admin/admin-user-detail.tsx:87 | row label |
| admin.userHero.unlimited | `Unlimited` | components/admin/admin-user-hero.tsx:73 | traffic display |
| admin.userHero.expiresLabel | `Expires` | components/admin/admin-user-hero.tsx:89 | KPI label |
| admin.userHero.devicesLabel | `Devices` | components/admin/admin-user-hero.tsx:100 | KPI label |
| admin.userHero.usedPercent | `Used {pct}%` | components/admin/admin-user-hero.tsx:116 | bar label (template) |
| admin.userHero.trafficResetLabel | `Traffic Reset` | components/admin/admin-user-hero.tsx:134 | stat label |
| admin.userHero.allTimeLabel | `All Time` | components/admin/admin-user-hero.tsx:138 | stat label |
| admin.userHero.lastSeenLabel | `Last Seen` | components/admin/admin-user-hero.tsx:142 | stat label |
| admin.userHero.cancelLabel | `Cancel` | components/admin/admin-user-hero.tsx:179 | dialog cancel label |
| admin.actions.disable | `Disable` | components/admin/admin-user-actions.ts:23 | action button label |
| admin.actions.enable | `Enable` | components/admin/admin-user-actions.ts:23 | action button label |
| admin.actions.disableTitle | `Disable user?` | components/admin/admin-user-actions.ts:24 | dialog title |
| admin.actions.enableTitle | `Enable user?` | components/admin/admin-user-actions.ts:24 | dialog title |
| admin.actions.disableDesc | `{username} will lose VPN access.` | components/admin/admin-user-actions.ts:26 | dialog description (template) |
| admin.actions.enableDesc | `{username} will regain VPN access.` | components/admin/admin-user-actions.ts:27 | dialog description (template) |
| admin.actions.resetTraffic | `Reset traffic` | components/admin/admin-user-actions.ts:33 | action button label |
| admin.actions.resetTrafficTitle | `Reset traffic?` | components/admin/admin-user-actions.ts:34 | dialog title |
| admin.actions.resetTrafficDesc | `Traffic counter for {username} will be set to zero.` | components/admin/admin-user-actions.ts:35 | dialog description (template) |
| admin.actions.resetConfirm | `Reset` | components/admin/admin-user-actions.ts:36 | dialog confirm label |
| admin.actions.revoke | `Revoke` | components/admin/admin-user-actions.ts:42 | action button label |
| admin.actions.revokeTitle | `Revoke subscription?` | components/admin/admin-user-actions.ts:43 | dialog title |
| admin.actions.revokeDesc | `Subscription link for {username} will stop working.` | components/admin/admin-user-actions.ts:44 | dialog description (template) |
| admin.actions.revokeConfirm | `Revoke` | components/admin/admin-user-actions.ts:45 | dialog confirm label |
| admin.actions.delete | `Delete` | components/admin/admin-user-actions.ts:50 | action button label |
| admin.actions.deleteTitle | `Delete user?` | components/admin/admin-user-actions.ts:51 | dialog title |
| admin.actions.deleteDesc | `{username} will be permanently deleted. This cannot be undone.` | components/admin/admin-user-actions.ts:52 | dialog description (template) |
| admin.actions.deleteConfirm | `Delete` | components/admin/admin-user-actions.ts:53 | dialog confirm label |

---

## common.status.*

Status badge labels (used across home and admin).

| Key | English | File | Context |
|-----|---------|------|---------|
| common.status.active | `Active` | components/ui/status-badge.tsx:12 | status label |
| common.status.limited | `Limited` | components/ui/status-badge.tsx:13 | status label |
| common.status.disabled | `Disabled` | components/ui/status-badge.tsx:14 | status label |
| common.status.expired | `Expired` | components/ui/status-badge.tsx:15 | status label |

---

## format.*

Format helper return values in `lib/format.ts`.

| Key | English | File | Context |
|-----|---------|------|---------|
| format.traffic.tb | `TB` | lib/format.ts:11 | traffic unit |
| format.traffic.gb | `GB` | lib/format.ts:12-14 | traffic unit |
| format.traffic.mb | `MB` | lib/format.ts:16 | traffic unit |
| format.traffic.kb | `KB` | lib/format.ts:17 | traffic unit |
| format.expiry.expired | `Expired` | lib/format.ts:61 | expiry label |
| format.expiry.today | `Today` | lib/format.ts:62 | expiry label |
| format.expiry.oneDay | `1 day` | lib/format.ts:63 | expiry label |
| format.expiry.days | `{n}d` | lib/format.ts:64 | expiry label (template) |
| format.date.locale | `en` | lib/format.ts:70 | toLocaleString month locale |
| format.relative.justNow | `just now` | lib/format.ts:85 | relative time |
| format.relative.minutesAgo | `{n}m ago` | lib/format.ts:87 | relative time (template) |
| format.relative.hoursAgo | `{n}h ago` | lib/format.ts:89 | relative time (template) |
| format.relative.daysAgo | `{n}d ago` | lib/format.ts:91 | relative time (template) |
| format.lastSeen.never | `Never` | lib/format.ts:102 | last seen fallback |
| format.lastSeen.now | `now` | lib/format.ts:105 | last seen label |
| format.lastSeen.minutesAgo | `{n}m ago` | lib/format.ts:106 | last seen (template) |
| format.lastSeen.hoursAgo | `{n}h ago` | lib/format.ts:108 | last seen (template) |
| format.lastSeen.daysAgo | `{n}d ago` | lib/format.ts:110 | last seen (template) |
| format.lastSeen.monthsAgo | `{n}mo ago` | lib/format.ts:111 | last seen (template) |
| format.adminExpiry.expired | `expired {n}d ago` | lib/format.ts:119 | admin expiry label (template) |
| format.adminExpiry.today | `expires today` | lib/format.ts:120 | admin expiry label |
| format.adminExpiry.daysLeft | `{n}d left` | lib/format.ts:121 | admin expiry label (template) |
| format.adminExpiry.monthsLeft | `{n}mo left` | lib/format.ts:122 | admin expiry label (template) |
| format.expiryCompact.ago | `{n}d ago` | lib/format.ts:166 | compact expiry (template) |
| format.expiryCompact.today | `today` | lib/format.ts:167 | compact expiry |
| format.expiryCompact.days | `{n}d` | lib/format.ts:168 | compact expiry (template) |
| format.expiryCompact.months | `{n}mo` | lib/format.ts:169 | compact expiry (template) |
| format.resetStrategy.monthly | `Monthly` | lib/format.ts:173 | reset strategy label |
| format.resetStrategy.weekly | `Weekly` | lib/format.ts:175 | reset strategy label |
| format.resetStrategy.daily | `Daily` | lib/format.ts:176 | reset strategy label |
| format.resetStrategy.never | `Never` | lib/format.ts:177 | reset strategy label |

---

## Summary

| Domain | String count |
|--------|-------------|
| common.* | 20 |
| home.* | 33 |
| devices.* | 20 |
| pulse.* | 11 |
| settings.* | 36 |
| admin.* | 37 |
| common.status.* | 4 |
| format.* | 30 |
| **Total** | **191** |
