[CmdletBinding()]
param(
    [ValidateSet("Changed", "Backend", "Frontend", "Docs", "Full")]
    [string]$Scope = "Changed",
    [switch]$SkipE2E
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$composeFile = Join-Path $repoRoot "docker-compose.dev.yml"
$savedPythonPath = [Environment]::GetEnvironmentVariable("PYTHONPATH", "Process")
[Environment]::SetEnvironmentVariable(
    "PYTHONPATH",
    (Join-Path $backendDir "src"),
    "Process"
)

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

try {
$changedFiles = @()
if ($Scope -eq "Changed") {
    $changedFiles = @(
        git -C $repoRoot diff --name-only HEAD
        git -C $repoRoot ls-files --others --exclude-standard
    ) | Where-Object { $_ } | Sort-Object -Unique
    Write-Host "Changed paths considered:"
    $changedFiles | ForEach-Object { Write-Host "  $_" }
}

$toolingChanged = $changedFiles | Where-Object {
    $_ -match '^(scripts/|\.github/|\.agents/|\.codex/|AGENTS\.md|PLANS\.md|CHANGELOG(?:\.ru)?\.md)'
}
$backendChanged = $Scope -in @("Backend", "Full") -or
    ($Scope -eq "Changed" -and ($toolingChanged -or ($changedFiles | Where-Object { $_ -like "backend/*" })))
$frontendChanged = $Scope -in @("Frontend", "Full") -or
    ($Scope -eq "Changed" -and ($toolingChanged -or ($changedFiles | Where-Object { $_ -like "frontend/*" })))
$docsChanged = $Scope -in @("Docs", "Full") -or
    ($Scope -eq "Changed" -and ($toolingChanged -or ($changedFiles | Where-Object { $_ -match '(^|/)(README|AGENTS|PLANS|PROJECT_STATE|ARCHITECTURE|DEVELOPMENT|TESTING|SECURITY|INTEGRATIONS|OPERATIONS|ROADMAP).*\.md$|^docs/|^plans/' })))
$uiChanged = $Scope -in @("Frontend", "Full") -or
    ($Scope -eq "Changed" -and ($changedFiles | Where-Object { $_ -match '^frontend/(src/.*\.(tsx|css)|tests/e2e/|playwright\.config\.ts|vite\.config\.ts)' }))

if ($Scope -eq "Full" -or $toolingChanged) {
    & (Join-Path $PSScriptRoot "verify-tooling.ps1")
}

if ($backendChanged) {
    Invoke-Checked "uv lock" $backendDir "uv" @("lock", "--check")
    Invoke-Checked "Ruff format" $backendDir "uv" @("run", "--frozen", "ruff", "format", "--check", ".")
    Invoke-Checked "Ruff lint" $backendDir "uv" @("run", "--frozen", "ruff", "check", ".")

    if ($Scope -eq "Full") {
        docker compose -f $composeFile up -d --wait postgres redis
        if ($LASTEXITCODE -ne 0) { throw "Disposable test services are not ready." }
        & (Join-Path $PSScriptRoot "verify-migrations.ps1")
        Invoke-Checked "Backend full tests" $backendDir "uv" @("run", "--frozen", "pytest", "-q")
        & (Join-Path $PSScriptRoot "verify-contracts.ps1")
    }
    else {
        Invoke-Checked "Backend service-free tests" $backendDir "uv" @("run", "--frozen", "pytest", "-m", "not integration", "-q")
    }
}

if ($frontendChanged) {
    Invoke-Checked "Frontend install" $frontendDir "pnpm" @("install", "--frozen-lockfile")
    Invoke-Checked "Frontend lint" $frontendDir "pnpm" @("lint")
    Invoke-Checked "Frontend typecheck" $frontendDir "pnpm" @("typecheck")
    Invoke-Checked "Frontend unit tests" $frontendDir "pnpm" @("test")
    Invoke-Checked "Frontend production build" $frontendDir "pnpm" @("build")

    if (-not $SkipE2E -and $uiChanged) {
        Invoke-Checked "Frontend Playwright smoke" $frontendDir "pnpm" @("test:e2e")
    }
}

if ($docsChanged) {
    & (Join-Path $PSScriptRoot "verify-docs.ps1")
}

if (-not ($backendChanged -or $frontendChanged -or $docsChanged)) {
    Write-Host "No verification scope matched the current change set."
}
else {
    Write-Host "`nFlowvy verification completed for scope: $Scope"
}
}
finally {
    [Environment]::SetEnvironmentVariable("PYTHONPATH", $savedPythonPath, "Process")
}
