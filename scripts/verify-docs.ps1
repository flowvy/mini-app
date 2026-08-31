[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$docsDir = Join-Path $repoRoot "docs"
$plansDir = Join-Path $repoRoot "plans"
$agentsDir = Join-Path $repoRoot ".agents"
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$ciWorkflowPath = Join-Path (Join-Path (Join-Path $repoRoot ".github") "workflows") "ci.yml"
$composePath = Join-Path $repoRoot "docker-compose.dev.yml"
$uvLockPath = Join-Path $backendDir "uv.lock"
$pnpmLockPath = Join-Path $frontendDir "pnpm-lock.yaml"
$docFiles = @(
    Get-Item `
        (Join-Path $repoRoot "README.md"), `
        (Join-Path $repoRoot "AGENTS.md"), `
        (Join-Path $repoRoot "PLANS.md"), `
        (Join-Path $repoRoot "THIRD_PARTY_NOTICES.md"), `
        (Join-Path $repoRoot "TRADEMARKS.md") `
        -ErrorAction SilentlyContinue
    Get-ChildItem $docsDir, $plansDir, $agentsDir -Recurse -File -Filter "*.md" -ErrorAction SilentlyContinue
    Get-ChildItem $backendDir, $frontendDir -Recurse -File -Filter "AGENTS.md" -ErrorAction SilentlyContinue
) | Sort-Object FullName -Unique

$broken = [System.Collections.Generic.List[string]]::new()
$inconsistent = [System.Collections.Generic.List[string]]::new()
$linkPattern = '\[[^\]]+\]\((?<target>[^)]+)\)'

function Get-UvLockedVersion {
    param([Parameter(Mandatory)][string]$PackageName)

    $pattern = '(?ms)^\[\[package\]\]\r?\nname = "' +
        [regex]::Escape($PackageName) + '"\r?\nversion = "(?<version>[^"]+)"'
    $match = [regex]::Match($script:uvLock, $pattern)
    if (-not $match.Success) {
        throw "Unable to find $PackageName in backend/uv.lock."
    }
    return $match.Groups["version"].Value
}

function Get-PnpmLockedVersion {
    param([Parameter(Mandatory)][string]$PackageName)

    $pattern = "(?m)^\s{2}'" + [regex]::Escape($PackageName) +
        "@(?<version>[^']+)':\s*$"
    $match = [regex]::Match($script:pnpmLock, $pattern)
    if (-not $match.Success) {
        throw "Unable to find $PackageName in frontend/pnpm-lock.yaml."
    }
    return $match.Groups["version"].Value
}

function Require-DocumentText {
    param(
        [Parameter(Mandatory)][string]$RelativePath,
        [Parameter(Mandatory)][string[]]$RequiredText
    )

    $path = Join-Path $repoRoot $RelativePath
    $content = Get-Content -Raw -LiteralPath $path
    foreach ($text in $RequiredText) {
        if ($content -notmatch [regex]::Escape($text)) {
            $script:inconsistent.Add("$RelativePath is missing executable version claim: $text")
        }
    }
}

function Require-ExactDocumentVersions {
    param(
        [Parameter(Mandatory)][string]$RelativePath,
        [Parameter(Mandatory)][string]$Label,
        [Parameter(Mandatory)][string]$Pattern,
        [Parameter(Mandatory)][string]$ExpectedVersion
    )

    $path = Join-Path $repoRoot $RelativePath
    $content = Get-Content -Raw -LiteralPath $path
    foreach ($match in [regex]::Matches($content, $Pattern)) {
        $actualVersion = $match.Groups["version"].Value
        if ($actualVersion -ne $ExpectedVersion) {
            $script:inconsistent.Add(
                "$RelativePath claims $Label $actualVersion; executable truth is $ExpectedVersion."
            )
        }
    }
}

foreach ($file in $docFiles) {
    $content = Get-Content -Raw -LiteralPath $file.FullName
    foreach ($match in [regex]::Matches($content, $linkPattern)) {
        $target = $match.Groups["target"].Value.Trim('<', '>')
        if ($target -match '^(https?://|mailto:|#)') { continue }
        $pathPart = ($target -split '#', 2)[0]
        if (-not $pathPart) { continue }
        $candidate = Join-Path $file.DirectoryName $pathPart
        if (-not (Test-Path $candidate)) {
            $broken.Add("$($file.FullName) -> $target")
        }
    }
}

if ($broken.Count -gt 0) {
    throw "Broken local Markdown links:`n$($broken -join "`n")"
}

$frontendPackage = Get-Content -Raw -LiteralPath (Join-Path $frontendDir "package.json") |
    ConvertFrom-Json
$nodeVersion = (Get-Content -Raw -LiteralPath (Join-Path $frontendDir ".node-version")).Trim()
$pythonVersion = (Get-Content -Raw -LiteralPath (Join-Path $backendDir ".python-version")).Trim()
$pnpmVersion = $frontendPackage.packageManager -replace '^pnpm@', ''
$script:uvLock = Get-Content -Raw -LiteralPath $uvLockPath
$script:pnpmLock = Get-Content -Raw -LiteralPath $pnpmLockPath
$ciWorkflow = Get-Content -Raw -LiteralPath $ciWorkflowPath
$compose = Get-Content -Raw -LiteralPath $composePath

$uvSetupMatch = [regex]::Match(
    $ciWorkflow,
    '(?ms)uses: astral-sh/setup-uv@.*?^\s+version: "(?<version>[^"]+)"'
)
if (-not $uvSetupMatch.Success) { throw "Unable to resolve the locked uv version from CI." }
$uvVersion = $uvSetupMatch.Groups["version"].Value

$postgresMatch = [regex]::Match($compose, 'image: postgres:(?<version>[0-9]+\.[0-9]+)-')
$redisMatch = [regex]::Match($compose, 'image: redis:(?<version>[0-9]+\.[0-9]+\.[0-9]+)-')
if (-not $postgresMatch.Success -or -not $redisMatch.Success) {
    throw "Unable to resolve PostgreSQL/Redis versions from docker-compose.dev.yml."
}
$postgresVersion = $postgresMatch.Groups["version"].Value
$redisVersion = $redisMatch.Groups["version"].Value

$aiogramVersion = Get-UvLockedVersion -PackageName "aiogram"
$httpxVersion = Get-UvLockedVersion -PackageName "httpx"
$httpcoreVersion = Get-UvLockedVersion -PackageName "httpcore"
$tmaReactVersion = $frontendPackage.dependencies.'@tma.js/sdk-react'
$tmaSdkVersion = Get-PnpmLockedVersion -PackageName "@tma.js/sdk"
$tiptapVersions = @(
    $frontendPackage.dependencies.PSObject.Properties |
        Where-Object { $_.Name -like '@tiptap/*' } |
        ForEach-Object { [string]$_.Value } |
        Sort-Object -Unique
)
if ($tiptapVersions.Count -ne 1) {
    $inconsistent.Add(
        "frontend/package.json must keep one reviewed Tiptap version; found: " +
        ($tiptapVersions -join ", ")
    )
}
$tiptapVersion = $tiptapVersions[0]

foreach ($requiredCiText in @(
    "python-version: `"$pythonVersion`"",
    "node-version: `"$nodeVersion`""
)) {
    if ($ciWorkflow -notmatch [regex]::Escape($requiredCiText)) {
        $inconsistent.Add(".github/workflows/ci.yml is missing: $requiredCiText")
    }
}
if ($frontendPackage.engines.node -ne ">=$nodeVersion <25") {
    $inconsistent.Add(
        "frontend/package.json Node engine $($frontendPackage.engines.node) does not match " +
        "frontend/.node-version $nodeVersion."
    )
}

Require-DocumentText "docs/DEV_ENVIRONMENT.md" @(
    "Python $pythonVersion", "uv $uvVersion", "Node.js $nodeVersion LTS", "pnpm $pnpmVersion",
    "PostgreSQL $postgresVersion", "Redis $redisVersion"
)
Require-DocumentText "docs/PROJECT_STATE.md" @(
    "Python $pythonVersion/uv $uvVersion", "Node $nodeVersion LTS", "pnpm $pnpmVersion",
    "PostgreSQL $postgresVersion", "Redis $redisVersion"
)
Require-DocumentText "docs/TESTING.md" @(
    "Python $pythonVersion/uv $uvVersion", "Node $nodeVersion LTS/pnpm $pnpmVersion",
    "PostgreSQL $postgresVersion", "Redis $redisVersion"
)
Require-DocumentText "docs/INTEGRATIONS.md" @(
    "Locked aiogram $aiogramVersion", "@tma.js/sdk-react $tmaReactVersion",
    "@tma.js/sdk $tmaSdkVersion", "HTTPX $httpxVersion/httpcore $httpcoreVersion"
)
Require-DocumentText "docs/decisions/0003-tribute-managed-checkout-and-entitlements.md" @(
    "Tiptap $tiptapVersion"
)

$canonicalToolchainDocs = @(
    "docs/DEV_ENVIRONMENT.md", "docs/PROJECT_STATE.md", "docs/TESTING.md"
)
foreach ($relativePath in $canonicalToolchainDocs) {
    Require-ExactDocumentVersions $relativePath "Node" 'Node(?:\.js)?\s+(?<version>[0-9]+\.[0-9]+\.[0-9]+)' $nodeVersion
    Require-ExactDocumentVersions $relativePath "Python" 'Python\s+(?<version>[0-9]+\.[0-9]+\.[0-9]+)' $pythonVersion
    Require-ExactDocumentVersions $relativePath "pnpm" 'pnpm\s+(?<version>[0-9]+\.[0-9]+\.[0-9]+)' $pnpmVersion
    Require-ExactDocumentVersions $relativePath "uv" 'uv\s+(?<version>[0-9]+\.[0-9]+\.[0-9]+)' $uvVersion
}
Require-ExactDocumentVersions "docs/INTEGRATIONS.md" "aiogram" 'Locked aiogram\s+(?<version>[0-9]+\.[0-9]+\.[0-9]+)' $aiogramVersion
Require-ExactDocumentVersions "docs/INTEGRATIONS.md" "@tma.js/sdk-react" '@tma\.js/sdk-react\s+(?<version>[0-9]+\.[0-9]+\.[0-9]+)' $tmaReactVersion
Require-ExactDocumentVersions "docs/INTEGRATIONS.md" "@tma.js/sdk" '@tma\.js/sdk\s+(?<version>[0-9]+\.[0-9]+\.[0-9]+)' $tmaSdkVersion
Require-ExactDocumentVersions "docs/decisions/0003-tribute-managed-checkout-and-entitlements.md" "Tiptap" 'Tiptap\s+(?<version>[0-9]+\.[0-9]+\.[0-9]+)' $tiptapVersion

if ($inconsistent.Count -gt 0) {
    throw "Documentation/executable version conflicts:`n$($inconsistent -join "`n")"
}

Write-Host "Repository Markdown links and executable version claims are consistent."
