# Кроссплатформенный Flowvy dev-контур для macOS

Status: completed
Owner: Codex
Started: 2026-08-21
Updated: 2026-08-21

## Purpose

Сохранить текущий Windows workflow и сделать тот же локальный Flowvy lifecycle воспроизводимым на
новом Mac: locked bootstrap, diff-aware/full verification, localhost-only запуск, безопасный
Telegram-enabled named Tunnel и штатная остановка без потери Docker volume.

## Starting state

- Исходный commit: `a5884eac03ebd670bcf05ac8896d501b005d41f2`; `dev` синхронизирован с
  `origin/dev`, рабочее дерево перед задачей чистое.
- Fresh Windows Full gate 2026-08-21: Alembic verifier, Ruff, 495 backend tests, 56 pinned
  Remnawave contract tests, frontend lint/typecheck/49 unit/build, 109 mobile Chromium Playwright и
  Markdown links прошли.
- `bootstrap.ps1` почти platform-neutral, но `dev-up.ps1`, `dev-down.ps1`, `tunnel-up.ps1`,
  `tunnel-down.ps1`, `dev-reset-data.ps1` и `verify-tunnel.ps1` используют Windows-only
  `Get-NetTCPConnection`, `Win32_Process`, `.cmd`, `curl.exe` или `-WindowStyle Hidden`.
- `verify.ps1` и часть вспомогательных scripts собирают пути с `\`, что не является надёжным
  macOS-контрактом.
- Named Tunnel сохраняет public hostname `https://dev-app.flowvy.io`. Текущий Windows connector
  направляет его на `http://localhost:80`; macOS origin должен использовать непривилегированный
  `http://localhost:4173`, без изменения public hostname или BotFather Main Mini App URL.

## Scope

Входит общий PowerShell 7 platform helper, кроссплатформенные bootstrap/verify/dev/tunnel scripts,
детерминированные tooling tests, документация установки Apple Silicon/macOS и cutover named Tunnel.
Бизнес-код, API, схема данных, реальные Telegram/provider calls, Cloudflare route mutation, перенос
секретов и PostgreSQL dump/restore в этот этап не входят.

## Acceptance

- Windows lifecycle сохраняет текущие команды и port `80` для named Tunnel.
- PowerShell 7 на macOS использует те же `.ps1` entry points, platform-native executable lookup,
  TCP port checks и process-tree shutdown без Windows CIM.
- macOS named Tunnel preview слушает `127.0.0.1:4173`; docs требуют изменить только Cloudflare
  Service URL при cutover и запрещают одновременный polling/две origin replicas.
- Full verification scripts строят пути через `Join-Path` и проходят свежий Windows gate.
- Tooling regressions покрывают platform selection, preview-port selection, process state safety и
  docs/command consistency без реальных внешних requests.

## Approach

1. Вынести platform detection, executable lookup, TCP probe, безопасный background start и
   recursive owned-process stop в `scripts/common.ps1`.
2. Перевести dev/tunnel lifecycle и verification paths на helper/`Join-Path`, сохранив fail-closed
   public checks и exact PID ownership.
3. Добавить tooling-level проверки PowerShell contracts без запуска Telegram или Cloudflare.
4. Обновить repository instructions и runbooks для Mac bootstrap/cutover.
5. Выполнить targeted tooling/docs checks, затем fresh Full gate и просмотреть итоговый diff.

## Progress

- [x] 2026-08-21 01:03 +03:00 — незакоммиченная предыдущая UI-задача откатана по разрешению
  владельца; commit `a5884ea` прошёл Full gate и отправлен в `origin/dev`.
- [x] 2026-08-21 01:10 +03:00 — зафиксированы Windows-only зависимости lifecycle и официальный
  public-hostname → local-service contract Cloudflare.
- [x] 2026-08-21 01:21 +03:00 — реализован общий platform helper; bootstrap, dev, tunnel и verify
  scripts переведены на native executable/TCP/process-tree contracts и `Join-Path`.
- [x] 2026-08-21 01:26 +03:00 — добавлены deterministic tooling tests и Apple Silicon/macOS
  bootstrap/cutover runbook с Windows `:80` → macOS `:4173` origin transition.
- [x] 2026-08-21 01:35 +03:00 — safe localhost lifecycle smoke, Changed и Full gates прошли;
  diff подготовлен к отдельному подтверждению коммита.
- [x] 2026-08-20 18:44 -07:00 — на новом Mac localhost startup подтверждён тремя fresh `200` для
  frontend и `/api/ready`; PostgreSQL/Redis healthy, Docker volumes сохранены.
- [x] 2026-08-20 18:47 -07:00 — исправлены выявленные macOS lifecycle gaps: hidden editable package
  обойдён process-level `PYTHONPATH`, TCP readiness использует explicit `int` cast, Vite-owned
  `esbuild` разрешён в process tree, shutdown ждёт фактический exit. Codex runner lifecycle
  закреплён в `AGENTS.md`, а tooling regression — в `verify-tooling.ps1`.
- [x] 2026-08-20 18:50 -07:00 — `verify.ps1` получил тот же process-local `PYTHONPATH`; удалён
  противоречащий `.gitattributes` одиночный Biome CRLF override. Fresh Changed gate прошёл: tooling,
  Ruff, 389 service-free backend tests, frontend lint/typecheck/49 unit/build и docs.
- [x] 2026-08-20 18:51 -07:00 — controlled named-Tunnel cutover ожидал установки Mac connector:
  `cloudflared 2026.8.2` установлен, но connector credentials/config и LaunchAgent отсутствуют;
  public root/health возвращали Cloudflare `530`. Telegram polling намеренно не запускался.
