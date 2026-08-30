"""Entrypoint: start FastAPI with uvicorn."""

from __future__ import annotations

import structlog
import uvicorn

from flowvy.config import Settings
from flowvy.logging_config import configure_logging


def main() -> None:
    """Run the Flowvy backend server."""
    settings = Settings()
    configure_logging(debug=settings.debug)
    structlog.get_logger("Application").info(
        "Starting Flowvy",
        version=settings.version,
        mode="debug" if settings.debug else "production",
    )
    uvicorn.run(
        "flowvy.api.factory:create_app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        factory=True,
        log_config=None,
    )


if __name__ == "__main__":
    main()
