@echo off
title STI CampusFlow
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed yet. Opening the download page.
  echo Install the LTS version, then run this file again.
  start https://nodejs.org/en/download
  pause
  exit /b
)
echo Starting STI CampusFlow...
echo Keep this window open while you use the system.
start "" http://localhost:3000
node --disable-warning=ExperimentalWarning backend\server.js
echo.
echo The system stopped.
pause
