@echo off
cd /d "%~dp0..\.."
if not exist .git (
  echo This folder is not a git clone, so it cannot be updated this way.
  echo Re-download it from https://github.com/sai-sambhu/trugreens-po-automation
) else (
  git pull --ff-only origin main
  if errorlevel 1 (
    echo.
    echo Update failed. If you edited tracked files here, run: git stash   then run this again.
  ) else (
    echo.
    echo Up to date. Reload convert.html in your browser.
  )
)
echo.
pause
