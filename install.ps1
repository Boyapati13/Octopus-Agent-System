# Octopus Agent System — Universal Installer (Windows PowerShell)
# Detects your LLM environment and configures the MCP server automatically.
# Supports: Claude Desktop, Cursor, Windsurf, Cline, Continue.dev, any MCP client.

$ErrorActionPreference = 'Stop'

$RepoDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeDir  = Join-Path $RepoDir 'node'
$McpEntry = Join-Path $NodeDir 'src\mcp.js'

function Log  { param($msg) Write-Host "[octopus] $msg" -ForegroundColor Green }
function Info { param($msg) Write-Host "[octopus] $msg" -ForegroundColor Cyan }
function Warn { param($msg) Write-Host "[octopus] $msg" -ForegroundColor Yellow }

# ── Known config paths ────────────────────────────────────────────────────────
$Clients = @{
  'Claude Desktop' = "$env:APPDATA\Claude\claude_desktop_config.json"
  'Cursor'         = "$env:APPDATA\Cursor\User\globalStorage\mcp.json"
  'Windsurf'       = "$env:USERPROFILE\.codeium\windsurf\mcp_config.json"
  'Continue.dev'   = "$env:USERPROFILE\.continue\config.json"
}

# ── Inject MCP entry into a JSON config ──────────────────────────────────────
function Inject-Mcp {
  param([string]$CfgPath, [string]$ClientName)
  $dir = Split-Path $CfgPath
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  if (-not (Test-Path $CfgPath)) {
    '{"mcpServers":{}}' | Out-File -FilePath $CfgPath -Encoding utf8
  }
  $cfg = Get-Content $CfgPath -Raw | ConvertFrom-Json
  if (-not $cfg.mcpServers) { $cfg | Add-Member -MemberType NoteProperty -Name mcpServers -Value ([PSCustomObject]@{}) }
  $entry = [PSCustomObject]@{
    command = 'node'
    args    = @($McpEntry)
    env     = [PSCustomObject]@{ SAFE_MODE = 'false'; LLM_PROVIDER = 'anthropic' }
  }
  $cfg.mcpServers | Add-Member -MemberType NoteProperty -Name octopus -Value $entry -Force
  $cfg | ConvertTo-Json -Depth 10 | Out-File -FilePath $CfgPath -Encoding utf8
  Log "Configured Octopus MCP in $ClientName → $CfgPath"
}

# ── Install npm deps ──────────────────────────────────────────────────────────
Log "Installing Node dependencies..."
Push-Location $NodeDir
npm install --silent
Pop-Location

# ── Install Python deps ───────────────────────────────────────────────────────
Log "Installing Python dependencies..."
pip install -r "$RepoDir\python\requirements.txt" -q

# ── Install agent-browser Chrome ─────────────────────────────────────────────
$abBin = Join-Path $NodeDir 'node_modules\.bin\agent-browser.cmd'
if (Test-Path $abBin) {
  Log "Installing Chrome for agent-browser..."
  try { & $abBin install 2>$null } catch {}
}

# ── Detect and configure clients ─────────────────────────────────────────────
$installed = 0

foreach ($client in $Clients.GetEnumerator()) {
  $cfgPath = $client.Value
  $cfgDir  = Split-Path $cfgPath
  # Detect: check if the parent app folder exists (not just the config file)
  $appDir = Split-Path $cfgDir
  if (Test-Path $appDir) {
    Inject-Mcp -CfgPath $cfgPath -ClientName $client.Key
    $installed++
  }
}

if ($installed -eq 0) {
  Warn "No supported LLM client detected. Add to your MCP config manually:"
  Write-Host ""
  Write-Host '  "mcpServers": { "octopus": { "command": "node", "args": ["' + $McpEntry + '"], "env": { "SAFE_MODE": "false" } } }'
  Write-Host ""
}

# ── Next steps ────────────────────────────────────────────────────────────────
Write-Host ""
Log "Installation complete! ($installed client(s) configured)"
Write-Host ""
Info "Next steps:"
Write-Host "  1. Set API keys in $NodeDir\.env  (copy from .env.example)"
Write-Host "  2. Start services:  .\start_mcp.ps1"
Write-Host "  3. Index your repo: python python\indexer\index_repo.py --root . --db .\data\octopus.db"
Write-Host "  4. Restart your LLM client — Octopus tools appear automatically"
Write-Host ""
Info "Tool adapters for direct API use:"
Write-Host "  GET http://localhost:3001/api/tools/openai    # OpenAI function calling"
Write-Host "  GET http://localhost:3001/api/tools/anthropic # Anthropic tool use"
Write-Host "  GET http://localhost:3001/api/tools/gemini    # Gemini function declarations"
