<div align="center">

<img src="assets/header.png" alt="Flowvy Mini App" width="720">

### Telegram Mini App и бот с открытым исходным кодом для управления Xray-подписками через Remnawave

Telegram · Remnawave · Tribute · Uptime Kuma · Beszel

[![CI](https://github.com/flowvy/mini-app/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/flowvy/mini-app/actions/workflows/ci.yml?query=branch%3Adev)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-663399?style=flat-square)](LICENSE)
[![Status: MVP](https://img.shields.io/badge/status-MVP-f59e0b?style=flat-square)](#статус)

[**Возможности**](#почему-mini-app) · [**Установка**](#установка-на-сервер) · [**Документация**](#документация)

<br>

<img src="assets/mini-app.png" alt="Интерфейс Flowvy Mini App" width="960">

</div>

## Почему Mini-App

- **Подписка внутри Telegram** — трафик, срок действия, ссылка подключения и устройства доступны в
  привычном Mini App без отдельного кабинета
- **Один интерфейс для пользователя и провайдера** — пользователь управляет своим доступом, а
  администратор видит сводку, пользователей, профили доступа и настройки сервиса
- **Безопасная идентификация через Telegram** — сервер проверяет подпись и срок действия `initData`,
  а перед важными действиями повторно проверяет роль и состояние учётной записи
- **Гибкая регистрация** — открытый вход или вход по приглашениям, многоразовые коды, учёт рефералов
  и управляемые профили доступа Remnawave
- **Состояние инфраструктуры** — раздел Pulse показывает данные Uptime Kuma или Beszel, не передавая
  учётные данные в браузер
- **Поддержка и база знаний** — обращения, переписка, быстрые ответы и Telegram-уведомления собраны в
  одном месте
- **Спонсорский доступ через Tribute** — подписки и пожертвования обрабатываются только после
  подписанного события провайдера; возврат со страницы оплаты сам по себе не считается оплатой
- **Настройка под провайдера** — название, логотип и переведённые тексты меняются без отдельной копии
  интерфейса

## Как устроена Mini-App

Mini-App не является прокси-сервером и не заменяет Remnawave. React-приложение обращается только к
FastAPI BFF. Сервер проверяет Telegram-аутентификацию, хранит данные в PostgreSQL и Redis и
взаимодействует с Remnawave, Telegram Bot API, выбранным источником Pulse, Tribute и, при
необходимости, Cloudflare R2.

- `frontend/` — React 19, TypeScript, Vite, TanStack Router/Query и TMA.js SDK
- `backend/` — FastAPI, aiogram, Dishka, SQLAlchemy/Alembic, PostgreSQL и Redis
- `scripts/` — установка зависимостей, локальный запуск и проверка через PowerShell 7
- `docs/` — архитектура, интеграции, безопасность, проверки и эксплуатация

Подробная схема компонентов и границ доверия находится в
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Статус

> [!WARNING]
> Mini-App остаётся незавершённым MVP. Серверный контейнер и воспроизводимая установка реализованы,
> но реальное развёртывание, восстановление из резервной копии, наблюдаемость и независимая проверка
> безопасности пока не подтверждены. Перед публичным запуском проверьте конфигурацию и предусмотрите
> резервное копирование PostgreSQL.

Проверенные возможности, известные ограничения и ближайшее действие перечислены в
[`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).

## Установка на сервер

Нужны Linux-сервер с Docker Engine и Docker Compose v2, домен и внешний обратный прокси-сервер с
HTTPS. Приложение принимает соединения только через `127.0.0.1:8001`, поэтому публиковать этот порт
напрямую в интернет не нужно.

### 1. Скачать конфигурацию и создать секреты

```bash
sudo -i
mkdir -p /opt/mini-app && cd /opt/mini-app

curl -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/flowvy/mini-app/main/docker-compose.yml
curl -fsSLo .env \
  https://raw.githubusercontent.com/flowvy/mini-app/main/.env.example
chmod 600 .env

POSTGRES_PASSWORD="$(openssl rand -hex 24)"
TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 32)"
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" .env
sed -i "s|^TELEGRAM_WEBHOOK_SECRET=.*|TELEGRAM_WEBHOOK_SECRET=${TELEGRAM_WEBHOOK_SECRET}|" .env
unset POSTGRES_PASSWORD TELEGRAM_WEBHOOK_SECRET
```

У Mini-App нет отдельного `APP_SECRET`. `REMNAWAVE_WEBHOOK_SECRET` генерировать заново нельзя: он
должен совпадать с `WEBHOOK_SECRET_HEADER` в Remnawave. Если панель установлена на этом же сервере в
`/opt/remnawave`, перенесите значение без вывода в терминал:

```bash
REMNAWAVE_WEBHOOK_SECRET="$(awk -F= '/^WEBHOOK_SECRET_HEADER=/{sub(/^[^=]*=/, ""); gsub(/\r/, ""); print; exit}' /opt/remnawave/.env)"
if [[ ! "$REMNAWAVE_WEBHOOK_SECRET" =~ ^[A-Za-z0-9]{32,}$ ]]; then
  echo "WEBHOOK_SECRET_HEADER не найден или имеет неверный формат" >&2
  unset REMNAWAVE_WEBHOOK_SECRET
  exit 1
fi

sed -i "s|^REMNAWAVE_WEBHOOK_SECRET=.*|REMNAWAVE_WEBHOOK_SECRET=${REMNAWAVE_WEBHOOK_SECRET}|" .env
unset REMNAWAVE_WEBHOOK_SECRET
```

Если Remnawave находится на другом сервере, перенесите `WEBHOOK_SECRET_HEADER` вручную через
защищённый канал.

### 2. Заполнить `.env`

```bash
nano /opt/mini-app/.env
```

Обязательные значения:

- `APP_DOMAIN` — домен без `https://` и пути;
- `BOT_TOKEN` — токен Telegram-бота от BotFather;
- `ADMIN_TELEGRAM_IDS` — Telegram ID администраторов через запятую;
- `REMNAWAVE_URL` — HTTPS-адрес панели;
- `REMNAWAVE_API_TOKEN` — API-токен Remnawave;
- `REMNAWAVE_WEBHOOK_SECRET` — существующий `WEBHOOK_SECRET_HEADER` Remnawave.

Поля Kuma, Beszel, Tribute и R2 необязательны. `.env` содержит секреты: не публикуйте его и не
добавляйте в Git.

### 3. Настроить HTTPS и интеграции

Направьте обратный прокси-сервер на `127.0.0.1:8001`. Например, для Caddy:

```caddyfile
app.example.com {
    reverse_proxy 127.0.0.1:8001
}
```

В BotFather укажите `https://APP_DOMAIN` как URL основной Mini App. В Remnawave добавьте получателя
webhook:

```text
https://APP_DOMAIN/api/webhooks/remnawave
```

### 4. Запустить

```bash
cd /opt/mini-app
docker compose config --quiet
docker compose up -d && docker compose logs -f -t
```

Выйти из просмотра журналов можно сочетанием `Ctrl+C`: контейнеры продолжат работать. Проверка
состояния:

```bash
docker compose ps -a
curl -fsS https://app.example.com/api/health
curl -fsS https://app.example.com/api/ready
```

`app`, `postgres` и `redis` должны быть healthy, а `migrate` — завершиться с кодом `0`.

### Обновление

Перед обновлением сделайте резервную копию PostgreSQL и прочитайте заметки о выпуске. Затем:

```bash
cd /opt/mini-app && docker compose pull && docker compose down && docker compose up -d && docker compose logs -f
```

Новые миграции применятся до запуска приложения. Команда создаёт короткий простой; бесшовное
обновление несколькими репликами пока не поддерживается.

Образ `ghcr.io/flowvy/mini-app:latest` появится после первого стабильного релиза. Репозиторий и пакет
GHCR должны быть публичными, иначе Docker не сможет скачать их без авторизации.

Подробности про резервные копии, закрепление конкретной версии, откат и хранение данных находятся в
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Проверки

```powershell
# проверки изменённых частей
./scripts/verify.ps1 -Scope Changed

# полная проверка: сервисы, миграции, контракты и интерфейс
./scripts/verify.ps1 -Scope Full

# серверный образ и временный Compose-контур без внешних запросов
./scripts/verify-container.ps1
```

Состав и границы автоматических проверок описаны в [`docs/TESTING.md`](docs/TESTING.md).

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

## Разработка

Код Mini-App написан с помощью Claude и OpenAI Codex. Архитектурные решения, проверка результата и
ответственность за публикацию остаются за владельцем проекта.

Локальная разработка проверена на Apple Silicon macOS с Python 3.14.7, uv 0.12.6,
Node.js 24.19.0 LTS, pnpm 11.24.0, Docker Desktop и PowerShell 7. Отдельная инструкция находится в
[`docs/DEV_ENVIRONMENT.md`](docs/DEV_ENVIRONMENT.md).

## Лицензия и бренд

Исходный код Mini-App распространяется по лицензии
[`GNU Affero General Public License v3.0 only`](LICENSE). Если изменённая версия работает по сети для
других пользователей, её соответствующий исходный код также должен быть доступен по условиям AGPL.

Название Flowvy, логотип и фирменные изображения не передаются по AGPL. Изменённые версии должны
использовать собственное название и оформление; подробные правила находятся в
[`TRADEMARKS.md`](TRADEMARKS.md). Лицензии и сведения о сторонних компонентах перечислены в
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

---

<div align="center">
<sub>Flowvy Mini App — открытый кабинет для самостоятельного размещения провайдерами Remnawave.</sub>
</div>
