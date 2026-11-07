@echo off
rem Turns the page buttons off: removes the link from your user settings and the note in the project folder.
rem Turn them on again with setup_computer.bat.
del "%~dp0..\..\.link_registered" >nul 2>nul
reg delete "HKCU\Software\Classes\trugreens" /f >nul 2>nul
echo Done. The page buttons are turned off on this computer.
echo.
pause
