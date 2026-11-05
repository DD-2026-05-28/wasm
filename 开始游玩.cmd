@echo off
chcp 65001 >nul
title Local Game Server - %~dp0
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  echo         Install Node.js LTS from https://nodejs.org/ , then double-click this file again.
  pause
  exit /b 1
)
echo Starting local server in: %CD%
echo The browser will open automatically. KEEP THIS WINDOW OPEN while playing.
echo Closing this window stops the game server.
echo.
node "%~dp0_serve.mjs" --port 8123 %*
echo.
echo Server stopped.
pause