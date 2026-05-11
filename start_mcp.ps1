# start_mcp.ps1
# Unified startup script to launch the Python memory service and Node MCP server

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

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
