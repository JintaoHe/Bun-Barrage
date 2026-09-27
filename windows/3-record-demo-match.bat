@echo off
setlocal
cd /d "%~dp0\.."
title Bun Barrage - scripted match
rem Plays one full match automatically and saves sim\match.gif (needs Python + Pillow).
start "Bun Barrage dev server (close to stop)" cmd /k "npm run dev"
timeout /t 5 /nobreak >nul
start "Even Hub simulator" cmd /c "npm run sim:auto"
timeout /t 10 /nobreak >nul
python -m pip install --quiet pillow
python scripts\sim-play.py
pause
