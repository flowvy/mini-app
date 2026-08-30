# Установка Mini-App

## 1. Установить Docker

```bash
sudo curl -fsSL https://get.docker.com | sh
```

## 2. Скачать файлы

```bash
sudo -i
mkdir -p /opt/mini-app && cd /opt/mini-app

curl -o docker-compose.yml https://raw.githubusercontent.com/flowvy/mini-app/main/docker-compose.yml && \
curl -o .env https://raw.githubusercontent.com/flowvy/mini-app/main/.env.example
chmod 600 .env
```

## 3. Заполнить `.env`

```bash
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env && \
sed -i "s/^TELEGRAM_WEBHOOK_SECRET=.*/TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)/" .env

nano .env
```

Заполните:

- `APP_DOMAIN`
- `BOT_TOKEN`
- `ADMIN_TELEGRAM_IDS`
- `REMNAWAVE_URL`
- `REMNAWAVE_API_TOKEN`
- `REMNAWAVE_WEBHOOK_SECRET`

## 4. Запустить Mini-App

```bash
cd /opt/mini-app
docker compose up -d && docker compose logs -f
```

`Ctrl+C` закроет просмотр журналов, но не остановит контейнеры.

## Обновление

```bash
cd /opt/mini-app && docker compose pull && docker compose down && docker compose up -d && docker compose logs -f
```
