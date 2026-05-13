# ──────────────────────────────────────────────────────────────────────────────
#  octo.ps1  —  Octopus Agent System launch command
#
#  Usage:
#    .\octo              → start all services + open browser
#    .\octo start        → same as above
#    .\octo setup        → force setup wizard (re-run configuration)
#    .\octo stop         → kill all running Octopus services
#    .\octo status       → check if server is running
#    .\octo logs         → tail the last 50 Node.js log lines
#    .\octo voice        → start voice service only
#    .\octo help         → show this help
#
#  To run as a global command from anywhere, add this to your PowerShell profile
#  ($PROFILE) or run the one-liner below:
#
#    Add-Content $PROFILE "`nSet-Alias octo '$((Resolve-Path .\octo.ps1).Path)'"
#
# ──────────────────────────────────────────────────────────────────────────────

param(
    [string] $Command = "start",
    [int]    $Port    = 3001
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$SetupMarker = Join-Path $ScriptDir "node\.setup-complete"

function Write-Banner {
    Write-Host ""
    Write-Host "  ╔═══════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║  🐙  O C T O P U S  A G E N T    ║" -ForegroundColor Cyan
    Write-Host "  ║     O.C.T.O Command Interface      ║" -ForegroundColor Cyan
    Write-Host "  ╚═══════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Show-Status {
    try {
        $r = Invoke-WebRequest "http://localhost:$Port/api/health" -TimeoutSec 3 -UseBasicParsing -EA Stop
        $json = $r.Content | ConvertFrom-Json
        Write-Host "  [RUNNING]  http://localhost:$Port" -ForegroundColor Green
        Write-Host "  Provider : $($json.provider)"      -ForegroundColor Cyan
        Write-Host "  Uptime   : $($json.uptime)"        -ForegroundColor Cyan
    } catch {
        Write-Host "  [STOPPED]  Server not responding on port $Port" -ForegroundColor Yellow
    }
}

function Stop-Octo {
    Write-Host "  Stopping Octopus services..." -ForegroundColor Yellow
    # Kill Node on the API port
    $conns = Get-NetTCPConnection -LocalPort $Port -EA SilentlyContinue
    if ($conns) {
        $conns.OwningProcess | Sort-Object -Unique | ForEach-Object {
            Stop-Process -Id $_ -Force -EA SilentlyContinue
        }
    }
    # Kill Python memory service on 5000
    $conns5 = Get-NetTCPConnection -LocalPort 5000 -EA SilentlyContinue
    if ($conns5) {
        $conns5.OwningProcess | Sort-Object -Unique | ForEach-Object {
            Stop-Process -Id $_ -Force -EA SilentlyContinue
        }
    }
    # Kill Python voice service on 8765
    $conns8 = Get-NetTCPConnection -LocalPort 8765 -EA SilentlyContinue
    if ($conns8) {
        $conns8.OwningProcess | Sort-Object -Unique | ForEach-Object {
            Stop-Process -Id $_ -Force -EA SilentlyContinue
        }
    }
    Write-Host "  [DONE]  All Octopus processes stopped." -ForegroundColor Green
}

function Show-Logs {
    $logPath = Join-Path $ScriptDir "data\octopus.log"
    if (Test-Path $logPath) {
        Get-Content $logPath -Tail 50
    } else {
        Write-Host "  No log file found at $logPath" -ForegroundColor Yellow
        Write-Host "  Tip: pipe server output to a file:" -ForegroundColor DarkGray
        Write-Host "    node node\src\server.js 2> data\octopus.log" -ForegroundColor DarkGray
    }
}

function Start-Voice {
    $voiceScript = Join-Path $ScriptDir "start_voice.ps1"
    if (Test-Path $voiceScript) {
        & $voiceScript
    } else {
        Write-Host "  start_voice.ps1 not found." -ForegroundColor Red
    }
}

function Add-ToProfile {
    $alias = "`nSet-Alias octo '$($MyInvocation.ScriptName)'"
    $answer = Read-Host "  Add 'octo' alias to your PowerShell profile? (y/n)"
    if ($answer -eq 'y') {
        Add-Content -Path $PROFILE -Value $alias
        Write-Host "  [DONE]  Added. Restart PowerShell or run: . `$PROFILE" -ForegroundColor Green
    }
}

# ── Main ──────────────────────────────────────────────────────────────────────

Write-Banner

switch ($Command.ToLower()) {

    "start" {
        $serverUrl = "http://localhost:$Port"
        # If setup hasn't been completed, open setup instead
        if (-not (Test-Path $SetupMarker)) {
            Write-Host "  First run detected — opening setup wizard..." -ForegroundColor Yellow
        }
        Write-Host "  Starting Octopus..." -ForegroundColor Cyan
        & (Join-Path $ScriptDir "start_server.ps1") -Port $Port
    }

    "setup" {
        Write-Host "  Forcing setup wizard..." -ForegroundColor Cyan
        if (Test-Path $SetupMarker) {
            Remove-Item $SetupMarker -Force
            Write-Host "  [OK]  Setup marker cleared — wizard will run on next start." -ForegroundColor Green
        }
        & (Join-Path $ScriptDir "start_server.ps1") -Port $Port
    }

    "stop" {
        Stop-Octo
    }

    "status" {
        Write-Host "  Octopus status:" -ForegroundColor Cyan
        Show-Status
    }

    "logs" {
        Show-Logs
    }

    "voice" {
        Write-Host "  Starting voice service..." -ForegroundColor Cyan
        Start-Voice
    }

    "install-alias" {
        Add-ToProfile
    }

    { $_ -in "help", "-h", "--help", "?" } {
        Write-Host "  Commands:" -ForegroundColor Cyan
        Write-Host "    octo              Start all services (setup wizard on first run)"
        Write-Host "    octo start        Same as above"
        Write-Host "    octo setup        Force re-run of the setup wizard"
        Write-Host "    octo stop         Kill all Octopus processes"
        Write-Host "    octo status       Check if server is running"
        Write-Host "    octo logs         Show recent log output"
        Write-Host "    octo voice        Start voice service only"
        Write-Host "    octo install-alias  Add 'octo' alias to PowerShell profile"
        Write-Host ""
        Write-Host "  To use 'octo' from anywhere:" -ForegroundColor DarkGray
        Write-Host "    .\octo install-alias" -ForegroundColor DarkGray
    }

    default {
        Write-Host "  Unknown command: $Command" -ForegroundColor Red
        Write-Host "  Run: .\octo help" -ForegroundColor DarkGray
    }
}
