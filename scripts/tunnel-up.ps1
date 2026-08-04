[CmdletBinding()]
param(
    [switch]$ConfirmPublic,
    [switch]$SkipLocalReachability,
    [string]$NamedTunnelUrl = ""
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmPublic) {
    throw "This publishes Flowvy. Re-run with -ConfirmPublic after confirming test-only data and DEBUG=false."
}

$namedTunnelMode = -not [string]::IsNullOrWhiteSpace($NamedTunnelUrl)
$namedTunnelUri = $null
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

$previewPort = if ($namedTunnelMode) { 80 } else { 4173 }
$previewUri = "http://127.0.0.1:$previewPort"

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
if (-not $namedTunnelMode -and -not (Get-Command "cloudflared" -ErrorAction SilentlyContinue)) {
    throw "cloudflared is required."
}
if (Get-NetTCPConnection -State Listen -LocalPort $previewPort -ErrorAction SilentlyContinue) {
    throw "Port $previewPort is already in use; refusing to attach a public tunnel to an unknown process."
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
$cloudflaredPath = if ($namedTunnelMode) { $null } else { (Get-Command "cloudflared").Source }
$previewProcess = $null
$tunnelProcess = $null
$savedAllowedHosts = [Environment]::GetEnvironmentVariable(
    "__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS",
    "Process"
)

try {
    try {
        if ($namedTunnelMode) {
            [Environment]::SetEnvironmentVariable(
                "__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS",
                $namedTunnelUri.Host,
                "Process"
            )
        }
        $previewProcess = Start-Process -FilePath $pnpmPath `
            -ArgumentList @(
                "preview", "--host", "127.0.0.1", "--port", "$previewPort", "--strictPort"
            ) `
            -WorkingDirectory $frontendDir `
            -RedirectStandardOutput $previewOut `
            -RedirectStandardError $previewErr `
            -WindowStyle Hidden `
            -PassThru
    }
    finally {
        [Environment]::SetEnvironmentVariable(
            "__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS",
            $savedAllowedHosts,
            "Process"
        )
    }

    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        try {
            $preview = Invoke-WebRequest -Uri $previewUri -UseBasicParsing -TimeoutSec 2
            if ($preview.StatusCode -eq 200) { break }
        }
        catch { Start-Sleep -Milliseconds 250 }
    }
    if (-not $preview -or $preview.StatusCode -ne 200) {
        throw "Frontend preview did not become ready."
    }

    if ($namedTunnelMode) {
        $publicUrl = $NamedTunnelUrl
    }
    else {
        $tunnelProcess = Start-Process -FilePath $cloudflaredPath `
            -ArgumentList @(
                "tunnel", "--no-autoupdate", "--metrics", "127.0.0.1:0",
                "--loglevel", "info", "--url", $previewUri,
                "--http-host-header", "127.0.0.1:$previewPort"
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
            if ($tunnelProcess.HasExited) {
                throw "cloudflared exited before registering a connection."
            }
        }
        if (-not $connectionReady) { throw "cloudflared did not register a tunnel connection." }
    }

    if (-not $SkipLocalReachability) {
        foreach ($publicCheck in $publicUrl, "$publicUrl/api/health") {
            $publicReady = $false
            for ($attempt = 0; $attempt -lt 60; $attempt++) {
                try {
                    $publicResponse = Invoke-WebRequest `
                        -Uri $publicCheck `
                        -UseBasicParsing `
                        -TimeoutSec 3
                    if ($publicResponse.StatusCode -eq 200) {
                        $publicReady = $true
                        break
                    }
                }
                catch {
                    Start-Sleep -Milliseconds 500
                }
                if ($tunnelProcess -and $tunnelProcess.HasExited) {
                    throw "cloudflared exited before the public URL was ready."
                }
            }
            if (-not $publicReady) {
                throw "Public tunnel check did not return 200 for $publicCheck."
            }
        }
    }

    $processState = @{
        mode = if ($namedTunnelMode) { "named" } else { "quick" }
        preview = $previewProcess.Id
        previewStartedAt = $previewProcess.StartTime.ToString("o")
        publicUrl = $publicUrl
        startedAt = (Get-Date).ToString("o")
    }
    if ($tunnelProcess) {
        $processState.cloudflared = $tunnelProcess.Id
        $processState.cloudflaredStartedAt = $tunnelProcess.StartTime.ToString("o")
    }
    $processState | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding utf8

    if ($namedTunnelMode) {
        Write-Host "Flowvy named Tunnel origin is ready: $publicUrl -> $previewUri"
        Write-Host "The system cloudflared service was not changed."
    }
    else {
        Write-Host "Temporary Flowvy tunnel is ready: $publicUrl"
    }
    Write-Host "Stop only the repo-owned preview/tunnel process with scripts/tunnel-down.ps1."
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
