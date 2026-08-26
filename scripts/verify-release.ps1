[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$releaseFixtureRoot = Join-Path (
    [System.IO.Path]::GetTempPath()
) "flowvy-release-$([guid]::NewGuid().ToString('N'))"
$releaseFixtureBackend = Join-Path $releaseFixtureRoot "backend"
$releaseFixtureFrontend = Join-Path $releaseFixtureRoot "frontend"
$releaseFixtureOutput = Join-Path $releaseFixtureRoot "output"
New-Item -ItemType Directory -Force -Path $releaseFixtureBackend, $releaseFixtureFrontend | Out-Null

try {
    @'
[project]
name = "flowvy"
version = "1.2.3"
'@ | Set-Content -LiteralPath (Join-Path $releaseFixtureBackend "pyproject.toml") -Encoding utf8
    @'
version = 1

[[package]]
name = "flowvy"
version = "1.2.3"
'@ | Set-Content -LiteralPath (Join-Path $releaseFixtureBackend "uv.lock") -Encoding utf8
    @'
{
  "name": "flowvy-frontend",
  "version": "1.2.3"
}
'@ | Set-Content -LiteralPath (Join-Path $releaseFixtureFrontend "package.json") -Encoding utf8
    @'
# Changelog

## 1.2.3 — 2026-08-26

### New

- A user-visible capability.

### Fixed

- A user-visible correction.
'@ | Set-Content -LiteralPath (Join-Path $releaseFixtureRoot "CHANGELOG.md") -Encoding utf8
    @'
# Список изменений

## 1.2.3 — 2026-08-26

### Новое

- Новая пользовательская возможность.

### Исправления

- Пользовательское исправление.
'@ | Set-Content -LiteralPath (Join-Path $releaseFixtureRoot "CHANGELOG.ru.md") -Encoding utf8

    & (Join-Path $PSScriptRoot "release.ps1") `
        -Version "1.2.3" `
        -RepositoryRoot $releaseFixtureRoot `
        -OutputDirectory $releaseFixtureOutput
    $expectedNotes = "### New`n`n- A user-visible capability.`n`n### Fixed`n`n- A user-visible correction.`n"
    $actualNotes = [System.IO.File]::ReadAllText(
        (Join-Path $releaseFixtureOutput "release-notes.md")
    ).Replace("`r`n", "`n")
    if ($actualNotes -ne $expectedNotes) {
        throw "Release helper did not extract the exact English changelog section."
    }

    $invalidVersionFailed = $false
    try {
        & (Join-Path $PSScriptRoot "release.ps1") `
            -Version "v1.2.3" `
            -RepositoryRoot $releaseFixtureRoot
    }
    catch {
        $invalidVersionFailed = $true
    }
    if (-not $invalidVersionFailed) { throw "Release helper accepted a v-prefixed tag." }

    Add-Content `
        -LiteralPath (Join-Path $releaseFixtureRoot "CHANGELOG.ru.md") `
        -Value "- Лишний несинхронизированный пункт."
    $mismatchedChangelogFailed = $false
    try {
        & (Join-Path $PSScriptRoot "release.ps1") `
            -Version "1.2.3" `
            -RepositoryRoot $releaseFixtureRoot
    }
    catch {
        $mismatchedChangelogFailed = $true
    }
    if (-not $mismatchedChangelogFailed) {
        throw "Release helper accepted changelogs with different item counts."
    }

    @'
[project]
name = "flowvy"
version = "1.2.4b2"
'@ | Set-Content -LiteralPath (Join-Path $releaseFixtureBackend "pyproject.toml") -Encoding utf8
    @'
version = 1

[[package]]
name = "flowvy"
version = "1.2.4b2"
'@ | Set-Content -LiteralPath (Join-Path $releaseFixtureBackend "uv.lock") -Encoding utf8
    @'
{
  "name": "flowvy-frontend",
  "version": "1.2.4-beta.2"
}
'@ | Set-Content -LiteralPath (Join-Path $releaseFixtureFrontend "package.json") -Encoding utf8
    @'
## 1.2.4-beta.2 — 2026-08-26

### Improved

- A prerelease improvement.
'@ | Set-Content -LiteralPath (Join-Path $releaseFixtureRoot "CHANGELOG.md") -Encoding utf8
    @'
## 1.2.4-beta.2 — 2026-08-26

### Улучшения

- Улучшение предварительной версии.
'@ | Set-Content -LiteralPath (Join-Path $releaseFixtureRoot "CHANGELOG.ru.md") -Encoding utf8
    & (Join-Path $PSScriptRoot "release.ps1") `
        -Version "1.2.4-beta.2" `
        -RepositoryRoot $releaseFixtureRoot
}
finally {
    if (Test-Path -LiteralPath $releaseFixtureRoot) {
        Remove-Item -LiteralPath $releaseFixtureRoot -Recurse -Force
    }
}

Write-Host "Release metadata fixtures are consistent."
