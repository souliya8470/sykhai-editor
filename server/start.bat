@echo off
cd /d "%~dp0"
set SK_DIR=D:\SykhaiEditor
set SK_PORT=8787
if exist token.txt goto havetoken
echo.
echo ===== Sykhai Editor server - first run =====
set /p NEWPW=Set a password for the editor server (6+ letters/numbers, no spaces or symbols): 
>token.txt echo %NEWPW%
cls
:havetoken
set /p SK_TOKEN=<token.txt
schtasks /query /tn SykhaiEditorServer >nul 2>&1
if errorlevel 1 schtasks /create /tn SykhaiEditorServer /tr "\"%~dp0start.bat\"" /sc onlogon /f >nul 2>&1
:loop
node "%~dp0server.js"
echo Server stopped. Restarting in 5 seconds...
timeout /t 5 >nul
goto loop
