@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0service\store-extension-secret.ps1"
set "result=%errorlevel%"
pause
exit /b %result%
