# Карточка устройства показывает данные Remnawave без подмены ОС версией

Status: completed
Owner: Codex
Started: 2026-08-15
Updated: 2026-08-15

## Purpose

Пользователь Flowvy видит в Devices логотип и название ОС, а также дату добавления, дату обновления
и IP, которые Remnawave сохранил при добавлении или обновлении HWID-устройства. User-Agent остаётся
в allow-listed BFF response, но не перегружает карточку.

## Current state

`RemnawaveDevice` уже allow-list'ит `platform`, `osVersion`, `deviceModel`, `userAgent`, `createdAt` и
`updatedAt`, но пропускает официальный `requestIp`. `DevicesService` публикует только `platform`,
`osVersion`, `deviceModel` и `createdAt`. Frontend показывает generic mobile/desktop glyph и выводит
`osVersion` вместо названия ОС.

Контракт проверен 2026-08-15 по official exact tags:

- Remnawave 2.8.1 `HwidUserDeviceSchema`:
  https://github.com/remnawave/backend/blob/2.8.1/libs/contract/models/hwid-user-device.schema.ts
- Remnawave 3.1.0 `HwidUserDeviceSchema`:
  https://github.com/remnawave/backend/blob/3.1.0/libs/contract/models/hwid-user-device.schema.ts
- Remnawave HWID documentation:
  https://docs.rw/features/hwid-device-limit/

Оба tagged schema объявляют nullable `platform`, `osVersion`, `deviceModel`, `userAgent`,
`requestIp` и обязательные ISO `createdAt`/`updatedAt`. Документация поясняет, что ОС, версия ОС,
модель и User-Agent приходят от client headers и, кроме HWID, могут отсутствовать.

## Scope

Входит provider/BFF mapping device read response, frontend wire type, карточка устройства, локализованные
labels, deterministic fixtures/tests и документация интеграции. Не входят изменения Remnawave,
device deletion, хранение device-данных в PostgreSQL и live provider mutations.

## Acceptance

- BFF безопасно публикует nullable `userAgent` и `requestIp`, а также `updatedAt` Unix timestamp из
  свежего ответа Remnawave.
- Карточка показывает логотип и название известной ОС из `platform`, но не показывает `osVersion`.
- Карточка показывает Added, Updated, ОС и IP двумя компактными строками; отсутствующие nullable
	provider-поля имеют явный нейтральный fallback.
- Unknown platform использует безопасный generic fallback без предположения об ОС.
- Backend contract tests, frontend lint/type/unit/build и focused Playwright Devices matrix проходят
  свежо; light/dark mobile evidence открыто и просмотрено.

## Approach

1. Расширить allow-list Remnawave/BFF и regression assertions точными official полями.
2. Обновить frontend type/fixture и сделать семантическую компактную details-разметку с OS glyphs.
3. Покрыть populated nullable/long-value состояния и проверить удаление устройств без регрессии.
4. Зафиксировать contract provenance, выполнить diff-aware и UI gates, просмотреть финальный diff.

## Progress

- [x] 2026-08-15 03:34 +03:00 — исходный flow route → service → provider schema → BFF schema →
  frontend type/hook/component/tests прослежен.
- [x] 2026-08-15 03:34 +03:00 — exact 2.8.1 и 3.1.0 schemas и текущая HWID documentation
  подтверждают имена, nullable-семантику и происхождение полей.
- [x] 2026-08-15 03:40 +03:00 — `requestIp` добавлен в provider allow-list, а BFF mapping
  `userAgent`/`requestIp`/`updatedAt` подтверждён тремя focused regression tests.
- [x] 2026-08-15 03:42 +03:00 — Devices UI показывает OS-specific glyph/name и
	Added/Updated/IP; focused matrix 20/20 прошла на четырёх browser projects, четыре light/dark
	screenshots на 320/430 px просмотрены.
- [x] 2026-08-15 03:51 +03:00 — Changed и Full gates, pinned Remnawave contracts и docs прошли;
	`PROJECT_STATE`/`INTEGRATIONS` обновлены, финальный diff проверен.
- [x] 2026-08-15 06:18 +03:00 — inline confirmation заменён общим native alert dialog для одного
	и всех устройств; координаты row до/после открытия совпадают.
- [x] 2026-08-15 06:42 +03:00 — начальный фокус перенесён с Cancel на semantic heading; у 189
	English locale leaves удалена только финальная точка и добавлен all-locales catalog regression.
	Focused Devices 9/9, full mobile Playwright 100/100 и frontend verify прошли.

## Surprises & Discoveries

- Fixture `FAKE_DEVICE_28` уже содержит `requestIp`, но `RemnawaveDevice.from_raw()` его отбрасывает;
  поэтому frontend не может получить IP без исправления provider allow-list.
