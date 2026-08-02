[CmdletBinding()]
param(
    [switch]$ExternalProbe,
    [switch]$Cleanup
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "backend"
$artifactDir = Join-Path $repoRoot ".artifacts\tunnel-smoke"
$backendProcessFile = Join-Path $artifactDir "backend-process.json"

function Get-HttpStatus {
    param(
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][string]$PublicHost,
        [Parameter(Mandatory)][string]$EdgeIp
    )

    $statusCode = & curl.exe `
        --resolve "${PublicHost}:443:${EdgeIp}" `
        --silent `
        --show-error `
        --output NUL `
        --write-out "%{http_code}" `
        $Uri
    if ($LASTEXITCODE -ne 0) { throw "Public tunnel request failed for $Uri." }
    return [int]$statusCode
}

function Wait-HttpStatus {
    param(
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][int]$ExpectedStatus,
        [Parameter(Mandatory)][string]$PublicHost,
        [Parameter(Mandatory)][string]$EdgeIp
    )

    $statusCode = 0
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $statusCode = Get-HttpStatus $Uri $PublicHost $EdgeIp
        if ($statusCode -eq $ExpectedStatus) { return $statusCode }
        Start-Sleep -Seconds 1
    }
    return $statusCode
}

function Stop-SmokeProcessTree {
    param([Parameter(Mandatory)][int]$TargetProcessId)

    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $TargetProcessId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        Stop-SmokeProcessTree -TargetProcessId $child.ProcessId
    }
    if (Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue) {
        Stop-Process -Id $TargetProcessId -Force -ErrorAction SilentlyContinue
    }
}

if ($Cleanup) {
    if (Test-Path (Join-Path $repoRoot ".artifacts\tunnel\processes.json")) {
        & (Join-Path $PSScriptRoot "tunnel-down.ps1")
    }
    if (Test-Path $backendProcessFile) {
        $record = Get-Content -Raw -LiteralPath $backendProcessFile | ConvertFrom-Json
        $targetId = [int]$record.backend
        $target = Get-Process -Id $targetId -ErrorAction SilentlyContinue
        if (
            $target -and
            (
                $target.ProcessName -ne [string]$record.backendProcessName -or
                [math]::Abs(
                    ($target.StartTime - [datetime]$record.backendStartedAt).TotalSeconds
                ) -gt 1
            )
        ) {
            throw "Recorded backend PID no longer belongs to the Flowvy smoke process."
        }
        if ($target) { Stop-SmokeProcessTree -TargetProcessId $targetId }
        Remove-Item -LiteralPath $backendProcessFile -Force
    }
    Write-Host "External tunnel probe processes are stopped."
    exit 0
}

if (Get-NetTCPConnection -State Listen -LocalPort 8001 -ErrorAction SilentlyContinue) {
    throw "Port 8001 is already owned by another process; synthetic tunnel verification refused."
}

New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
$savedEnvironment = @{}
$safeNames = @(
    "BOT_TOKEN",
    "DEBUG",
    "WEBHOOK_URL",
    "TELEGRAM_WEBHOOK_SECRET",
    "WEBAPP_URL",
    "REMNAWAVE_URL",
    "REMNAWAVE_API_TOKEN",
    "ADMIN_TELEGRAM_IDS",
    "DATABASE_URL",
    "REDIS_URL"
)
foreach ($name in $safeNames) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

