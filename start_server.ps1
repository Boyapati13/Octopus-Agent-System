# start_server.ps1 - Octopus 3.0 OctoDeck Edition
# Starts REST API + WebSocket (:3001) + Python memory service (:5000)

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

function Kill-Port {
    param([int]$p)
    try {
        $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
        if ($conns) {
            $pids = $conns.OwningProcess | Sort-Object -Unique
            foreach ($id in $pids) {
                Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Milliseconds 800
            WARN "Cleared stale process(es) on :$p"
        }
    } catch {}
}

Write-Host ""
Write-Host "  Octopus 3.0 - OctoDeck Edition" -ForegroundColor Magenta
Write-Host "  REST API + WebSocket + Memory Service" -ForegroundColor DarkGray
Write-Host ""

# -- 0. Clear stale port holders ----------------------------------------------

INFO "Clearing ports $Port and 5000..."
Kill-Port $Port
Kill-Port 5000
OK "Ports $Port and 5000 are free"

# -- 1. Prerequisites ---------------------------------------------------------

$pyCmd = $null
foreach ($cmd in @('py', 'python3', 'python')) {
    try { if ((& $cmd --version 2>&1) -and $LASTEXITCODE -eq 0) { $pyCmd = $cmd; break } } catch {}
}
if (-not $pyCmd) { FAIL "Python not found. Install from https://python.org"; exit 1 }
OK "Python: $pyCmd $((& $pyCmd --version 2>&1))"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    FAIL "Node.js not found. Install from https://nodejs.org (LTS >= 18)"; exit 1
}
OK "Node.js: $(node --version)"

$NodeDir = Join-Path $ScriptDir "node"
if (-not (Test-Path (Join-Path $NodeDir "node_modules"))) {
    WARN "node_modules missing - running npm install..."
    Push-Location $NodeDir; npm install --silent; Pop-Location
}
if (-not (Test-Path (Join-Path $NodeDir "node_modules\ws"))) {
    WARN "ws missing - installing..."
    Push-Location $NodeDir; npm install ws --save --silent; Pop-Location
}

$PythonReqs = Join-Path $ScriptDir "python\requirements.txt"
if (Test-Path $PythonReqs) {
    try {
        & $pyCmd -m pip install -r $PythonReqs -q --disable-pip-version-check 2>&1 | Out-Null
        OK "Python dependencies up to date"
    } catch {
        WARN "Python dependency check returned a warning; continuing startup"
    }
}

# -- 2. .env ------------------------------------------------------------------

$EnvFile = Join-Path $NodeDir ".env"
if (-not (Test-Path $EnvFile)) {
    $RulesDir = Join-Path $ScriptDir ".claude\rules"
    @"
MEMORY_SERVICE_URL=http://localhost:5000
DATA_DIR=../data
PORT=$Port
SAFE_MODE=false
HEADLESS_MODE=false
MAX_THINKING_TOKENS=10000
COMPACT_THRESHOLD=50
AGENTSHIELD_MODE=advisory
ECC_HOOK_PROFILE=standard
PROJECT_ROOT=$ScriptDir
ECC_RULES_PATH=$RulesDir
LLM_PROVIDER=ollama
LLM_MODEL=gemma4:e2b
OLLAMA_BASE_URL=http://localhost:11434
SOVEREIGN_FALLBACK_MODEL=gemma4:e2b
CUSTOM_HTTP_URL=
CUSTOM_HTTP_MODEL=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
NVIDIA_API_KEY=
"@ | Out-File -FilePath $EnvFile -Encoding utf8
    OK ".env created"
}

# -- 3. Ollama ----------------------------------------------------------------

Write-Host ""
INFO "Checking Ollama..."
$ollamaOnline = $false
try {
    $r = Invoke-WebRequest "http://localhost:11434/api/tags" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    $models = ($r.Content | ConvertFrom-Json).models.name
    $ollamaOnline = $true
    OK "Ollama online - $($models.Count) model(s): $($models -join ', ')"
} catch {
    $ollamaExe = @(
        "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
        "C:\Program Files\Ollama\ollama.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($ollamaExe) {
        WARN "Ollama installed but not running - auto-starting..."
        Start-Process -FilePath $ollamaExe -ArgumentList "serve" -NoNewWindow
        Start-Sleep -Seconds 4
        try {
            Invoke-WebRequest "http://localhost:11434/api/tags" -TimeoutSec 4 -UseBasicParsing -ErrorAction Stop | Out-Null
            $ollamaOnline = $true; OK "Ollama started"
        } catch { WARN "Ollama did not start - cloud providers only" }
    } else {
        INFO "Ollama not installed - cloud providers only. Run /setup in CLI to configure."
    }
}

# -- 4. Start Python memory service (port 5000) --------------------------------
# Do NOT set $env:PORT here - Flask reads it and would steal the Node port

Write-Host ""
INFO "Starting Python memory service on :5000..."
$MemPy   = Join-Path $ScriptDir "python\services\memory_service.py"
$MemDir  = Join-Path $ScriptDir "python"
$MemProc = Start-Process -NoNewWindow -PassThru -FilePath $pyCmd -ArgumentList $MemPy -WorkingDirectory $MemDir

Start-Sleep -Seconds 3
try {
    Invoke-WebRequest -Uri 'http://localhost:5000/health' -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop | Out-Null
    OK "Memory service ready on :5000"
} catch {
    WARN "Memory service health check timed out. Check python/requirements.txt is installed."
}

# -- 5. Start REST + WebSocket server ------------------------------------------
# Set PORT only here, after Python is already running on 5000

$env:PORT = "$Port"
$NodeScript = Join-Path $NodeDir "src\server.js"

Write-Host ""
INFO "Starting Octopus API on :$Port..."

# Start Node as a plain OS process (not a PS Job - avoids stderr being treated as errors)
$NodeProc = Start-Process -FilePath "node" -ArgumentList $NodeScript `
    -NoNewWindow -PassThru -WorkingDirectory $NodeDir

# Poll /api/health until ready (up to 20 seconds)
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    if ($NodeProc.HasExited) {
        FAIL "Node server exited unexpectedly (exit code $($NodeProc.ExitCode)). Check output above."
        break
    }
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}

if ($ready) {
    OK "Server ready"
} elseif (-not $NodeProc.HasExited) {
    WARN "Server health check timed out - it may still be starting"
}

Write-Host ""
Write-Host "  REST API  : http://localhost:$Port/api/health" -ForegroundColor Cyan
Write-Host "  WebSocket : ws://localhost:$Port/ws"           -ForegroundColor Cyan
Write-Host "  Dashboard : http://localhost:$Port/"            -ForegroundColor Cyan
Write-Host "  Setup     : http://localhost:$Port/setup  (re-run: .\octo setup)" -ForegroundColor Cyan
Write-Host "  CLI       : node node\src\cli.js               " -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services." -ForegroundColor DarkGray
Write-Host ""

# Open root — redirects to /setup on first run, /dashboard thereafter
if (-not $NoBrowser -and $ready) { Start-Process "http://localhost:$Port/" }

# Keep alive until Node exits or Ctrl+C
try {
    $NodeProc.WaitForExit()
} finally {
    Write-Host ""
    INFO "Shutting down memory service..."
    if ($MemProc -and -not $MemProc.HasExited) {
        Stop-Process -Id $MemProc.Id -Force -ErrorAction SilentlyContinue
    }
    # Final port cleanup so next run starts clean
    Kill-Port $Port
    Kill-Port 5000
    INFO "All services stopped. Ports $Port and 5000 released."
}
