@echo off
cd /d "%~dp0"
start "" "..\stream-control\apps\desktop\node_modules\electron\dist\electron.exe" "%~dp0service\desktop-display.cjs"
bun run vite --config vite.stage.config.ts --mode production --host 127.0.0.1 --port 27139 --strictPort --open /preview.html

