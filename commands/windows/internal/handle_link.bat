@echo off
rem Runs when a trugreens:// link is clicked in the page. Only these three words are accepted.
setlocal
set "URL=%~1"
set "ACT=%URL:trugreens://=%"
set "ACT=%ACT:/=%"
if /i "%ACT%"=="update" ( call "%~dp0..\update_code.bat" & exit /b )
if /i "%ACT%"=="setup"  ( call "%~dp0..\setup_computer.bat" & exit /b )
if /i "%ACT%"=="run"    ( call "%~dp0..\run_selenium.bat" & exit /b )
echo Unknown action: "%ACT%". Allowed: update, setup, run.
pause
