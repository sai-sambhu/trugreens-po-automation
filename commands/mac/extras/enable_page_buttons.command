#!/bin/bash
# Turns the page buttons on (setup_computer runs this for you). Lets the buttons in convert.html start update_code, setup_computer and run_selenium.
# Creates a small helper app in ~/Applications. Undo with disable_page_buttons.command.
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
HANDLER="$(cd "$DIR/../internal" && pwd)/handle_link.sh"
APP="$HOME/Applications/TruGreens Link.app"
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
chmod +x "$HANDLER" "$DIR"/*.command "$DIR"/../*.command
mkdir -p "$HOME/Applications"
rm -rf "$APP"
TMP="$(mktemp /tmp/tglink.XXXXXX)"
cat > "$TMP" <<AS
on open location theURL
	do shell script "/bin/bash " & quoted form of "$HANDLER" & " " & quoted form of theURL & " >/dev/null 2>&1 &"
end open location
AS
if osacompile -o "$APP" "$TMP" 2>/dev/null; then
  P="$APP/Contents/Info.plist"
  PB=/usr/libexec/PlistBuddy
  $PB -c "Add :CFBundleIdentifier string com.trugreens.link" "$P" 2>/dev/null || $PB -c "Set :CFBundleIdentifier com.trugreens.link" "$P"
  $PB -c "Add :LSUIElement bool true" "$P" 2>/dev/null
  $PB -c "Add :CFBundleURLTypes array" "$P"
  $PB -c "Add :CFBundleURLTypes:0 dict" "$P"
  $PB -c "Add :CFBundleURLTypes:0:CFBundleURLName string TruGreens Link" "$P"
  $PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$P"
  $PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string trugreens" "$P"
  codesign --force --sign - "$APP" >/dev/null 2>&1
  "$LSR" -f "$APP"
  printf '%s\nv2\n' "$ROOT" > "$ROOT/.link_registered"
  echo "Done. The buttons in convert.html now work on this Mac."
  echo "Registered to: $DIR"
  echo "If you move this folder, run this file again."
else
  echo "Could not create the helper app. This Mac may block it."
  FAILED=1
fi
rm -f "$TMP"
echo
[ "$1" = "quiet" ] || read -n 1 -s -r -p "Press any key to close."
[ -z "$FAILED" ]
