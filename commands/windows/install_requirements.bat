@echo off
cd /d "%~dp0..\.."
set PY=python
where py >nul 2>nul && set PY=py
%PY% -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo Install failed. Make sure Python 3 is installed: py --version
) else (
  echo.
  echo Done. Requirements installed.
)
echo.
pause
