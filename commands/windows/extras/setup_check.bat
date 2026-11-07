@echo off
rem Checks git, python, selenium, chrome, the repo and .env. Creates .env from the template if missing.
setlocal
cd /d "%~dp0..\..\.."
set FAIL=0
echo Checking setup in: %CD%
echo.

rem ---- Git
where git >nul 2>nul
if errorlevel 1 goto nogit
for /f "tokens=3" %%v in ('git --version') do echo [ OK ]   Git %%v
goto gitdone
:nogit
echo [FIX ]   Git is missing. Install: winget install --id Git.Git -e --source winget
set FAIL=1
:gitdone

rem ---- Python
set PY=
py -3 --version >nul 2>nul
if not errorlevel 1 set PY=py -3
if defined PY goto pyfound
python --version >nul 2>nul
if not errorlevel 1 set PY=python
:pyfound
if not defined PY goto nopy
for /f "tokens=2" %%v in ('%PY% --version 2^>^&1') do echo [ OK ]   Python %%v
%PY% -c "import selenium" >nul 2>nul
if errorlevel 1 goto nosel
echo [ OK ]   Selenium installed
goto pydone
:nosel
echo [FIX ]   Selenium is missing. Run commands\windows\setup_computer.bat
set FAIL=1
goto pydone
:nopy
echo [FIX ]   Python 3 is missing. Install: winget install --id Python.Python.3.12 -e --source winget
set FAIL=1
:pydone

rem ---- Chrome
set CHROME=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set CHROME=1
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME=1
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set CHROME=1
if defined CHROME goto chromeok
echo [FIX ]   Google Chrome is missing. Install: winget install --id Google.Chrome -e --source winget
set FAIL=1
goto chromedone
:chromeok
echo [ OK ]   Google Chrome
:chromedone

rem ---- Repo
if not exist .git goto norepo
where git >nul 2>nul
if errorlevel 1 goto repodone
git fetch --quiet origin >nul 2>nul
if errorlevel 1 goto fetchfail
set BEHIND=0
for /f %%n in ('git rev-list --count HEAD..origin/main 2^>nul') do set BEHIND=%%n
if "%BEHIND%"=="0" goto repouptodate
echo [UPDATE] %BEHIND% new commits on GitHub. Run commands\windows\update_code.bat
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
echo Fix the items above, then run this check again.
goto end
:allgood
echo All good. Open convert.html to start.
:end
echo.
pause
