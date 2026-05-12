# start_server.ps1 — Octopus 3.0 OctoDeck Edition
# Starts the REST API + WebSocket server (:3001) + Python memory service (:5000).
# Opens the web dashboard automatically.
#
# Usage:
#   .\start_server.ps1                  # default: REST+WS server + memory service
#   .\start_server.ps1 -Port 4001       # custom port
#   .\start_server.ps1 -NoBrowser       # skip auto-opening dashboard
#
# For MCP stdio (Claude Desktop / Cursor / Windsurf) use .\start_mcp.ps1 instead.

param(
    [int]    $Port      = 3001,
    [switch] $NoBrowser = $false
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

function OK   { param($m) Write-Host "  [OK]   $m" -ForegroundColor Green  }
function WARN { param($m) Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function INFO { param($m) Write-Host "  [INFO] $m" -ForegroundColor Cyan   }
function FAIL { param($m) Write-Host "  [FAIL] $m" -ForegroundColor Red    }

Write-Host ""
Write-Host "  🐙 Octopus 3.0 — OctoDeck Edition" -ForegroundColor Magenta
Write-Host "     REST API + WebSocket + Memory Service" -ForegroundColor DarkGray
Write-Host ""

# ── 1. Prerequisites ──────────────────────────────────────────────────────────

# Python
$pyCmd = $null
foreach ($cmd in @('py', 'python3', 'python')) {
    try {
        $ver = (& $cmd --version 2>&1)
        if ($LASTEXITCODE -eq 0) { $pyCmd = $cmd; break }
    } catch { continue }
}
if (-not $pyCmd) {
    FAIL "Python not found. Install from https://python.org then re-run."
    exit 1
}
OK "Python: $pyCmd $((& $pyCmd --version 2>&1))"

# Node
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    FAIL "Node.js not found. Install from https://nodejs.org (LTS ≥ 18) then re-run."
    exit 1
}
OK "Node.js: $(node --version)"

# node_modules
$NodeDir = Join-Path $ScriptDir "node"
if (-not (Test-Path (Join-Path $NodeDir "node_modules"))) {
    WARN "node_modules missing — running npm install..."
    Push-Location $NodeDir; npm install --silent; Pop-Location
    OK "npm install complete"
}

# ws package (required for WebSocket server)
if (-not (Test-Path (Join-Path $NodeDir "node_modules\ws"))) {
    WARN "ws package missing — installing..."
    Push-Location $NodeDir; npm install ws --save --silent; Pop-Location
    OK "ws installed"
}

# Python dependencies
$PythonReqs = Join-Path $ScriptDir "python\requirements.txt"
if (Test-Path $PythonReqs) {
    & $pyCmd -m pip install -r $PythonReqs -q --disable-pip-version-check 2>$null
    OK "Python dependencies up to date"
} else {
    WARN "python/requirements.txt not found — skipping pip install"
}

# ── 2. .env ───────────────────────────────────────────────────────────────────

$EnvFile = Join-Path $NodeDir ".env"
if (-not (Test-Path $EnvFile)) {
    WARN ".env not found — running install.ps1 first..."
    & (Join-Path $ScriptDir "install.ps1")
}
$env:PORT = "$Port"

# ── 3. Ollama (optional — sovereign fallback) ─────────────────────────────────

Write-Host ""
INFO "Checking Ollama..."
$ollamaOnline = $false
try {
    $r = Invoke-WebRequest "http://localhost:11434/api/tags" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    $models = ($r.Content | ConvertFrom-Json).models.name
    $ollamaOnline = $true
    OK "Ollama online — $($models.Count) model(s)"
} catch {
    # Try to auto-start
    $ollamaExe = @(
        "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
        "C:\Program Files\Ollama\ollama.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($ollamaExe) {
        WARN "Ollama installed but not running — auto-starting..."
        Start-Process -FilePath $ollamaExe -ArgumentList "serve" -NoNewWindow
        Start-Sleep -Seconds 4
        try {
            Invoke-WebRequest "http://localhost:11434/api/tags" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop | Out-Null
            $ollamaOnline = $true
            OK "Ollama started"
        } catch {
            WARN "Ollama did not start in time — Sovereign Fallback unavailable (cloud providers only)"
        }
    } else {
        INFO "Ollama not installed — cloud providers only. Install at https://ollama.ai for local Gemma."
    }
}

# ── 4. Start Python memory service ───────────────────────────────────────────

Write-Host ""
INFO "Starting Python memory service on :5000..."
$MemPy = Join-Path $ScriptDir "python\services\memory_service.py"
$MemDir = Join-Path $ScriptDir "python"
$MemProc = Start-Process `
    -NoNewWindow -PassThru `
    -FilePath $pyCmd `
    -ArgumentList $MemPy `
    -WorkingDirectory $MemDir

Start-Sleep -Seconds 3
$memOk = $false
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:5000/health' -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    $memOk = $true
    OK "Memory service ready on :5000"
} catch {
    WARN "Memory service health check timed out. Check python/requirements.txt is installed."
}

# ── 5. Start REST + WebSocket server ─────────────────────────────────────────

Write-Host ""
OK "All checks complete — starting Octopus API server on :$Port"
Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────────┐" -ForegroundColor Cyan
Write-Host "  │  REST API    http://localhost:$Port/api/health       │" -ForegroundColor Cyan
Write-Host "  │  WebSocket   ws://localhost:$Port/ws                 │" -ForegroundColor Cyan
Write-Host "  │  Dashboard   http://localhost:$Port/dashboard         │" -ForegroundColor Cyan
Write-Host "  └─────────────────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services." -ForegroundColor DarkGray
Write-Host ""

# Auto-open dashboard
if (-not $NoBrowser) {
    Start-Process "http://localhost:$Port/dashboard"
}

# Run server in foreground (blocks until Ctrl+C)
try {
    $env:PORT = "$Port"
    & node (Join-Path $NodeDir "src\server.js")
} finally {
    Write-Host ""
    INFO "Shutting down memory service..."
    if ($MemProc -and -not $MemProc.HasExited) {
        Stop-Process -Id $MemProc.Id -Force -ErrorAction SilentlyContinue
    }
    INFO "Stopped."
}
