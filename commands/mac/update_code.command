#!/bin/bash
cd "$(dirname "$0")/../.." || exit 1
if [ ! -d .git ]; then
  echo "This folder is not a git clone, so it can't be updated this way."
  echo "Re-download it from https://github.com/sai-sambhu/trugreens-po-automation"
else
  git pull --ff-only origin main && echo && echo "Up to date. Reload index.html in your browser." \
    || { echo; echo "Update failed. If you edited tracked files here, run: git stash   then run this again."; }
fi
echo
read -n 1 -s -r -p "Press any key to close."
