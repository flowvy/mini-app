"""Locale normalization, fallback, and packaged product-copy loading."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from importlib.resources import files

from pydantic import BaseModel

DEFAULT_LOCALE = "en"
_LOCALE_RE = re.compile(r"^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$")
_PLACEHOLDER_RE = re.compile(r"\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}")


def normalize_locale(value: str | None, *, fallback: str = DEFAULT_LOCALE) -> str:
    """Return one bounded lowercase BCP-47-like locale tag."""

    candidate = (value or "").strip().replace("_", "-").lower()
    if len(candidate) <= 35 and _LOCALE_RE.fullmatch(candidate):
        return candidate
    return fallback


def locale_candidates(requested: str | None, default: str = DEFAULT_LOCALE) -> tuple[str, ...]:
    """Build exact/base/default fallback candidates without duplicates."""

    requested_locale = normalize_locale(requested, fallback=normalize_locale(default))
    default_locale = normalize_locale(default)
    candidates = (
        requested_locale,
        requested_locale.partition("-")[0],
        default_locale,
        default_locale.partition("-")[0],
        DEFAULT_LOCALE,
    )
    return tuple(dict.fromkeys(candidates))


def locale_from_accept_language(value: str | None, default: str = DEFAULT_LOCALE) -> str:
    """Resolve the first valid language range from a bounded Accept-Language value."""

    for item in (value or "")[:256].split(","):
        language_range = item.partition(";")[0].strip()
        if language_range == "*":
            continue
        normalized = normalize_locale(language_range, fallback="")
        if normalized:
            return normalized
    return normalize_locale(default)


def normalize_locale_map[ModelT: BaseModel](
    value: object,
    model: type[ModelT],
    *,
    max_locales: int = 20,
) -> dict[str, ModelT]:
    """Validate and normalize a locale-keyed map for a typed content model."""

    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("Localized content must be an object")
    if len(value) > max_locales:
        raise ValueError(f"Localized content supports at most {max_locales} locales")

    normalized: dict[str, ModelT] = {}
    for raw_locale, raw_content in value.items():
        if not isinstance(raw_locale, str):
            raise ValueError("Locale keys must be strings")
        locale = normalize_locale(raw_locale, fallback="")
        if not locale:
            raise ValueError(f"Invalid locale tag: {raw_locale}")
        if locale in normalized:
            raise ValueError(f"Duplicate normalized locale tag: {locale}")
        normalized[locale] = model.model_validate(raw_content)
    return normalized


def dump_locale_map(value: dict[str, BaseModel]) -> dict[str, dict[str, object]]:
    """Serialize a validated locale map for JSONB using internal snake_case keys."""

    return {
        locale: content.model_dump(exclude_none=True)
        for locale, content in value.items()
        if content.model_dump(exclude_none=True)
    }


def resolve_locale_map[ModelT: BaseModel](
    value: object,
    model: type[ModelT],
    requested: str | None,
    default: str = DEFAULT_LOCALE,
) -> ModelT | None:
    """Resolve one typed locale entry or return ``None`` when no override exists."""

    localized = normalize_locale_map(value, model)
    for locale in locale_candidates(requested, default):
        content = localized.get(locale)
        if content is not None:
            return content
    return None


def placeholders(value: str) -> set[str]:
    """Return all template placeholders used by one operator-authored string."""

    return set(_PLACEHOLDER_RE.findall(value))


def render_placeholders(value: str, context: dict[str, str]) -> str:
    """Render a previously validated template without evaluating arbitrary expressions."""

    return _PLACEHOLDER_RE.sub(lambda match: context[match.group(1)], value)


@lru_cache(maxsize=20)
def _product_catalog(locale: str) -> dict[str, object] | None:
    resource = files("flowvy").joinpath("locales", f"{locale}.json")
    if not resource.is_file():
        return None
    return json.loads(resource.read_text(encoding="utf-8"))


def product_text(locale: str | None, key: str) -> str:
    """Read a required bot product string through locale fallback."""

    for candidate in locale_candidates(locale):
        catalog = _product_catalog(candidate)
        if catalog is None:
            continue
        value: object = catalog
        for part in key.split("."):
            if not isinstance(value, dict) or part not in value:
                value = None
                break
            value = value[part]
        if isinstance(value, str):
            return value
    raise KeyError(f"Missing product locale key: {key}")


__all__ = [
    "DEFAULT_LOCALE",
    "dump_locale_map",
    "locale_candidates",
    "locale_from_accept_language",
    "normalize_locale",
    "normalize_locale_map",
    "placeholders",
    "product_text",
    "render_placeholders",
    "resolve_locale_map",
]
