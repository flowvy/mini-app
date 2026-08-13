"""Shared HTTP schema conventions."""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model for camelCase HTTP contracts."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


__all__ = ["CamelModel"]
