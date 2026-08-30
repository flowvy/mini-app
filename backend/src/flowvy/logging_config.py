"""Unified human-readable logging for application and third-party loggers."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from typing import TextIO

import structlog
from structlog.typing import EventDict, Processor, WrappedLogger

_COMPONENT_ALIASES = {
    "root": "Application",
    "uvicorn.error": "Server",
    "uvicorn.access": "HTTP",
    "uvicorn.asgi": "Server",
    "flowvy.api.factory": "Application",
}
_LEVEL_ALIASES = {
    "WARNING": "WARN",
    "CRITICAL": "FATAL",
}


def _add_timestamp(
    _logger: WrappedLogger,
    _method_name: str,
    event_dict: EventDict,
) -> EventDict:
    """Add one UTC timestamp with millisecond precision."""
    event_dict["timestamp"] = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    return event_dict


def _component_name(logger_name: object) -> str:
    """Turn a logger name into a short operator-facing component name."""
    normalized = str(logger_name or "Application")
    if normalized in _COMPONENT_ALIASES:
        return _COMPONENT_ALIASES[normalized]
    if "." not in normalized and "_" not in normalized:
        return normalized
    leaf = normalized.rsplit(".", maxsplit=1)[-1]
    return "".join(part.capitalize() for part in leaf.split("_")) or "Application"


def _render_value(value: object) -> str:
    """Render structured context consistently without Python-only repr noise."""
    if isinstance(value, str) and value and not any(char.isspace() for char in value):
        return value
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
    except TypeError, ValueError:
        return repr(value)


class FlowvyConsoleRenderer:
    """Render logs in the process/time/level/component shape used by operators."""

    def __init__(self, *, process_name: str = "app") -> None:
        self._process_name = process_name

    def __call__(
        self,
        _logger: WrappedLogger,
        method_name: str,
        event_dict: EventDict,
    ) -> str:
        timestamp = str(event_dict.pop("timestamp", ""))
        raw_level = str(event_dict.pop("level", method_name)).upper()
        level = _LEVEL_ALIASES.get(raw_level, raw_level)
        component = _component_name(event_dict.pop("logger", "Application"))
        event = str(event_dict.pop("event", ""))
        exception = event_dict.pop("exception", None)
        stack = event_dict.pop("stack", None)

        context = " ".join(
            f"{key}={_render_value(value)}"
            for key, value in sorted(event_dict.items())
            if value is not None
        )
        line = (f"[{self._process_name}] {timestamp} {level:<5} [{component}] {event}").rstrip()
        if context:
            line = f"{line} - {context}"
        if exception:
            line = f"{line}\n{exception}"
        if stack:
            line = f"{line}\n{stack}"
        return line


class SuccessfulReadinessFilter(logging.Filter):
    """Hide successful Docker health probes while retaining readiness failures."""

    def filter(self, record: logging.LogRecord) -> bool:
        if record.name != "uvicorn.access" or not isinstance(record.args, tuple):
            return True
        if len(record.args) < 5:
            return True
        _client, method, path, _http_version, status_code = record.args[:5]
        try:
            status = int(status_code)
        except TypeError, ValueError:
            return True
        request_path = str(path).partition("?")[0]
        return not (method == "GET" and request_path == "/api/ready" and status < 400)


def configure_logging(*, debug: bool, stream: TextIO | None = None) -> None:
    """Route structlog, stdlib, and Uvicorn through one console formatter."""
    shared_processors: list[Processor] = [
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        _add_timestamp,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            FlowvyConsoleRenderer(),
        ],
    )
    handler = logging.StreamHandler(stream or sys.stderr)
    handler.addFilter(SuccessfulReadinessFilter())
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.DEBUG if debug else logging.INFO)

    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access", "uvicorn.asgi"):
        framework_logger = logging.getLogger(logger_name)
        framework_logger.handlers.clear()
        framework_logger.propagate = True

    for noisy_logger_name in ("asyncio", "httpcore", "httpx", "sqlalchemy.engine"):
        logging.getLogger(noisy_logger_name).setLevel(logging.WARNING)

    logging.captureWarnings(True)
