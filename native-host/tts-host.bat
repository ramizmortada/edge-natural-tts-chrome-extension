@echo off
if exist "%~dp0tts-host.bundle.js" (
  node "%~dp0tts-host.bundle.js"
) else (
  node "%~dp0tts-host.js"
)
