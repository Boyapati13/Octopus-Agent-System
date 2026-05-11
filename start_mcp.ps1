# start_mcp.ps1
# Unified startup script to launch the Python memory service and Node MCP server
# Includes OS-Vault pre-flight check: migrates plain-text .env keys to Windows Credential Manager.

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# ── OS-Vault Pre-flight Check ──────────────────────────────────────────────────
Write-Host ""
Write-Host "[Octopus] OS-Vault pre-flight check..."

$providers = @(
    [PSCustomObject]@{ Name = 'anthropic'; EnvVar = 'ANTHROPIC_API_KEY' }
    [PSCustomObject]@{ Name = 'openai';    EnvVar = 'OPENAI_API_KEY'    }
    [PSCustomObject]@{ Name = 'google';    EnvVar = 'GOOGLE_API_KEY'    }
)

$envFile        = Join-Path $ScriptDir "node\.env"
$vaultCheck     = Join-Path $ScriptDir "node\src\vault_preflight.js"
$vaultSetScript = Join-Path $ScriptDir "node\src\vault_set.js"
$nodeDir        = Join-Path $ScriptDir "node"

foreach ($p in $providers) {
    # 1. Check OS Vault
    $inVault = $false
    try {
        $checkResult = (& node "$vaultCheck" check $p.Name 2>$null)
        $inVault = ($checkResult -eq '1')
    } catch { $inVault = $false }

    if ($inVault) {
        Write-Host ("  [OK]  {0}: key present in OS Vault" -f $p.Name)
        continue
    }

    # 2. Check .env for a non-empty, uncommented value
    $envKey = $null
    if (Test-Path $envFile) {
        foreach ($line in (Get-Content $envFile)) {
            if ($line -match "^$($p.EnvVar)=(.+)$") {
                $candidate = $Matches[1].Trim()
                if ($candidate -and $candidate -notmatch '^#') {
                    $envKey = $candidate
                    break
                }
            }
        }
    }

    if ($envKey) {
        Write-Host ("  [WARN] {0}: key found in plain-text .env" -f $p.Name)
        $choice = Read-Host "         Migrate to OS Vault and clear from .env? [Y/n]"
        if ($choice -eq '' -or $choice -match '^[Yy]$') {
            # Pipe key via stdin — never exposes it in process args
            $envKey | & node "$vaultSetScript" $p.Name
            # Scrub the value from .env (leave the variable name, empty value)
            $raw = Get-Content $envFile -Raw
            $raw = $raw -replace "(?m)^$($p.EnvVar)=.+$", "$($p.EnvVar)="
            [System.IO.File]::WriteAllText($envFile, $raw, [System.Text.Encoding]::UTF8)
            Write-Host ("  [DONE] {0}: plain-text key cleared from .env" -f $p.Name)
        }
    } else {
        Write-Host ("  [INFO] {0}: no key configured — run octopus_login to link via Vault" -f $p.Name)
    }
}

Write-Host ""

# ── Python Memory Service ──────────────────────────────────────────────────────
Write-Host "[Octopus] Starting Python Memory Service..."
Set-Location -Path "$ScriptDir\python"
$pythonProcess = Start-Process -NoNewWindow -PassThru -FilePath "python" -ArgumentList "services\memory_service.py"

# Wait for the service to bind to port 5000
Start-Sleep -Seconds 2

try {
    Write-Host "[Octopus] Starting Node MCP Server..."
    Set-Location -Path "$ScriptDir\node"
    # Execute the Node process (blocking)
    & node src\mcp.js
} finally {
    # Cleanup background Python process when Node exits
    Write-Host "[Octopus] Cleaning up Python Memory Service..."
    if (-not $pythonProcess.HasExited) {
        Stop-Process -Id $pythonProcess.Id -Force
    }
}