- [x] 2026-08-20 18:59 -07:00 — владелец остановил Windows connector/poller, установил Mac
  `cloudflared` LaunchDaemon и переключил exact `dev-app.flowvy.io` Service URL на
  `http://localhost:4173`. Full Telegram-enabled named-Tunnel startup прошёл: local frontend,
  backend ready и preview, public root/health/ready — `200`; public debug — `404`, backend подтвердил
  `telegram_main_app_ready`.

## Surprises & Discoveries

- Docker Desktop на исходной Windows машине потребовал UAC для запуска engine; после запуска Full
  gate прошёл без изменения application source.
- PowerShell `$IsWindows`, `$IsMacOS` и `$IsLinux` являются официальными automatic variables в
  PowerShell 7.6 и подходят для явного platform branch.
- Старые ignored process markers ссылались на уже переиспользованные Windows PID. Новый stop helper
  отклонил чужие `taskhostw`/`svchost`; после проверки свободных Flowvy ports удалены только два
  stale marker-файла, логи и Docker volume сохранены.
- Безопасный localhost smoke выявил только неверное синтетическое значение
  `ADMIN_TELEGRAM_IDS='[]'`; повтор с валидным пустым значением подтвердил health/ready/frontend
  `200` и штатную остановку owned process trees без внешних интеграций.
- На macOS PowerShell распаковывает nullable port parameter до `Int32`; обращение к `.Value`
  передавало TCP helper значение `0`. Explicit `[int]` cast устраняет ошибку.
- Vite запускает отдельный дочерний `esbuild`; без него fail-closed process allowlist не мог штатно
  завершить frontend tree. Сам `Stop-Process` также требует bounded `WaitForExit`, иначе immediate
  macOS verification видит ещё не исчезнувший PID.
- Codex command runner завершает descendants после закрытия owning shell. Для runtime acceptance
  его session нужно удерживать живым и проверять endpoints отдельной командой; обычный interactive
  Terminal такого runner teardown не выполняет.
- Hidden `.venv` затрагивает не только runtime startup, но и direct `verify.ps1`; verification
  entrypoint также должен задавать `backend/src` process-locally. Одиночный Biome `crlf` override
  конфликтовал с repository-wide LF attributes и воспроизводимо ломал lint на Mac.

## Decision Log

- 2026-08-21 — сохранить единый PowerShell interface вместо параллельного набора `.sh`; это
  исключает дрейф двух lifecycle implementations и требует на Mac только PowerShell 7.
- 2026-08-21 — оставить Windows named preview на `80`, а macOS default задать `4173`; public
  hostname не зависит от local service port, а непривилегированный Mac origin не требует запуска
  Node от root.
- 2026-08-21 — repository не изменяет Cloudflare route автоматически; cutover остаётся явным
  owner-controlled внешним шагом.

## External contract evidence

- Microsoft PowerShell 7.6 automatic variables, accessed 2026-08-21:
  https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_automatic_variables?view=powershell-7.6
- Cloudflare Tunnel routing, accessed 2026-08-21: public hostname maps to an arbitrary local HTTP
  service URL such as `http://localhost:8080`:
  https://developers.cloudflare.com/tunnel/routing/
- Cloudflare macOS service lifecycle, accessed 2026-08-21:
  https://developers.cloudflare.com/tunnel/advanced/local-management/as-a-service/macos/
- Cloudflare macOS download via Homebrew, accessed 2026-08-21:
  https://developers.cloudflare.com/tunnel/downloads/

## Verification

- `E:\mini-app`: `.\scripts\verify-tooling.ps1`, `.\scripts\verify-docs.ps1`, `git diff --check` →
  PowerShell parsing, Windows/macOS port contracts, owned ephemeral process/TCP lifecycle,
  documentation links and whitespace passed.
- `E:\mini-app`: safe `.\scripts\dev-up.ps1 -SkipInstall` smoke with process-local integration
  settings disabled → health/ready/frontend `200`; `.\scripts\dev-down.ps1` stopped only recorded
  owned trees and preserved the Docker volume.
- `E:\mini-app`: `.\scripts\verify.ps1 -Scope Changed` → tooling/docs, Ruff, 389 service-free
  backend tests, frontend lint/typecheck/49 unit/build passed; no UI source changed, so E2E was not
  selected by the diff-aware gate.
- `E:\mini-app`: `.\scripts\verify.ps1 -Scope Full` → migration zero/previous-head,
  downgrade/re-upgrade/runtime inserts/drift, Ruff, 495 backend, 56 pinned Remnawave contracts,
  frontend lint/typecheck/49 unit/build, 109 mobile Chromium Playwright and docs passed on Windows.
  macOS runtime acceptance remains for the new machine.
- `/Users/x_kit_/Documents/Projects/mini-app`: manual macOS acceptance → localhost frontend/ready,
  named preview on `4173`, public root/health/ready `200`, public debug `404`, system connector
  running, `telegram_main_app_ready` confirmed for the permitted test bot.

## Recovery and rollback

All changes are source-only until external cutover. Reverting the future commit restores the
Windows-only lifecycle. The scripts never delete Docker volumes, change BotFather configuration,
rewrite Cloudflare routes, print `.env`, or start a real integration during deterministic tests.
At cutover, keep the old connector stopped but recoverable until the Mac origin passes health and
Telegram acceptance.

## Outcomes & Retrospective

Windows implementation и verification сохранены, первый macOS localhost/full named-Tunnel lifecycle
и controlled Telegram cutover подтверждены. Найденные Mac gaps закрыты минимально и покрыты tooling,
Changed gate и реальным runtime. Commit/push выполняются только после отдельного подтверждения
владельца.
