<div align="center">

<img src="assets/header.png" alt="Flowvy Mini App" width="720">

### Telegram Mini App и бот с открытым исходным кодом — личный кабинет для пользователей и отдельный раздел для администратора

Telegram · Remnawave · Tribute · Uptime Kuma · Beszel

[![CI](https://github.com/flowvy/mini-app/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/flowvy/mini-app/actions/workflows/ci.yml?query=branch%3Adev)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-663399?style=flat-square)](LICENSE)
[![Status: MVP](https://img.shields.io/badge/status-MVP-f59e0b?style=flat-square)](#статус)

[**Возможности**](#возможности) · [**Установка**](#установка-на-сервер) · [**Flowvy Client**](https://github.com/flowvy/desktop) · [**Документация**](#документация)

<br>

<img src="assets/mini-app.png" alt="Интерфейс Flowvy Mini App" width="960">

</div>

Flowvy Mini App — часть экосистемы Flowvy. Пользователь получает личный кабинет и поддержку внутри
Telegram, а администратор — отдельный раздел для работы с пользователями, доступом и настройками.
В экосистему также входит отдельный [Flowvy Client](https://github.com/flowvy/desktop).

## Возможности

- **Личный кабинет в Telegram** — пользователь видит состояние подписки, трафик, срок действия, ссылку
  для подключения и свои устройства без отдельного сайта
- **Telegram-бот** — показывает настроенное приветствие, открывает Mini App и доставляет уведомления
- **Административный раздел** — администратор видит сводку, работает с пользователями и профилями
  доступа, настраивает регистрацию, Pulse, поддержку, Tribute и оформление
- **Безопасная идентификация через Telegram** — сервер проверяет подпись и срок действия `initData`,
  а перед важными действиями повторно проверяет роль и состояние учётной записи
- **Регистрация и приглашения** — поддерживаются открытая регистрация, вход по приглашениям,
  многоразовые коды, учёт приглашённых пользователей и настраиваемые профили доступа
- **Состояние инфраструктуры** — раздел Pulse показывает данные Uptime Kuma или Beszel, не раскрывая
  служебную информацию в браузере
- **Поддержка внутри приложения** — обращения, переписка, быстрые ответы и Telegram-уведомления
  собраны в одном месте
- **Расширенный доступ через Tribute** — подписки и пожертвования учитываются только после
  подтверждённого события от Tribute; возврат со страницы оплаты сам по себе не считается оплатой
- **Настройка под себя** — название, логотип, приветствие и переведённые тексты меняются без
  изменения исходного кода

## Как устроен Flowvy Mini App

Flowvy Mini App объединяет React-интерфейс, Telegram-бота и серверное приложение FastAPI. Интерфейс
обращается только к FastAPI BFF. Сервер проверяет Telegram-аутентификацию, хранит данные в PostgreSQL
и Redis, обращается к API Remnawave и взаимодействует с Telegram Bot API, выбранным источником Pulse,
Tribute и, при необходимости, Cloudflare R2.

- `frontend/` — React 19, TypeScript, Vite, TanStack Router/Query и TMA.js SDK
- `backend/` — FastAPI, aiogram, Dishka, SQLAlchemy/Alembic, PostgreSQL и Redis
- `scripts/` — установка зависимостей, локальный запуск и проверка через PowerShell 7
- `docs/` — архитектура, интеграции, безопасность, проверки и эксплуатация

Подробная схема компонентов и границ доверия находится в
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Статус

> [!WARNING]
> Flowvy Mini App остаётся незавершённым MVP. Установка контейнера и работа на реальном сервере
> подтверждены, но ещё не проверены смена секретов, восстановление из резервной копии, мониторинг и
> оповещения, поведение под нагрузкой, порядок действий при сбоях и независимая безопасность.

Проверенные возможности, известные ограничения и ближайшее действие перечислены в
[`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).

## Установка на сервер

### 1. Установить Docker

```bash
sudo curl -fsSL https://get.docker.com | sh
```

### 2. Скачать файлы

```bash
sudo -i
mkdir -p /opt/mini-app && cd /opt/mini-app

curl -o docker-compose.yml https://raw.githubusercontent.com/flowvy/mini-app/main/docker-compose.yml && \
curl -o .env https://raw.githubusercontent.com/flowvy/mini-app/main/.env.example
chmod 600 .env
```

### 3. Заполнить `.env`

Сгенерируйте пароль PostgreSQL и секрет Telegram webhook:

```bash
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env && \
sed -i "s/^TELEGRAM_WEBHOOK_SECRET=.*/TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)/" .env
```

Откройте `.env`:

```bash
nano .env
```

Заполните:

- `APP_DOMAIN`
- `BOT_TOKEN`
- `ADMIN_TELEGRAM_IDS`
- `REMNAWAVE_URL`
- `REMNAWAVE_API_TOKEN`
- `REMNAWAVE_WEBHOOK_SECRET`

### 4. Запустить Flowvy Mini App

```bash
cd /opt/mini-app
docker compose up -d && docker compose logs -f
```

`Ctrl+C` закроет просмотр журналов, но не остановит контейнеры.

### Обновление

```bash
cd /opt/mini-app && docker compose pull && docker compose down && docker compose up -d && docker compose logs -f
```

## Документация

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — установка и обновление на своём сервере
- [`docs/PRODUCT.md`](docs/PRODUCT.md) — роли, пользовательские сценарии и границы продукта
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — компоненты, данные и границы доверия
- [`docs/DEV_ENVIRONMENT.md`](docs/DEV_ENVIRONMENT.md) — установка и локальная разработка
- [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) — Telegram, Remnawave, Pulse, Tribute и R2
- [`docs/SECURITY.md`](docs/SECURITY.md) — требования безопасности и модель угроз
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — эксплуатационные процедуры и известные пробелы
- [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) — последнее подтверждённое состояние проекта
- [`CHANGELOG.md`](CHANGELOG.md) и [`CHANGELOG.ru.md`](CHANGELOG.ru.md) — заметки о выпусках

## Лицензия и бренд

Исходный код Flowvy Mini App распространяется по лицензии
[`GNU Affero General Public License v3.0 only`](LICENSE). Если изменённая версия работает по сети для
других пользователей, её соответствующий исходный код также должен быть доступен по условиям AGPL.

Название Flowvy, логотип и фирменные изображения не передаются по AGPL. Изменённые версии должны
использовать собственное название и оформление; подробные правила находятся в
[`TRADEMARKS.md`](TRADEMARKS.md). Лицензии и сведения о сторонних компонентах перечислены в
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

---

<div align="center">
<sub>Flowvy Mini App — личный кабинет в Telegram и инструменты администратора.</sub>
</div>
