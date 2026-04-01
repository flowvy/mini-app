"""SQLAlchemy declarative base and shared column types."""

from __future__ import annotations

import datetime
import uuid
from typing import Annotated

from sqlalchemy import BigInteger, func
from sqlalchemy.orm import DeclarativeBase, mapped_column

# Reusable annotated types for common columns.
uuid_pk = Annotated[
    uuid.UUID,
    mapped_column(primary_key=True, server_default=func.gen_random_uuid()),
]
bigint_pk = Annotated[
    int,
    mapped_column(BigInteger, primary_key=True, autoincrement=False),
]
created_at = Annotated[
    datetime.datetime,
    mapped_column(server_default=func.now()),
]
updated_at = Annotated[
    datetime.datetime,
    mapped_column(server_default=func.now(), onupdate=func.now()),
]


class Base(DeclarativeBase):
    """Base class for all ORM models."""
