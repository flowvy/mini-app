[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$processFile = Join-Path (Join-Path (Join-Path $repoRoot ".artifacts") "tunnel") "processes.json"

if (-not (Test-Path $processFile)) {
    Write-Host "No Flowvy-owned tunnel is recorded; nothing was stopped."
    exit 0
}

$processes = Get-Content -Raw -LiteralPath $processFile | ConvertFrom-Json
if ($null -ne $processes.cloudflared) {
    $cloudflaredNames = if ($null -ne $processes.cloudflaredProcessName) {
        @([string]$processes.cloudflaredProcessName)
    }
    else {
        @("cloudflared")
    }
    Stop-FlowvyOwnedProcessTree `
        -TargetProcessId ([int]$processes.cloudflared) `
        -AllowedRootNames $cloudflaredNames `
        -ExpectedStartTime ([datetime]$processes.cloudflaredStartedAt)
}
$previewNames = if ($null -ne $processes.previewProcessName) {
    @([string]$processes.previewProcessName)
}
else {
    @("pnpm", "node")
}
Stop-FlowvyOwnedProcessTree `
    -TargetProcessId ([int]$processes.preview) `
    -AllowedRootNames $previewNames `
    -ExpectedStartTime ([datetime]$processes.previewStartedAt)
Remove-Item -LiteralPath $processFile -Force

Write-Host "The Flowvy-owned public preview and optional Quick Tunnel were stopped. System cloudflared services were untouched."
