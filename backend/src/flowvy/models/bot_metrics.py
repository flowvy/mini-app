"""Bot metrics history ORM model."""

from __future__ import annotations

import datetime

from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column

from flowvy.models.base import Base


class BotMetricsHistory(Base):
    """Periodic snapshot of bot-level metrics."""

    __tablename__ = "bot_metrics_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    timestamp: Mapped[datetime.datetime] = mapped_column(
        index=True,
        server_default=func.now(),
    )
    total_users: Mapped[int]
    active_users_1h: Mapped[int]
    active_users_24h: Mapped[int]
    api_requests_count: Mapped[int]

    def __repr__(self) -> str:
        """Return dev-friendly representation."""
        return f"<BotMetricsHistory id={self.id} ts={self.timestamp}>"
