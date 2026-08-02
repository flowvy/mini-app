[CmdletBinding()]
param(
    [ValidateSet("Changed", "Backend", "Frontend", "Docs", "Full")]
    [string]$Scope = "Changed",
    [switch]$SkipE2E
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Invoke-Checked {
    param(
        [Parameter(Mandatory)][string]$Label,
        [Parameter(Mandatory)][string]$WorkingDirectory,
        [Parameter(Mandatory)][string]$Command,
        [string[]]$CommandArgs = @()
    )

    Write-Host "`n==> $Label"
    Push-Location $WorkingDirectory
    try {
        & $Command @CommandArgs
        if ($LASTEXITCODE -ne 0) {
            throw "$Label failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

$changedFiles = @()
if ($Scope -eq "Changed") {
    $changedFiles = @(
        git -C $repoRoot diff --name-only HEAD
        git -C $repoRoot ls-files --others --exclude-standard
    ) | Where-Object { $_ } | Sort-Object -Unique
    Write-Host "Changed paths considered:"
    $changedFiles | ForEach-Object { Write-Host "  $_" }
}

$toolingChanged = $changedFiles | Where-Object { $_ -match '^(scripts/|\.github/|\.agents/|\.codex/|AGENTS\.md|PLANS\.md)' }
$backendChanged = $Scope -in @("Backend", "Full") -or
    ($Scope -eq "Changed" -and ($toolingChanged -or ($changedFiles | Where-Object { $_ -like "backend/*" })))
$frontendChanged = $Scope -in @("Frontend", "Full") -or
    ($Scope -eq "Changed" -and ($toolingChanged -or ($changedFiles | Where-Object { $_ -like "frontend/*" })))
$docsChanged = $Scope -in @("Docs", "Full") -or
    ($Scope -eq "Changed" -and ($toolingChanged -or ($changedFiles | Where-Object { $_ -match '(^|/)(README|AGENTS|PLANS|PROJECT_STATE|ARCHITECTURE|DEVELOPMENT|TESTING|SECURITY|INTEGRATIONS|OPERATIONS|ROADMAP).*\.md$|^docs/|^plans/' })))
$uiChanged = $Scope -in @("Frontend", "Full") -or
    ($Scope -eq "Changed" -and ($changedFiles | Where-Object { $_ -match '^frontend/(src/.*\.(tsx|css)|tests/e2e/|playwright\.config\.ts|vite\.config\.ts)' }))

if ($backendChanged) {
    Invoke-Checked "uv lock" "$repoRoot\backend" "uv" @("lock", "--check")
    Invoke-Checked "Ruff format" "$repoRoot\backend" "uv" @("run", "--frozen", "ruff", "format", "--check", ".")
    Invoke-Checked "Ruff lint" "$repoRoot\backend" "uv" @("run", "--frozen", "ruff", "check", ".")

    if ($Scope -eq "Full") {
        docker compose -f "$repoRoot\docker-compose.dev.yml" up -d --wait postgres redis
        if ($LASTEXITCODE -ne 0) { throw "Disposable test services are not ready." }
        & "$PSScriptRoot\verify-migrations.ps1"
        Invoke-Checked "Backend full tests" "$repoRoot\backend" "uv" @("run", "--frozen", "pytest", "-q")
        & "$PSScriptRoot\verify-contracts.ps1"
    }
    else {
        Invoke-Checked "Backend service-free tests" "$repoRoot\backend" "uv" @("run", "--frozen", "pytest", "-m", "not integration", "-q")
    }
}

if ($frontendChanged) {
    Invoke-Checked "Frontend install" "$repoRoot\frontend" "pnpm" @("install", "--frozen-lockfile")
    Invoke-Checked "Frontend lint" "$repoRoot\frontend" "pnpm" @("lint")
    Invoke-Checked "Frontend typecheck" "$repoRoot\frontend" "pnpm" @("typecheck")
    Invoke-Checked "Frontend unit tests" "$repoRoot\frontend" "pnpm" @("test")
    Invoke-Checked "Frontend production build" "$repoRoot\frontend" "pnpm" @("build")

    if (-not $SkipE2E -and $uiChanged) {
        Invoke-Checked "Frontend Playwright smoke" "$repoRoot\frontend" "pnpm" @("test:e2e")
    }
}

if ($docsChanged) {
    & "$PSScriptRoot\verify-docs.ps1"
}

if (-not ($backendChanged -or $frontendChanged -or $docsChanged)) {
    Write-Host "No verification scope matched the current change set."
}
else {
    Write-Host "`nFlowvy verification completed for scope: $Scope"
}
