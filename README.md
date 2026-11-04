# trugreens-po-automation

Turns a vendor WhatsApp message or invoice (Excel, PDF, Word) into a PosBytz purchase order.

1. `convert.html` sends your message and/or attachments to the OpenAI API, checks the JSON it gets back, and saves `purchase_orders.json` only when there are no blocking issues.
2. `run_selenium` (in `commands/mac` or `commands/windows`) opens PosBytz in Chrome and fills the purchase order from that JSON.

Everything runs locally. The only outside calls are to OpenAI and PosBytz (the page also loads its Excel/PDF/Word readers from a CDN, so it needs internet).

## Setup on a new machine

Needs Python 3, Git and Google Chrome. On Windows, install Git with `winget install --id Git.Git -e` and Python with `winget install --id Python.Python.3.12 -e`.

1. Clone the repo:
   ```
   git clone https://github.com/sai-sambhu/trugreens-po-automation.git
   cd trugreens-po-automation
   ```
2. Create your `.env` from the template and fill in the values (no spaces around `=`, no quotes):
   ```
   cp .env.example .env        (Windows: copy .env.example .env)
   ```
   | Key | What it is |
   |---|---|
   | `OPENAI_API_KEY` | Your OpenAI API key (platform.openai.com → API keys; needs billing credits) |
   | `OPENAI_MODEL` | Optional. Model ID; defaults to `gpt-4.1` |
   | `POSBYTZ_EMAIL` | PosBytz login email |
   | `POSBYTZ_PASSWORD` | PosBytz login password |

   `.env` is git-ignored and never comes from git. Create it by hand on every machine and never commit it.
3. Install the Python requirements: double-click `commands/mac/install_requirements.command` (Mac) or `commands/windows/install_requirements.bat` (Windows), or run `python3 -m pip install -r requirements.txt`.
4. Open `convert.html` in Chrome or Edge and choose the project folder once. After a restart the browser asks you to reconnect the folder with one click.

On macOS, the first time you open a `.command` file, right-click it and choose Open. On Windows, SmartScreen may warn about a `.bat` file: click More info, then Run anyway.

## Use

1. Pick the item list (**Fruits & veggies** or **Victory**).
2. Paste a message and/or attach files (Excel, PDF, Word `.docx`). At least one is required.
3. Click **Convert & validate**.
4. Fix anything shown in red and convert again. Red means the result is blocked and nothing is saved:
   - unmatched items
   - unit mismatches
   - a SKU that isn't in the item list
   - a missing vendor or date
   - more than one order in a single run (Selenium only enters the first)

   Amber warnings (total mismatch, name differences, estimated conversions, model warnings) don't block.
5. When it says "No issues", `purchase_orders.json` is saved. Double-click `commands/mac/run_selenium.command` (Mac) or `commands/windows/run_selenium.bat` (Windows). On a Mac you can also use the **Copy run command** button and paste it into Terminal. Chrome opens, logs in to PosBytz and fills the purchase order. Review it before saving.

Editing the prompt or item lists takes effect on the next convert, with no code change. The page reads them from `prompts/` every time.

## Updating

Run `commands/mac/update_code.command` or `commands/windows/update_code.bat`, or `git pull` in the project folder. Your `.env` is not touched. If the pull fails because you edited tracked files locally, run `git stash` and try again.

## Layout

```
convert.html                       the UI
src/create_purchase_order.py       Selenium automation
prompts/
  message_to_json_prompt.txt       system prompt sent to the AI
  items_fruits_veggies.txt         item list: fruits and veggies
  items_victory.txt                item list: Victory / kirana
  chatgpt_promt.txt                short instruction for the ChatGPT website (not used by the page)
commands/
  mac/                             double-click launchers for macOS (.command)
  windows/                         double-click launchers for Windows (.bat)
    each folder has: run_selenium, install_requirements, update_code
requirements.txt                   Python requirements
.env.example                       template for .env
```

Generated per run and git-ignored: `purchase_orders.json`.
