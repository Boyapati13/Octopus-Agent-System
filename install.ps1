# Octopus 2.0 — Zero-Key · Universal Windows Installer
# Works both locally (.\install.ps1) and via one-liner remote install:
#   powershell -ExecutionPolicy Bypass -Command "iex (irm https://raw.githubusercontent.com/Boyapati13/Octopus-Agent-System/master/install.ps1)"

$ErrorActionPreference = 'Stop'

$REPO_URL  = 'https://github.com/Boyapati13/Octopus-Agent-System.git'
$REPO_NAME = 'Octopus-Agent-System'

function Log  { param($m) Write-Host "  [octopus] $m" -ForegroundColor Green }
function Info { param($m) Write-Host "  [octopus] $m" -ForegroundColor Cyan }
function Warn { param($m) Write-Host "  [octopus] $m" -ForegroundColor Yellow }
function Head { param($m) Write-Host "`n$m" -ForegroundColor Magenta }

Head "🐙 Octopus 3.0 — OctoDeck Edition Installer"
Write-Host "  14 agents · 26 MCP tools · AgentShield · Web Dashboard · Voice · JAX/Gemma"
Write-Host ""

# ── Step 1: Clone if running remotely ────────────────────────────────────────
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir -or -not (Test-Path (Join-Path $ScriptDir 'node'))) {
    $DestFolder = Join-Path $HOME $REPO_NAME
    if (Test-Path $DestFolder) {
        Log "Repo already exists at $DestFolder — pulling latest..."
        Push-Location $DestFolder
        git pull --quiet
        Pop-Location
    } else {
        Log "Cloning Octopus 2.0 into $DestFolder..."
        git clone $REPO_URL $DestFolder --quiet
    }
    $ScriptDir = $DestFolder
}

$RepoDir  = $ScriptDir
$NodeDir  = Join-Path $RepoDir 'node'
$McpEntry = Join-Path $NodeDir 'src\mcp.js'
$RulesDir = Join-Path $RepoDir '.claude\rules'

# ── .gitignore guard ──────────────────────────────────────────────────────────
$GitIgnore = Join-Path $RepoDir '.gitignore'
if (Test-Path $GitIgnore) {
    $content = Get-Content $GitIgnore -Raw
    $needsUpdate = $false
    if ($content -notmatch '(?m)^node/\.env') { Add-Content -Path $GitIgnore -Value "`nnode/.env"; $needsUpdate = $true }
    if ($content -notmatch '(?m)^\.env')      { Add-Content -Path $GitIgnore -Value ".env";       $needsUpdate = $true }
    if ($needsUpdate) { Warn ".gitignore updated — node/.env protected" } else { Log ".gitignore already guards .env ✅" }
}

# ── Step 2: Node.js dependencies ─────────────────────────────────────────────
Head "Step 1/5 — Node.js dependencies"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Warn "Node.js not found. Install from https://nodejs.org (LTS) then re-run."
    exit 1
}
Log "Node $(node --version) / npm $(npm --version)"
# keytar uses a prebuilt binary on Windows (Windows Credential Manager — no build tools needed)
Push-Location $NodeDir
npm install --silent
Log "Dependencies installed (ws + keytar + dotenv + 26-tool MCP stack)"
Pop-Location

# ── Step 3: Python dependencies ───────────────────────────────────────────────
Head "Step 2/5 — Python dependencies"
$pyCmd = $null
foreach ($cmd in @('python3','python','py')) {
    try {
        $ver = & $cmd --version 2>&1
        if ($LASTEXITCODE -eq 0) { $pyCmd = $cmd; Log "$cmd $ver detected"; break }
    } catch {}
}
if (-not $pyCmd) {
    Warn "Python not found. Install from https://python.org then re-run."
    exit 1
}
& $pyCmd -m pip install -r (Join-Path $RepoDir 'python\requirements.txt') -q
Log "Python dependencies installed"

# ── Step 4: Create .env (non-sensitive config only) ───────────────────────────
Head "Step 3/5 — Configuration"
$EnvFile = Join-Path $NodeDir '.env'
if (-not (Test-Path $EnvFile)) {
    $ollamaRunning = $false
    $ollamaModels  = @()
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:11434/api/tags' -TimeoutSec 2 -ErrorAction Stop
        $ollamaRunning = $true
        $ollamaModels  = ($r.Content | ConvertFrom-Json).models.name
        Log "Ollama detected — $($ollamaModels.Count) model(s): $($ollamaModels -join ', ')"
    } catch {
        Info "Ollama not running (optional — needed for local Gemma 4)"
    }

    $provider = 'anthropic'
    $model    = ''
    if ($ollamaRunning -and ($ollamaModels | Where-Object { $_ -match 'gemma4' })) {
        $provider = 'ollama'
        $model    = ($ollamaModels | Where-Object { $_ -match 'gemma4' } | Select-Object -First 1)
        Log "Auto-configured for Gemma 4: $model"
    } elseif ($ollamaRunning -and $ollamaModels.Count -gt 0) {
        $provider = 'ollama'
        $model    = $ollamaModels[0]
        Log "Auto-configured for Ollama: $model"
    }

    @"
