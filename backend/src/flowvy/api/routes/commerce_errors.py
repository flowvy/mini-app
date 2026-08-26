"""Stable HTTP mappings for commerce domain errors."""

from fastapi import HTTPException, status

from flowvy.services.commerce import CommerceRuleError, CommerceRuleNotFoundError
from flowvy.services.sponsor import SponsorOfferError, SponsorOfferNotFoundError


def commerce_rule_http_error(exc: CommerceRuleError) -> HTTPException:
    code = (
        status.HTTP_404_NOT_FOUND
        if isinstance(exc, CommerceRuleNotFoundError)
        else status.HTTP_422_UNPROCESSABLE_CONTENT
    )
    return HTTPException(code, str(exc))


def sponsor_offer_http_error(exc: SponsorOfferError) -> HTTPException:
    code = (
        status.HTTP_404_NOT_FOUND
        if isinstance(exc, SponsorOfferNotFoundError)
        else status.HTTP_422_UNPROCESSABLE_CONTENT
    )
    return HTTPException(code, detail={"code": exc.code, "message": str(exc)})


__all__ = ["commerce_rule_http_error", "sponsor_offer_http_error"]
