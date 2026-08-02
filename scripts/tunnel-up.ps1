[CmdletBinding()]
param(
    [switch]$ConfirmPublic,
    [switch]$SkipLocalReachability
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmPublic) {
    throw "This creates a public temporary URL. Re-run with -ConfirmPublic after confirming test-only data and DEBUG=false."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendDir = Join-Path $repoRoot "frontend"
$artifactDir = Join-Path $repoRoot ".artifacts\tunnel"
$processFile = Join-Path $artifactDir "processes.json"
$previewOut = Join-Path $artifactDir "preview.stdout.log"
$previewErr = Join-Path $artifactDir "preview.stderr.log"
$tunnelOut = Join-Path $artifactDir "cloudflared.stdout.log"
$tunnelErr = Join-Path $artifactDir "cloudflared.stderr.log"

function Stop-StartedProcessTree {
    param([Parameter(Mandatory)][int]$TargetProcessId)

    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $TargetProcessId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        Stop-StartedProcessTree -TargetProcessId $child.ProcessId
    }
    if (Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue) {
        Stop-Process -Id $TargetProcessId -Force -ErrorAction SilentlyContinue
    }
}

if (Test-Path $processFile) {
    throw "A Flowvy-owned tunnel is already recorded. Run scripts/tunnel-down.ps1 first."
}
if (-not (Get-Command "cloudflared" -ErrorAction SilentlyContinue)) {
    throw "cloudflared is required."
}
if (Get-NetTCPConnection -State Listen -LocalPort 4173 -ErrorAction SilentlyContinue) {
    throw "Port 4173 is already in use; refusing to attach a public tunnel to an unknown process."
}

try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:8001/api/health" -UseBasicParsing -TimeoutSec 3
    if ($health.StatusCode -ne 200) { throw "Backend health check did not return 200." }
}
catch {
    throw "Start the local backend on 127.0.0.1:8001 before opening a tunnel."
}

$debugStatus = 0
try {
    $debugResponse = Invoke-WebRequest -Uri "http://127.0.0.1:8001/api/debug/devices/empty" -UseBasicParsing -TimeoutSec 3
    $debugStatus = $debugResponse.StatusCode
}
catch {
    if ($_.Exception.Response) {
        $debugStatus = [int]$_.Exception.Response.StatusCode
    }
}
if ($debugStatus -ne 404) {
    throw "Backend debug routes are reachable or could not be proven absent; public tunnel refused."
}

New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null

$savedEnv = @{}
foreach ($name in "VITE_API_URL", "VITE_MOCK_AUTH", "VITE_DEBUG_TELEGRAM_ID", "VITE_DEBUG_DEVICES_EMPTY") {
    $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}
try {
    $env:VITE_API_URL = "/api"
    $env:VITE_MOCK_AUTH = "false"
    $env:VITE_DEBUG_TELEGRAM_ID = ""
    $env:VITE_DEBUG_DEVICES_EMPTY = ""
    Push-Location $frontendDir
    try {
        pnpm build
        if ($LASTEXITCODE -ne 0) { throw "Safe frontend build failed." }
    }
    finally {
        Pop-Location
    }
}
finally {
    foreach ($name in $savedEnv.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnv[$name], "Process")
    }
}

$pnpmPath = (Get-Command "pnpm.cmd" -ErrorAction SilentlyContinue).Source
if (-not $pnpmPath) { $pnpmPath = (Get-Command "pnpm").Source }
$cloudflaredPath = (Get-Command "cloudflared").Source
$previewProcess = $null
$tunnelProcess = $null

try {
    $previewProcess = Start-Process -FilePath $pnpmPath `
        -ArgumentList @("preview", "--host", "127.0.0.1", "--strictPort") `
        -WorkingDirectory $frontendDir `
        -RedirectStandardOutput $previewOut `
        -RedirectStandardError $previewErr `
        -WindowStyle Hidden `
        -PassThru

    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        try {
            $preview = Invoke-WebRequest -Uri "http://127.0.0.1:4173" -UseBasicParsing -TimeoutSec 2
            if ($preview.StatusCode -eq 200) { break }
        }
        catch { Start-Sleep -Milliseconds 250 }
    }
    if (-not $preview -or $preview.StatusCode -ne 200) {
        throw "Frontend preview did not become ready."
    }

    $tunnelProcess = Start-Process -FilePath $cloudflaredPath `
        -ArgumentList @(
            "tunnel", "--no-autoupdate", "--metrics", "127.0.0.1:0",
            "--loglevel", "info", "--url", "http://127.0.0.1:4173",
            "--http-host-header", "127.0.0.1:4173"
        ) `
        -WorkingDirectory $repoRoot `
        -RedirectStandardOutput $tunnelOut `
        -RedirectStandardError $tunnelErr `
        -WindowStyle Hidden `
        -PassThru

    $publicUrl = $null
    for ($attempt = 0; $attempt -lt 80; $attempt++) {
        Start-Sleep -Milliseconds 250
        $logs = @()
        if (Test-Path $tunnelOut) { $logs += Get-Content -Raw -LiteralPath $tunnelOut }
        if (Test-Path $tunnelErr) { $logs += Get-Content -Raw -LiteralPath $tunnelErr }
        $match = [regex]::Match(($logs -join "`n"), "https://[a-z0-9-]+\.trycloudflare\.com")
        if ($match.Success) {
            $publicUrl = $match.Value
            break
        }
        if ($tunnelProcess.HasExited) { throw "cloudflared exited before publishing a URL." }
    }
    if (-not $publicUrl) { throw "Timed out waiting for the Cloudflare Quick Tunnel URL." }

    $connectionReady = $false
    for ($attempt = 0; $attempt -lt 80; $attempt++) {
        Start-Sleep -Milliseconds 250
        $connectionLogs = Get-Content -Raw -LiteralPath $tunnelErr
        if ($connectionLogs -match "Registered tunnel connection") {
            $connectionReady = $true
            break
        }
        if ($tunnelProcess.HasExited) { throw "cloudflared exited before registering a connection." }
    }
    if (-not $connectionReady) { throw "cloudflared did not register a tunnel connection." }

    if (-not $SkipLocalReachability) {
        $publicReady = $false
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            try {
                $publicResponse = Invoke-WebRequest -Uri $publicUrl -UseBasicParsing -TimeoutSec 3
                if ($publicResponse.StatusCode -eq 200) {
                    $publicReady = $true
                    break
                }
            }
            catch {
                Start-Sleep -Milliseconds 500
            }
            if ($tunnelProcess.HasExited) {
                throw "cloudflared exited before the public URL was ready."
            }
        }
        if (-not $publicReady) {
            throw "Public tunnel did not become locally reachable within the timeout."
        }
    }

    @{
        preview = $previewProcess.Id
        previewStartedAt = $previewProcess.StartTime.ToString("o")
        cloudflared = $tunnelProcess.Id
        cloudflaredStartedAt = $tunnelProcess.StartTime.ToString("o")
        publicUrl = $publicUrl
        startedAt = (Get-Date).ToString("o")
    } | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding utf8

    Write-Host "Temporary Flowvy tunnel is ready: $publicUrl"
    Write-Host "Stop only this repo-owned tunnel with scripts/tunnel-down.ps1."
}
catch {
    if ($tunnelProcess -and -not $tunnelProcess.HasExited) {
        Stop-StartedProcessTree -TargetProcessId $tunnelProcess.Id
    }
    if ($previewProcess -and -not $previewProcess.HasExited) {
        Stop-StartedProcessTree -TargetProcessId $previewProcess.Id
    }
    throw
}
