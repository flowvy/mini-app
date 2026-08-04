[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$processFile = Join-Path $repoRoot ".artifacts\tunnel\processes.json"

function Stop-OwnedProcessTree {
    param(
        [Parameter(Mandatory)][int]$TargetProcessId,
        [Parameter(Mandatory)][string[]]$AllowedNames,
        [Nullable[datetime]]$ExpectedStartTime
    )

    $target = Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue
    if (-not $target) { return }
    if ($target.ProcessName -notin $AllowedNames) {
        throw "PID $TargetProcessId now belongs to $($target.ProcessName); refusing to stop it."
    }
    if (
        $null -ne $ExpectedStartTime -and
        [math]::Abs(($target.StartTime - [datetime]$ExpectedStartTime).TotalSeconds) -gt 1
    ) {
        throw "PID $TargetProcessId was reused after the recorded start; refusing to stop it."
    }

    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $TargetProcessId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        $childProcess = Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
        if ($childProcess -and $childProcess.ProcessName -in @("node", "cmd", "pnpm", "conhost")) {
            Stop-OwnedProcessTree `
                -TargetProcessId $child.ProcessId `
                -AllowedNames @("node", "cmd", "pnpm", "conhost")
        }
    }
    Stop-Process -Id $TargetProcessId -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $processFile)) {
    Write-Host "No Flowvy-owned tunnel is recorded; nothing was stopped."
    exit 0
}

$processes = Get-Content -Raw -LiteralPath $processFile | ConvertFrom-Json
if ($null -ne $processes.cloudflared) {
    Stop-OwnedProcessTree `
        -TargetProcessId ([int]$processes.cloudflared) `
        -AllowedNames @("cloudflared") `
        -ExpectedStartTime ([datetime]$processes.cloudflaredStartedAt)
}
Stop-OwnedProcessTree `
    -TargetProcessId ([int]$processes.preview) `
    -AllowedNames @("cmd", "pnpm", "node") `
    -ExpectedStartTime ([datetime]$processes.previewStartedAt)
Remove-Item -LiteralPath $processFile -Force

Write-Host "The Flowvy-owned public preview and optional Quick Tunnel were stopped. System cloudflared services were untouched."
