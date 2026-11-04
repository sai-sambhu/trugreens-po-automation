@echo off
cd /d "%~dp0..\.."
set PY=python
where py >nul 2>nul && set PY=py
%PY% src\create_purchase_order.py
echo.
pause
