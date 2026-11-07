@echo off
rem Turns the page buttons off. Removes what enable_page_buttons.bat added.
del "%~dp0..\..\..\.link_registered" >nul 2>nul
reg delete "HKCU\Software\Classes\trugreens" /f >nul 2>nul
echo Done. The trugreens:// link is removed from this computer.
echo.
pause
