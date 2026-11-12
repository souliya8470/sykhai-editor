@echo off
chcp 65001 >nul
REM ===== Sykhai Editor file server =====
REM 1) แก้รหัสผ่านด้านล่าง (อย่างน้อย 6 ตัวอักษร)  2) ดับเบิลคลิกไฟล์นี้
set SK_TOKEN=CHANGE_ME
set SK_DIR=D:\SykhaiEditor
set SK_PORT=8787
:loop
node "%~dp0server.js"
echo เซิร์ฟเวอร์หยุดทำงาน จะเริ่มใหม่ใน 5 วินาที...
timeout /t 5 >nul
goto loop
