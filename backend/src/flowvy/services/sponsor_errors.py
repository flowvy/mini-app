"""Sponsor domain errors shared by offer and checkout services."""


class SponsorOfferError(ValueError):
    """Safe offer validation error."""

    code = "sponsor_offer_invalid"


class SponsorOfferNotFoundError(SponsorOfferError):
    """Requested offer is absent."""

    code = "sponsor_offer_not_found"


class SponsorOfferDestinationMissingError(SponsorOfferError):
    """The selected provider item has no configured checkout destination."""

    code = "tribute_subscription_destination_missing"


class SponsorCheckoutConflictError(ValueError):
    """A checkout cannot safely start in the user's current paid state."""


__all__ = [
    "SponsorCheckoutConflictError",
    "SponsorOfferDestinationMissingError",
    "SponsorOfferError",
    "SponsorOfferNotFoundError",
]
