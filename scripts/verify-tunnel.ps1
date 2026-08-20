[CmdletBinding()]
param(
    [switch]$ExternalProbe,
    [switch]$Cleanup
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "backend"
$artifactRoot = Join-Path $repoRoot ".artifacts"
$artifactDir = Join-Path $artifactRoot "tunnel-smoke"
$backendProcessFile = Join-Path $artifactDir "backend-process.json"
$tunnelProcessFile = Join-Path (Join-Path $artifactRoot "tunnel") "processes.json"
$curlPath = $null
$nullDevice = Get-FlowvyNullDevice

function Get-HttpStatus {
    param(
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][string]$PublicHost,
        [Parameter(Mandatory)][string]$EdgeIp
    )

    $statusCode = & $curlPath `
        --resolve "${PublicHost}:443:${EdgeIp}" `
        --silent `
        --show-error `
        --output $nullDevice `
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

if ($Cleanup) {
    if (Test-Path $tunnelProcessFile) {
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
        if ($target) {
            Stop-FlowvyOwnedProcessTree `
                -TargetProcessId $targetId `
                -AllowedRootNames @([string]$record.backendProcessName) `
                -ExpectedStartTime ([datetime]$record.backendStartedAt)
        }
        Remove-Item -LiteralPath $backendProcessFile -Force
    }
    Write-Host "External tunnel probe processes are stopped."
    exit 0
}

if (Test-FlowvyTcpPort -Port 8001) {
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

    $uvPath = Resolve-FlowvyExecutable -Name "uv"
    $backendProcess = Start-FlowvyBackgroundProcess `
        -FilePath $uvPath `
        -ArgumentList @("run", "--frozen", "python", "-m", "flowvy") `
        -WorkingDirectory $backendDir `
        -StandardOutputPath (Join-Path $artifactDir "backend.stdout.log") `
        -StandardErrorPath (Join-Path $artifactDir "backend.stderr.log")

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

    & (Join-Path $PSScriptRoot "tunnel-up.ps1") -ConfirmPublic -SkipLocalReachability
    $owned = Get-Content -Raw -LiteralPath $tunnelProcessFile | ConvertFrom-Json
    $publicUrl = [string]$owned.publicUrl

    if ($ExternalProbe) {
        @{
            backend = $backendProcess.Id
            backendProcessName = $backendProcess.ProcessName
            backendStartedAt = $backendProcess.StartTime.ToString("o")
            startedAt = (Get-Date).ToString("o")
        } | ConvertTo-Json | Set-Content -LiteralPath $backendProcessFile -Encoding utf8
        $leaveRunning = $true
        Write-Host "External probe target is ready: $publicUrl"
        Write-Host "Always finish with scripts/verify-tunnel.ps1 -Cleanup."
        return
    }

    $curlPath = Resolve-FlowvyExecutable -Name "curl"
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
    $sourceHeaders = & $curlPath `
        --resolve "${publicHost}:443:${edgeIp}" `
        --silent `
        --show-error `
        --dump-header - `
        --output $nullDevice `
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
        if (Test-Path $tunnelProcessFile) {
            & (Join-Path $PSScriptRoot "tunnel-down.ps1")
        }
        if ($backendProcess) {
            Stop-FlowvyOwnedProcessTree `
                -TargetProcessId $backendProcess.Id `
                -AllowedRootNames @($backendProcess.ProcessName) `
                -ExpectedStartTime $backendProcess.StartTime
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
