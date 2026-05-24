@echo off
REM Self-restarting launcher for the away-conductor on Corazon.
REM
REM Replaces PM2 supervision for this one critical service. PM2 on Windows
REM kept stalling its RPC pipe with EPERM, taking the away-conductor down
REM with it. This cmd loops on crash + survives the launching shell via
REM detached `start` invocation.
REM
REM Two invocation modes:
REM   1. Direct: `start-away-conductor.cmd`  - runs in foreground (testing)
REM   2. Detached: `start "" /b /min start-away-conductor.cmd`  (production)
REM
REM Wired into HKCU Run key as the logon resurrect (no elevation needed).
REM
REM Doctrine: backend/patterns/corazon-services-must-be-pm2-supervised-with-reboot-persistence-2026-05-21.md

setlocal
set "NODE_BIN=D:\SSD_Turbo\nvm4w\nodejs\node.exe"
set "SCRIPT=D:\.code\EcodiaOS\backend\scripts\away-conductor-server.js"
set "LOG_OUT=C:\Users\tjdTa\.pm2\logs\away-conductor-out.log"
set "LOG_ERR=C:\Users\tjdTa\.pm2\logs\away-conductor-error.log"

:loop
echo [%date% %time%] away-conductor spawning >> "%LOG_OUT%"
"%NODE_BIN%" "%SCRIPT%" 1>>"%LOG_OUT%" 2>>"%LOG_ERR%"
echo [%date% %time%] away-conductor exited code=%errorlevel%, restarting in 5s >> "%LOG_ERR%"
timeout /t 5 /nobreak > nul
goto loop
