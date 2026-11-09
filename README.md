# trugreens-po-automation

Turns a vendor WhatsApp message or invoice (Excel, PDF, Word or an image) into a PosBytz purchase order.

1. `index.html` sends your message and/or attachments to the OpenAI API, checks the JSON it gets back, and saves `purchase_orders.json` only when there are no blocking issues.
2. `selenium_create_purchase_order` (in `commands/mac` or `commands/windows`) opens PosBytz in Chrome and fills the purchase order from that JSON.

Everything runs locally. The only outside calls are to OpenAI and PosBytz (the page also loads its Excel/PDF/Word readers from a CDN, so it needs internet).

## Setup on a new machine

### Prerequisites

You need Git, Python 3 and Google Chrome.

**Windows** (PowerShell or Command Prompt). Close and reopen the terminal after installing:
```
winget install --id Git.Git -e --source winget
winget install --id Python.Python.3.12 -e --source winget
winget install --id Google.Chrome -e --source winget
```
If `winget` isn't available, download the installers from https://git-scm.com/download/win, https://www.python.org/downloads/ and https://www.google.com/chrome/.

**macOS** (Terminal). This installs Git and Python 3 with Apple's command line tools:
```
xcode-select --install
```
Or, with Homebrew:
```
brew install git python
brew install --cask google-chrome
```

**Check the installs:**
```
git --version
python3 --version        (Windows: py --version)
```

### Steps

1. Clone the repo:
   ```
   git clone https://github.com/sai-sambhu/trugreens-po-automation.git
   cd trugreens-po-automation
   ```
2. Create your `.env` from the template and fill in the values (no spaces around `=`, no quotes).

   Easiest: run the setup check. It creates `.env` from the template if it is missing and opens it for you (see "Setup check" below).

   Or by hand. Windows (Command Prompt, in the project folder):
   ```
   copy .env.example .env
   notepad .env
   ```
   macOS:
   ```
   cp .env.example .env
   open -t .env
   ```
   Windows tip: Notepad and File Explorer won't create a file named `.env` from scratch (Notepad saves it as `.env.txt`), so always copy the template with the command above. If you must save from Notepad, set "Save as type" to "All files" and put the name in quotes: `".env"`.

   | Key | What it is |
   |---|---|
   | `OPENAI_API_KEY` | Your OpenAI API key (platform.openai.com → API keys; needs billing credits) |
   | `OPENAI_MODEL` | Optional. Model ID; defaults to `gpt-4.1` |
| `OPENAI_MODEL_TEXT` | Optional. Model for text only (typed message, Excel, PDF, Word). Falls back to `OPENAI_MODEL`. `gpt-4.1-mini` is about 5 times cheaper but can make rare wrong matches on long invoices |
| `OPENAI_MODEL_IMAGE` | Optional. Model when a picture is attached. Falls back to `OPENAI_MODEL` |
   | `POSBYTZ_EMAIL` | PosBytz login email |
   | `POSBYTZ_PASSWORD` | PosBytz login password |

   `.env` is git-ignored and never comes from git. Create it by hand on every machine and never commit it.
3. Install the Python requirements: double-click `commands/mac/setup_computer.command` (Mac) or `commands/windows/setup_computer.bat` (Windows), or run `python3 -m pip install -r requirements.txt`.
4. Run the setup check (below) to confirm everything is ready.
5. Open `index.html` in Chrome or Edge and choose the project folder once. After a restart the browser asks you to reconnect the folder with one click.

### Setup check

Double-click `commands/mac/setup_computer.command` (Mac) or `commands/windows/setup_computer.bat` (Windows). It checks Git, Python, Selenium, Chrome, that the folder is a git clone and up to date, and that `.env` exists with `OPENAI_API_KEY`, `POSBYTZ_EMAIL` and `POSBYTZ_PASSWORD` filled in. Anything missing is shown with the command to fix it. It never prints your secret values.

