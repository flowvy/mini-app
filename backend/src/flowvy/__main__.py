"""Entrypoint: start FastAPI with uvicorn."""

from __future__ import annotations

import uvicorn

from flowvy.config import Settings


def main() -> None:
    """Run the Flowvy backend server."""
    settings = Settings()
    uvicorn.run(
        "flowvy.api.factory:create_app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        factory=True,
    )


if __name__ == "__main__":
    main()
