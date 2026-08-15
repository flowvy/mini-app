[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

docker compose -f "$repoRoot\docker-compose.dev.yml" up -d --wait postgres
if ($LASTEXITCODE -ne 0) { throw "Disposable PostgreSQL test service is not ready." }

Push-Location (Join-Path $repoRoot "backend")
try {
    uv run --frozen pytest -q `
        tests/test_tribute_donation_fixture.py
    if ($LASTEXITCODE -ne 0) { throw "Tribute entitlement fixture failed." }
}
finally {
    Pop-Location
}

Write-Host "Signed Tribute donation production-boundary fixture passed without live endpoints."
