[CmdletBinding()]
param(
    [string]$Version,
    [string]$OutputDirectory,
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$versionPatternText = '(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)' +
    '(?:-(?:alpha|beta|rc|pre)\.(?:0|[1-9]\d*))?'
$versionPattern = "^$versionPatternText`$"
$headerPattern = "^## (?<version>$versionPatternText) — (?<date>\d{4}-\d{2}-\d{2})`$"

function Get-RequiredFileContent {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required release file is missing: $Path"
    }
    return (Get-Content -Raw -LiteralPath $Path).Replace("`r`n", "`n")
}

function Get-FirstPreparedVersion {
    param([Parameter(Mandatory)][string]$Path)

    $content = Get-RequiredFileContent -Path $Path
    foreach ($line in $content -split "`n") {
        if ($line -eq "## Unreleased") { continue }
        if ($line -cmatch '^## (?<version>\S+)') {
            if ($line -cnotmatch $script:headerPattern) {
                throw "Malformed release heading in ${Path}: $line"
            }
            return $Matches.version
        }
    }
    return $null
}

function Get-PythonVersion {
    param([Parameter(Mandatory)][string]$ReleaseVersion)

    if ($ReleaseVersion -cnotmatch '^(?<base>\d+\.\d+\.\d+)(?:-(?<channel>alpha|beta|rc|pre)\.(?<number>\d+))?$') {
        throw "Invalid release version: $ReleaseVersion"
    }
    $baseVersion = $Matches['base']
    $channel = $Matches['channel']
    $number = $Matches['number']
    if (-not $channel) { return $baseVersion }

    $pythonChannel = switch ($channel) {
        "alpha" { "a" }
        "beta" { "b" }
        default { "rc" }
    }
    return "$baseVersion$pythonChannel$number"
}

function Get-ProjectVersion {
    param([Parameter(Mandatory)][string]$Path)

    $content = Get-RequiredFileContent -Path $Path
    $project = [regex]::Match($content, '(?ms)^\[project\]\s*(?<body>.*?)(?=^\[|\z)')
    if (-not $project.Success) { throw "[project] is missing in $Path" }
    $match = [regex]::Match($project.Groups['body'].Value, '(?m)^version\s*=\s*"(?<version>[^"]+)"\s*$')
    if (-not $match.Success) { throw "[project].version is missing in $Path" }
    return $match.Groups['version'].Value
}

function Get-UvPackageVersion {
    param([Parameter(Mandatory)][string]$Path)

    $content = Get-RequiredFileContent -Path $Path
    foreach ($package in [regex]::Matches(
        $content,
        '(?ms)^\[\[package\]\]\s*(?<body>.*?)(?=^\[\[package\]\]|\z)'
    )) {
        $body = $package.Groups['body'].Value
        if ($body -notmatch '(?m)^name\s*=\s*"flowvy"\s*$') { continue }
        $match = [regex]::Match($body, '(?m)^version\s*=\s*"(?<version>[^"]+)"\s*$')
        if (-not $match.Success) { throw "Flowvy package version is missing in $Path" }
        return $match.Groups['version'].Value
    }
    throw "Flowvy package is missing in $Path"
}

function Get-ChangelogRelease {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$ReleaseVersion,
        [Parameter(Mandatory)][hashtable]$Categories
    )

    $content = Get-RequiredFileContent -Path $Path
    $lines = @($content -split "`n")
    $headerIndexes = [System.Collections.Generic.List[int]]::new()
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -cmatch $script:headerPattern -and $Matches.version -ceq $ReleaseVersion) {
            $headerIndexes.Add($index)
        }
    }
    if ($headerIndexes.Count -ne 1) {
        throw "$Path must contain exactly one release heading for $ReleaseVersion."
    }

    $headerIndex = $headerIndexes[0]
    [void]($lines[$headerIndex] -cmatch $script:headerPattern)
    $releaseDateText = $Matches.date
    try {
        $releaseDate = [datetime]::ParseExact(
            $releaseDateText,
            "yyyy-MM-dd",
            [Globalization.CultureInfo]::InvariantCulture,
            [Globalization.DateTimeStyles]::AssumeUniversal
        )
    }
    catch {
        throw "Invalid release date in ${Path}: $releaseDateText"
    }
    if ($releaseDate.Date -gt [datetime]::UtcNow.Date) {
        throw "Release date cannot be in the future in ${Path}: $releaseDateText"
    }

    $endIndex = $lines.Count
    for ($index = $headerIndex + 1; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -cmatch '^## ') {
            $endIndex = $index
            break
        }
    }

    $bodyLines = [System.Collections.Generic.List[string]]::new()
    for ($index = $headerIndex + 1; $index -lt $endIndex; $index++) {
        $bodyLines.Add($lines[$index])
    }
    while ($bodyLines.Count -gt 0 -and [string]::IsNullOrWhiteSpace($bodyLines[0])) {
        $bodyLines.RemoveAt(0)
    }
    while (
        $bodyLines.Count -gt 0 -and
        [string]::IsNullOrWhiteSpace($bodyLines[$bodyLines.Count - 1])
    ) {
        $bodyLines.RemoveAt($bodyLines.Count - 1)
    }
    if ($bodyLines.Count -eq 0) { throw "Release notes are empty in $Path for $ReleaseVersion." }

    $categoryKeys = [System.Collections.Generic.List[string]]::new()
    $bulletCounts = @{}
    $currentKey = $null
    $lastOrder = -1
    foreach ($line in $bodyLines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -cmatch '^### (?<title>.+)$') {
            $title = $Matches.title
            if (@($Categories.Keys) -cnotcontains $title) {
                throw "Unsupported release category in ${Path}: $title"
            }
            $category = $Categories[$title]
            if ($category.Order -le $lastOrder) {
                throw "Release categories are duplicated or out of order in ${Path}: $title"
            }
            $lastOrder = $category.Order
            $currentKey = $category.Key
            $categoryKeys.Add($currentKey)
            $bulletCounts[$currentKey] = 0
            continue
        }
        if ($line -match '^- \S') {
            if (-not $currentKey) { throw "Release item appears before a category in ${Path}: $line" }
            $bulletCounts[$currentKey]++
            continue
        }
        throw "Unsupported release-notes line in ${Path}: $line"
    }

    if ($categoryKeys.Count -eq 0) { throw "Release categories are missing in $Path." }
    foreach ($key in $categoryKeys) {
        if ($bulletCounts[$key] -eq 0) { throw "Release category is empty in ${Path}: $key" }
    }

    return [pscustomobject]@{
        Date = $releaseDateText
        CategoryKeys = @($categoryKeys)
        BulletCounts = $bulletCounts
        Notes = [string]::Join("`n", $bodyLines)
    }
}

