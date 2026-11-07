@echo off
rem One file for the whole setup: checks this computer, installs what is missing (Git, Python, Chrome) with winget,
rem turns the page buttons on, and reports. The page buttons also call this file ("--link <word>").
rem Never asks for or prints passwords.
setlocal
cd /d "%~dp0..\.."
set "ROOT=%CD%"
set "SELF=%~dp0setup_computer.bat"
if /i "%~1"=="--link" goto link
goto main

:link
rem A page button was clicked. Allowed words and their files are listed in commands\links.txt.
set "ACT=%~2"
set "ACT=%ACT:trugreens://=%"
set "ACT=%ACT:/=%"
set "TARGET="
echo %ACT%| findstr /r /c:"^[A-Za-z0-9_][A-Za-z0-9_]*$" >nul || goto badlink
for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%~dp0..\links.txt") do if /i "%%a"=="%ACT%" set "TARGET=%%b"
if not defined TARGET goto badlink
set "KIND=bat"
if /i "%TARGET:~0,3%"=="py:" set "KIND=py"
if "%KIND%"=="py" set "TARGET=%TARGET:~3%"
echo %TARGET%| findstr /r /c:"^[A-Za-z0-9_][A-Za-z0-9_]*$" >nul || goto badlink
if "%KIND%"=="py" goto runpy
if /i "%TARGET%"=="setup_computer" goto main
if not exist "%~dp0%TARGET%.bat" goto badlink
call "%~dp0%TARGET%.bat"
exit /b
:badlink
echo Unknown action: "%ACT%".
pause
exit /b
:runpy
rem a quiet helper script in src\, no pause
if not exist "%ROOT%\src\%TARGET%.py" exit /b
set PYQ=
py -3 --version >nul 2>nul
if not errorlevel 1 set PYQ=py -3
if defined PYQ goto runpy2
python --version >nul 2>nul
if not errorlevel 1 set PYQ=python
:runpy2
if not defined PYQ exit /b
%PYQ% "%ROOT%\src\%TARGET%.py" >nul 2>nul
exit /b

:main
set INSTALLED=0
set FAIL=0
echo Checking and setting up this computer in: %ROOT%
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

rem ---- Page buttons (trugreens:// links), written to your own user settings only
reg add "HKCU\Software\Classes\trugreens" /ve /d "URL:TruGreens Link" /f >nul 2>nul
reg add "HKCU\Software\Classes\trugreens" /v "URL Protocol" /d "" /f >nul 2>nul
reg add "HKCU\Software\Classes\trugreens\shell\open\command" /ve /d "\"%SELF%\" --link \"%%1\"" /f >nul 2>nul
if errorlevel 1 goto linkfail
> "%ROOT%\.link_registered" echo %ROOT%
>> "%ROOT%\.link_registered" echo v3
echo [ OK ]   Page buttons registered ^(Update code, Check health, Run Selenium^)
goto linkdone
:linkfail
echo [WARN]   Page buttons could not be registered here ^(your organisation may block it^). The files in commands still work.
:linkdone

rem ---- Repo
if not exist .git goto norepo
git fetch --quiet origin >nul 2>nul
if errorlevel 1 goto fetchfail
set BEHIND=0
for /f %%n in ('git rev-list --count HEAD..origin/main 2^>nul') do set BEHIND=%%n
if "%BEHIND%"=="0" goto repouptodate
echo [UPDATE] %BEHIND% new commits on GitHub. Click Update code on the page, or run commands\windows\update_code.bat
goto repodone
:repouptodate
echo [ OK ]   Repo is up to date
goto repodone
:fetchfail
echo [WARN]   Could not reach GitHub. Repo status unknown.
goto repodone
:norepo
echo [FIX ]   This folder is not a git clone. Clone it: git clone https://github.com/sai-sambhu/trugreens-po-automation.git
set FAIL=1
:repodone

rem ---- .env
if exist .env goto envexists
if not exist .env.example goto noexample
copy .env.example .env >nul
echo [CREATED] .env was missing. Created it from .env.example. Opening it in Notepad: fill in the values and save.
set FAIL=1
start notepad .env
goto envdone
:noexample
echo [FIX ]   .env and .env.example are both missing. Run commands\windows\update_code.bat
set FAIL=1
goto envdone
:envexists
set MISSINGKEYS=
findstr /b /r /c:"OPENAI_API_KEY=." .env >nul || set MISSINGKEYS=%MISSINGKEYS% OPENAI_API_KEY
findstr /b /r /c:"POSBYTZ_EMAIL=." .env >nul || set MISSINGKEYS=%MISSINGKEYS% POSBYTZ_EMAIL
findstr /b /r /c:"POSBYTZ_PASSWORD=." .env >nul || set MISSINGKEYS=%MISSINGKEYS% POSBYTZ_PASSWORD
if defined MISSINGKEYS goto envmissing
echo [ OK ]   .env has all required values
goto envdone
:envmissing
echo [FIX ]   .env is missing values for:%MISSINGKEYS%
set FAIL=1
:envdone

echo.
if "%FAIL%"=="0" goto allgood
echo Fix the items above, then click "Check computer health" again.
goto end
:allgood
echo All good. Open convert.html to start.
:end
echo.
pause
exit /b

:restart
echo.
echo Something was just installed. Windows does not see new programs in this window.
echo Please close this window, then click "Check computer health" again to finish.
echo.
pause
exit /b

:failed
echo.
echo Some steps could not finish ^(see the lines above^). Fix them, then click "Check computer health" again.
echo.
pause
exit /b

:install
if "%WINGET%"=="0" goto noget
echo Installing %~2 ^(Windows may ask for permission^)...
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
