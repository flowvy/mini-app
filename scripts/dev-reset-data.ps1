[CmdletBinding()]
param(
    [switch]$ConfirmDevDataReset
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "backend"
$composeFile = Join-Path $repoRoot "docker-compose.dev.yml"
$processFile = Join-Path (Join-Path (Join-Path $repoRoot ".artifacts") "dev") "processes.json"

if (-not $ConfirmDevDataReset) {
    throw (
        "This permanently clears only the local Flowvy development database and Redis DB 0. " +
        "Re-run with -ConfirmDevDataReset after checking the target."
    )
}

if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    throw "Docker with Compose is required."
}
if (-not (Get-Command "uv" -ErrorAction SilentlyContinue)) {
    throw "uv is required to apply development migrations."
}
if (Test-Path -LiteralPath $processFile) {
    throw "Flowvy dev is running. Run scripts/dev-down.ps1 before clearing its data."
}
foreach ($port in 8001, 5173) {
    if (Test-FlowvyTcpPort -Port $port) {
        throw "Port $port is in use. Stop the process before clearing Flowvy development data."
    }
}

docker compose -f $composeFile up -d --wait postgres redis
if ($LASTEXITCODE -ne 0) {
    throw "Development PostgreSQL/Redis startup failed."
}

$resetSql = @"
DROP SCHEMA public CASCADE;
CREATE SCHEMA public AUTHORIZATION flowvy;
GRANT ALL ON SCHEMA public TO public;
"@
$resetSql | docker compose -f $composeFile exec -T postgres `
    psql -v ON_ERROR_STOP=1 -U flowvy -d flowvy
if ($LASTEXITCODE -ne 0) {
    throw "Development PostgreSQL reset failed."
}

docker compose -f $composeFile exec -T redis redis-cli -n 0 FLUSHDB | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Development Redis reset failed."
}

$databaseUrlName = "DATABASE_URL"
$savedDatabaseUrl = [Environment]::GetEnvironmentVariable($databaseUrlName, "Process")
[Environment]::SetEnvironmentVariable(
    $databaseUrlName,
    "postgresql+asyncpg://flowvy:flowvy_dev@127.0.0.1:5432/flowvy",
    "Process"
)
try {
    Push-Location $backendDir
    try {
        uv run --frozen alembic upgrade head
        if ($LASTEXITCODE -ne 0) {
            throw "Development database migration failed."
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    [Environment]::SetEnvironmentVariable($databaseUrlName, $savedDatabaseUrl, "Process")
}

$rowCountSql = @"
SELECT
    (SELECT count(*) FROM users) +
    (SELECT count(*) FROM subscriptions) +
    (SELECT count(*) FROM invites) +
    (SELECT count(*) FROM access_profiles) +
    (SELECT count(*) FROM bot_metrics_history) +
    (SELECT count(*) FROM webhook_events),
    (SELECT count(*) FROM provider_settings);
"@
$rowCountOutput = $rowCountSql | docker compose -f $composeFile exec -T postgres `
    psql -At -v ON_ERROR_STOP=1 -U flowvy -d flowvy
if ($LASTEXITCODE -ne 0) {
    throw "Could not verify the cleared development database."
}
$rowCounts = (($rowCountOutput | Select-Object -Last 1).Trim()) -split '\|'
if ($rowCounts.Count -ne 2) {
    throw "Development database verification returned an unexpected result."
}
$userDataRowCount = [int]$rowCounts[0]
$settingsRowCount = [int]$rowCounts[1]
if ($userDataRowCount -ne 0) {
    throw "Development database verification failed: user or runtime rows remain."
}
if ($settingsRowCount -ne 1) {
    throw "Development database verification failed: settings seed is missing or duplicated."
}

$redisSizeOutput = docker compose -f $composeFile exec -T redis redis-cli -n 0 DBSIZE
if ($LASTEXITCODE -ne 0) {
    throw "Could not verify the cleared development Redis database."
}
$redisSize = [int](($redisSizeOutput | Select-Object -Last 1).Trim())
if ($redisSize -ne 0) {
    throw "Development Redis verification failed: keys remain."
}

Write-Host "Flowvy development data is empty, settings are reset, and migrations are at head."
Write-Host "The test database and Docker volume were preserved."
Write-Host "Start the app with scripts/dev-up.ps1."
