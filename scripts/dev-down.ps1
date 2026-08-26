[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$artifactRoot = Join-Path $repoRoot ".artifacts"
$processFile = Join-Path (Join-Path $artifactRoot "dev") "processes.json"
$tunnelProcessFile = Join-Path (Join-Path $artifactRoot "tunnel") "processes.json"

if (Test-Path $processFile) {
    $processes = Get-Content -Raw -LiteralPath $processFile | ConvertFrom-Json
    foreach ($name in "frontend", "backend") {
        $targetId = [int]$processes.$name
        if ($targetId -le 0) { continue }
        $processNameProperty = "${name}ProcessName"
        $startedAtProperty = "${name}StartedAt"
        $allowedNames = if ($name -eq "frontend") {
            @("pnpm", "node")
        }
        else {
            @("uv", "python", "python3", "python3.14", "flowvy")
        }
        if ($null -ne $processes.$processNameProperty) {
            $allowedNames = @([string]$processes.$processNameProperty)
        }
        $expectedStart = if ($null -ne $processes.$startedAtProperty) {
            [datetime]$processes.$startedAtProperty
        }
        elseif ($null -ne $processes.startedAt) {
            [datetime]$processes.startedAt
        }
        else {
            $null
        }
        Stop-FlowvyOwnedProcessTree `
            -TargetProcessId $targetId `
            -AllowedRootNames $allowedNames `
            -ExpectedStartTime $expectedStart
    }
    Remove-Item -LiteralPath $processFile -Force
}

if (Test-Path $tunnelProcessFile) {
    & (Join-Path $PSScriptRoot "tunnel-down.ps1")
}

docker compose -f (Join-Path $repoRoot "docker-compose.dev.yml") stop postgres redis
if ($LASTEXITCODE -ne 0) { throw "Could not stop the development services." }

Write-Host "Flowvy processes and development services are stopped; Docker volumes were preserved."
