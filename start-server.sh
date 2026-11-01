#!/usr/bin/env bash
set -e

root="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js not found. Install Node.js 18+ first."
    exit 1
fi

echo "=============================================="
echo " shishishibou LAN server launcher"
echo "=============================================="
echo " Frontend : web/ (mirror of shishishibou.com, served at /)"
echo " Backend  : /api/* (progress sync, leaderboard, roster, config)"
echo " Config   : server/config/server.json | site.json"
echo " Player   : click the LAN chip bottom-left to register"
echo " Stop     : Ctrl+C"
echo "=============================================="

cd "$root/server"
exec node src/index.js
