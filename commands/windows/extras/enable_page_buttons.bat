@echo off
rem Turns the page buttons on (setup_computer runs this for you). Lets the buttons in convert.html start update_code, setup_computer and run_selenium.
rem Writes only to your own user settings (no admin needed). Undo with disable_page_buttons.bat.
setlocal
for %%I in ("%~dp0..\internal\handle_link.bat") do set "HANDLER=%%~fI"
pushd "%~dp0..\..\.."
set "ROOT=%CD%"
popd
reg add "HKCU\Software\Classes\trugreens" /ve /d "URL:TruGreens Link" /f >nul
reg add "HKCU\Software\Classes\trugreens" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\trugreens\shell\open\command" /ve /d "\"%HANDLER%\" \"%%1\"" /f >nul
if errorlevel 1 (
  echo Could not register. Your organisation may block this on this computer.
  if /i not "%~1"=="quiet" pause
  exit /b 1
) else (
  > "%ROOT%\.link_registered" echo %ROOT%
  >> "%ROOT%\.link_registered" echo v2
  echo Done. The buttons in convert.html now work on this computer.
  echo Registered to: %HANDLER%
  echo If you move this folder, run this file again.
)
echo.
if /i not "%~1"=="quiet" pause
exit /b 0
