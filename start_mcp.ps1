# start_mcp.ps1 — Octopus 2.0 Sovereign Edition
# Self-Healing Startup: dependency checks, vault pre-flight, Python + Node launch.
# Compatible with Windows Python 3.14 (uses 'py' launcher) and Node 18+.

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

function Octolog  { param($m) Write-Host "  [OK]   $m" -ForegroundColor Green }
function Octowarn { param($m) Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Octoinfo { param($m) Write-Host "  [INFO] $m" -ForegroundColor Cyan }
function Octofail { param($m) Write-Host "  [FAIL] $m" -ForegroundColor Red }

Write-Host ""
Write-Host "  🐙 Octopus 2.0 — Sovereign Edition" -ForegroundColor Magenta
Write-Host ""

# ── Self-Healing Check 1: Python command ──────────────────────────────────────
$pyCmd = $null
foreach ($cmd in @('py', 'python3', 'python')) {
    try {
        $ver = (& $cmd --version 2>&1)
        if ($LASTEXITCODE -eq 0) { $pyCmd = $cmd; break }
    } catch { continue }
}
if (-not $pyCmd) {
    Octofail "Python not found. Install from https://python.org (adds 'py' launcher on Windows)."
    exit 1
}
Octolog "Python: $pyCmd $((& $pyCmd --version 2>&1))"

# ── Self-Healing Check 2: Node.js ─────────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Octofail "Node.js not found. Install from https://nodejs.org (LTS)."
    exit 1
}
Octolog "Node.js: $(node --version)"

# ── Self-Healing Check 3: node_modules ────────────────────────────────────────
$nodeModulesDir = Join-Path $ScriptDir "node\node_modules"
if (-not (Test-Path $nodeModulesDir)) {
    Octowarn "node_modules not found — running npm install..."
    Push-Location (Join-Path $ScriptDir "node")
    npm install --silent
    Pop-Location
    Octolog "npm install complete"
} else {
    Octolog "node_modules present"
}

# ── Self-Healing Check 4: keytar native build ─────────────────────────────────
$keytarDir = Join-Path $ScriptDir "node\node_modules\keytar"
if (-not (Test-Path $keytarDir)) {
    Octowarn "keytar not installed — running npm install keytar..."
    Push-Location (Join-Path $ScriptDir "node")
    npm install keytar --silent
    Pop-Location
    Octolog "keytar installed"
}

# ── OS-Vault Pre-flight Check ──────────────────────────────────────────────────
Write-Host ""
Octoinfo "OS-Vault pre-flight check..."

$vaultCheck     = Join-Path $ScriptDir "node\src\vault_preflight.js"
$vaultSetScript = Join-Path $ScriptDir "node\src\vault_set.js"
$envFile        = Join-Path $ScriptDir "node\.env"

$providerList = @(
    [PSCustomObject]@{ Name = 'anthropic'; EnvVar = 'ANTHROPIC_API_KEY' }
    [PSCustomObject]@{ Name = 'openai';    EnvVar = 'OPENAI_API_KEY'    }
    [PSCustomObject]@{ Name = 'google';    EnvVar = 'GOOGLE_API_KEY'    }
)

foreach ($p in $providerList) {
    # Check OS Vault / session file
    $inVault = $false
    try {
        $checkResult = (& node "$vaultCheck" check $p.Name 2>$null)
        $inVault = ($checkResult -eq '1')
    } catch {}

    if ($inVault) {
        Octolog "$($p.Name): key present in OS Vault"
        continue
    }

    # Check .env for a non-empty, uncommented value
    $envKey = $null
    if (Test-Path $envFile) {
        foreach ($line in (Get-Content $envFile -Encoding UTF8)) {
            if ($line -match "^$($p.EnvVar)=(.+)$") {
                $candidate = $Matches[1].Trim()
                if ($candidate -and $candidate -notmatch '^#') {
                    $envKey = $candidate; break
                }
            }
        }
    }

    if ($envKey) {
        Octowarn "$($p.Name): key found in plain-text .env"
        $choice = Read-Host "         Migrate to OS Vault and clear from .env? [Y/n]"
        if ($choice -eq '' -or $choice -match '^[Yy]$') {
            $envKey | & node "$vaultSetScript" $p.Name
            # Scrub value — keep variable name, blank value
            $raw = [System.IO.File]::ReadAllText($envFile, [System.Text.Encoding]::UTF8)
            $raw = $raw -replace "(?m)^$($p.EnvVar)=.+$", "$($p.EnvVar)="
            [System.IO.File]::WriteAllText($envFile, $raw, [System.Text.Encoding]::UTF8)
            Octolog "$($p.Name): migrated to OS Vault, plain-text cleared"
        }
    } else {
        Octoinfo "$($p.Name): no key — run octopus_login in your AI chat"
    }
}

Write-Host ""

# ── Python Memory Service (background job) ────────────────────────────────────
Octoinfo "Starting Python Memory Service..."
$pythonService = Join-Path $ScriptDir "python\services\memory_service.py"
$pythonWorkDir = Join-Path $ScriptDir "python"

$pythonProcess = Start-Process `
    -NoNewWindow `
    -PassThru `
    -FilePath $pyCmd `
    -ArgumentList $pythonService `
    -WorkingDirectory $pythonWorkDir

# Wait for service to bind to port 5000
Start-Sleep -Seconds 2

# Quick health check
try {
    $null = Invoke-WebRequest -Uri 'http://localhost:5000/health' -TimeoutSec 3 -ErrorAction Stop
    Octolog "Memory service ready on :5000"
} catch {
    Octowarn "Memory service health check failed — continuing anyway"
}

# ── Node MCP Server ────────────────────────────────────────────────────────────
try {
    Octoinfo "Starting Node MCP Server (23 tools)..."
    $mcpEntry = Join-Path $ScriptDir "node\src\mcp.js"
    & node $mcpEntry
} finally {
    Octoinfo "Stopping Python Memory Service..."
    if ($pythonProcess -and -not $pythonProcess.HasExited) {
        Stop-Process -Id $pythonProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
