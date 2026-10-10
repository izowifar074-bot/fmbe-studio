$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'data\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No launcher-owned server record.'; exit 0 }
$serverPid = [int](Get-Content -LiteralPath $pidFile -Raw)
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid"
$serverFile = Join-Path $PSScriptRoot 'dist\server.mjs'
if ($processInfo -and $processInfo.Name -eq 'node.exe' -and $processInfo.CommandLine -like "*$serverFile*") {
    Stop-Process -Id $serverPid
    Write-Output 'FMBE Studio stopped. Project data is preserved.'
} elseif ($processInfo) {
    throw 'The saved PID belongs to a different process. No process was stopped.'
}
