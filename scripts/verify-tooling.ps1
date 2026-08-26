[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "common.ps1")

$parseErrors = [System.Collections.Generic.List[string]]::new()
foreach ($script in Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter "*.ps1") {
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $script.FullName,
        [ref]$tokens,
        [ref]$errors
    )
    foreach ($error in $errors) {
        $parseErrors.Add("$($script.Name): $($error.Message)")
    }
}
if ($parseErrors.Count -gt 0) {
    throw "PowerShell parse errors:`n$($parseErrors -join "`n")"
}

if ((Get-FlowvyNamedPreviewPort -Platform "windows") -ne 80) {
    throw "Windows named Tunnel preview port changed unexpectedly."
}
foreach ($platform in "macos", "linux") {
    if ((Get-FlowvyNamedPreviewPort -Platform $platform) -ne 4173) {
        throw "$platform named Tunnel preview must use the unprivileged port 4173."
    }
}
$unsupportedFailed = $false
try {
    Get-FlowvyNamedPreviewPort -Platform "unsupported" | Out-Null
}
catch {
    $unsupportedFailed = $true
}
if (-not $unsupportedFailed) { throw "Unknown platforms must fail closed." }

$listener = [System.Net.Sockets.TcpListener]::new(
    [System.Net.IPAddress]::Loopback,
    0
)
$listener.Start()
$testPort = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
try {
    if (-not (Test-FlowvyTcpPort -Port $testPort)) {
        throw "Cross-platform TCP probe did not detect its owned listener."
    }
}
finally {
    $listener.Stop()
}
if (Test-FlowvyTcpPort -Port $testPort) {
    throw "Cross-platform TCP probe reported a stopped listener."
}
if ("esbuild" -notin $script:FlowvyAllowedChildProcessNames) {
    throw "Vite's esbuild child must remain in the owned-process allowlist."
}
if ("python3.14" -notin $script:FlowvyAllowedChildProcessNames) {
    throw "Python 3.14 must remain in the owned-process allowlist."
}

$pythonVersion = (
    Get-Content -Raw -LiteralPath (Join-Path (Join-Path $repoRoot "backend") ".python-version")
).Trim()
if ($pythonVersion -ne "3.14.7") {
    throw "backend/.python-version must pin Python 3.14.7."
}
$frontendPackage = Get-Content -Raw -LiteralPath (
    Join-Path (Join-Path $repoRoot "frontend") "package.json"
) | ConvertFrom-Json
$nodeVersion = (
    Get-Content -Raw -LiteralPath (Join-Path (Join-Path $repoRoot "frontend") ".node-version")
).Trim()
if ($nodeVersion -ne "24.19.0") {
    throw "frontend/.node-version must pin Node 24.19.0 LTS."
}
if ($frontendPackage.packageManager -ne "pnpm@11.24.0") {
    throw "frontend/package.json must pin pnpm 11.24.0."
}
if ($frontendPackage.engines.node -ne ">=24.19.0 <25") {
    throw "frontend/package.json must require the Node 24.19.0 LTS line."
}
$ciWorkflow = Get-Content -Raw -LiteralPath (
    Join-Path (Join-Path (Join-Path $repoRoot ".github") "workflows") "ci.yml"
)
if ($ciWorkflow -notmatch [regex]::Escape("package_json_file: frontend/package.json")) {
    throw "CI must read the pinned pnpm version from frontend/package.json."
}

$actualUvVersion = (& uv --version).Trim()
if ($actualUvVersion -notmatch '^uv 0\.12\.6(?:\s|$)') {
    throw "Active uv must be 0.12.6; found: $actualUvVersion"
}
$actualNodeVersion = (& node --version).Trim()
if ($actualNodeVersion -ne "v24.19.0") {
    throw "Active Node.js must be v24.19.0; found: $actualNodeVersion"
}
$actualPnpmVersion = (& pnpm --version).Trim()
if ($actualPnpmVersion -ne "11.24.0") {
    throw "Active pnpm must be 11.24.0; found: $actualPnpmVersion"
}

$toolingArtifactDir = Join-Path (Join-Path $repoRoot ".artifacts") "tooling"
New-Item -ItemType Directory -Force -Path $toolingArtifactDir | Out-Null
$pwshPath = Resolve-FlowvyExecutable -Name "pwsh"
$ownedProcess = Start-FlowvyBackgroundProcess `
    -FilePath $pwshPath `
    -ArgumentList @("-NoLogo", "-NoProfile", "-Command", "Start-Sleep -Seconds 30") `
    -WorkingDirectory $repoRoot `
    -StandardOutputPath (Join-Path $toolingArtifactDir "owned.stdout.log") `
    -StandardErrorPath (Join-Path $toolingArtifactDir "owned.stderr.log")
try {
    Start-Sleep -Milliseconds 150
    if ($ownedProcess.HasExited) {
        throw "Background-process helper exited before ownership could be verified."
    }
}
finally {
    Stop-FlowvyOwnedProcessTree `
        -TargetProcessId $ownedProcess.Id `
        -AllowedRootNames @($ownedProcess.ProcessName) `
        -ExpectedStartTime $ownedProcess.StartTime
}
if (Get-Process -Id $ownedProcess.Id -ErrorAction SilentlyContinue) {
    throw "Owned-process helper did not stop its recorded PID."
}

$requiredScripts = @(
    "bootstrap.ps1", "dev-up.ps1", "dev-down.ps1", "tunnel-up.ps1", "tunnel-down.ps1",
    "verify.ps1", "verify-migrations.ps1", "verify-contracts.ps1", "verify-docs.ps1"
)
foreach ($name in $requiredScripts) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $name))) {
        throw "Required Flowvy lifecycle script is missing: $name"
    }
}

$macDocs = Get-Content -Raw -LiteralPath (
    Join-Path (Join-Path $repoRoot "docs") "DEV_ENVIRONMENT.md"
)
foreach ($requiredText in "PowerShell 7", "http://localhost:4173", "dev-app.flowvy.io") {
    if ($macDocs -notmatch [regex]::Escape($requiredText)) {
        throw "DEV_ENVIRONMENT.md is missing the macOS contract: $requiredText"
    }
}

Write-Host "PowerShell lifecycle scripts and active toolchain versions are consistent."
