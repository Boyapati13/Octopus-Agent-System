# ── Octopus Voice Service Launcher (Windows) ─────────────────────────────────
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "  🐙 Octopus Voice Service" -ForegroundColor Cyan
Write-Host "  Gemini Live <-> Octopus Agent Bridge" -ForegroundColor Gray
Write-Host ""

# Check for API key
$hasKey = ($env:GEMINI_API_KEY -ne $null) -or (Test-Path "config\api_keys.json")
if (-not $hasKey) {
    Write-Host "  ⚠️  No Gemini API key found." -ForegroundColor Yellow
    Write-Host "  Either:" -ForegroundColor Gray
    Write-Host '    $env:GEMINI_API_KEY = "your_key"' -ForegroundColor Gray
    Write-Host '    or create config\api_keys.json: {"gemini_api_key": "your_key"}' -ForegroundColor Gray
    Write-Host ""
    exit 1
}

# Install deps if missing
$depsOk = python -c "import google.genai, aiohttp, websockets" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  📦 Installing Python voice dependencies..." -ForegroundColor Yellow
    pip install google-genai aiohttp websockets -q
}

Write-Host "  ✅ Starting voice service on ws://localhost:8765" -ForegroundColor Green
Write-Host "  ℹ️  Open the Octopus frontend -> Voice tab to connect" -ForegroundColor Gray
Write-Host ""

python python\services\voice_service.py
