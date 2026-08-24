"""Private Cloudflare R2 boundary for Support attachment objects."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from urllib.parse import quote

import boto3
import httpx
from botocore.client import BaseClient
from botocore.config import Config

from flowvy.config import Settings


class R2StorageError(Exception):
    """Stable storage failure without credentials, signed URLs or upstream bodies."""


class R2StorageUnavailableError(R2StorageError):
    pass


class R2ObjectNotFoundError(R2StorageError):
    pass


@dataclass(frozen=True, slots=True)
class R2ObjectMetadata:
    size_bytes: int
    content_type: str
    checksum_sha256: str | None


class R2Storage:
    """Generate SigV4 URLs locally and perform provider I/O through async httpx."""

    def __init__(self, settings: Settings, http: httpx.AsyncClient) -> None:
        self._settings = settings
        self._http = http
        self._client: BaseClient | None = None
        if settings.r2_configured:
            self._client = boto3.client(
                "s3",
                region_name="auto",
                endpoint_url=settings.r2_endpoint,
                aws_access_key_id=settings.r2_access_key_id.get_secret_value(),
                aws_secret_access_key=settings.r2_secret_access_key.get_secret_value(),
                config=Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "path"},
                ),
            )

    @property
    def configured(self) -> bool:
        return self._client is not None

    def presign_upload(
        self,
        *,
        key: str,
        content_type: str,
        checksum_sha256: str,
        expires_seconds: int,
    ) -> tuple[str, dict[str, str]]:
        client = self._require_client()
        params = {
            "Bucket": self._settings.r2_bucket_name,
            "Key": key,
            "ContentType": content_type,
            "ChecksumSHA256": checksum_sha256,
        }
        url = client.generate_presigned_url(
            "put_object",
            Params=params,
            ExpiresIn=expires_seconds,
            HttpMethod="PUT",
        )
        return url, {
            "Content-Type": content_type,
            "x-amz-checksum-sha256": checksum_sha256,
        }

    def presign_download(
        self,
        *,
        key: str,
        file_name: str,
        expires_seconds: int,
    ) -> str:
        client = self._require_client()
        disposition = f"attachment; filename*=UTF-8''{quote(file_name, safe='')}"
        return client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self._settings.r2_bucket_name,
                "Key": key,
                "ResponseContentDisposition": disposition,
            },
            ExpiresIn=expires_seconds,
            HttpMethod="GET",
        )

    async def head(self, key: str) -> R2ObjectMetadata:
        client = self._require_client()
        url = client.generate_presigned_url(
            "head_object",
            Params={
                "Bucket": self._settings.r2_bucket_name,
                "Key": key,
                "ChecksumMode": "ENABLED",
            },
            ExpiresIn=60,
            HttpMethod="HEAD",
        )
        response = await self._send(
            "HEAD",
            url,
            headers={"x-amz-checksum-mode": "ENABLED"},
        )
        if response.status_code == 404:
            raise R2ObjectNotFoundError("R2 object was not found")
        if not 200 <= response.status_code < 300:
            raise R2StorageUnavailableError("R2 object metadata is unavailable")
        try:
            size_bytes = int(response.headers["content-length"])
        except (KeyError, ValueError) as exc:
            raise R2StorageUnavailableError("R2 returned invalid object metadata") from exc
        return R2ObjectMetadata(
            size_bytes=size_bytes,
            content_type=response.headers.get("content-type", "").partition(";")[0].lower(),
            checksum_sha256=response.headers.get("x-amz-checksum-sha256"),
        )

    async def delete(self, key: str) -> None:
        client = self._require_client()
        url = client.generate_presigned_url(
            "delete_object",
            Params={"Bucket": self._settings.r2_bucket_name, "Key": key},
            ExpiresIn=60,
            HttpMethod="DELETE",
        )
        response = await self._send("DELETE", url)
        if response.status_code not in {200, 204, 404}:
            raise R2StorageUnavailableError("R2 object could not be deleted")

    async def check(self) -> bool:
        client = self._require_client()
        url = client.generate_presigned_url(
            "head_bucket",
            Params={"Bucket": self._settings.r2_bucket_name},
            ExpiresIn=60,
            HttpMethod="HEAD",
        )
        response = await self._send("HEAD", url)
        return 200 <= response.status_code < 300

    async def _send(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        try:
            return await self._http.request(
                method,
                url,
                headers=headers,
                follow_redirects=False,
            )
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            raise R2StorageUnavailableError("R2 is temporarily unavailable") from exc

    def _require_client(self) -> BaseClient:
        if self._client is None:
            raise R2StorageUnavailableError("R2 attachment storage is not configured")
        return self._client


def support_download_expiry() -> tuple[int, datetime.datetime]:
    seconds = 60
    return seconds, datetime.datetime.now(datetime.UTC) + datetime.timedelta(seconds=seconds)


__all__ = [
    "R2ObjectMetadata",
    "R2ObjectNotFoundError",
    "R2Storage",
    "R2StorageError",
    "R2StorageUnavailableError",
    "support_download_expiry",
]