On macOS, the first time you open a `.command` file, right-click it and choose Open. On Windows, SmartScreen may warn about a `.bat` file: click More info, then Run anyway.

## Use

1. Pick the tab: **Fruits**, **Veggies & leafy**, **Victory** or **Aashirwaad**. Only that tab's item list and prompt rules are sent to the AI. On the Fruits and Veggies tabs the vendor is read from the message (Kanchana Vegetables, Kanchana Fruits, Manoj). The Victory and Aashirwaad tabs always use their own vendor.
2. Paste a message and/or attach files (Excel, PDF, Word `.docx`, or images: jpg, jpeg, png, webp). You can also copy a file or image and paste it with Cmd/Ctrl + V: a PDF or Excel copied in Finder/Explorer, a WhatsApp image, or a screenshot (on a Mac, Cmd + Ctrl + Shift + 4 copies a screenshot area). At least one message or file is required.
3. Pick the **Model** if you want: **GPT-4.1** (default, most accurate), **GPT-4.1 mini** (about 5 times cheaper) or **Auto** (mini only for short Fruits/Veggies text; pictures, long inputs, Victory and Aashirwaad use GPT-4.1). A picture always uses GPT-4.1. The Log shows which model ran.
4. Click **Convert & validate**.
5. Fix anything shown in red and convert again. Red means the result is blocked and nothing is saved:
   - unmatched items
   - unit mismatches
   - a SKU that isn't in the item list
   - a missing vendor or date
   - a wrong unit: each item's unit comes from the list (Count = pc, Weight = kg). If a message uses the other unit, it is converted only for items in the prompt's "MANUAL CONVERSION OVERRIDES" table (and the maths is checked). Anything else is an error.
   - more than one order in a single run (Selenium only enters the first)

   Amber warnings (total mismatch, name differences, estimated conversions, model warnings) don't block.
6. When it says "No issues", `purchase_orders.json` is saved. Double-click `commands/mac/selenium_create_purchase_order.command` (Mac) or `commands/windows/selenium_create_purchase_order.bat` (Windows). On a Mac you can also use the **Copy run command** button and paste it into Terminal. Chrome opens, logs in to PosBytz and fills the purchase order. Review it before saving.

Editing the prompt or item lists takes effect on the next convert, with no code change. The page reads them from `prompts/` every time.

## Updating

The page checks GitHub when it opens. If this copy is older, an amber bar at the top says so; the version is also shown at the bottom of the page. The bar needs internet and does not update anything by itself.


Run `commands/mac/update_code.command` or `commands/windows/update_code.bat`, or `git pull` in the project folder. Your `.env` is not touched. It never stops on an error: if the normal update cannot run (a deleted or moved folder, files edited here), your edits to repo files are saved in `backup/` and the folder is refreshed to match GitHub.

## Buttons that start the commands (optional, one-time setup)

The page has **Check computer health**, **Update code** (only when a newer version exists) and **Create purchase order** and **Create waste entry** buttons. A browser cannot start programs by itself, so each computer needs a one-time setup:

- **Windows:** double-click `commands/windows/setup_computer.bat`.
- **Mac:** double-click `commands/mac/setup_computer.command`. The buttons use a small helper app it creates in `~/Applications`.

`setup_computer` checks Git, Python, Chrome, the Python packages, the repo and `.env`, installs what is missing, and turns the page buttons on. After that, the buttons open the same windows as double-clicking `setup_computer`, `update_code` and `create_purchase_order`. The link only carries a word listed in `commands/links.txt` (update, setup, run), so nothing else can be started. To add a feature button later, add one line there with its script: new buttons then arrive with `update_code`, no setup needed. The first click may show "Open TruGreens Link?": allow it. If you move the folder, run `setup_computer` again.

To turn the buttons off, run `deregister_links` (`.bat` on Windows, `.command` on Mac). If your organisation blocks the buttons, nothing is lost: double-click the files in `commands/` as before.

## Layout

