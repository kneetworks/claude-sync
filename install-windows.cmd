@echo off
rem Double-click to install claude-sync from this folder, or to update it
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo claude-sync needs Node.js 18 or later. Opening the download page...
  start "" https://nodejs.org/
) else (
  node scripts\setup.mjs
)
echo.
pause
