#!/bin/bash
# Checks git, python, selenium, chrome, the repo and .env. Creates .env from the template if missing.
cd "$(dirname "$0")/../../.." || exit 1
FAIL=0
ok()   { echo "[ OK ]   $1"; }
fix()  { echo "[FIX ]   $1"; FAIL=1; }
warn() { echo "[WARN]   $1"; }

echo "Checking setup in: $PWD"
echo

# Git
if command -v git >/dev/null 2>&1; then ok "Git $(git --version | awk '{print $3}')"
else fix "Git is missing. Install: xcode-select --install   (or: brew install git)"; fi

# Python
if command -v python3 >/dev/null 2>&1; then
  ok "Python $(python3 --version 2>&1 | awk '{print $2}')"
  if python3 -c "import selenium" >/dev/null 2>&1; then ok "Selenium installed"
  else fix "Selenium is missing. Run commands/mac/setup_computer.command"; fi
else
  fix "Python 3 is missing. Install: xcode-select --install   (or: brew install python)"
fi

# Chrome
if [ -d "/Applications/Google Chrome.app" ]; then ok "Google Chrome"
else fix "Google Chrome is missing. Install: brew install --cask google-chrome   (or download from google.com/chrome)"; fi

# Repo
if [ -d .git ] && command -v git >/dev/null 2>&1; then
  if git fetch --quiet origin >/dev/null 2>&1; then
    BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
    if [ "$BEHIND" = "0" ]; then ok "Repo is up to date"
    else echo "[UPDATE] $BEHIND new commit(s) on GitHub. Run commands/mac/update_code.command"; fi
  else
    warn "Could not reach GitHub (offline?). Repo status unknown."
  fi
elif [ ! -d .git ]; then
  fix "This folder is not a git clone. Clone it: git clone https://github.com/sai-sambhu/trugreens-po-automation.git"
fi

# .env
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "[CREATED] .env was missing. Created it from .env.example. Opening it: fill in the values and save."
    open -t .env
    FAIL=1
  else
    fix ".env and .env.example are both missing. Run commands/mac/update_code.command"
  fi
else
  MISSING=""
  for KEY in OPENAI_API_KEY POSBYTZ_EMAIL POSBYTZ_PASSWORD; do
    grep -q "^$KEY=." .env || MISSING="$MISSING $KEY"
  done
  if [ -z "$MISSING" ]; then ok ".env has all required values"
  else fix ".env is missing values for:$MISSING"; fi
fi

echo
if [ "$FAIL" = "0" ]; then echo "All good. Open convert.html to start."
else echo "Fix the items above, then run this check again."; fi
echo
read -n 1 -s -r -p "Press any key to close."
