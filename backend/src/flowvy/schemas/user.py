"""User API schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class UserResponse(BaseModel):
    """Public representation of a user."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str | None
    full_name: str
    role: str
    is_active: bool
