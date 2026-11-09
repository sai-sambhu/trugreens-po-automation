"""Creates a waste entry in PosBytz from waste_management.json (written by the page's Waste Management tab):
Wastage Location and Approver, then one row per item (SKU, wastage quantity, reason "damage", Add).
It does not save the entry: Chrome stays open so the entry can be checked first."""
import json
import os
import re
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import NoSuchElementException, StaleElementReferenceException

# Login, popup, dropdown and click helpers are shared with the purchase order script.
import create_purchase_order as po

WASTE_JSON_PATH = os.path.join(po.ROOT, "waste_management.json")
STOCK_ADJUST_URL = "https://app.posbytz.com/inventory/stock-adjust"
CREATE_WASTE_BUTTON_XPATH = "/html/body/div[1]/div[2]/main/form/div/div[2]/a[2]"
WASTAGE_LOCATION_TOGGLE_XPATH = "/html/body/div[1]/div[2]/main/div[3]/div[2]/div/div/form/div[1]/div[1]/div/div/span/span[1]/span/span[1]/span"
APPROVER_TOGGLE_XPATH = "/html/body/div[1]/div[2]/main/div[3]/div[2]/div/div/form/div[1]/div[2]/div/div/span/span[1]/span/span[1]"
FIRST_RESULT_XPATH = po.SELECT2_FIRST_RESULT_XPATH

# The item table. The entry row is always the first row (tr[1]); added items go below it.
TABLE = "/html/body/div[1]/div[2]/main/div[3]/div[2]/div/div/form/div[3]/div[2]/div/table/tbody"
ROW = TABLE + "/tr[1]"
SKU_TOGGLE_FIRST_XPATH = TABLE + "/tr/td[1]/span[1]/span[1]/span/span[1]/span"   # the first item (only one row exists)
SKU_TOGGLE_NEXT_XPATH = ROW + "/td[1]/span[1]/span[1]/span/span[1]"             # second item onwards
QTY_INPUT_XPATH = ROW + "/td[6]/input[1]"
REASON_TOGGLE_XPATH = ROW + "/td[7]/div/span/span[1]/span/span[1]/span"
ADD_BUTTON_XPATH = ROW + "/td[8]/button"
REASON_SEARCH_TERM = "damage"
PAGE_SETTLE_SECONDS = 0.4   # the page loads for about 200 to 300 ms after an item is chosen


def pick_from_dropdown(driver, wait, toggle_xpath, search_text, label, first_result=False):
    print(f"Setting {label}: {search_text}")
    toggle = wait.until(EC.element_to_be_clickable((By.XPATH, toggle_xpath)))
    po.safe_click(driver, toggle)
    time.sleep(0.5)
    search = wait.until(EC.visibility_of_element_located((By.XPATH, po.SELECT2_SEARCH_INPUT_XPATH)))
    search.send_keys(search_text)
    if first_result:
        time.sleep(1.5)
        first = wait.until(EC.element_to_be_clickable((By.XPATH, FIRST_RESULT_XPATH)))
        po.safe_click(driver, first)
    else:
        po.click_matching_result(driver, search_text)
    time.sleep(0.5)


def click_item_by_name(driver, name, timeout=15):
    """Click the dropdown result whose text equals the item name from the list (ignoring spaces and case).

    This dropdown shows only item names (no SKU), and searching the SKU puts that item first. If no result has exactly
    the same name, the first result is used only when it starts with the same letters as the name; otherwise it stops.
    """
    def squash(text):
        return re.sub(r"\s+", "", text or "").casefold()

    wanted = squash(name)
    options_xpath = (
        "(//ul[contains(@class, 'select2-results__options')])[last()]"
        "/li[contains(@class, 'select2-results__option')]"
    )
    deadline = time.monotonic() + timeout
    while True:
        try:
            options = driver.find_elements(By.XPATH, options_xpath)
            texts = [(o, o.get_attribute("textContent") or "") for o in options]
            for option, text in texts:
                if squash(text) == wanted:
                    po.safe_click(driver, option)
                    return
            if texts and time.monotonic() >= deadline - (timeout - 6):   # after about 6 seconds without an exact name match
                first, first_text = texts[0]
                if squash(first_text)[:4] == wanted[:4] and "no results" not in first_text.lower():
                    print(f"  No exact name match, using the first result: {first_text.strip()}")
                    po.safe_click(driver, first)
                    return
        except StaleElementReferenceException:
            pass
        if time.monotonic() >= deadline:
            shown = ", ".join(t.strip() for _, t in texts[:5]) if "texts" in locals() else "nothing"
            raise RuntimeError(f"'{name}' did not appear in the item results (saw: {shown}).")
        time.sleep(0.3)


