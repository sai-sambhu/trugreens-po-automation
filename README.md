# trugreens-po-automation

Turns a vendor WhatsApp message or invoice (Excel, PDF, Word) into a PosBytz purchase order.

1. `convert.html` sends your message and/or attachments to the OpenAI API, checks the JSON it gets back, and saves `purchase_orders.json` only when there are no blocking issues.
2. `run_selenium.command` opens PosBytz in Chrome and fills the purchase order from that JSON.

## Setup

1. Copy `.env.example` to `.env` and fill in `OPENAI_API_KEY`, `POSBYTZ_EMAIL` and `POSBYTZ_PASSWORD`. `.env` is git-ignored; never commit it.
2. Install the Python requirements: double-click `install_requirements.command` (or run `python3 -m pip install -r requirements.txt`). Python 3 and Google Chrome must be installed.
3. Open `convert.html` in Chrome or Edge and choose this folder once.

## Use

1. Pick the item list (Fruits & veggies or Victory), paste a message and/or attach files, click **Convert & validate**.
2. Fix anything shown in red (unmatched items, unit mismatches, unknown SKUs) and convert again.
3. When it says "No issues", double-click `run_selenium.command`.

## Layout

- `convert.html` – the UI
- `src/create_purchase_order.py` – Selenium automation
- `prompts/` – system prompt and the two item lists (`items_fruits_veggies.txt`, `items_victory.txt`)
- `run_selenium.command` – double-click launcher
- `install_requirements.command` – installs the Python requirements
- `update_code.command` – pulls the latest code from GitHub