# Octopus 3.0 — OctoDeck Edition Configuration
# API keys are NOT stored here — use 'octopus_login' in your AI chat instead.
# Keys are stored securely in Windows Credential Manager via the OS Vault.

MEMORY_SERVICE_URL=http://localhost:5000
DATA_DIR=../data
PORT=3001
SAFE_MODE=false

# Headless mode: false = Cortex is planner (default); true = external LLM is planner
HEADLESS_MODE=false

# ECC 3.0 Token Optimization
MAX_THINKING_TOKENS=10000
COMPACT_THRESHOLD=50

# AgentShield
AGENTSHIELD_MODE=advisory
ECC_HOOK_PROFILE=standard

# Project Constitution
PROJECT_ROOT=$RepoDir
ECC_RULES_PATH=$RulesDir

# LLM Provider (no API key needed — use octopus_login to authorize cloud providers)
# Options: anthropic | openai | google | ollama | nvidia | huggingface | custom_http | router
LLM_PROVIDER=$provider
LLM_MODEL=$model
OLLAMA_BASE_URL=http://localhost:11434
SOVEREIGN_FALLBACK_MODEL=gemma4:e2b

# Custom HTTP backend (any OpenAI-compatible server: JAX/Gemma, vLLM, LM Studio, llamafile)
# Set LLM_PROVIDER=custom_http and fill these in:
CUSTOM_HTTP_URL=
CUSTOM_HTTP_MODEL=

# Optional fallback keys (prefer octopus_login — these are plain-text)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
NVIDIA_API_KEY=
HF_TOKEN=
GITHUB_TOKEN=
"@ | Out-File -FilePath $EnvFile -Encoding utf8
    Log ".env created (LLM_PROVIDER=$provider) — API keys go in OS Vault, not here"
} else {
    Log ".env already exists — skipping"
}

# ── Step 5: ECC rules bootstrap ───────────────────────────────────────────────
New-Item -ItemType Directory -Path $RulesDir -Force | Out-Null
if (-not (Test-Path (Join-Path $RulesDir 'node.md'))) {
    @"
---
description: Node.js standards (ECC-aligned, always-loaded)
alwaysApply: true
---
- CommonJS only (no ESM unless .mjs)
- const over let, never var
- console.error for diagnostics — never console.log in MCP stdio paths
- All PreToolUse hooks must complete in under 200ms
"@ | Out-File -FilePath (Join-Path $RulesDir 'node.md') -Encoding utf8
}
if (-not (Test-Path (Join-Path $RulesDir 'security.md'))) {
    @"
---
description: Security guardrails (AgentShield-aligned, always-loaded)
alwaysApply: true
---
- Never hardcode secrets — all credentials via OS Vault (octopus_login) or environment variables
- Validate agentName: /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/ before path construction
- No eval(), new Function(), or __proto__ assignments
- All database queries through the memory/repository layer
- AGENTSHIELD_MODE=gate for production deployments
"@ | Out-File -FilePath (Join-Path $RulesDir 'security.md') -Encoding utf8
}
Log "ECC rules bootstrapped (.claude/rules/)"

# ── Step 6: Register with MCP clients ────────────────────────────────────────
Head "Step 4/5 — MCP client registration"

function Inject-Mcp {
    param([string]$CfgPath, [string]$ClientName)
    $dir = Split-Path $CfgPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    if (-not (Test-Path $CfgPath)) { '{"mcpServers":{}}' | Out-File -FilePath $CfgPath -Encoding utf8 }
    $cfg = Get-Content $CfgPath -Raw | ConvertFrom-Json
    if (-not $cfg.mcpServers) {
        $cfg | Add-Member -MemberType NoteProperty -Name mcpServers -Value ([PSCustomObject]@{}) -Force
    }
    $entry = [PSCustomObject]@{
        command = 'node'
        args    = @($McpEntry)
        env     = [PSCustomObject]@{
            SAFE_MODE           = 'false'
            MAX_THINKING_TOKENS = '10000'
            COMPACT_THRESHOLD   = '50'
            AGENTSHIELD_MODE    = 'advisory'
            ECC_HOOK_PROFILE    = 'standard'
            PROJECT_ROOT        = $RepoDir
            ECC_RULES_PATH      = $RulesDir
            MEMORY_SERVICE_URL  = 'http://localhost:5000'
            LLM_PROVIDER        = 'anthropic'
        }
    }
    $cfg.mcpServers | Add-Member -MemberType NoteProperty -Name 'octopus' -Value $entry -Force
    $cfg | ConvertTo-Json -Depth 10 | Out-File -FilePath $CfgPath -Encoding utf8
    Log "$ClientName registered → $CfgPath"
}

