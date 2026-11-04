#!/bin/bash
cd "$(dirname "$0")/../.." || exit 1
python3 -m pip install -r requirements.txt && echo && echo "Done. Requirements installed." \
  || { echo; echo "Install failed. Make sure Python 3 is installed (python3 --version)."; }
echo
read -n 1 -s -r -p "Press any key to close."
