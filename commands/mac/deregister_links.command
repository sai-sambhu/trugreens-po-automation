#!/bin/bash
# Turns the page buttons off: removes the helper app and the note in the project folder.
# Turn them on again with setup_computer.command.
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Applications/TruGreens Link.app"
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$LSR" -u "$APP" 2>/dev/null
rm -rf "$APP"
rm -f "$DIR/../../.link_registered"
echo "Done. The page buttons are turned off on this Mac."
echo
read -n 1 -s -r -p "Press any key to close."
