"""HTTP locale negotiation shared by public BFF routes."""

from fastapi import Request

from flowvy.localization import locale_from_accept_language


def request_locale(request: Request) -> str:
    """Resolve the requested UI locale from the standard request header."""

    return locale_from_accept_language(request.headers.get("accept-language"))


__all__ = ["request_locale"]
