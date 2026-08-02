[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$snapshot = Join-Path $repoRoot "docs\api-remnawave.json"

if (-not (Test-Path $snapshot)) { throw "Remnawave OpenAPI snapshot is missing: $snapshot" }
$null = Get-Content -Raw -LiteralPath $snapshot | ConvertFrom-Json

Push-Location (Join-Path $repoRoot "backend")
try {
    uv run --frozen pytest -q tests/test_remnawave.py
    if ($LASTEXITCODE -ne 0) { throw "Remnawave contract tests failed." }
}
finally {
    Pop-Location
}

Write-Host "The legacy Remnawave snapshot parses and deterministic 2.8.1/3.0.0/3.1.0 client tests pass."
