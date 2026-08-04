# Согласованный loading и настройки доступа из Remnawave

Status: completed
Owner: Codex
Started: 2026-08-02
Updated: 2026-08-02

## Purpose

Домашняя страница должна показывать один согласованный loading-state, а администратор — настраивать
регистрацию и доступ в понятной секции Bot. Тег access profile выбирается только из актуальных тегов
Remnawave и повторно проверяется backend перед сохранением.

## Current state

- Home загружает подписку и персональный invite отдельными запросами, поэтому готовая invite-card
  появляется рядом со skeleton подписки.
- Registration & Access находится вне ожидаемой группы Bot; редактор профиля одновременно показывает
  внешний и внутренний заголовки Access Profiles.
- Lifetime поддержан моделью, но смысл режима и безлимитных значений недостаточно явно объяснён.
- Поле tag принимает произвольный текст и не связано с каталогом Remnawave.

## Scope

Входит синхронизация Home skeleton, перегруппировка Settings, переработка редактора access profile,
тёмная/светлая тема native controls, read-only получение Remnawave tags, backend validation,
детерминированные contract/UI tests и актуализация документации. Не входят live-мутации Remnawave,
изменение существующих пользовательских данных, Broadcast и Support.

## Acceptance

- Пока основная Home subscription не завершила загрузку, Invite friends тоже отображается skeleton.
- Name & Logo и Registration & Access находятся в секции Bot без дублированных заголовков.
- Режим без срока понятен без догадок; date/select controls читаемы в iOS WebView в обеих темах.
- Tag выбирается из каталога Remnawave; произвольное значение нельзя создать через UI или API.
- Ошибки/пустые списки тегов имеют безопасное поведение без утечки provider payload.
- Свежие backend, Remnawave contract, frontend и Playwright проверки проходят.

## Approach

1. Зафиксировать официальный и локальный контракт tags для поддерживаемых Remnawave 2.8.1/3.0/3.1.
2. Расширить provider client, registration options и server-side validation детерминированными тестами.
3. Исправить Home loading и Settings/access-profile UI с локализованными подсказками.
4. Расширить UI fixtures и сценарии loading, grouping, tag selection и lifetime.
5. Выполнить change-aware и затем полный gate, визуально проверить мобильные состояния.

## Progress

- [x] 2026-08-02 — зафиксированы исходный diff, правила репозитория и затронутый end-to-end поток.
- [x] 2026-08-02 — official exact tags 2.8.1/3.0.0/3.1.0 подтвердили
  `GET /api/users/tags` и envelope `response.tags: string[]`.
- [x] 2026-08-02 — backend contract и validation реализованы; targeted 52 tests passed.
- [x] 2026-08-02 — UI/loading исправлены; mobile + iOS focused 18 tests passed.
- [x] 2026-08-02 — full gate, 140-case browser matrix и визуальная проверка завершены.

## Surprises & Discoveries

- Между 2.8.1 и 3.x upstream переименовал TypeScript namespace `GetAllTagsCommand` в
  `GetUsersTagsCommand`, но HTTP route и response schema остались стабильными.

## Decision Log

- 2026-08-02 — tags остаются provider-owned справочником: frontend получает allow-list через BFF,
  а backend проверяет выбор непосредственно перед сохранением.
- 2026-08-02 — автоматические проверки используют только mock transport; реальная панель не мутируется.

## Verification

- `E:\mini-app\backend`: targeted registration/Remnawave pytest, Ruff, затем полный pytest.
- `E:\mini-app\frontend`: Biome, TypeScript, Vitest, production build.
- `E:\mini-app\frontend`: focused Playwright на 430x932 и WebKit 390x844, затем полный mock matrix.
- Ручная проверка: Home loading и `/admin/settings/access` в тёмной/светлой теме и малом viewport.

## Recovery and rollback

Изменения additive на read-only provider boundary и frontend. При provider failure сохранение нового
или изменённого tag закрывается безопасной общей ошибкой; profile без tag продолжает работать.
Откат выполняется восстановлением только файлов этого плана, без изменения базы и live Remnawave.

## Outcomes & Retrospective

Home больше не показывает готовый invite рядом с чужим skeleton и сохраняет итоговый порядок блоков.
Bot settings объединяет branding, registration/access и welcome. Редактор показывает либо список,
либо форму, объясняет `No expiry`, а native calendar/select controls следуют текущей color scheme.
User tag выбирается из Remnawave и проверяется backend; provider failure не блокирует profile без tag
или с неизменённым сохранённым tag.

Свежая проверка: `scripts/verify.ps1 -Scope Full` на `PLAYWRIGHT_PORT=5181` прошла migrations, Ruff,
281 pytest, 41 Remnawave contract tests, frontend lint/typecheck/11 unit/build, 35 Chromium E2E и docs.
Отдельно `PLAYWRIGHT_PORT=5182; pnpm test:e2e:all -- --workers=2` прошёл 140/140 на 430x932,
320x568, iPhone 13/WebKit и 1280x900. Скриншоты Home loading, Settings, lifetime/date editor в
light/dark просмотрены вручную; overflow и неверной темы native calendar не обнаружено.

Локальный dev перезапущен с `DEBUG=false` и Telegram polling, production preview опубликован новым
Flowvy-owned Quick Tunnel. Public root/health отвечают `200`, debug route — `404`; локальный
`WEBAPP_URL` указывает на текущий временный URL.
