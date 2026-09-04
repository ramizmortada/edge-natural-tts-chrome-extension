@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Update encountered an error (code %errorlevel%).
    pause
)
