#!/bin/bash
# One file for the whole setup: checks this Mac, installs what is missing, turns the page buttons on, and reports.
# The page buttons also call this file ("--link <word>"). Never asks for or prints passwords.
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"

# ---- A page button was clicked. Allowed words and their files are listed in commands/links.txt.
if [ "$1" = "--link" ]; then
  ACT="${2#trugreens://}"; ACT="${ACT//\//}"
  [[ "$ACT" =~ ^[a-z0-9_]+$ ]] || exit 1
  NAME="$(sed -n "s/^$ACT=\(.*\)$/\1/p" "$DIR/../links.txt" 2>/dev/null | head -1 | tr -d '\r ')"
  if [[ "$NAME" == py:* ]]; then   # a quiet helper script in src/, no window
    NAME="${NAME#py:}"
    [[ "$NAME" =~ ^[a-z0-9_]+$ ]] && [ -f "$ROOT/src/$NAME.py" ] || exit 1
    nohup python3 "$ROOT/src/$NAME.py" >/dev/null 2>&1 &
    exit 0
  fi
  [[ "$NAME" =~ ^[a-z0-9_]+$ ]] && [ -f "$DIR/$NAME.command" ] || exit 1
  chmod +x "$DIR/$NAME.command" 2>/dev/null
  open -a Terminal "$DIR/$NAME.command"
  exit 0
fi

cd "$ROOT" || exit 1
FAIL=0
ok()   { echo "[ OK ]   $1"; }
fix()  { echo "[FIX ]   $1"; FAIL=1; }
warn() { echo "[WARN]   $1"; }
echo "Checking and setting up this Mac in: $ROOT"
echo

# ---- Git and Python come with Apple's command line tools.
if ! xcode-select -p >/dev/null 2>&1; then
  echo "Installing Apple's command line tools (Git and Python)..."
  xcode-select --install >/dev/null 2>&1
  echo
  echo "An Apple window opened. Click Install and wait until it finishes."
  echo "Then click \"Check computer health\" again to finish."
  echo; read -n 1 -s -r -p "Press any key to close."; exit 0
fi
ok "Git $(git --version | awk '{print $3}')"
ok "Python $(python3 --version 2>&1 | awk '{print $2}')"

# ---- Chrome
if [ -d "/Applications/Google Chrome.app" ]; then
  ok "Google Chrome"
elif command -v brew >/dev/null 2>&1; then
  echo "Installing Google Chrome..."
  brew install --cask google-chrome || fix "Chrome could not be installed. Get it from https://www.google.com/chrome/"
else
  fix "Google Chrome is missing. Get it from https://www.google.com/chrome/"
fi

# ---- Python packages (Selenium etc.): quiet, the full output is shown only if it fails
if OUT="$(python3 -m pip install -q --disable-pip-version-check -r requirements.txt 2>&1)"; then
  ok "Python packages (Selenium)"
else
  echo "$OUT"
  fix "The package install failed (details above). Check your internet connection and try again."
fi

# ---- Page buttons (trugreens:// links): a small helper app in ~/Applications
APP="$HOME/Applications/TruGreens Link.app"
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
chmod +x "$DIR"/*.command
mkdir -p "$HOME/Applications"
rm -rf "$APP"
TMP="$(mktemp /tmp/tglink.XXXXXX)"
cat > "$TMP" <<AS
on open location theURL
	do shell script "/bin/bash " & quoted form of "$DIR/setup_computer.command" & " --link " & quoted form of theURL & " >/dev/null 2>&1 &"
end open location
AS
if osacompile -o "$APP" "$TMP" 2>/dev/null; then
  P="$APP/Contents/Info.plist"; PB=/usr/libexec/PlistBuddy
  $PB -c "Add :CFBundleIdentifier string com.trugreens.link" "$P" 2>/dev/null || $PB -c "Set :CFBundleIdentifier com.trugreens.link" "$P"
  $PB -c "Add :LSUIElement bool true" "$P" 2>/dev/null
  $PB -c "Add :CFBundleURLTypes array" "$P"
  $PB -c "Add :CFBundleURLTypes:0 dict" "$P"
  $PB -c "Add :CFBundleURLTypes:0:CFBundleURLName string TruGreens Link" "$P"
  $PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$P"
  $PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string trugreens" "$P"
  codesign --force --sign - "$APP" >/dev/null 2>&1
  "$LSR" -f "$APP"
  printf '%s\nv3\n' "$ROOT" > "$ROOT/.link_registered"
  ok "Page buttons registered (Update code, Check health, Run Selenium)"
else
  warn "Page buttons could not be registered here. The files in commands still work."
fi
rm -f "$TMP"

# ---- Repo
if [ -d .git ]; then
  if git fetch --quiet origin >/dev/null 2>&1; then
    BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
    if [ "$BEHIND" = "0" ]; then ok "Repo is up to date"
    else echo "[UPDATE] $BEHIND new commit(s) on GitHub. Click Update code on the page, or run commands/mac/update_code.command"; fi
  else
    warn "Could not reach GitHub (offline?). Repo status unknown."
  fi
else
  fix "This folder is not a git clone. Clone it: git clone https://github.com/sai-sambhu/trugreens-po-automation.git"
fi

# ---- .env
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
else echo "Fix the items above, then click \"Check computer health\" again."; fi
echo
read -n 1 -s -r -p "Press any key to close."
