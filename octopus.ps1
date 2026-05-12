# octopus.ps1 — Octopus CLI launcher
# Starts the Python memory service if needed, then launches the interactive CLI.
# Works from any directory after install.ps1 adds the project to PATH.

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$NodeDir   = Join-Path $ScriptDir "node"
$McpEntry  = Join-Path $NodeDir "src\mcp.js"

# Load .env into the current session
$EnvFile = Join-Path $NodeDir ".env"
if (Test-Path $EnvFile) {
    foreach ($line in (Get-Content $EnvFile -Encoding UTF8)) {
        if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
        $parts = $line -split '=', 2
        $key   = $parts[0].Trim()
        $val   = $parts[1].Trim()
        if ($key -and -not [System.Environment]::GetEnvironmentVariable($key)) {
            [System.Environment]::SetEnvironmentVariable($key, $val, 'Process')
        }
    }
}

# Detect Python
$pyCmd = $null
foreach ($cmd in @('py', 'python3', 'python')) {
    try { if ((& $cmd --version 2>&1) -and $LASTEXITCODE -eq 0) { $pyCmd = $cmd; break } } catch {}
}

# Start memory service in background if not running
$memRunning = $false
try {
    $null = Invoke-WebRequest "http://localhost:5000/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    $memRunning = $true
} catch {}

if (-not $memRunning -and $pyCmd) {
    $memScript = Join-Path $ScriptDir "python\services\memory_service.py"
    $script:memProc = Start-Process -PassThru -NoNewWindow -FilePath $pyCmd `
        -ArgumentList $memScript `
        -WorkingDirectory (Join-Path $ScriptDir "python")
    Start-Sleep -Seconds 2
}

# Run the CLI
try {
    & node (Join-Path $NodeDir "src\cli.js") @args
} finally {
    if ($script:memProc -and -not $script:memProc.HasExited) {
        Stop-Process -Id $script:memProc.Id -Force -ErrorAction SilentlyContinue
    }
}
