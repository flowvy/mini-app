[CmdletBinding()]
param(
    [string]$Image = "mini-app:verify",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$composeFile = Join-Path $repoRoot "docker-compose.yml"
$smokeComposeFile = Join-Path $PSScriptRoot "container-smoke.compose.yml"
$projectName = "mini-app-smoke-$PID"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$appPort = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

$environment = @{
    MINI_APP_IMAGE = $Image.Split(":")[0]
    MINI_APP_VERSION = $Image.Substring($Image.IndexOf(":") + 1)
    APP_DOMAIN = "localhost"
    APP_PORT = "$appPort"
    BOT_TOKEN = "000000:CONTAINER_SMOKE_DISABLED"
    TELEGRAM_WEBHOOK_SECRET = "container_smoke_secret_000000000000"
    ADMIN_TELEGRAM_IDS = "123456789"
    POSTGRES_PASSWORD = "container-smoke-postgres-password"
    REMNAWAVE_URL = "https://remnawave.invalid"
    REMNAWAVE_API_TOKEN = "container-smoke-disabled"
    REMNAWAVE_WEBHOOK_SECRET = "containersmokesecret000000000000000000"
}
$previousEnvironment = @{}
foreach ($entry in $environment.GetEnumerator()) {
    $previousEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable(
        $entry.Key,
        [EnvironmentVariableTarget]::Process
    )
    Set-Item -LiteralPath "Env:$($entry.Key)" -Value $entry.Value
}

$composeArgs = @(
    "compose",
    "--project-name", $projectName,
    "--file", $composeFile,
    "--file", $smokeComposeFile
)

try {
    if (-not $SkipBuild) {
        & docker build `
            --tag $Image `
            --build-arg "VERSION=0.0.0-smoke" `
            --build-arg "REVISION=container-smoke" `
            $repoRoot
        if ($LASTEXITCODE -ne 0) {
            throw "Container image build failed."
        }
    }

    $containerUser = (& docker image inspect --format "{{.Config.User}}" $Image).Trim()
    if ($containerUser -ne "10001:10001") {
        throw "Production image must run as the dedicated 10001:10001 user."
    }

    & docker @composeArgs config --quiet
    if ($LASTEXITCODE -ne 0) {
        throw "Production Compose configuration is invalid."
    }

    & docker @composeArgs up --detach --wait --wait-timeout 120
    if ($LASTEXITCODE -ne 0) {
        throw "Container stack did not become healthy."
    }

    $migrationContainer = (& docker @composeArgs ps --all --quiet migrate).Trim()
    if (-not $migrationContainer) {
        throw "Migration container was not created."
    }
    $migrationExitCode = (& docker inspect --format "{{.State.ExitCode}}" $migrationContainer).Trim()
    if ($migrationExitCode -ne "0") {
        throw "Migration container exited with code $migrationExitCode."
    }

    $baseUrl = "http://127.0.0.1:$appPort"
    $headers = @{ Host = "localhost" }
    $root = Invoke-WebRequest -Uri "$baseUrl/" -Headers $headers
    if ($root.StatusCode -ne 200 -or $root.Content -notmatch '<div id="root"></div>') {
        throw "Production frontend shell was not served from the application container."
    }

    $clientRoute = Invoke-WebRequest -Uri "$baseUrl/support/article" -Headers $headers
    if ($clientRoute.StatusCode -ne 200 -or $clientRoute.Content -ne $root.Content) {
        throw "Production frontend client-route fallback is unavailable."
    }

    $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -Headers $headers
    if ($health.status -ne "ok") {
        throw "Liveness endpoint did not return ok."
    }
    $ready = Invoke-RestMethod -Uri "$baseUrl/api/ready" -Headers $headers
    if ($ready.status -ne "ready") {
        throw "Readiness endpoint did not return ready."
    }

    $debugResponse = Invoke-WebRequest `
        -Uri "$baseUrl/api/debug/pulse" `
        -Headers $headers `
        -SkipHttpErrorCheck
    if ($debugResponse.StatusCode -ne 404) {
        throw "Debug routes must remain unavailable in the production container."
    }

    Write-Host "Production container smoke passed on $baseUrl."
}
catch {
    & docker @composeArgs logs --no-color --timestamps
    throw
}
finally {
    & docker @composeArgs down --volumes --remove-orphans
    foreach ($entry in $previousEnvironment.GetEnumerator()) {
        if ($null -eq $entry.Value) {
            Remove-Item -LiteralPath "Env:$($entry.Key)" -ErrorAction SilentlyContinue
        }
        else {
            Set-Item -LiteralPath "Env:$($entry.Key)" -Value $entry.Value
        }
    }
}
