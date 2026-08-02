[CmdletBinding()]
param(
    [switch]$InstallBrowsers
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Assert-Tool {
    param([Parameter(Mandatory)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required tool '$Name' was not found on PATH."
    }
}

Assert-Tool "uv"
Assert-Tool "pnpm"

Push-Location (Join-Path $repoRoot "backend")
try {
    uv sync --locked
    if ($LASTEXITCODE -ne 0) { throw "uv sync failed with exit code $LASTEXITCODE." }
}
finally {
    Pop-Location
}

Push-Location (Join-Path $repoRoot "frontend")
try {
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed with exit code $LASTEXITCODE." }

    if ($InstallBrowsers) {
        pnpm exec playwright install chromium webkit
        if ($LASTEXITCODE -ne 0) { throw "Playwright browser installation failed." }
    }
}
finally {
    Pop-Location
}

Write-Host "Flowvy dependencies are ready."
