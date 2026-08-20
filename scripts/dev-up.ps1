[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$EnableTelegram,
    [string]$NamedTunnelUrl = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$artifactDir = Join-Path (Join-Path $repoRoot ".artifacts") "dev"
$processFile = Join-Path $artifactDir "processes.json"
$namedTunnelMode = -not [string]::IsNullOrWhiteSpace($NamedTunnelUrl)

if ($namedTunnelMode) {
    try {
        $namedTunnelUri = [uri]$NamedTunnelUrl
    }
    catch {
        throw "NamedTunnelUrl must be an absolute HTTPS origin."
    }
    if (
        -not $namedTunnelUri.IsAbsoluteUri -or
        $namedTunnelUri.Scheme -ne "https" -or
        -not [string]::IsNullOrEmpty($namedTunnelUri.UserInfo) -or
        -not [string]::IsNullOrEmpty($namedTunnelUri.Query) -or
        -not [string]::IsNullOrEmpty($namedTunnelUri.Fragment) -or
        $namedTunnelUri.AbsolutePath -ne "/"
    ) {
        throw "NamedTunnelUrl must be an HTTPS origin without credentials, path, query, or fragment."
    }
    $NamedTunnelUrl = $namedTunnelUri.GetLeftPart([System.UriPartial]::Authority)
}

if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    throw "Docker with Compose is required for the local PostgreSQL and Redis services."
}

if (-not (Test-Path (Join-Path $backendDir ".env"))) {
    throw "backend/.env is missing. Copy backend/.env.example and provide local-only values first."
}

if (Test-Path $processFile) {
    throw "A Flowvy dev process file already exists at $processFile. Run scripts/dev-down.ps1 first."
}

foreach ($port in 8001, 5173) {
    if (Test-FlowvyTcpPort -Port $port) {
        throw "Port $port is already in use. Stop the existing process instead of starting a stale Flowvy server."
    }
}

if (-not $SkipInstall) {
    & (Join-Path $PSScriptRoot "bootstrap.ps1")
}

$devEnvironment = @{
    DATABASE_URL = "postgresql+asyncpg://flowvy:flowvy_dev@127.0.0.1:5432/flowvy"
    REDIS_URL = "redis://127.0.0.1:6379/0"
}
if ($namedTunnelMode) {
    $devEnvironment.WEBAPP_URL = $NamedTunnelUrl
}
if (-not $EnableTelegram) {
    $devEnvironment.BOT_TOKEN = ""
    $devEnvironment.WEBHOOK_URL = ""
    $devEnvironment.TELEGRAM_WEBHOOK_SECRET = ""
}

$savedEnvironment = @{}
foreach ($name in $devEnvironment.Keys) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, $devEnvironment[$name], "Process")
}

try {
    docker compose -f (Join-Path $repoRoot "docker-compose.dev.yml") up -d --wait postgres redis
    if ($LASTEXITCODE -ne 0) { throw "Development PostgreSQL/Redis startup failed." }

    Push-Location $backendDir
    try {
        uv run --frozen alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw "Development database migration failed." }
    }
    finally {
        Pop-Location
    }

    New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null

    $uvPath = Resolve-FlowvyExecutable -Name "uv"
    $pnpmPath = Resolve-FlowvyExecutable -Name "pnpm"

    $backendProcess = Start-FlowvyBackgroundProcess `
        -FilePath $uvPath `
        -ArgumentList @("run", "--frozen", "python", "-m", "flowvy") `
        -WorkingDirectory $backendDir `
        -StandardOutputPath (Join-Path $artifactDir "backend.stdout.log") `
        -StandardErrorPath (Join-Path $artifactDir "backend.stderr.log")

    $frontendProcess = Start-FlowvyBackgroundProcess `
        -FilePath $pnpmPath `
        -ArgumentList @("dev", "--host", "127.0.0.1", "--strictPort") `
        -WorkingDirectory $frontendDir `
        -StandardOutputPath (Join-Path $artifactDir "frontend.stdout.log") `
        -StandardErrorPath (Join-Path $artifactDir "frontend.stderr.log")

    @{
        backend = $backendProcess.Id
        backendProcessName = $backendProcess.ProcessName
        backendStartedAt = $backendProcess.StartTime.ToString("o")
        frontend = $frontendProcess.Id
        frontendProcessName = $frontendProcess.ProcessName
        frontendStartedAt = $frontendProcess.StartTime.ToString("o")
        startedAt = (Get-Date).ToString("o")
    } | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding utf8

    function Wait-Ready {
        param(
            [Parameter(Mandatory)][string]$Name,
            [Parameter(Mandatory)][string]$Uri
        )

        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            try {
                $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
                if ($response.StatusCode -eq 200) { return }
            }
            catch {
                Start-Sleep -Milliseconds 500
            }
        }
        throw "$Name did not become ready at $Uri. See $artifactDir."
    }

    try {
        Wait-Ready -Name "Backend" -Uri "http://127.0.0.1:8001/api/ready"
        Wait-Ready -Name "Frontend" -Uri "http://127.0.0.1:5173"

        if ($namedTunnelMode) {
            & (Join-Path $PSScriptRoot "tunnel-up.ps1") `
                -ConfirmPublic `
                -NamedTunnelUrl $NamedTunnelUrl
        }
    }
    catch {
        & (Join-Path $PSScriptRoot "dev-down.ps1")
        throw
    }

    Write-Host "Flowvy is ready: frontend http://127.0.0.1:5173, backend http://127.0.0.1:8001"
    if ($namedTunnelMode) {
        Write-Host "Named Tunnel Mini App: $NamedTunnelUrl"
    }
    Write-Host "Logs and process ids: $artifactDir"
}
finally {
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], "Process")
    }
}
