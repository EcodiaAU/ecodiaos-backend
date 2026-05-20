@echo off
REM Resurrect PM2-managed processes (the EcodiaOS away-conductor) at logon.
REM
REM Live deployment: copy this to the user Startup folder so it runs at logon:
REM   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\away-conductor-resurrect.cmd
REM PM2 itself keeps the away-conductor alive while logged in (auto-restart on
REM crash); this only covers the reboot case (restore the pm2 save dump).
set "PATH=D:\SSD_Turbo\nvm4w\nodejs;D:\SSD_Turbo\node-global;%PATH%"
call "D:\SSD_Turbo\node-global\pm2.cmd" resurrect
