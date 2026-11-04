import json
import os
import re
import time
from datetime import datetime

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from selenium.common.exceptions import (
    ElementClickInterceptedException,
    NoSuchElementException,
    StaleElementReferenceException,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env(path):
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


load_env(os.path.join(ROOT, ".env"))
EMAIL = os.environ.get("POSBYTZ_EMAIL")
PASSWORD = os.environ.get("POSBYTZ_PASSWORD")
if not EMAIL or not PASSWORD:
    raise SystemExit("Add POSBYTZ_EMAIL=... and POSBYTZ_PASSWORD=... to the .env file in the project folder.")

LOGIN_URL = "https://app.posbytz.com/account/login?next=/sale/cash-drawer-shifts/"
PURCHASE_ORDER_URL = "https://app.posbytz.com/inventory/purchase-order/"
PURCHASE_ORDERS_JSON_PATH = os.path.join(ROOT, "purchase_orders.json")
SHIP_TO_SEARCH_TERM = "Trugreens"
CATEGORY_SEARCH_TERM = "Fnv"

EMAIL_XPATH = "/html/body/div[2]/div/div[2]/div/div/div[3]/div/form/div[2]/input"
PASSWORD_XPATH = "/html/body/div[2]/div/div[2]/div/div/div[3]/div/form/div[3]/div/input"
LOGIN_BUTTON_XPATH = "/html/body/div[2]/div/div[2]/div/div/div[3]/div/form/div[5]/button"

NEW_PURCHASE_ORDER_XPATH = "/html/body/div[1]/div[2]/main/form/div/div[2]/a[2]"

# The New Purchase Order form is addressed by stable ids/classes, not by position in the page.
FORM = "//form[@id='js_purchase-order-form']"
SELECT2_SELECTION = "/following-sibling::span[contains(@class, 'select2-container')]//span[contains(@class, 'select2-selection')]"
VENDOR_DROPDOWN_TOGGLE_XPATH = FORM + "//select[contains(@class, 'js_po-vendor-select2')]" + SELECT2_SELECTION
SHIP_TO_DROPDOWN_TOGGLE_XPATH = FORM + "//select[contains(@class, 'js_po-location-select2')]" + SELECT2_SELECTION
SELECT2_SEARCH_INPUT_XPATH = "(//input[contains(@class, 'select2-search__field')])[last()]"
SELECT2_FIRST_RESULT_XPATH = "(//ul[contains(@class, 'select2-results__options')])[last()]/li[contains(@class, 'select2-results__option')][1]"

PO_DATE_INPUT_XPATH = FORM + "//input[contains(@class, 'js_delivery-date')]"
DATE_PICKER = "(//div[contains(@class, 'daterangepicker') and contains(@style, 'block')])[last()]"
DATE_MONTH_SELECT_XPATH = DATE_PICKER + "//select[contains(@class, 'monthselect')]"
DATE_YEAR_SELECT_XPATH = DATE_PICKER + "//select[contains(@class, 'yearselect')]"
DATE_DAY_CELL_XPATH_TEMPLATE = DATE_PICKER + "//td[contains(@class, 'available') and not(contains(@class, 'off')) and normalize-space(text())='{day}']"
APPLY_DATE_BUTTON_XPATH = DATE_PICKER + "//button[contains(@class, 'applyBtn')]"

CATEGORY_DROPDOWN_TOGGLE_XPATH = FORM + "//select[contains(@class, 'js_po-category-select2')]" + SELECT2_SELECTION
ADD_ITEM_BUTTON_XPATH = FORM + "//button[contains(@class, 'js_item-add')]"

POPUP_COLLAPSE_XPATH = "/html/body/div[3]/div[2]/div/div[2]/span[2]/span[1]/span/span/span"

# "Add Items" tab of the item modal (quick add): pick item, price, qty, Add
ADD_MULTIPLE_ITEMS_TAB_XPATH = "//div[@id='js_item-modal']//a[@href='#quick-add-items']"
QUICK_ADD = "//div[@id='quick-add-items']//form[@id='po-quick-item-select-form']"
ITEM_DROPDOWN_TOGGLE_XPATH = QUICK_ADD + "//select[contains(@class, 'js_select-inventory-item-v2')]" + SELECT2_SELECTION
ITEM_PRICE_INPUT_XPATH = QUICK_ADD + "//input[contains(@class, 'js_item-buying-price')]"
ITEM_QTY_INPUT_XPATH = QUICK_ADD + "//input[@id='js_purchase-qty']"
ITEM_ADD_BUTTON_XPATH = "//button[@id='js_quick-list-add-item']"

DRIVER = None


def save_debug(driver):
    """On failure, keep a screenshot and the page HTML so the broken step can be seen."""
    folder = os.path.join(ROOT, "debug")
    os.makedirs(folder, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    try:
        driver.save_screenshot(os.path.join(folder, f"failure-{stamp}.png"))
        with open(os.path.join(folder, f"failure-{stamp}.html"), "w", encoding="utf-8") as f:
            f.write(driver.page_source)
        print(f"Saved a screenshot and page HTML to {folder}")
    except Exception as e:
        print(f"Could not save debug files: {e}")


def normalize_result_text(text):
    text = re.sub(r"^\d+\s+", "", text.strip())
    return re.sub(r"\s+", "", text)


def wait_for_matching_result(driver, expected_text, timeout=15):
    normalized_expected = re.sub(r"\s+", "", expected_text).casefold()

    def _first_result_matches(d):
        try:
            element = d.find_element(By.XPATH, SELECT2_FIRST_RESULT_XPATH)
            text = element.text
        except Exception:
            return False
        if normalize_result_text(text).casefold() == normalized_expected:
            return element
        return False

    return WebDriverWait(driver, timeout).until(_first_result_matches)


def safe_click(driver, element, timeout=5):
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
    deadline = time.monotonic() + timeout
    while True:
        try:
            element.click()
            return
        except ElementClickInterceptedException:
            if time.monotonic() >= deadline:
                driver.execute_script("arguments[0].click();", element)
                return
            time.sleep(0.5)


def main():
    with open(PURCHASE_ORDERS_JSON_PATH) as f:
        data = json.load(f)
    purchase_order = data[0] if isinstance(data, list) else data
    vendor_search_term = purchase_order["vendor"]

    options = Options()
    # options.add_argument("--headless=new")  # uncomment to run without a visible window

    driver = webdriver.Chrome(options=options)
    global DRIVER
    DRIVER = driver
    driver.get(LOGIN_URL)

    wait = WebDriverWait(
        driver,
        15,
        ignored_exceptions=[NoSuchElementException, StaleElementReferenceException],
    )
    email_field = wait.until(EC.presence_of_element_located((By.XPATH, EMAIL_XPATH)))
    email_field.send_keys(EMAIL)

    password_field = driver.find_element(By.XPATH, PASSWORD_XPATH)
    password_field.send_keys(PASSWORD)

    login_button = driver.find_element(By.XPATH, LOGIN_BUTTON_XPATH)
    login_button.click()

    time.sleep(3)

    driver.get(PURCHASE_ORDER_URL)

    time.sleep(5)

    try:
        popup_collapse = WebDriverWait(driver, 8).until(EC.element_to_be_clickable((By.XPATH, POPUP_COLLAPSE_XPATH)))
        safe_click(driver, popup_collapse)
    except Exception:
        pass  # the popup is not always there

    new_po_button = wait.until(EC.element_to_be_clickable((By.XPATH, NEW_PURCHASE_ORDER_XPATH)))
    safe_click(driver, new_po_button)

    vendor_toggle = wait.until(EC.element_to_be_clickable((By.XPATH, VENDOR_DROPDOWN_TOGGLE_XPATH)))
    safe_click(driver, vendor_toggle)

    time.sleep(0.5)

    vendor_search_input = wait.until(EC.visibility_of_element_located((By.XPATH, SELECT2_SEARCH_INPUT_XPATH)))
    vendor_search_input.send_keys(vendor_search_term)

    vendor_first_result = wait_for_matching_result(driver, vendor_search_term)
    safe_click(driver, vendor_first_result)

    ship_to_toggle = wait.until(EC.element_to_be_clickable((By.XPATH, SHIP_TO_DROPDOWN_TOGGLE_XPATH)))
    safe_click(driver, ship_to_toggle)

    time.sleep(0.5)

    ship_to_search_input = wait.until(EC.visibility_of_element_located((By.XPATH, SELECT2_SEARCH_INPUT_XPATH)))
    ship_to_search_input.send_keys(SHIP_TO_SEARCH_TERM)

    ship_to_first_result = wait_for_matching_result(driver, SHIP_TO_SEARCH_TERM)
    safe_click(driver, ship_to_first_result)

    delivery_date = datetime.strptime(purchase_order["delivery_date"], "%Y-%m-%d")

    delivery_date_input = wait.until(EC.element_to_be_clickable((By.XPATH, PO_DATE_INPUT_XPATH)))
    safe_click(driver, delivery_date_input)

    year_select = wait.until(EC.presence_of_element_located((By.XPATH, DATE_YEAR_SELECT_XPATH)))
    Select(year_select).select_by_value(str(delivery_date.year))

    month_select = wait.until(EC.presence_of_element_located((By.XPATH, DATE_MONTH_SELECT_XPATH)))
    Select(month_select).select_by_value(str(delivery_date.month - 1))

    time.sleep(0.5)

    day_cell_xpath = DATE_DAY_CELL_XPATH_TEMPLATE.format(day=delivery_date.day)
    day_cell = wait.until(EC.element_to_be_clickable((By.XPATH, day_cell_xpath)))
    safe_click(driver, day_cell)

    apply_date_button = wait.until(EC.element_to_be_clickable((By.XPATH, APPLY_DATE_BUTTON_XPATH)))
    safe_click(driver, apply_date_button)

    # category_toggle = wait.until(EC.element_to_be_clickable((By.XPATH, CATEGORY_DROPDOWN_TOGGLE_XPATH)))
    # safe_click(driver, category_toggle)
    #
    # time.sleep(0.5)
    #
    # category_search_input = wait.until(EC.visibility_of_element_located((By.XPATH, SELECT2_SEARCH_INPUT_XPATH)))
    # category_search_input.send_keys(CATEGORY_SEARCH_TERM)
    #
    # category_first_result = wait_for_matching_result(driver, CATEGORY_SEARCH_TERM)
    # safe_click(driver, category_first_result)

    add_item_button = wait.until(EC.element_to_be_clickable((By.XPATH, ADD_ITEM_BUTTON_XPATH)))
    safe_click(driver, add_item_button)

    add_multiple_items_tab = wait.until(EC.element_to_be_clickable((By.XPATH, ADD_MULTIPLE_ITEMS_TAB_XPATH)))
    safe_click(driver, add_multiple_items_tab)

    for index, item in enumerate(reversed(purchase_order["items"])):
        buying_price = item["buying_price_per_unit"]

        if index == 0:
            item_toggle = wait.until(EC.element_to_be_clickable((By.XPATH, ITEM_DROPDOWN_TOGGLE_XPATH)))
            safe_click(driver, item_toggle)

        item_search_term = str(item["sku"]).zfill(4)

        item_search_input = wait.until(EC.visibility_of_element_located((By.XPATH, SELECT2_SEARCH_INPUT_XPATH)))
        item_search_input.send_keys(item_search_term)

        time.sleep(2)

        item_first_result = wait.until(EC.element_to_be_clickable((By.XPATH, SELECT2_FIRST_RESULT_XPATH)))
        safe_click(driver, item_first_result)

        item_price_input = wait.until(EC.element_to_be_clickable((By.XPATH, ITEM_PRICE_INPUT_XPATH)))
        item_price_input.clear()
        item_price_input.send_keys(str(buying_price))

        item_qty_input = wait.until(EC.element_to_be_clickable((By.XPATH, ITEM_QTY_INPUT_XPATH)))
        item_qty_input.clear()
        item_qty_input.send_keys(str(item["quantity"]))

        item_add_button = wait.until(EC.element_to_be_clickable((By.XPATH, ITEM_ADD_BUTTON_XPATH)))
        safe_click(driver, item_add_button)

        time.sleep(0.5)

    time.sleep(10000)
    driver.quit()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        if DRIVER is not None:
            save_debug(DRIVER)
        raise
