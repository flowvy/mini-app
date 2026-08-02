"""Entrypoint: start FastAPI with uvicorn."""

from __future__ import annotations

import uvicorn

from flowvy.config import Settings


def main() -> None:
    """Run the Flowvy backend server."""
    settings = Settings()
    uvicorn.run(
        "flowvy.api.factory:create_app",
        host="127.0.0.1",
        port=8001,
        reload=settings.debug,
        factory=True,
    )


if __name__ == "__main__":
    main()
