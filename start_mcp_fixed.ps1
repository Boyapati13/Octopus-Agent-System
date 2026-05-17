# start_mcp.ps1     Octopus 2.0 Sovereign Edition
# Self-Healing Startup: dependency checks, Ollama auto-start, vault pre-flight, Python + Node launch.
# Compatible with Windows Python 3.14 (uses 'py' launcher) and Node 18+.

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

function Octolog  { param($m) Write-Host "  [OK]   $m" -ForegroundColor Green }
function Octowarn { param($m) Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Octoinfo { param($m) Write-Host "  [INFO] $m" -ForegroundColor Cyan }
function Octofail { param($m) Write-Host "  [FAIL] $m" -ForegroundColor Red }

Write-Host ""
Write-Host "  Octopus 3.0     OctoDeck Edition (MCP stdio mode)" -ForegroundColor Magenta
Write-Host ""

#        Self-Healing Check 1: Python                                                                                                                                           
$pyCmd = $null
foreach ($cmd in @('py', 'python3', 'python')) {
    try {
        $ver = (& $cmd --version 2>&1)
        if ($LASTEXITCODE -eq 0) { $pyCmd = $cmd; break }
    } catch { continue }
}
if (-not $pyCmd) {
    Octofail "Python not found. Install from https://python.org"
    exit 1
}
Octolog "Python: $pyCmd $((& $pyCmd --version 2>&1))"

#        Self-Healing Check 2: Node.js                                                                                                                                        
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Octofail "Node.js not found. Install from https://nodejs.org (LTS)"
    exit 1
}
Octolog "Node.js: $(node --version)"

#        Self-Healing Check 3: node_modules                                                                                                                         
$nodeDir = Join-Path $ScriptDir "node"
if (-not (Test-Path (Join-Path $nodeDir "node_modules"))) {
    Octowarn "node_modules missing     running npm install..."
    Push-Location $nodeDir; npm install --silent; Pop-Location
    Octolog "npm install complete"
} else {
    Octolog "node_modules present ($(((Get-ChildItem (Join-Path $nodeDir 'node_modules') -Force).Count)) packages)"
}

#        Self-Healing Check 4: keytar                                                                                                                                           
if (-not (Test-Path (Join-Path $nodeDir "node_modules\keytar"))) {
    Octowarn "keytar missing     installing..."
    Push-Location $nodeDir; npm install keytar --silent; Pop-Location
    Octolog "keytar installed"
}

#        Self-Healing Check 5: Ollama                                                                                                                                           
Write-Host ""
Octoinfo "Checking Ollama..."
$ollamaOnline = $false
try {
    $r = Invoke-WebRequest "http://localhost:11434/api/tags" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    $models = ($r.Content | ConvertFrom-Json).models
    $ollamaOnline = $true
    Octolog "Ollama online     $($models.Count) model(s): $($models.Name -join ', ')"
} catch {
    # Try to start Ollama if it's installed
    $ollamaExe = @(
        "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
        "C:\Program Files\Ollama\ollama.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($ollamaExe) {
        Octowarn "Ollama installed but not running     starting..."
        Start-Process -FilePath $ollamaExe -ArgumentList "serve" -NoNewWindow
        Start-Sleep -Seconds 5
        try {
            $r = Invoke-WebRequest "http://localhost:11434/api/tags" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
            $models = ($r.Content | ConvertFrom-Json).models
            $ollamaOnline = $true
            Octolog "Ollama started     $($models.Count) model(s): $($models.Name -join ', ')"
        } catch {
            Octowarn "Ollama did not start in time     Sovereign Fallback unavailable"
        }
    } else {
        Octoinfo "Ollama not installed     cloud providers only (run octopus_login to authorize)"
    }
}

#        OS-Vault Pre-flight Check                                                                                                                                                       
Write-Host ""
Octoinfo "OS-Vault pre-flight check..."

$vaultCheck  = Join-Path $ScriptDir "node\src\vault_preflight.js"
$vaultSet    = Join-Path $ScriptDir "node\src\vault_set.js"
$envFile     = Join-Path $ScriptDir "node\.env"

$providerList = @(
    [PSCustomObject]@{ Name = 'anthropic'; EnvVar = 'ANTHROPIC_API_KEY' }
    [PSCustomObject]@{ Name = 'openai';    EnvVar = 'OPENAI_API_KEY'    }
    [PSCustomObject]@{ Name = 'google';    EnvVar = 'GOOGLE_API_KEY'    }
)

foreach ($p in $providerList) {
    $inVault = $false
    try {
        $checkResult = (& node "$vaultCheck" check $p.Name 2>$null)
        $inVault = ($checkResult -eq '1')
    } catch {}

    if ($inVault) { Octolog "$($p.Name): key in OS Vault"; continue }

    $envKey = $null
    if (Test-Path $envFile) {
        foreach ($line in (Get-Content $envFile -Encoding UTF8)) {
            if ($line -match "^$($p.EnvVar)=(.+)$") {
                $c = $Matches[1].Trim()
                if ($c -and $c -notmatch '^#') { $envKey = $c; break }
            }
        }
    }

    if ($envKey) {
        Octowarn "$($p.Name): plain-text key in .env"
        $choice = Read-Host "         Migrate to OS Vault and clear from .env? [Y/n]"
        if ($choice -eq '' -or $choice -match '^[Yy]$') {
            $envKey | & node "$vaultSet" $p.Name
            $raw = [System.IO.File]::ReadAllText($envFile, [System.Text.Encoding]::UTF8)
            $raw = $raw -replace "(?m)^$($p.EnvVar)=.+$", "$($p.EnvVar)="
            [System.IO.File]::WriteAllText($envFile, $raw, [System.Text.Encoding]::UTF8)
            Octolog "$($p.Name): migrated and cleared from .env"
        }
    } else {
        if (-not $ollamaOnline) {
            Octowarn "$($p.Name): no key + Ollama offline     LLM calls will fail until one is set"
        } else {
            Octoinfo "$($p.Name): no key     Sovereign Fallback to Ollama active"
        }
    }
}

Write-Host ""

#        Python Memory Service                                                                                                                                                                
Octoinfo "Starting Python Memory Service..."
$pythonProcess = Start-Process `
    -NoNewWindow -PassThru `
    -FilePath $pyCmd `
    -ArgumentList (Join-Path $ScriptDir "python\services\memory_service.py") `
    -WorkingDirectory (Join-Path $ScriptDir "python")

Start-Sleep -Seconds 3

try {
    $r = Invoke-WebRequest -Uri 'http://localhost:5000/health' -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Octolog "Memory service ready on :5000"
} catch {
    Octowarn "Memory service health check timed out     verify python/requirements.txt is installed"
}

#        Node MCP Server                                                                                                                                                                                     
Write-Host ""
Octolog "All checks complete     starting MCP server (26 tools)..."
Octoinfo "For the web dashboard + REST API, use: .\start_server.ps1"
Write-Host ""

try {
    & node (Join-Path $ScriptDir "node\src\mcp.js")
} finally {
    Octoinfo "Shutting down Python Memory Service..."
    if ($pythonProcess -and -not $pythonProcess.HasExited) {
        Stop-Process -Id $pythonProcess.Id -Force -ErrorAction SilentlyContinue
    }
}

