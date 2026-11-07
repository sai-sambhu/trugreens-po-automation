"""Copies the newest purchase, sold-items and stock exports from the Downloads folder into ./exports/.
Started by the page's "Auto-select" button (through the trugreens://exports link). Prints nothing.
The page then reads ./exports/ and builds the report. Writes exports/.ready when done."""
import csv
import io
import json
import os
import re
import shutil
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "exports")
EXT = (".csv", ".xlsx", ".xls")

# name pattern and the column names a real export must contain (checked for .csv files)
KINDS = {
    "purchase": (re.compile(r"purchase.?order.?items", re.I), ["sku", "item variation", "ordered qty", "item category", "unit buying price"]),
    "sales": (re.compile(r"order.?items", re.I), ["sku", "variation name", "quantity", "category name", "unit buying price"]),
    "stock": (re.compile(r"stocks?\b|stocks?[_\-. ]", re.I), ["sku", "item variation name", "stock", "stock value(buying price)"]),
}


def download_dirs():
    home = os.path.expanduser("~")
    found = [os.path.join(os.environ.get("USERPROFILE", home), "Downloads"), os.path.join(home, "Downloads")]
    for key, val in os.environ.items():
        if key.startswith("OneDrive") and val:
            found.append(os.path.join(val, "Downloads"))
    seen, dirs = set(), []
    for d in found:
        if os.path.isdir(d) and os.path.normcase(os.path.abspath(d)) not in seen:
            seen.add(os.path.normcase(os.path.abspath(d)))
            dirs.append(d)
    return dirs


def kind_of(name):
    low = name.lower()
    if not low.endswith(EXT) or low.startswith("stock report"):  # "Stock Report ...xlsx" is this tool's own output
        return None
    for kind in ("purchase", "sales", "stock"):  # purchase first: its name also contains "order items"
        if KINDS[kind][0].search(name):
            return kind
    return None


def csv_ok(path, need):
    """True when the csv has all the needed column names in one of its first 30 lines (other formats are checked by the page)."""
    if not path.lower().endswith(".csv"):
        return True
    try:
        with io.open(path, encoding="utf-8-sig", errors="replace", newline="") as f:
            for i, row in enumerate(csv.reader(f)):
                if i >= 30:
                    break
                cells = {c.strip().lower() for c in row}
                if all(n in cells for n in need):
                    return True
    except OSError:
        pass
    return False


def main():
    candidates = {k: [] for k in KINDS}
    for d in download_dirs():
        for name in os.listdir(d):
            path = os.path.join(d, name)
            kind = kind_of(name)
            if kind and os.path.isfile(path):
                candidates[kind].append((os.path.getmtime(path), path))

    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    picked = {}
    for kind, items in candidates.items():
        for _, path in sorted(items, reverse=True):  # newest first; fall back to the next one if the contents do not match
            if csv_ok(path, KINDS[kind][1]):
                shutil.copy2(path, os.path.join(OUT, os.path.basename(path)))
                picked[kind] = os.path.basename(path)
                break
    with open(os.path.join(OUT, ".ready"), "w") as f:
        json.dump({"time": int(time.time() * 1000), "files": picked}, f)


if __name__ == "__main__":
    main()
