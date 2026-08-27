# Установка Mini-App на сервер

Этот путь повторяет подход Remnawave: два конфигурационных файла в `/opt/mini-app`, один `.env`,
готовый образ из GHCR и обычные команды Docker Compose. Он не требует клонировать репозиторий или
собирать приложение на сервере.

> [!WARNING]
> Mini-App остаётся MVP. Контейнерный контур проверяется автоматически без внешних сервисов, но
> реальный запуск с Telegram и Remnawave, восстановление PostgreSQL из резервной копии и независимая
> проверка безопасности пока не выполнены.

## Что понадобится

- Linux-сервер с Docker Engine и Docker Compose v2;
- домен или поддомен, направленный на сервер;
- внешний обратный прокси-сервер с действующим HTTPS-сертификатом;
- Telegram-бот и его токен от BotFather;
- установленная Remnawave и API-токен для неё;
- Telegram ID хотя бы одного администратора.

Основной Compose не занимает порты `80` и `443`: Mini-App слушает только
`127.0.0.1:${APP_PORT:-8001}`. Это позволяет использовать уже установленный Caddy, Nginx, Traefik или
другой обратный прокси-сервер рядом с Remnawave.

## 1. Скачать конфигурацию

Выполните от `root`:

```bash
sudo -i
mkdir -p /opt/mini-app && cd /opt/mini-app

curl -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/flowvy/mini-app/main/docker-compose.yml
curl -fsSLo .env \
  https://raw.githubusercontent.com/flowvy/mini-app/main/.env.example
chmod 600 .env
```

Эти ссылки начнут работать без авторизации после публикации репозитория. Для анонимного
`docker compose pull` пакет `ghcr.io/flowvy/mini-app` тоже должен иметь видимость `Public`.

## 2. Сгенерировать локальные секреты

Mini-App не использует отдельный `APP_SECRET`. Для новой установки нужны случайный пароль
PostgreSQL и секрет Telegram webhook:

```bash
cd /opt/mini-app

POSTGRES_PASSWORD="$(openssl rand -hex 24)"
TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 32)"

sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" .env
sed -i "s|^TELEGRAM_WEBHOOK_SECRET=.*|TELEGRAM_WEBHOOK_SECRET=${TELEGRAM_WEBHOOK_SECRET}|" .env

unset POSTGRES_PASSWORD TELEGRAM_WEBHOOK_SECRET
```

`REMNAWAVE_WEBHOOK_SECRET` не генерируется заново: он обязан совпадать с
`WEBHOOK_SECRET_HEADER` в Remnawave. Если Remnawave находится на этом же сервере в
`/opt/remnawave`, значение можно перенести, не выводя его в терминал:

```bash
cd /opt/mini-app

REMNAWAVE_WEBHOOK_SECRET="$(awk -F= '/^WEBHOOK_SECRET_HEADER=/{sub(/^[^=]*=/, ""); gsub(/\r/, ""); print; exit}' /opt/remnawave/.env)"
if [[ ! "$REMNAWAVE_WEBHOOK_SECRET" =~ ^[A-Za-z0-9]{32,}$ ]]; then
  echo "WEBHOOK_SECRET_HEADER не найден или имеет неверный формат" >&2
  unset REMNAWAVE_WEBHOOK_SECRET
  exit 1
fi

sed -i "s|^REMNAWAVE_WEBHOOK_SECRET=.*|REMNAWAVE_WEBHOOK_SECRET=${REMNAWAVE_WEBHOOK_SECRET}|" .env
unset REMNAWAVE_WEBHOOK_SECRET
```

Если Remnawave установлена на другом сервере, скопируйте значение вручную через защищённый канал.
Не публикуйте `.env`, не вставляйте его в issue и не отправляйте содержимое в чат.

## 3. Заполнить `.env`

```bash
nano /opt/mini-app/.env
```

Обязательные значения:

- `APP_DOMAIN` — домен без `https://` и пути, например `app.example.com`;
- `BOT_TOKEN` — токен Telegram-бота от BotFather;
- `ADMIN_TELEGRAM_IDS` — один или несколько Telegram ID через запятую;
- `REMNAWAVE_URL` — HTTPS-адрес панели без завершающего пути;
- `REMNAWAVE_API_TOKEN` — API-токен, созданный в Remnawave;
- `REMNAWAVE_WEBHOOK_SECRET` — существующий `WEBHOOK_SECRET_HEADER` Remnawave.

Поля Kuma, Beszel, Tribute и R2 необязательны. Для R2 либо заполните все четыре значения, либо
оставьте все четыре пустыми. `DEBUG` намеренно зафиксирован в Compose как `false`.

По умолчанию используется `MINI_APP_VERSION=latest`. Для предсказуемого развёртывания можно указать
конкретный стабильный выпуск, например `MINI_APP_VERSION=1.2.3`; не придумывайте номер, которого нет
в разделе Releases или Packages.

