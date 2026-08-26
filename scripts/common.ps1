$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw "Flowvy lifecycle scripts require PowerShell 7 or newer."
}
if (-not $IsMacOS) {
    throw "Flowvy local development scripts require macOS."
}

function Get-FlowvyNamedPreviewPort {
    return 4173
}

function Resolve-FlowvyExecutable {
    param([Parameter(Mandatory)][string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command -and $command.CommandType -eq "Application") {
        if ($command.Source) { return $command.Source }
        return $command.Path
    }
    throw "Required tool '$Name' was not found on PATH."
}

function Test-FlowvyTcpPort {
    param(
        [Parameter(Mandatory)][ValidateRange(1, 65535)][int]$Port,
        [string]$HostName = "127.0.0.1",
        [ValidateRange(50, 5000)][int]$TimeoutMilliseconds = 250
    )

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connect = $client.ConnectAsync($HostName, $Port)
        if (-not $connect.Wait($TimeoutMilliseconds)) { return $false }
        return $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Start-FlowvyBackgroundProcess {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$ArgumentList,
        [Parameter(Mandatory)][string]$WorkingDirectory,
        [Parameter(Mandatory)][string]$StandardOutputPath,
        [Parameter(Mandatory)][string]$StandardErrorPath
    )

    $startParameters = @{
        FilePath = $FilePath
        ArgumentList = $ArgumentList
        WorkingDirectory = $WorkingDirectory
        RedirectStandardOutput = $StandardOutputPath
        RedirectStandardError = $StandardErrorPath
        PassThru = $true
    }
    Start-Process @startParameters
}

function Get-FlowvyChildProcessIds {
    param([Parameter(Mandatory)][int]$TargetProcessId)

    $pgrep = Get-Command "pgrep" -ErrorAction SilentlyContinue
    if (-not $pgrep) {
        throw "pgrep is required to stop Flowvy-owned process trees on macOS."
    }
    $childIds = & $pgrep.Source -P $TargetProcessId 2>$null
    return @($childIds | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ })
}

$script:FlowvyAllowedChildProcessNames = @(
    "uv", "python", "python3", "python3.14", "flowvy",
    "pnpm", "node", "esbuild", "sh", "bash", "zsh", "cloudflared"
)

function Stop-FlowvyOwnedProcessTree {
    param(
        [Parameter(Mandatory)][int]$TargetProcessId,
        [string[]]$AllowedRootNames = @(),
        [Nullable[datetime]]$ExpectedStartTime,
        [switch]$SkipIfOwnershipChanged,
        [string[]]$AllowedChildNames = $script:FlowvyAllowedChildProcessNames
    )

    $target = Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue
    if (-not $target) { return }
    if ($AllowedRootNames.Count -gt 0 -and $target.ProcessName -notin $AllowedRootNames) {
        if ($SkipIfOwnershipChanged) { return }
        throw "PID $TargetProcessId now belongs to $($target.ProcessName); refusing to stop it."
    }
    if (
        $null -ne $ExpectedStartTime -and
        [math]::Abs(($target.StartTime - [datetime]$ExpectedStartTime).TotalSeconds) -gt 2
    ) {
        if ($SkipIfOwnershipChanged) { return }
        throw "PID $TargetProcessId was reused after the recorded start; refusing to stop it."
    }

    foreach ($childId in Get-FlowvyChildProcessIds -TargetProcessId $TargetProcessId) {
        $child = Get-Process -Id $childId -ErrorAction SilentlyContinue
        if (-not $child) { continue }
        if ($child.ProcessName -notin $AllowedChildNames) {
            throw (
                "Flowvy-owned PID $TargetProcessId has unexpected child " +
                "$childId ($($child.ProcessName)); refusing recursive stop."
            )
        }
        Stop-FlowvyOwnedProcessTree `
            -TargetProcessId $childId `
            -AllowedRootNames $AllowedChildNames `
            -ExpectedStartTime $child.StartTime `
            -SkipIfOwnershipChanged `
            -AllowedChildNames $AllowedChildNames
    }

    $current = Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue
    if (-not $current) { return }
    if (
        $current.ProcessName -ne $target.ProcessName -or
        [math]::Abs(($current.StartTime - $target.StartTime).TotalSeconds) -gt 2
    ) {
        if ($SkipIfOwnershipChanged) { return }
        throw "PID $TargetProcessId changed ownership before shutdown; refusing to stop it."
    }
    Stop-Process -Id $TargetProcessId -Force -ErrorAction SilentlyContinue
    if (-not $current.WaitForExit(5000)) {
        throw "Flowvy-owned PID $TargetProcessId did not exit after shutdown."
    }
}

function Get-FlowvyNullDevice {
    return "/dev/null"
}
