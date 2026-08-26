"""Cloudflare R2 signing boundary without live provider calls."""

from __future__ import annotations

import httpx
import pytest

from flowvy.config import Settings
from flowvy.services.r2_storage import R2Storage


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        r2_account_id="a" * 32,
        r2_bucket_name="test-support-bucket",
        r2_access_key_id="EXAMPLE_ACCESS_KEY",
        r2_secret_access_key="EXAMPLE_SECRET_KEY",
    )


@pytest.mark.asyncio
async def test_presigned_upload_binds_content_type_and_sha256_headers() -> None:
    async with httpx.AsyncClient() as http:
        url, headers = R2Storage(_settings(), http).presign_upload(
            key="support/objects/1/example",
            content_type="application/zip",
            checksum_sha256="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            expires_seconds=600,
        )

    assert url.startswith("https://")
    assert "test-support-bucket/support/objects/1/example" in url
    assert headers == {
        "Content-Type": "application/zip",
        "x-amz-checksum-sha256": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    }


@pytest.mark.asyncio
async def test_head_sends_signed_checksum_mode_and_reads_verified_metadata() -> None:
    checksum = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "HEAD"
        assert request.headers["x-amz-checksum-mode"] == "ENABLED"
        return httpx.Response(
            200,
            headers={
                "content-length": "42",
                "content-type": "text/plain; charset=utf-8",
                "x-amz-checksum-sha256": checksum,
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        metadata = await R2Storage(_settings(), http).head("support/objects/1/example")

    assert metadata.size_bytes == 42
    assert metadata.content_type == "text/plain"
    assert metadata.checksum_sha256 == checksum