def main():
    with open(WASTE_JSON_PATH) as f:
        data = json.load(f)
    location = data.get("location", "Trugreens")
    approver = data.get("approver", "Kanchana")

    driver = webdriver.Chrome(options=Options())
    po.DRIVER = driver
    driver.get(po.LOGIN_URL)
    wait = WebDriverWait(driver, 15, ignored_exceptions=[NoSuchElementException, StaleElementReferenceException])

    wait.until(EC.presence_of_element_located((By.XPATH, po.EMAIL_XPATH))).send_keys(po.EMAIL)
    driver.find_element(By.XPATH, po.PASSWORD_XPATH).send_keys(po.PASSWORD)
    driver.find_element(By.XPATH, po.LOGIN_BUTTON_XPATH).click()
    time.sleep(3)

    driver.get(STOCK_ADJUST_URL)
    time.sleep(5)

    try:
        popup = WebDriverWait(driver, 8).until(EC.element_to_be_clickable((By.XPATH, po.POPUP_COLLAPSE_XPATH)))
        po.safe_click(driver, popup)
    except Exception:
        pass  # the popup is not always there

    po.safe_click(driver, wait.until(EC.element_to_be_clickable((By.XPATH, CREATE_WASTE_BUTTON_XPATH))))

    pick_from_dropdown(driver, wait, WASTAGE_LOCATION_TOGGLE_XPATH, location, "Wastage Location")
    pick_from_dropdown(driver, wait, APPROVER_TOGGLE_XPATH, approver, "Approver", first_result=True)

    items = data.get("items", [])
    # Added in reverse order, like the purchase order script, so the entry ends up in the same order as the list.
    for index, item in enumerate(reversed(items)):
        sku = str(item["sku"]).zfill(4)   # PosBytz pads SKUs ("0005"); the result is matched by number
        print(f"Item {index + 1} of {len(items)}: {item['name']} (SKU {sku}), quantity {item['quantity']}")

        sku_toggle = wait.until(EC.element_to_be_clickable((By.XPATH, SKU_TOGGLE_FIRST_XPATH if index == 0 else SKU_TOGGLE_NEXT_XPATH)))
        po.safe_click(driver, sku_toggle)

        search = wait.until(EC.visibility_of_element_located((By.XPATH, po.SELECT2_SEARCH_INPUT_XPATH)))
        search.send_keys(sku)
        time.sleep(2)
        click_item_by_name(driver, item["name"])
        time.sleep(PAGE_SETTLE_SECONDS)

        qty_input = wait.until(EC.element_to_be_clickable((By.XPATH, QTY_INPUT_XPATH)))
        qty_input.clear()
        qty_input.send_keys(str(item["quantity"]))

        pick_from_dropdown(driver, wait, REASON_TOGGLE_XPATH, REASON_SEARCH_TERM, "Reason", first_result=True)

        add_button = wait.until(EC.element_to_be_clickable((By.XPATH, ADD_BUTTON_XPATH)))
        po.safe_click(driver, add_button)
        time.sleep(0.5)

    print(f"All {len(items)} item(s) were added. The entry is NOT saved: check it in Chrome, then save it yourself.")
    time.sleep(3600)
    driver.quit()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        if po.DRIVER is not None:
            po.save_debug(po.DRIVER)
        raise
