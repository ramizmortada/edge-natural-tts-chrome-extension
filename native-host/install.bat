@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo     ReadFlow - Natural Voice Host Installer
echo ===================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found on your system!
    echo ReadFlow requires Node.js to stream Edge TTS neural voices.
    echo.
    echo Please install Node.js from:
    echo   https://nodejs.org/
    echo.
    pause
    exit /b 1
)

set "SCRIPT_DIR=%~dp0"

:: Use PowerShell to safely write the JSON manifest and register Windows registry keys
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$dir = '%SCRIPT_DIR%'.TrimEnd('\'); " ^
    "$batPath = Join-Path $dir 'tts-host.bat'; " ^
    "$manifestPath = Join-Path $dir 'com.edgetts.host.json'; " ^
    "$manifest = @{ " ^
    "    name = 'com.edgetts.host'; " ^
    "    description = 'ReadFlow Edge TTS Host'; " ^
    "    path = $batPath; " ^
    "    type = 'stdio'; " ^
    "    allowed_origins = @('chrome-extension://doamgjjamfoodahblejajjaolbklnbfo/') " ^
    "}; " ^
    "$json = $manifest | ConvertTo-Json -Depth 5; " ^
    "[System.IO.File]::WriteAllText($manifestPath, $json); " ^
    "New-Item -Path 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.edgetts.host' -Force | Out-Null; " ^
    "Set-ItemProperty -Path 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.edgetts.host' -Name '(Default)' -Value $manifestPath; " ^
    "New-Item -Path 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.edgetts.host' -Force | Out-Null; " ^
    "Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.edgetts.host' -Name '(Default)' -Value $manifestPath; "

if %errorlevel% equ 0 (
    echo [SUCCESS] ReadFlow Voice Host installed successfully!
    echo Registered for Google Chrome and Microsoft Edge.
    echo Extension ID: doamgjjamfoodahblejajjaolbklnbfo
    echo.
    echo You can now use neural voices in ReadFlow!
) else (
    echo.
    echo [ERROR] Failed to register host in the Windows Registry.
)
echo.
pause