## 4. Настроить домен и HTTPS

Создайте DNS `A`/`AAAA` запись домена и направьте обратный прокси-сервер на `127.0.0.1:8001`.
Минимальный блок Caddy выглядит так:

```caddyfile
app.example.com {
    reverse_proxy 127.0.0.1:8001
}
```

Если изменён `APP_PORT`, укажите тот же порт в обратном прокси-сервере. Он должен сохранять исходный
заголовок `Host`; приложение отклоняет остальные хосты. Не направляйте публичный DNS прямо на порт
`8001` и не меняйте привязку к loopback-адресу на `0.0.0.0`.

В BotFather укажите `https://APP_DOMAIN` как URL основной Mini App. В Remnawave добавьте получателя
webhook:

```text
https://APP_DOMAIN/api/webhooks/remnawave
```

Подпись этого webhook использует тот же `WEBHOOK_SECRET_HEADER`, который записан в
`REMNAWAVE_WEBHOOK_SECRET`. Telegram webhook `https://APP_DOMAIN/webhook` приложение регистрирует
самостоятельно при запуске.

## 5. Запустить

```bash
cd /opt/mini-app
docker compose config --quiet
docker compose up -d && docker compose logs -f -t
```

Первый запуск выполняет миграции Alembic, затем запускает один экземпляр приложения. Несколько
реплик пока не поддерживаются: этот процесс также управляет Telegram и фоновыми задачами.

Выйдите из просмотра журналов сочетанием `Ctrl+C`; контейнеры продолжат работать. Проверьте:

```bash
docker compose ps -a
curl -fsS https://app.example.com/api/health
curl -fsS https://app.example.com/api/ready
```

Ожидается `healthy` у `app`, `postgres` и `redis`, код `0` у `migrate`, `{"status":"ok"}` у
`/api/health` и состояние `ready` у `/api/ready`. Маршрут `/api/debug/pulse` снаружи должен отвечать
`404`.

## Обновление

Перед обновлением проверьте заметки о выпуске и сделайте резервную копию PostgreSQL. Минимальная
локальная копия:

```bash
cd /opt/mini-app
mkdir -p backups
chmod 700 backups
docker compose exec -T postgres \
  pg_dump -U flowvy -d flowvy -Fc > "backups/mini-app-$(date +%Y%m%d-%H%M%S).dump"
```

После этого обновление выполняется одной последовательностью:

```bash
cd /opt/mini-app && docker compose pull && docker compose down && docker compose up -d && docker compose logs -f
```

`migrate` применит новые миграции до запуска приложения. Команда создаёт короткий простой; бесшовное
обновление несколькими репликами в текущую схему не входит. Создание файла `pg_dump` проверяет только
резервное копирование: процедура восстановления на реальном сервере ещё должна быть отдельно
отрепетирована.

Чтобы получить изменения самого Compose или новые переменные, перед обновлением сравните текущие
файлы с `.env.example` и скачайте свежий `docker-compose.yml`. Не заменяйте рабочий `.env` примером.

## Откат версии

Если выпуск не требует несовместимого отката базы данных, укажите прежний существующий tag:

```bash
cd /opt/mini-app
sed -i 's/^MINI_APP_VERSION=.*/MINI_APP_VERSION=1.2.3/' .env
docker compose pull && docker compose down && docker compose up -d && docker compose logs -f
```

`1.2.3` здесь только пример. Автоматического downgrade Alembic нет: если новый выпуск уже изменил
схему несовместимо, остановитесь и используйте проверенный план восстановления из резервной копии.

## Что хранится на сервере

- PostgreSQL находится в Docker volume `mini-app_postgres-data` и переживает `docker compose down`;
- Redis используется как кэш и для ограниченной координации, поэтому в production Compose он
  намеренно не хранится на диске;
- `.env` содержит секреты и должен оставаться только в `/opt/mini-app` с правами `600`;
- `docker compose down -v` удаляет PostgreSQL volume и не является обычной командой обслуживания.

Архитектурная граница описана в [ADR 0006](decisions/0006-production-container-and-delivery.md), а
оставшиеся эксплуатационные риски — в [`OPERATIONS.md`](OPERATIONS.md).

## Проверенные источники подхода

Сценарий установки и обновления повторяет официальные инструкции
[Remnawave Panel](https://docs.rw/install/remnawave-panel) и
[Remnawave Upgrading](https://docs.rw/install/upgrading/). Ожидание `service_healthy` и успешного
завершения миграции основано на [порядке запуска Docker Compose](https://docs.docker.com/compose/how-tos/startup-order/),
а публикация образа — на официальной документации
[GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).
Контракты повторно проверены 2026-08-27.
