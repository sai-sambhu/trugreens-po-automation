#!/bin/bash
# Turns the page buttons off. Removes what enable_page_buttons.command added.
APP="$HOME/Applications/TruGreens Link.app"
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$LSR" -u "$APP" 2>/dev/null
rm -rf "$APP"
rm -f "$(cd "$(dirname "$0")/../../.." && pwd)/.link_registered"
echo "Done. The trugreens:// link is removed from this Mac."
echo
read -n 1 -s -r -p "Press any key to close."