$backendProcess = $null
$backendServerProcess = $null
$leaveRunning = $false
try {
    $env:BOT_TOKEN = ""
    $env:DEBUG = "false"
    $env:WEBHOOK_URL = ""
    $env:TELEGRAM_WEBHOOK_SECRET = ""
    $env:WEBAPP_URL = "http://127.0.0.1:4173"
    $env:REMNAWAVE_URL = ""
    $env:REMNAWAVE_API_TOKEN = ""
    $env:ADMIN_TELEGRAM_IDS = ""
    $env:DATABASE_URL = "postgresql+asyncpg://flowvy:flowvy_dev@127.0.0.1:5432/flowvy"
    $env:REDIS_URL = "redis://127.0.0.1:6379/0"

    $uvPath = (Get-Command "uv").Source
    $backendProcess = Start-Process -FilePath $uvPath `
        -ArgumentList @("run", "--frozen", "python", "-m", "flowvy") `
        -WorkingDirectory $backendDir `
        -RedirectStandardOutput (Join-Path $artifactDir "backend.stdout.log") `
        -RedirectStandardError (Join-Path $artifactDir "backend.stderr.log") `
        -WindowStyle Hidden `
        -PassThru

    $backendReady = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            $health = Invoke-WebRequest "http://127.0.0.1:8001/api/health" -UseBasicParsing -TimeoutSec 2
            if ($health.StatusCode -eq 200) {
                $backendReady = $true
                break
            }
        }
        catch {
            Start-Sleep -Milliseconds 250
        }
    }
    if (-not $backendReady) { throw "Synthetic backend did not become ready." }
    $backendListener = Get-NetTCPConnection -State Listen -LocalPort 8001 -ErrorAction Stop
    $backendServerProcess = Get-Process -Id $backendListener.OwningProcess -ErrorAction Stop

    if ($ExternalProbe) {
        & (Join-Path $PSScriptRoot "tunnel-up.ps1") -ConfirmPublic -SkipLocalReachability
    }
    else {
        & (Join-Path $PSScriptRoot "tunnel-up.ps1") -ConfirmPublic -SkipLocalReachability
    }
    $owned = Get-Content -Raw (Join-Path $repoRoot ".artifacts\tunnel\processes.json") | ConvertFrom-Json
    $publicUrl = [string]$owned.publicUrl

    if ($ExternalProbe) {
        @{
            backend = $backendServerProcess.Id
            backendProcessName = $backendServerProcess.ProcessName
            backendStartedAt = $backendServerProcess.StartTime.ToString("o")
            startedAt = (Get-Date).ToString("o")
        } | ConvertTo-Json | Set-Content -LiteralPath $backendProcessFile -Encoding utf8
        $leaveRunning = $true
        Write-Host "External probe target is ready: $publicUrl"
        Write-Host "Always finish with scripts/verify-tunnel.ps1 -Cleanup."
        return
    }

    if (-not (Get-Command "curl.exe" -ErrorAction SilentlyContinue)) {
        throw "curl.exe is required for the external tunnel probe."
    }
    $publicHost = ([uri]$publicUrl).DnsSafeHost
    $dnsResponse = Invoke-RestMethod `
        -Uri "https://dns.google/resolve?name=trycloudflare.com&type=A" `
        -TimeoutSec 15
    $edgeIp = @($dnsResponse.Answer | Where-Object { $_.type -eq 1 })[0].data
    if (-not $edgeIp) { throw "Could not externally resolve the Quick Tunnel hostname." }

    $rootStatus = Wait-HttpStatus $publicUrl 200 $publicHost $edgeIp
    $healthStatus = Wait-HttpStatus "$publicUrl/api/health" 200 $publicHost $edgeIp
    $authStatus = Wait-HttpStatus "$publicUrl/api/me" 401 $publicHost $edgeIp
    $debugStatus = Wait-HttpStatus "$publicUrl/api/debug/devices/empty" 404 $publicHost $edgeIp
    $webhookStatus = Wait-HttpStatus "$publicUrl/webhook" 404 $publicHost $edgeIp
    $sourceHeaders = & curl.exe `
        --resolve "${publicHost}:443:${edgeIp}" `
        --silent `
        --show-error `
        --dump-header - `
        --output NUL `
        "$publicUrl/src/main.tsx"
    if ($LASTEXITCODE -ne 0) { throw "Public source-path probe failed." }
    $sourceType = [string](@(
        $sourceHeaders | Select-String -Pattern "^Content-Type:" -CaseSensitive:$false
    )[0].Line)

    if (
        $rootStatus -ne 200 -or
        $healthStatus -ne 200 -or
        $authStatus -ne 401 -or
        $debugStatus -ne 404 -or
        $webhookStatus -ne 404
    ) {
        throw (
            "Unexpected public status matrix: root=$rootStatus health=$healthStatus " +
            "auth=$authStatus debug=$debugStatus webhook=$webhookStatus"
        )
    }
    if ($sourceType -notmatch "text/html") {
        throw "Production preview exposed a source response: $sourceType"
    }

    Write-Host (
        "Tunnel smoke passed: root=$rootStatus health=$healthStatus auth=$authStatus " +
        "debug=$debugStatus webhook=$webhookStatus source=$sourceType"
    )
}
finally {
    if (-not $leaveRunning) {
        if (Test-Path (Join-Path $repoRoot ".artifacts\tunnel\processes.json")) {
            & (Join-Path $PSScriptRoot "tunnel-down.ps1")
        }
        if ($backendProcess) {
            Stop-SmokeProcessTree -TargetProcessId $backendProcess.Id
        }
        if ($backendServerProcess) {
            Stop-SmokeProcessTree -TargetProcessId $backendServerProcess.Id
        }
    }
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable(
            $name,
            $savedEnvironment[$name],
            "Process"
        )
    }
}
