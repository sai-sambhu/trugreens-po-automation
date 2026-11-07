@echo off
rem Sets up this computer in one go: installs what is missing (Git, Python, Chrome) with winget, installs the Python
rem packages, then runs the setup check. Never asks for or prints passwords.
setlocal
cd /d "%~dp0..\.."
set INSTALLED=0
set FAIL=0
echo Setting up this computer...
echo.

where winget >nul 2>nul
if errorlevel 1 (set WINGET=0) else (set WINGET=1)

rem ---- Git
where git >nul 2>nul
if not errorlevel 1 goto gitok
call :install Git.Git "Git"
goto gitdone
:gitok
echo [ OK ]   Git
:gitdone

rem ---- Python
set PY=
py -3 --version >nul 2>nul
if not errorlevel 1 set PY=py -3
if defined PY goto pyok
python --version >nul 2>nul
if not errorlevel 1 set PY=python
if defined PY goto pyok
call :install Python.Python.3.12 "Python"
goto pydone
:pyok
echo [ OK ]   Python
:pydone

rem ---- Chrome
set CHROME=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set CHROME=1
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME=1
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set CHROME=1
if defined CHROME goto chromeok
call :install Google.Chrome "Google Chrome"
goto chromedone
:chromeok
echo [ OK ]   Google Chrome
:chromedone

if "%INSTALLED%"=="1" goto restart
if "%FAIL%"=="1" goto failed

rem ---- Python packages (Selenium etc.): quiet, the full output is shown only if it fails
%PY% -m pip install -q --disable-pip-version-check -r requirements.txt >"%TEMP%\tg_pip.log" 2>&1
if errorlevel 1 (
  type "%TEMP%\tg_pip.log"
  echo [FIX ]   The package install failed ^(details above^). Check your internet connection and try again.
  goto failed
)
echo [ OK ]   Python packages ^(Selenium^)

rem ---- Page buttons (trugreens:// links)
call "%~dp0extras\enable_page_buttons.bat" quiet >nul 2>nul
if errorlevel 1 (
  echo [WARN]   Page buttons could not be registered here ^(your organisation may block it^). The scripts in commands still work.
) else (
  echo [ OK ]   Page buttons registered ^(Update code, Set up, Run Selenium^)
)

rem ---- Final check
echo.
call "%~dp0extras\setup_check.bat"
exit /b

:restart
echo.
echo Something was just installed. Windows does not see new programs in this window.
echo Please close this window, then click "Set up this computer" again to finish.
echo.
pause
exit /b

:failed
echo.
echo Some steps could not finish (see the lines above). Fix them, then click "Set up this computer" again.
echo.
pause
exit /b

:install
if "%WINGET%"=="0" goto noget
echo Installing %~2 (Windows may ask for permission)...
winget install --id %1 -e --source winget --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto instfail
set INSTALLED=1
goto :eof
:instfail
echo [FIX ]   %~2 could not be installed here. Your organisation may block it.
set FAIL=1
goto :eof
:noget
echo [FIX ]   %~2 is missing and winget is not available. Install it by hand from its website.
set FAIL=1
goto :eof
