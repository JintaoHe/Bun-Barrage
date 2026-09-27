@echo off
setlocal
cd /d "%~dp0\.."
title Bun Barrage - simulator
if not exist node_modules (
  echo Run 1-setup.bat first.
  pause
  exit /b 1
)
echo Starting the game server in a separate window...
start "Bun Barrage dev server (close to stop)" cmd /k "npm run dev"
echo Waiting for the server...
timeout /t 5 /nobreak >nul
echo Opening the Even Hub simulator...
echo   In the simulator use its Up / Down (swipe = angle), Long Press (hold = power), Long Press Release (fire) and Double Click buttons.
echo   Browser preview keys: Up/Down = angle, hold Space = power, Esc = back
echo   Phone page with keyboard controls: http://localhost:5173
start "" http://localhost:5173
call npx evenhub-simulator http://127.0.0.1:5173