- Текущий `PlatformIcon` различает только mobile/desktop, хотя `platform` уже доступен BFF.
- Первый change-aware gate обнаружил ровно две stale locale leaves `devices.platform.mobile` и
  `devices.platform.desktop`, которые перестали использоваться после OS-specific glyphs; строки удалены,
  catalog test не ослаблялся.
- Первый Full запуск совпал с внутренним fast shutdown первого PostgreSQL init и не создал disposable
  migration DB. Логи подтвердили штатный entrypoint restart; после stable healthy state повторный Full
  gate прошёл целиком без изменения кода или данных.

## Decision Log

- 2026-08-15 — название ОС берётся из `platform`, а не выводится из UA или `osVersion`: поле является
  официальным provider contract, не требует ненадёжного client-side parsing и допускает unknown fallback.
- 2026-08-15 — BFF сохраняет существующий `osVersion` для совместимости ответа, но текущий UI его не
  отображает; задача меняет отображение, а не требует breaking removal поля.
- 2026-08-15 — IP публикуется под provider-derived именем `requestIp`, чтобы не создавать ложное
	впечатление текущего network address.
- 2026-08-15 — irreversible device removal подтверждается отдельным modal alert dialog, а не
	расширением строки. Решение сверено с Apple HIG Alerts, Material 3 Dialogs, WAI-ARIA APG
	Alert/Modal Dialog и React `createPortal` (доступ 2026-08-15). Telegram `showPopup` поддерживает
	dеструктивную кнопку, но не выбран: Flowvy уже использует единый доступный dialog и должен одинаково
	работать внутри Telegram и в browser fallback.

- 2026-08-15 — alert dialog сначала фокусирует заголовок: focus остаётся внутри top layer и доступен
	скринридеру, но ни Cancel, ни destructive action не выглядят заранее выбранными. Compact Flowvy
	microcopy не получает финальную точку; internal punctuation, URL, версии, числа и provider-owned
	контент сохраняются. Решение сверено с Apple HIG Alerts/Writing, Material Writing и Microsoft
	Style Guide Periods (доступ 2026-08-15).

## Verification

- `E:\mini-app`: `scripts\verify-contracts.ps1` → 56/56 pinned 2.8.1/3.0.0/3.1.0 tests passed.
- `E:\mini-app\frontend`: focused Devices Playwright → 20/20 на 430x932, 320x568, iOS WebKit и
  desktop; OS glyphs, nullable/long metadata, deletion, Axe, overflow, console/network passed.
- `E:\mini-app\frontend`: focused visual evidence → 2/2 projects; light/dark 320/430 px screenshots
  открыты и проверены вручную.
- `E:\mini-app`: `PLAYWRIGHT_PORT=5337; scripts\verify.ps1 -Scope Changed` → 384 service-free
  backend, Ruff, frontend lint/typecheck/43 unit/build, 100 mobile Playwright и docs passed.
- `E:\mini-app`: `PLAYWRIGHT_PORT=5339; scripts\verify.ps1 -Scope Full` → migrations/drift,
  483 backend, 56 Remnawave contract, Ruff, frontend lint/typecheck/43 unit/build, 100 mobile
  Playwright и docs passed.

- `E:\mini-app\frontend`: focused Devices confirmations/evidence → 9/9 на 430x932, 320x568 и
  iOS WebKit; шесть light/dark confirmation screenshots просмотрены вручную.
- `E:\mini-app\frontend`: `pnpm verify` → Biome, TypeScript, 44/44 unit и production build passed;
  полный `mobile-chromium` Playwright → 100/100 passed.

## Risks and rollback

IP и User-Agent являются пользовательскими device metadata: они не логируются и не сохраняются
локально, а возвращаются только уже авторизованному владельцу после fresh Remnawave ownership check.
Автоматические проверки используют только documentation-reserved IP и synthetic UA. Откат — удалить
новые BFF-поля и вернуть прежнюю разметку; миграция и destructive provider action не нужны.

## Outcomes & Retrospective

Flowvy теперь передаёт official Remnawave `userAgent`, nullable `requestIp` и `updatedAt` через
allow-listed BFF response; карточка показывает владельцу Added, Updated, ОС и IP, но не UA. ОС
выводится из `platform` с Android/Apple/Windows/Linux glyph, `osVersion` больше не участвует в
представлении. Подтверждение удаления вынесено из строки в общий modal alert dialog и фокусирует
semantic heading, не подсвечивая Cancel. Compact locale copy больше не заканчивается точкой. Unknown и
nullable данные не угадываются. Реальные provider requests и mutations не выполнялись; схема БД не
менялась.
