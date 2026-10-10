param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$appDir = $PSScriptRoot
$serverFile = Join-Path $appDir 'dist\server.mjs'
$dataDir = Join-Path $appDir 'data'
$appUrl = 'http://127.0.0.1:18120'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
try {
    $existing = Invoke-RestMethod -Uri "$appUrl/api/health" -TimeoutSec 2
    if ($existing.ok -and $existing.profile -eq 'bedrock-1.21.120.4-community-inferred') {
        if (-not $NoBrowser) { Start-Process $appUrl }
        Write-Output "FMBE Studio is already running: $appUrl"
        exit 0
    }
} catch { }
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeFile = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe' }
if (-not (Test-Path -LiteralPath $nodeFile)) { throw 'Node.js 22 or later is required. Install it from https://nodejs.org/' }
if (-not (Test-Path -LiteralPath $serverFile)) { throw 'Built files are missing. Run npm install, then npm run build in this folder.' }
$logOut = Join-Path $dataDir 'server.stdout.log'
$logErr = Join-Path $dataDir 'server.stderr.log'
$process = Start-Process -FilePath $nodeFile -ArgumentList @('"' + $serverFile + '"') -WorkingDirectory $appDir -WindowStyle Hidden -PassThru -RedirectStandardOutput $logOut -RedirectStandardError $logErr
Set-Content -LiteralPath (Join-Path $dataDir 'server.pid') -Value $process.Id -Encoding ascii
for ($i = 0; $i -lt 60; $i++) {
    try {
        $health = Invoke-RestMethod -Uri "$appUrl/api/health" -TimeoutSec 1
        if ($health.ok) {
            if (-not $NoBrowser) { Start-Process $appUrl }
            Write-Output "FMBE Studio ready: $appUrl"
            exit 0
        }
    } catch { }
    Start-Sleep -Milliseconds 200
}
throw "FMBE Studio did not start. Check $logErr"
