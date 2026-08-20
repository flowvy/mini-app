[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$docsDir = Join-Path $repoRoot "docs"
$plansDir = Join-Path $repoRoot "plans"
$agentsDir = Join-Path $repoRoot ".agents"
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$docFiles = @(
    Get-Item `
        (Join-Path $repoRoot "README.md"), `
        (Join-Path $repoRoot "AGENTS.md"), `
        (Join-Path $repoRoot "PLANS.md") `
        -ErrorAction SilentlyContinue
    Get-ChildItem $docsDir, $plansDir, $agentsDir -Recurse -File -Filter "*.md" -ErrorAction SilentlyContinue
    Get-ChildItem $backendDir, $frontendDir -Recurse -File -Filter "AGENTS.md" -ErrorAction SilentlyContinue
) | Sort-Object FullName -Unique

$broken = [System.Collections.Generic.List[string]]::new()
$linkPattern = '\[[^\]]+\]\((?<target>[^)]+)\)'

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

Write-Host "Repository Markdown links resolve locally."
