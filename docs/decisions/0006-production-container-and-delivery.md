# 0006: Production-контейнер и доставка Mini-App

Status: accepted
Date: 2026-08-27
Owners: Flowvy

## Context

В репозитории были только локальные PostgreSQL/Redis Compose services, отдельные Vite и FastAPI
процессы и GitHub Release без исполняемого артефакта. Самостоятельная установка требовала бы
клонировать исходники и вручную воспроизводить сборку, миграции, сеть и порядок запуска.

FastAPI lifespan владеет Telegram polling/webhook lifecycle и несколькими фоновыми worker. Поэтому
простое горизонтальное масштабирование application process создало бы дублирующихся владельцев.
Frontend обращается только к same-origin BFF, а PostgreSQL остаётся единственным долговечным
источником business state; Redis не является источником auth, role или payment truth.

## Decision

1. Один multi-stage `Dockerfile` собирает React frontend и frozen Python backend в общий
   non-root image. FastAPI раздаёт frontend shell/assets и сохраняет отдельные `/api` и `/webhook`
   boundaries.
2. Публичное имя образа — `ghcr.io/flowvy/mini-app`. Bare SemVer tag workflow публикует
   `linux/amd64` и `linux/arm64`; только стабильный release обновляет `latest`.
3. Root `docker-compose.yml` запускает отдельные PostgreSQL, непостоянный Redis, одноразовый
   Alembic `migrate` и ровно один `app`. Приложение стартует только после healthy dependencies и
   успешной миграции.
4. Application port доступен host только как `127.0.0.1:${APP_PORT}:8001`. Domain allowlist
   проверяется `TrustedHostMiddleware`; `DEBUG=false` закреплён в Compose. TLS и публичный ingress
   принадлежат внешнему reverse proxy.
5. PostgreSQL хранится в named volume. Redis не получает volume, потому что его потеря не должна
   менять durable authorization, subscription или payment truth.
6. Установка использует `/opt/mini-app`, скачанные `docker-compose.yml` и `.env.example`, локально
   сгенерированные secrets и стандартный Compose lifecycle. Рабочий `.env` не входит в image или
   repository.
7. Release workflow публикует image, но не подключается к серверу, Telegram или providers и не
   запускает production migrations. Миграции выполняет installation Compose при `up`.

## Alternatives

- **Отдельные Nginx/frontend и FastAPI images** — отклонено для первого production path: добавляет
  второй release artifact и proxy configuration внутри Compose без новой trust boundary.
- **Vite preview как production frontend** — отклонено: development preview server не является
  production delivery layer и потребовал бы отдельной cross-origin конфигурации.
- **Reverse proxy внутри основного Compose** — отклонено: конфликтует с уже работающими Remnawave
  proxy/ports и мешает владельцу выбрать Caddy, Nginx или Traefik.
- **Миграция внутри каждого app startup** — отклонено: отдельный завершившийся service делает порядок
  запуска наблюдаемым и блокирует приложение при ошибке схемы.
- **Несколько application replicas** — отложено до появления отдельного leader/queue ownership для
  Telegram lifecycle и background workers.
- **Сборка на пользовательском сервере из Git clone** — остаётся возможной для разработчика, но не
  является основным installation contract.

## Consequences

- Серверу нужны только Docker Compose, два public files, `.env`, домен и внешний HTTPS proxy.
- Frontend и API имеют один origin; production container не зависит от Node.js runtime.
- `docker compose pull/down/up` предсказуем, но вызывает простой и повторно выполняет forward
  migrations. Автоматический schema downgrade отсутствует.
- Публичность GitHub repository не гарантирует публичность GHCR package: перед первым общедоступным
  выпуском владелец отдельно проверяет обе настройки.
- Приложение имеет health/readiness и bounded container logs, но это не заменяет monitoring,
  alerting, backup/restore rehearsal, capacity planning и incident ownership.
- Образ использует pinned base digests and locked dependencies; их обновление должно синхронно
  менять Dockerfile, verification coverage и release evidence.

## Verification and rollout

- `scripts/verify-container.ps1` собирает image, запускает disposable Compose project без внешних
  credentials, проверяет migration exit, health/readiness, frontend shell/client route и отсутствие
  debug route, затем удаляет только свой project и volume.
- CI выполняет тот же smoke после backend/frontend gates без публикации image.
- Release workflow сначала требует successful CI tagged `main` commit, затем публикует multi-platform
  image и только после этого создаёт GitHub Release.
- Перед первым публичным запуском владелец делает repository и GHCR package публичными, проверяет
  anonymous pull, настраивает reverse proxy/TLS, создаёт PostgreSQL backup и выполняет controlled
  Telegram/Remnawave acceptance.
- Откат к прежнему image tag допустим только при совместимой схеме; иначе требуется заранее
  отрепетированное восстановление PostgreSQL.