$englishChangelog = Join-Path $RepositoryRoot "CHANGELOG.md"
$russianChangelog = Join-Path $RepositoryRoot "CHANGELOG.ru.md"

if (-not $Version) {
    $englishPreparedVersion = Get-FirstPreparedVersion -Path $englishChangelog
    $russianPreparedVersion = Get-FirstPreparedVersion -Path $russianChangelog
    if (-not $englishPreparedVersion -and -not $russianPreparedVersion) {
        Write-Host "No versioned release is prepared; both changelogs contain only Unreleased content."
        return
    }
    if ($englishPreparedVersion -ne $russianPreparedVersion) {
        throw "The newest prepared versions differ between CHANGELOG.md and CHANGELOG.ru.md."
    }
    $Version = $englishPreparedVersion
}

if ($Version -cnotmatch $versionPattern) {
    throw "Invalid release version '$Version'. Expected X.Y.Z or X.Y.Z-(alpha|beta|rc|pre).N without v."
}

$frontendPackagePath = Join-Path (Join-Path $RepositoryRoot "frontend") "package.json"
$frontendPackage = Get-RequiredFileContent -Path $frontendPackagePath | ConvertFrom-Json
if ($frontendPackage.version -ne $Version) {
    throw "frontend/package.json version '$($frontendPackage.version)' does not match '$Version'."
}

$expectedPythonVersion = Get-PythonVersion -ReleaseVersion $Version
$backendProjectPath = Join-Path (Join-Path $RepositoryRoot "backend") "pyproject.toml"
$backendProjectVersion = Get-ProjectVersion -Path $backendProjectPath
if ($backendProjectVersion -ne $expectedPythonVersion) {
    throw "backend/pyproject.toml version '$backendProjectVersion' does not match '$expectedPythonVersion'."
}
$backendLockPath = Join-Path (Join-Path $RepositoryRoot "backend") "uv.lock"
$backendLockVersion = Get-UvPackageVersion -Path $backendLockPath
if ($backendLockVersion -ne $expectedPythonVersion) {
    throw "backend/uv.lock Flowvy version '$backendLockVersion' does not match '$expectedPythonVersion'."
}

$englishCategories = @{
    "New" = @{ Key = "new"; Order = 0 }
    "Improved" = @{ Key = "improved"; Order = 1 }
    "Fixed" = @{ Key = "fixed"; Order = 2 }
    "Security" = @{ Key = "security"; Order = 3 }
}
$russianCategories = @{
    "Новое" = @{ Key = "new"; Order = 0 }
    "Улучшения" = @{ Key = "improved"; Order = 1 }
    "Исправления" = @{ Key = "fixed"; Order = 2 }
    "Безопасность" = @{ Key = "security"; Order = 3 }
}

$englishRelease = Get-ChangelogRelease `
    -Path $englishChangelog `
    -ReleaseVersion $Version `
    -Categories $englishCategories
$russianRelease = Get-ChangelogRelease `
    -Path $russianChangelog `
    -ReleaseVersion $Version `
    -Categories $russianCategories

if ($englishRelease.Date -ne $russianRelease.Date) {
    throw "Release dates differ between the English and Russian changelogs for $Version."
}
if ([string]::Join(",", $englishRelease.CategoryKeys) -ne [string]::Join(",", $russianRelease.CategoryKeys)) {
    throw "Release categories differ between the English and Russian changelogs for $Version."
}
foreach ($key in $englishRelease.CategoryKeys) {
    if ($englishRelease.BulletCounts[$key] -ne $russianRelease.BulletCounts[$key]) {
        throw "Release item count differs for category '$key' between the changelogs."
    }
}

if ($OutputDirectory) {
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
    $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText(
        (Join-Path $OutputDirectory "release-notes.md"),
        "$($englishRelease.Notes)`n",
        $utf8WithoutBom
    )
    [System.IO.File]::WriteAllText(
        (Join-Path $OutputDirectory "release-notes.ru.md"),
        "$($russianRelease.Notes)`n",
        $utf8WithoutBom
    )
}

$releaseKind = if ($Version.Contains("-")) { "prerelease" } else { "stable" }
Write-Host "Release metadata is valid: $Version ($releaseKind, $($englishRelease.Date))."