$Clients = [ordered]@{
    'Claude Desktop' = "$env:APPDATA\Claude\claude_desktop_config.json"
    'Claude Code'    = "$env:USERPROFILE\.claude\settings.json"
    'Cursor'         = "$env:APPDATA\Cursor\User\globalStorage\mcp.json"
    'Windsurf'       = "$env:USERPROFILE\.codeium\windsurf\mcp_config.json"
    'Continue.dev'   = "$env:USERPROFILE\.continue\config.json"
}

$installed = 0
foreach ($client in $Clients.GetEnumerator()) {
    $appDir = Split-Path $client.Value
    # Claude Code: check ~/.claude exists; others: check parent of parent
    if ($client.Key -eq 'Claude Code') {
        if (Test-Path $appDir) { Inject-Mcp -CfgPath $client.Value -ClientName $client.Key; $installed++ }
    } else {
        if (Test-Path (Split-Path $appDir)) { Inject-Mcp -CfgPath $client.Value -ClientName $client.Key; $installed++ }
    }
}

if ($installed -eq 0) {
    Warn "No LLM client detected. Add manually (see DEPLOYMENT.md)."
}

# ── Step 7: Global CLI — npm link + PATH ─────────────────────────────────────
Head "Step 5/6 — Global CLI setup"

Push-Location $NodeDir
try {
    npm link --silent 2>$null
    Log "octopus command linked globally (type 'octopus' from any terminal)"
} catch {
    Warn "npm link failed — run manually: cd $NodeDir && npm link"
}
Pop-Location

# Also add project root to user PATH so octopus.ps1 is always available
$currentPath = [System.Environment]::GetEnvironmentVariable('PATH', 'User') ?? ''
if ($currentPath -notlike "*$RepoDir*") {
    [System.Environment]::SetEnvironmentVariable('PATH', "$RepoDir;$currentPath", 'User')
    Log "Added $RepoDir to user PATH (restart terminal to take effect)"
} else {
    Log "Project root already in user PATH"
}

# ── Done ──────────────────────────────────────────────────────────────────────
Head "Step 6/6 — Done ✅"
Log "Octopus 3.0 installed ($installed MCP client(s) registered)"
Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────────────────┐" -ForegroundColor Cyan
Write-Host "  │  Start everything (REST + WS + memory + dashboard):      │" -ForegroundColor Cyan
Write-Host "  │    .\start_server.ps1                                    │" -ForegroundColor Green
Write-Host "  │                                                           │" -ForegroundColor Cyan
Write-Host "  │  Start MCP server (for Claude Desktop / Cursor):         │" -ForegroundColor Cyan
Write-Host "  │    .\start_mcp.ps1                                       │" -ForegroundColor Green
Write-Host "  │                                                           │" -ForegroundColor Cyan
Write-Host "  │  Launch CLI:                                              │" -ForegroundColor Cyan
Write-Host "  │    octopus   (or: node node\src\cli.js)                  │" -ForegroundColor Green
Write-Host "  └─────────────────────────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""
Info "Web dashboard (after .\start_server.ps1):"
Write-Host "  http://localhost:3001/dashboard" -ForegroundColor Cyan
Write-Host ""
Info "CLI commands:"
Write-Host "  /plan <task>           plan with Cortex"
Write-Host "  /run  <task>           run the full 14-agent pipeline"
Write-Host "  /provider list         show all LLM providers"
Write-Host "  /provider set ollama   switch to local Gemma"
Write-Host "  /headless on|off       toggle headless mode"
Write-Host "  /dashboard             open the web dashboard"
Write-Host "  /vault                 check API key status"
Write-Host ""
Info "Zero-Key auth — in the CLI or your AI chat:"
Write-Host "  octopus_login  → browser opens, paste key once, stored in Windows Vault"
Write-Host ""
Info "Local Gemma 4 (no API key needed):"
Write-Host "  ollama pull gemma4:e2b    # 7.2 GB — default"
Write-Host "  ollama pull gemma4:26b    # 18 GB  — MoE, fast planning"
Write-Host ""
Info "Full guide:  $RepoDir\README.md"
Info "Quick start: $RepoDir\docs\quickstart-local.md"
Write-Host ""
