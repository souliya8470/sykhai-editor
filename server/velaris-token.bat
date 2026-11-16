@echo off
cd /d "%~dp0"
set SK_DIR=D:\SykhaiEditor
echo.
echo This makes a NEW key for the VELARIS website (the old VELARIS key stops working).
choice /m "Continue"
if errorlevel 2 goto :eof
node "%~dp0velaris-token.js"
echo.
echo Notepad opens with the key: copy it (Ctrl+A, Ctrl+C) and paste it into VELARIS as SYKHAI_TOKEN. Do not send it in chat.
start notepad "%SK_DIR%\velaris-token.txt"
pause
