$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskUrl = 'http://localhost:5173'
$taskRunning = $false
try { $taskResponse = Invoke-WebRequest -Uri $taskUrl -TimeoutSec 2; $taskRunning = $taskResponse.Content -match 'Learning Lab' } catch {}
if (-not $taskRunning) {
    $taskNode = (Get-Command node.exe).Source
    Start-Process -FilePath $taskNode -ArgumentList 'node_modules/vite/bin/vite.js','preview','--host','localhost','--port','5173','--strictPort' -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskRoot 'server.log') -RedirectStandardError (Join-Path $taskRoot 'server-error.log') | Out-Null
    for ($taskAttempt=0; $taskAttempt -lt 40; $taskAttempt++) {
        try { $taskResponse = Invoke-WebRequest -Uri $taskUrl -TimeoutSec 1; if ($taskResponse.Content -match 'Learning Lab') { $taskRunning=$true; break } } catch {}
        Start-Sleep -Milliseconds 250
    }
}
if (-not $taskRunning) { throw 'Dashboard could not start. Check server-error.log and whether port 5173 is in use.' }
Start-Process $taskUrl
