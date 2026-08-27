<div align="center">

<img src="assets/header.png" alt="Flowvy Mini App" width="720">

### Open-source Telegram Mini App и бот для управления Xray-подписками через Remnawave

Telegram · Remnawave · Tribute · Uptime Kuma · Beszel

[![CI](https://github.com/flowvy/mini-app/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/flowvy/mini-app/actions/workflows/ci.yml?query=branch%3Adev)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-663399?style=flat-square)](LICENSE)
[![Status: MVP](https://img.shields.io/badge/status-MVP-f59e0b?style=flat-square)](#статус)

[**Возможности**](#почему-flowvy) · [**Локальный запуск**](#локальный-запуск) · [**Документация**](#документация)

<br>

<img src="assets/mini-app.png" alt="Интерфейс Flowvy Mini App" width="960">

</div>

## Почему Flowvy

- **Подписка внутри Telegram** — трафик, срок действия, ссылка подключения и устройства доступны в
  привычном Mini App без отдельного кабинета
- **Один интерфейс для пользователя и оператора** — пользователь управляет своим доступом, а
  администратор видит сводку, юзеров, профили доступа и настройки сервиса
- **Безопасная Telegram-идентификация** — backend проверяет подпись и срок действия `initData`, а
  роли и активность подтверждает перед чувствительными действиями
- **Гибкая регистрация** — открытый или invite-only вход, многоразовые инвайты, referral attribution
  и управляемые профили доступа Remnawave
- **Состояние инфраструктуры** — встроенный Pulse показывает данные Uptime Kuma или Beszel без
  передачи credentials во frontend
- **Поддержка и база знаний** — обращения, переписка, Quick Answers и Telegram-уведомления собраны в
  одном потоке
- **Sponsor-доступ через Tribute** — подписки и донаты обрабатываются по подписанным provider events;
  возврат из checkout сам по себе не считается оплатой
- **Готов к настройке под оператора** — название, логотип и локализованный контент меняются без форка
  продуктового интерфейса

## Как устроен Flowvy

Flowvy не является прокси-сервером и не заменяет Remnawave. React Mini App обращается только к
FastAPI BFF. Backend проверяет Telegram authentication, хранит локальные данные в PostgreSQL и Redis
и взаимодействует с Remnawave, Telegram Bot API, выбранным Pulse provider, Tribute и optional
Cloudflare R2.

- `frontend/` — React 19, TypeScript, Vite, TanStack Router/Query и TMA.js SDK
- `backend/` — FastAPI, aiogram, Dishka, SQLAlchemy/Alembic, PostgreSQL и Redis
- `scripts/` — locked bootstrap, локальный lifecycle и verification workflows на PowerShell 7
- `docs/` — архитектура, integrations, security boundaries, testing и operations

Подробная схема компонентов и trust boundaries находится в
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Статус

> [!WARNING]
> Flowvy находится в состоянии незавершённого MVP. Локальные и CI-проверки реализованы, но
> production deployment, backup/recovery, observability и независимая security readiness пока не
> подтверждены. Не разворачивайте текущую версию как production-сервис без собственного review.

Проверенные возможности, известные ограничения и ближайшее действие перечислены в
[`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).

## Локальный запуск

Текущий repository workflow проверен на Apple Silicon macOS. Нужны Python 3.14.7, uv 0.12.6,
Node.js 24.19.0 LTS, pnpm 11.24.0, Docker Desktop и PowerShell 7.

Сначала создайте локальные `backend/.env` и `frontend/.env` из соответствующих `.env.example` и
проверьте, что в них нет production credentials. Затем из корня репозитория:

```powershell
./scripts/bootstrap.ps1
./scripts/dev-up.ps1
```

`dev-up.ps1` запускает безопасный localhost-only контур без Telegram и публичного Tunnel. Остановить
его можно командой:

```powershell
./scripts/dev-down.ps1
```

Полная настройка, mock auth, Telegram test bot и Tunnel описаны в
[`docs/DEV_ENVIRONMENT.md`](docs/DEV_ENVIRONMENT.md). Никогда не публикуйте `DEBUG=true` и не
добавляйте `.env` в Git.

## Проверки

```powershell
# проверки по текущему diff
./scripts/verify.ps1 -Scope Changed

# полный gate: services, migrations, contracts и UI
./scripts/verify.ps1 -Scope Full
```

Состав и границы автоматических проверок описаны в [`docs/TESTING.md`](docs/TESTING.md).

## Документация

- [`docs/PRODUCT.md`](docs/PRODUCT.md) — роли, пользовательские потоки и продуктовые границы
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — компоненты, данные и trust boundaries
- [`docs/DEV_ENVIRONMENT.md`](docs/DEV_ENVIRONMENT.md) — установка и локальная разработка
- [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) — Telegram, Remnawave, Pulse, Tribute и R2
- [`docs/SECURITY.md`](docs/SECURITY.md) — security invariants и модель угроз
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — runtime-процедуры и production gaps
- [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) — последнее подтверждённое состояние проекта
- [`CHANGELOG.md`](CHANGELOG.md) и [`CHANGELOG.ru.md`](CHANGELOG.ru.md) — release notes

## Лицензия и бренд

Исходный код Flowvy распространяется по лицензии
[`GNU Affero General Public License v3.0 only`](LICENSE). Если изменённая версия работает по сети для
других пользователей, её соответствующий исходный код также должен быть доступен по условиям AGPL.

Название Flowvy, логотип и фирменные изображения не передаются по AGPL. Форки и изменённые
дистрибутивы должны использовать собственное название и визуальную айдентику; подробные правила — в
[`TRADEMARKS.md`](TRADEMARKS.md). Лицензии и атрибуция сторонних компонентов перечислены в
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

---

<div align="center">
<sub>Flowvy Mini App — открытый self-hosted кабинет для операторов Remnawave и их пользователей.</sub>
</div>
