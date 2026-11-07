#!/bin/bash
# Runs when a trugreens:// link is clicked in the page. Only these three words are accepted.
DIR="$(cd "$(dirname "$0")" && pwd)"
ACT="${1#trugreens://}"; ACT="${ACT//\//}"
case "$ACT" in
  update) F="update_code.command" ;;
  setup)  F="setup_computer.command" ;;
  run)    F="run_selenium.command" ;;
  *) exit 1 ;;
esac
TOP="$(cd "$DIR/.." && pwd)"
chmod +x "$TOP/$F" 2>/dev/null
open -a Terminal "$TOP/$F"
