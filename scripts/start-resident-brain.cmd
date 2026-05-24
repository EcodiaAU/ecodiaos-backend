@echo off
REM Self-restarting launcher for the resident-brain server (persistent claude
REM session). Same pattern as start-away-conductor.cmd.
REM
REM Wired into HKCU Run key + Scheduled Task watchdog for resilience.

setlocal
set "NODE_BIN=D:\SSD_Turbo\nvm4w\nodejs\node.exe"
set "SCRIPT=D:\.code\EcodiaOS\backend\scripts\resident-brain-server.js"
set "LOG_OUT=C:\Users\tjdTa\.pm2\logs\resident-brain-out.log"
set "LOG_ERR=C:\Users\tjdTa\.pm2\logs\resident-brain-error.log"

:loop
echo [%date% %time%] resident-brain spawning >> "%LOG_OUT%"
"%NODE_BIN%" "%SCRIPT%" 1>>"%LOG_OUT%" 2>>"%LOG_ERR%"
echo [%date% %time%] resident-brain exited code=%errorlevel%, restarting in 5s >> "%LOG_ERR%"
timeout /t 5 /nobreak > nul
goto loop
