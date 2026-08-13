"""Provider-neutral cryptographic webhook primitives."""

from __future__ import annotations

import hashlib
import hmac


def verify_hmac_sha256_hex(body: bytes, secret: str, signature: str) -> bool:
    """Compare a raw-body HMAC-SHA256 against an exact hexadecimal signature."""
    if len(signature) != hashlib.sha256().digest_size * 2:
        return False
    try:
        supplied = bytes.fromhex(signature)
    except ValueError:
        return False
    if len(supplied) != hashlib.sha256().digest_size:
        return False
    expected = hmac.digest(secret.encode(), body, hashlib.sha256)
    return hmac.compare_digest(expected, supplied)


def sha256_hex(body: bytes) -> str:
    """Return a lowercase SHA-256 digest for exact-delivery identity."""
    return hashlib.sha256(body).hexdigest()
