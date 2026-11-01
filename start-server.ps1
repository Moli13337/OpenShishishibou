$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "[ERROR] Node.js not found. Install Node.js 18+ first." -ForegroundColor Red
    exit 1
}

Write-Host "==============================================" -ForegroundColor Yellow
Write-Host " shishishibou LAN server launcher" -ForegroundColor Yellow
Write-Host "==============================================" -ForegroundColor Yellow
Write-Host " Frontend : web/ (mirror of shishishibou.com, served at /)"
Write-Host " Backend  : /api/* (progress sync, leaderboard, roster, config)"
Write-Host " Config   : server/config/server.json | site.json"
Write-Host " Player   : click the LAN chip bottom-left to register"
Write-Host " Stop     : Ctrl+C"
Write-Host "==============================================" -ForegroundColor Yellow

Set-Location (Join-Path $root "server")
node src/index.js
