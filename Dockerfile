# syntax=docker/dockerfile:1.18

FROM node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995 AS frontend-build

WORKDIR /build/frontend
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build


FROM python:3.14.7-slim-bookworm@sha256:416f0db2a2b561945630cef9877a7ea0581b27449eb9fd9df42f03e1b74b5b63 AS backend-build

COPY --from=ghcr.io/astral-sh/uv:0.12.6@sha256:88bc6eb1ccd4b82efd0e1b530caffabddf50dc2bf612e66c14ea25b8ee8a4d3d /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
RUN uv sync --frozen --no-dev --no-editable


FROM python:3.14.7-slim-bookworm@sha256:416f0db2a2b561945630cef9877a7ea0581b27449eb9fd9df42f03e1b74b5b63 AS runtime

ARG VERSION=0.0.0
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Mini-App" \
      org.opencontainers.image.description="Telegram Mini App and bot for Remnawave providers" \
      org.opencontainers.image.source="https://github.com/flowvy/mini-app" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

ENV PATH="/app/backend/.venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/frontend \
    HOST=0.0.0.0 \
    PORT=8001

RUN groupadd --gid 10001 miniapp \
    && useradd --uid 10001 --gid miniapp --no-create-home --home-dir /nonexistent miniapp

WORKDIR /app/backend
COPY --from=backend-build --chown=miniapp:miniapp /app/backend/.venv /app/backend/.venv
COPY --from=backend-build --chown=miniapp:miniapp /app/backend/alembic.ini /app/backend/alembic.ini
COPY --from=backend-build --chown=miniapp:miniapp /app/backend/migrations /app/backend/migrations
COPY --from=frontend-build --chown=miniapp:miniapp /build/frontend/dist /app/frontend

USER 10001:10001
EXPOSE 8001
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/api/health', timeout=2).read()"]
CMD ["python", "-m", "flowvy"]
