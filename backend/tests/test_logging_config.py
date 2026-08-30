"""Regression tests for the production console logging contract."""

from __future__ import annotations

import logging
import subprocess
import sys

from flowvy.logging_config import (
    FlowvyConsoleRenderer,
    SuccessfulReadinessFilter,
)


def test_renderer_uses_operator_facing_shape() -> None:
    renderer = FlowvyConsoleRenderer()

    rendered = renderer(
        None,
        "info",
        {
            "timestamp": "2026-08-30 06:06:59.443",
            "level": "info",
            "logger": "uvicorn.error",
            "event": "Application startup complete.",
        },
    )

    assert rendered == (
        "[app] 2026-08-30 06:06:59.443 INFO  [Server] Application startup complete."
    )


def test_structlog_and_stdlib_share_one_format() -> None:
    completed = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import logging, structlog; "
                "from flowvy.logging_config import configure_logging; "
                "configure_logging(debug=False); "
                "structlog.get_logger('Workers').info("
                "'Background workers are ready', count=4); "
                "logging.getLogger('flowvy.services.webhook_retention').warning("
                "'Cleanup delayed')"
            ),
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    output = completed.stderr
    assert "INFO  [Workers] Background workers are ready - count=4" in output
    assert "WARN  [WebhookRetention] Cleanup delayed" in output


def test_successful_readiness_filter_keeps_failures() -> None:
    readiness_filter = SuccessfulReadinessFilter()

    successful = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:1234", "GET", "/api/ready", "1.1", 200),
        None,
    )
    failed = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:1234", "GET", "/api/ready", "1.1", 503),
        None,
    )

    assert readiness_filter.filter(successful) is False
    assert readiness_filter.filter(failed) is True