```
index.html                       the page (HTML only; open this)
assets/
  css/style.css                    the page styles
  js/app.js                        the page logic (AI call, checks, saving)
  js/version.js                    the release number (v1.0.0 style); bump it on every release (the page compares it with GitHub and shows "update needed")
src/create_purchase_order.py       Selenium automation
prompts/
  rules/                           prompt rules sent to the AI (a tab sends core.txt + its own files)
    core.txt                         shared rules (output format, matching, totals)
    produce_common.txt               shared rules for Fruits and Veggies (vendors, units, conversions)
    fruits.txt  veggies.txt          rules for the Fruits and Veggies & leafy tabs
    victory.txt  aashirwaad.txt      rules for the Victory and Aashirwaad tabs
  items/                           item lists, one per tab
    fruits.txt  veggies_leafy.txt  (columns: Variation Name, Sku, Count or Weight)
    victory.txt  aashirwaad.txt    (columns: Variation Name, Sku; all pieces)
commands/
  mac/                             double-click launchers for macOS (.command)
  windows/                         double-click launchers for Windows (.bat)
    each folder has: setup_computer (run this first), update_code, selenium_create_purchase_order, selenium_create_waste_entry, deregister_links
requirements.txt                   Python requirements
.env.example                       template for .env
```

Generated per run and git-ignored: `purchase_orders.json`.

## Adding a tab (new vendor or list)

1. Add the item list to `prompts/items/` (`Variation Name<tab>Sku`, plus `Count or Weight` if units vary).
2. Add a rules file to `prompts/purchase_orders/` named `<vendor>_rules.txt` with that vendor's rules (vendor name, units, matching).
3. Add one line to `TABS` near the top of `assets/js/app.js`: label, list file, rules files (`core.txt` plus yours), and `vendor` / `pcOnly` if the tab belongs to one vendor and is all pieces. The tab button appears by itself.

## Stock Report

Open `index.html`, switch to **Stock Report**, and add the three PosBytz exports (purchase order items, order items, stocks). Drop them in the box, or click **Auto-select latest from Downloads**:

- With the page buttons set up (see above), that button finds the newest of each export in your Downloads folder in one click, with no file window. A small script (`src/fetch_exports.py`) copies them into `exports/` (not saved to git) and the page reads them from there.
- Without the page buttons, it opens a file window in Downloads instead: press Ctrl+A (Cmd+A on Mac), then Open. The newest of each export is chosen; a file with the right name but the wrong columns is skipped.

The report has two tabs (item-wise and category-wise), both with filters, and **Download Excel** saves them as two sheets.

## Waste Management

The **Waste Management** tab turns a pasted waste list (fruits and veggies, one item and quantity per line) into `waste_management.json`, the same way the purchase order tab does. Only a clean result is saved.

- Prompts live in `prompts/waste_management/`: `prompt.txt` (task and output format), `rules.txt` (matching and unit rules), `groups.json` (lines like "All brinjals" or "Raw banana" with no size: the page splits the total across the group's items, so the maths is exact). The item lists come from the common `prompts/items/` folder (fruits and veggies only).
- `commands/.../selenium_create_waste_entry` (or the **Create waste entry** button on that tab) runs `src/create_waste_entry.py`. It logs in, opens Stock Adjust, creates a waste entry, sets Wastage Location (Trugreens) and Approver (Kanchana), then adds every item (SKU, quantity, reason "damage"). It does not save the entry: Chrome stays open so you can check it and save it yourself. Several waste messages can be pasted together: the same item in more than one message is added up by the page, with a note.

## Troubleshooting

- **Windows says "An Application Control policy has blocked this file" when Selenium starts:** Windows (Smart App Control) is blocking Chrome's helper program. The scripts then try Microsoft Edge automatically. If that is blocked too, open Windows Security > App & browser control > Smart App Control settings and turn it off (Microsoft treats this as a one-way switch), or ask your administrator to allow the browser driver.
