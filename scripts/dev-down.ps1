[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$processFile = Join-Path $repoRoot ".artifacts\dev\processes.json"
$tunnelProcessFile = Join-Path $repoRoot ".artifacts\tunnel\processes.json"

function Stop-ProcessTree {
    param([Parameter(Mandatory)][int]$TargetProcessId)

    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $TargetProcessId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        Stop-ProcessTree -TargetProcessId $child.ProcessId
    }

    if (Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue) {
        Stop-Process -Id $TargetProcessId -Force -ErrorAction SilentlyContinue
    }
}

if (Test-Path $processFile) {
    $processes = Get-Content -Raw -LiteralPath $processFile | ConvertFrom-Json
    foreach ($name in "frontend", "backend") {
        $targetId = [int]$processes.$name
        if ($targetId -gt 0) { Stop-ProcessTree -TargetProcessId $targetId }
    }
    Remove-Item -LiteralPath $processFile -Force
}

if (Test-Path $tunnelProcessFile) {
    & (Join-Path $PSScriptRoot "tunnel-down.ps1")
}

docker compose -f (Join-Path $repoRoot "docker-compose.dev.yml") stop postgres redis
if ($LASTEXITCODE -ne 0) { throw "Could not stop the development services." }

Write-Host "Flowvy processes and development services are stopped; Docker volumes were preserved."
