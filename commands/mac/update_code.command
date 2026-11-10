#!/bin/bash
# Brings this folder up to date with GitHub and does not stop on errors. If the normal update cannot run (a deleted or
# moved folder, files edited here, leftovers), local edits are saved to backup/ and the folder is made to match GitHub.
# .env and other git-ignored files (purchase_orders.json, exports, debug...) are never touched.
main() {
  cd "$(dirname "$0")/../.." || return 1
  if [ ! -d .git ]; then
    echo "This folder is not a git clone, so it can't be updated this way."
    echo "Re-download it from https://github.com/sai-sambhu/trugreens-po-automation"
    return 1
  fi
  # a leftover lock from an interrupted git run
  if [ -f .git/index.lock ] && ! pgrep -x git >/dev/null 2>&1; then rm -f .git/index.lock; fi

  OLD="$(git rev-parse HEAD 2>/dev/null)"
  echo "Checking GitHub..."
  if ! git fetch --quiet origin main 2>/dev/null; then
    echo "Could not reach GitHub. Check the internet connection and try again."
    return 1
  fi
  if git pull --ff-only --quiet origin main >/dev/null 2>&1; then
    :   # the summary below says what happened
  else
    echo "The normal update could not run, so the folder is being refreshed to match GitHub..."
    TS="$(date +%Y%m%d-%H%M%S)"
    if ! git diff HEAD --quiet 2>/dev/null; then
      mkdir -p backup
      git diff HEAD > "backup/local-changes-$TS.patch"
      echo "Your edits to repo files were saved to backup/local-changes-$TS.patch"
    fi
    if [ "$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)" != "0" ]; then
      git branch "backup-$TS" HEAD >/dev/null 2>&1
      echo "Commits that were not on GitHub were kept in the branch backup-$TS"
    fi
    if ! git checkout -q -f -B main origin/main 2>/dev/null; then
      echo "Could not refresh the folder. Close any program using files in it (editors, Terminal windows) and try again."
      return 1
    fi
  fi

  # tidy up: junk files, then folders left empty by deleted or moved folders
  find . -path ./.git -prune -o -type f \( -name .DS_Store -o -name Thumbs.db \) -print -delete >/dev/null 2>&1
  for _ in 1 2 3; do find . -path ./.git -prune -o -mindepth 1 -type d -empty -print -delete >/dev/null 2>&1; done

  # what changed since before the update
  NEW="$(git rev-parse HEAD 2>/dev/null)"
  VER="$(sed -n 's/.*APP_RELEASE = "\(.*\)".*/\1/p' assets/js/version.js 2>/dev/null)"
  echo
  if [ -z "$OLD" ] || [ "$OLD" = "$NEW" ]; then
    echo "No changes made. This folder is already up to date with GitHub${VER:+ (version $VER)}."
    return 0
  else
    echo "What changed:"
    git log --format='  - %s' "$OLD..$NEW" 2>/dev/null | head -15
    echo
    echo "Files (M changed, A added, D deleted, R moved):"
    git diff --name-status -M "$OLD" "$NEW" 2>/dev/null | head -40 | sed 's/^/  /'
    TOTAL="$(git diff --name-only -M "$OLD" "$NEW" 2>/dev/null | wc -l | tr -d ' ')"
    [ "${TOTAL:-0}" -gt 40 ] && echo "  ...and $((TOTAL - 40)) more"
  fi

  echo
  echo "Updated${VER:+ to version $VER}. Reload index.html in your browser."
  return 0
}
# one line on purpose: bash has read all of it before the update replaces this very file
main "$@"; echo; read -n 1 -s -r -p "Press any key to close."; exit 0
