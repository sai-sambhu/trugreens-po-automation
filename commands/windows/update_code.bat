@echo off
rem Brings this folder up to date with GitHub and does not stop on errors. If the normal update cannot run (a deleted or
rem moved folder, files edited here, leftovers), local edits are saved to backup\ and the folder is made to match GitHub.
rem .env and other git-ignored files (purchase_orders.json, exports, debug...) are never touched.
if /i "%~1"=="--run" goto start
rem This file is replaced by the update itself, so it runs from a temporary copy.
copy /y "%~f0" "%TEMP%\tg_update_code.bat" >nul
call "%TEMP%\tg_update_code.bat" --run "%~dp0."
exit /b

:start
setlocal
cd /d "%~2\..\.."
if not exist .git goto nogit
if not exist .git\index.lock goto nolock
tasklist /fi "imagename eq git.exe" 2>nul | find /i "git.exe" >nul
if errorlevel 1 del /f /q .git\index.lock >nul 2>nul
:nolock
set OLD=
for /f %%h in ('git rev-parse HEAD 2^>nul') do set OLD=%%h
echo Checking GitHub...
git fetch --quiet origin main >nul 2>nul
if errorlevel 1 goto offline
git pull --ff-only --quiet origin main >nul 2>nul
if not errorlevel 1 goto updated

echo The normal update could not run, so the folder is being refreshed to match GitHub...
set TS=
for /f %%t in ('powershell -nologo -noprofile -command "Get-Date -Format yyyyMMdd-HHmmss" 2^>nul') do set TS=%%t
if not defined TS set TS=%RANDOM%%RANDOM%
git diff HEAD --quiet >nul 2>nul
if not errorlevel 1 goto nolocaledits
if not exist backup mkdir backup
git diff HEAD > "backup\local-changes-%TS%.patch"
echo Your edits to repo files were saved to backup\local-changes-%TS%.patch
:nolocaledits
set AHEAD=0
for /f %%n in ('git rev-list --count origin/main..HEAD 2^>nul') do set AHEAD=%%n
if "%AHEAD%"=="0" goto noahead
git branch "backup-%TS%" HEAD >nul 2>nul
echo Commits that were not on GitHub were kept in the branch backup-%TS%
:noahead
git checkout -q -f -B main origin/main >nul 2>nul
if errorlevel 1 goto lockfail
goto tidy

:updated

:tidy
rem tidy up: junk files, then folders left empty by deleted or moved folders
del /s /q /f .DS_Store Thumbs.db >nul 2>nul
for /l %%i in (1,1,3) do for /f "delims=" %%d in ('dir /ad /b /s 2^>nul ^| findstr /v /i /c:"\.git" ^| sort /r') do rd "%%d" >nul 2>nul
set NEW=
for /f %%h in ('git rev-parse HEAD 2^>nul') do set NEW=%%h
echo.
if not defined OLD goto nochange
if "%OLD%"=="%NEW%" goto nochange
echo What changed:
git log --format="  - %%s" -15 %OLD%..%NEW%
echo.
echo Files (M changed, A added, D deleted, R moved):
git diff --name-status -M %OLD% %NEW%
goto changeddone
:nochange
echo No changes made. This folder is already up to date with GitHub.
goto end
:changeddone
echo.
echo Updated. Reload index.html in your browser.
goto end

:nogit
echo This folder is not a git clone, so it cannot be updated this way.
echo Re-download it from https://github.com/sai-sambhu/trugreens-po-automation
goto end

:offline
echo Could not reach GitHub. Check the internet connection and try again.
goto end

:lockfail
echo Could not refresh the folder. Close any program using files in it (Excel, editors, other command windows) and try again.

:end
echo.
pause
exit /b
