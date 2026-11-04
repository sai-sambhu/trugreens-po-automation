#!/bin/bash
cd "$(dirname "$0")/../.." || exit 1
python3 src/create_purchase_order.py
echo
read -n 1 -s -r -p "Press any key to close."
