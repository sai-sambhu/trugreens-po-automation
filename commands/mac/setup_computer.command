#!/bin/bash
# Sets up this Mac in one go: Apple's command line tools (Git + Python), Chrome if Homebrew is there, the Python
# packages, then the setup check. Never asks for or prints passwords.
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/../.." || exit 1
FAIL=0
echo "Setting up this Mac..."
echo

# Git and Python come with Apple's command line tools.
if ! xcode-select -p >/dev/null 2>&1; then
  echo "Installing Apple's command line tools (Git and Python)..."
  xcode-select --install >/dev/null 2>&1
  echo
  echo "An Apple window opened. Click Install and wait until it finishes."
  echo "Then click \"Set up this computer\" again to finish."
  echo; read -n 1 -s -r -p "Press any key to close."; exit 0
fi
echo "[ OK ]   Git and Python"

# Chrome
if [ -d "/Applications/Google Chrome.app" ]; then
  echo "[ OK ]   Google Chrome"
elif command -v brew >/dev/null 2>&1; then
  echo "Installing Google Chrome..."
  brew install --cask google-chrome || { echo "[FIX ]   Chrome could not be installed. Get it from https://www.google.com/chrome/"; FAIL=1; }
else
  echo "[FIX ]   Google Chrome is missing. Get it from https://www.google.com/chrome/"
  FAIL=1
fi

# Python packages (Selenium etc.): quiet, the full output is shown only if it fails
if OUT="$(python3 -m pip install -q --disable-pip-version-check -r requirements.txt 2>&1)"; then
  echo "[ OK ]   Python packages (Selenium)"
else
  echo "$OUT"
  echo "[FIX ]   The package install failed (details above). Check your internet connection and try again."
  FAIL=1
fi

# Page buttons (trugreens:// links)
if bash "$DIR/extras/enable_page_buttons.command" quiet >/dev/null 2>&1; then
  echo "[ OK ]   Page buttons registered (Update code, Set up, Run Selenium)"
else
  echo "[WARN]   Page buttons could not be registered here. The scripts in commands still work."
fi

echo
bash "$DIR/extras/setup_check.command"
