const ENV_FILE = [".env"];
// One entry per tab. Item lists are in prompts/items/ and prompt rules in prompts/rules/. The prompt sent to the AI is the rules files joined in order.
//   list:    the item list for this tab
//   rules:   prompt files (shared core + the rules for this kind of list)
//   vendor:  fixed vendor for the whole tab (omit when the vendor is read from the message)
//   pcOnly:  the list has no Count/Weight column and every item is pieces
//   checkTotal: the invoice line Amounts already include tax, so they must add up to the invoice total (blocks a misread row)
const TABS = {
  fruits:     { label: "Fruits",          list: "fruits.txt",         rules: ["core.txt", "produce_common.txt", "fruits.txt"] },
  veggies:    { label: "Veggies & leafy", list: "veggies_leafy.txt",  rules: ["core.txt", "produce_common.txt", "veggies.txt"] },
  victory:    { label: "Victory",         list: "victory.txt",        rules: ["core.txt", "victory.txt"],    vendor: "Victory",    pcOnly: true },
  aashirwaad: { label: "Aashirwaad",      list: "aashirwaad.txt",     rules: ["core.txt", "aashirwaad.txt"], vendor: "Aashirwaad", pcOnly: true, checkTotal: true },
};
const DEFAULT_TAB = "veggies";
const AUTO_MAX_ROWS = 20; // Auto: at most this many lines of text still counts as short
const OUTPUT = "purchase_orders.json";
const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const API_URL = "https://api.openai.com/v1/chat/completions";
const $ = (id) => document.getElementById(id);

let dir = null;

// Build the tab buttons from TABS.
Object.entries(TABS).forEach(([key, tab]) => {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "radio"; input.name = "list"; input.value = key; input.checked = key === DEFAULT_TAB;
  const span = document.createElement("span");
  span.textContent = tab.label;
  label.append(input, span);
  document.getElementById("tabs").appendChild(label);
});
const selectedTab = () => document.querySelector('input[name="list"]:checked').value;
let attachments = [];

/* ---------- remembered folder (IndexedDB) ---------- */
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("po-converter", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const r = db.transaction("kv").objectStore("kv").get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(undefined);
    });
  } catch { return undefined; }
}
async function idbSet(key, value) {
  try {
    const db = await idb();
    db.transaction("kv", "readwrite").objectStore("kv").put(value, key);
  } catch {}
}

function setFolder(handle, granted) {
  dir = granted ? handle : null;
  const pill = $("folderPill");
  if (granted) {
    pill.textContent = "connected: " + handle.name;
    pill.className = "pill ok";
    $("folderDot").className = "dot ok";
    $("folderBtn").textContent = "Change folder";
    $("folderHint").textContent = "";
  } else if (handle) {
    pill.textContent = "needs permission: " + handle.name;
    pill.className = "pill bad";
    $("folderDot").className = "dot bad";
    $("folderBtn").textContent = "Reconnect";
    $("folderHint").textContent = "Browsers ask again after a restart. One click.";
  }
  updateButton();
}
function updateButton() {
  const hasInput = $("message").value.trim() || attachments.length;
  $("convertBtn").disabled = !dir || !hasInput;
}

const selectedModel = () => $("modelSel").value;
const MODEL_HINTS = {
  strong: "Most accurate. Used for everything.",
  mini: "About 5 times cheaper. A picture still uses GPT-4.1.",
  auto: "Small model only for short Fruits/Veggies text. Pictures, long inputs, Victory and Aashirwaad use GPT-4.1.",
};
function showModelHint() { $("modelHint").textContent = MODEL_HINTS[selectedModel()]; }
try { const m = localStorage.getItem("modelChoice"); if (m && ["strong", "mini", "auto"].includes(m)) $("modelSel").value = m; } catch (_) {}
$("modelSel").addEventListener("change", () => { try { localStorage.setItem("modelChoice", selectedModel()); } catch (_) {} showModelHint(); });
showModelHint();

let pendingHandle = null;
$("folderBtn").addEventListener("click", async () => {
  try {
    if (!dir && pendingHandle && (await pendingHandle.requestPermission({ mode: "readwrite" })) === "granted") {
      setFolder(pendingHandle, true);
      return;
    }
    if (!window.showDirectoryPicker) {
      $("folderHint").textContent = "This browser can't pick folders. Use Chrome or Edge.";
      return;
    }
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    pendingHandle = handle;
    await idbSet("dir", handle);
    setFolder(handle, true);
  } catch (e) {
    if (e.name !== "AbortError") $("folderHint").textContent = "Could not open folder: " + e.message;
  }
});

(async () => {
  const handle = await idbGet("dir");
  if (!handle) return;
  pendingHandle = handle;
  const granted = (await handle.queryPermission({ mode: "readwrite" })) === "granted";
  setFolder(handle, granted);
})();

/* ---------- file helpers ---------- */
// Step-by-step log shown under the Convert button (cleared on every run, opens by itself on a failure).
function log(text) {
  const t = new Date().toTimeString().slice(0, 8);
  $("log").textContent += (t + "  " + text + "\n");
}

async function readText(path) {
  try {
    let folder = dir;
    for (const part of path.slice(0, -1)) folder = await folder.getDirectoryHandle(part);
    const fh = await folder.getFileHandle(path[path.length - 1]);
    const text = (await (await fh.getFile()).text()).trim();
    log("read " + path.join("/") + " (" + text.length + " characters)");
    return text;
  } catch (e) {
    log("FAILED to read " + path.join("/") + " [" + e.name + ": " + e.message + "]");
    if (e.name === "NotFoundError")
      throw new Error("Can't find " + path.join("/") + " in the project folder (" + dir.name + "). Run git pull or the update_code file in commands/, or choose the right folder.");
    throw e;
  }
}
async function writeText(name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}
function parseEnv(text) {
  const env = {};
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}
// Rows are: Variation Name <tab> Sku [<tab> Count or Weight]. Count -> "pc", Weight -> "kg".
function loadCatalog(itemsText) {
  const catalog = {};
  itemsText.split(/\r?\n/).slice(1).forEach((line) => {
    const parts = line.split("\t");
    if (parts.length < 2) return;
    const kind = (parts[2] || "").trim().toLowerCase();
    catalog[parts[1].trim()] = { name: parts[0].trim(), unit: kind === "count" ? "pc" : kind === "weight" ? "kg" : "" };
  });
  return catalog;
}

/* ---------- OpenAI ---------- */
async function callOpenAI(apiKey, model, messages) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  const body = await res.text();
  if (!res.ok) {
    log("OpenAI answered with an error, HTTP " + res.status);
    let code = "", detail = "";
    try { const e = JSON.parse(body).error || {}; code = e.code || e.type || ""; detail = e.message || ""; } catch (_) { detail = body.slice(0, 200); }
    const billing = "Add credits at platform.openai.com/settings/organization/billing, then convert again.";
    let friendly;
    if (res.status === 429 && /quota|credit|billing/i.test(code + " " + detail))
      friendly = "OpenAI credits are used up. Nothing was converted. " + billing;
    else if (res.status === 429)
      friendly = "OpenAI says too many requests right now (rate limit). Wait a minute and convert again.";
    else if (res.status === 401)
      friendly = "OpenAI did not accept the API key. Check OPENAI_API_KEY in .env (no spaces or quotes), then convert again.";
    else if (res.status === 402 || /billing|credit|quota/i.test(code))
      friendly = "OpenAI billing problem. " + billing;
    else if (res.status >= 500)
      friendly = "OpenAI is having trouble (HTTP " + res.status + "). Wait a minute and convert again.";
    else if (/context_length|too long|maximum context/i.test(code + " " + detail))
      friendly = "The message and attachments are too long for the model. Convert fewer files or a shorter message at a time.";
    else friendly = "OpenAI error " + res.status + ": " + (detail || body.slice(0, 200));
    throw new Error(friendly);
  }
  const j = JSON.parse(body);
  log("OpenAI replied: " + j.usage.prompt_tokens + " tokens in, " + j.usage.completion_tokens + " out, finish_reason " + j.choices[0].finish_reason);
  return j.choices[0];
}
function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function parseJsonArray(raw) {
  // The model sometimes writes a number as a formula ("line_total": 3000 / 2, "computed_total": 100 + 80 + 40).
  // Work out plain number-and-operator chains; anything else is left alone and fails as invalid JSON.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "").replace(
    /(:\s*)(-?\d+(?:\.\d+)?(?:\s*[\/*+\-]\s*-?\d+(?:\.\d+)?)+)(?=\s*[,}\n])/g,
    (m, lead, expr) => {
      if (!/^[\d.\s+\-*\/]+$/.test(expr)) return m;
      try { return lead + Math.round(Function('"use strict"; return (' + expr + ")")() * 100) / 100; } catch { return m; }
    });
  let data = JSON.parse(cleaned);
  if (!Array.isArray(data)) {
    if (data && typeof data === "object") data = [data];
    else throw new Error("Model output is not a JSON array");
  }
  return data;
}

/* ---------- validation (blocking = must fix before Selenium) ---------- */
// Conversion rules from the prompt:
//   "- Lemon 1 Pc : 1 kg = 25 pc"      -> perKg["lemon 1 pc"] = 25
//   "- Tomatoes : 1 box = 23 kg"       -> perUnit["tomatoes"].box = { n: 23, unit: "kg" }
function parseOverrides(promptText) {
  const perKg = {}, perUnit = {};
  // "<A> kg = <B> pc" means B/A pieces per kg; "<A> gala = <B> pc" means B/A per gala
  for (const m of promptText.matchAll(/^- (.+?)\s*:\s*([\d.]+) kg = ([\d.]+) pc/gim)) perKg[m[1].trim().toLowerCase()] = Number(m[3]) / Number(m[2]);
  for (const m of promptText.matchAll(/^- (.+?)\s*:\s*([\d.]+) (box|bag|gala)(?: \([^)]*\))? = ([\d.]+) (pc|kg)/gim)) {
    const name = m[1].trim().toLowerCase(), word = m[3].toLowerCase();
    ((perUnit[name] = perUnit[name] || {})[word] = perUnit[name][word] || []).push({ n: Number(m[4]) / Number(m[2]), unit: m[5].toLowerCase() });
  }
  return { perKg, perUnit };
}

function validate(orders, catalog, defaultUnit, overrides, rowCheck) {
  const issues = [];
  const words = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(" ").filter((x) => x.length > 2);
  const bad = (label, text) => issues.push({ level: "bad", label, text });
  const warn = (label, text) => { if (!issues.some((i) => i.level === "warn" && i.label === label && i.text === text)) issues.push({ level: "warn", label, text }); };

  if (orders.length > 1) {
    bad("all", "Message produced " + orders.length + " orders but Selenium only enters the first one.");
  }
  if (orders.length === 0) bad("all", "Model returned no orders.");

  orders.forEach((o) => {
    const label = (o.delivery_date || "no date") + " / " + (o.vendor || "no vendor");
    if (!o.vendor) bad(label, "Vendor is null, the automation needs one.");
    if (!o.delivery_date) bad(label, "Delivery date is missing.");

    const convWords = [];
    (o.items || []).forEach((it) => {
      const sku = String(it.sku);
      if (!(sku in catalog)) bad(label, "SKU " + sku + " (" + it.name + ") is not in items.txt.");
      else {
        const entry = catalog[sku];
        it.unit = entry.unit || defaultUnit || it.unit; // the list decides the unit, not the model
        if (entry.name !== String(it.name || "").trim())
          warn(label, "SKU " + sku + " is '" + entry.name + "' in items.txt but the model named it '" + it.name + "'.");
        if (it.unit === "pc" && !Number.isInteger(Number(it.quantity)))
          bad(label, entry.name + ": pieces must be a whole number but the model gave " + it.quantity + ".");
        if (rowCheck) {
          // Invoice rows are echoed in message_text as "... | Rate R | Qty Q | Gross G | Amount A": Q x R must equal G.
          const t = String(it.message_text || "");
          const num = (k) => { const m = t.match(new RegExp(k + "\\s*[:=]?\\s*([\\d,]*\\.?\\d+)", "i")); return m ? Number(m[1].replace(/,/g, "")) : null; };
          const R = num("Rate"), Q = num("Qty"), G = num("Gross"), A = num("Amount");
          if (R == null || Q == null || G == null || A == null)
            bad(label, entry.name + ": the row text is missing its Rate, Qty, Gross or Amount, so it can't be verified: '" + t.slice(0, 80) + "'.");
          else {
            if (Q !== Number(it.quantity)) bad(label, entry.name + ": quantity " + it.quantity + " does not match the row's Qty " + Q + ".");
            if (Math.abs(A - Number(it.line_total)) > 0.015) bad(label, entry.name + ": line total " + it.line_total + " does not match the row's Amount " + A + ".");
            if (Math.abs(Q * R - G) > Math.max(1, 0.01 * G))
              bad(label, entry.name + ": Qty " + Q + " x Rate " + R + " = " + Math.round(Q * R * 100) / 100 + " but Gross is " + G + ". The quantity or the rate was misread; check this row.");
          }
        }
        // Rate per unit = line total / quantity, worked out here (the model's division is not trusted).
        if (Number(it.quantity) > 0 && it.line_total != null)
          it.buying_price_per_unit = Math.round((Number(it.line_total) / Number(it.quantity)) * 100) / 100;
        const expected = entry.unit || defaultUnit;
        if (expected && it.unit !== expected)
          bad(label, "Unit for " + entry.name + " (SKU " + sku + ") must be " + expected + " but the model gave " + it.unit + ".");
        if (!entry.unit) return; // pieces-only lists: the record's quantity is used as written, no conversions
        // Message used another unit than the DB: only allowed for items with a rule in the prompt, and the maths must match.
        const key = entry.name.toLowerCase();
        const rules = overrides || { perKg: {}, perUnit: {} };
        const text = String(it.message_text || "");
        // Lists without a unit column (Victory) are all pc and never converted, so "1Kg" in an item name or "Kgs" in the per column is not a unit mismatch.
        const converts = Boolean(entry.unit);
        const cont = converts ? text.match(/([\d.]+)\s*(box|boxes|bag|bags|gala)\b/i) : null;
        // A row merged from several ("Lemon 1kg + Lemon 2kg") counts all its quantities together.
        const sumOf = (re) => { const all = [...text.matchAll(re)]; return all.length ? all.reduce((t, m) => t + Number(m[1]), 0) : undefined; };
        const kgNum = sumOf(/([\d.]+)\s*(?:kgs?|kilos?)\b/gi);
        const pcNum = sumOf(/([\d.]+)\s*(?:pcs?|pieces?|pacs?|packs?)\b/gi);
        // Grams written for a Count (pc) item with no rule can't be turned into pieces.
        const gNum = sumOf(/([\d.]+)\s*(?:grams?|gms?|g)\b/gi);
        if (converts && it.unit === "pc" && gNum && !kgNum && !pcNum && !cont)
          bad(label, "'" + text + "': " + entry.name + " is counted in pieces but the message gave grams, and there is no conversion rule for it.");
        // Several quantities in one row's text ("4kg,5kg" or a merged "A + B"): the entered quantity must be their sum.
        if (defaultUnit !== "pc") {
          const kgAll = [...text.matchAll(/([\d.]+)\s*(?:kgs?|kilos?)\b/gi)], pcAll = [...text.matchAll(/([\d.]+)\s*(?:pcs?|pieces?)\b/gi)];
          const sumKg = kgAll.reduce((t, m) => t + Number(m[1]), 0), sumPc = pcAll.reduce((t, m) => t + Number(m[1]), 0);
          if (it.unit === "kg" && kgAll.length > 1 && !pcAll.length && Math.abs(sumKg - Number(it.quantity)) > 0.01)
            bad(label, "'" + text + "': the quantities in the text add up to " + sumKg + " kg but " + it.quantity + " kg was entered for " + entry.name + ".");
          if (it.unit === "pc" && pcAll.length > 1 && !kgAll.length && Math.abs(sumPc - Number(it.quantity)) > 0.01)
            bad(label, "'" + text + "': the quantities in the text add up to " + sumPc + " pc but " + it.quantity + " pc was entered for " + entry.name + ".");
        }
        // A quantity already written in the item's own unit must be entered as written (no override applied on top of it).
        if (defaultUnit !== "pc" && converts && !cont) {
          const kgAll2 = [...text.matchAll(/([\d.]+)\s*(?:kgs?|kilos?)\b/gi)], pcAll2 = [...text.matchAll(/([\d.]+)\s*(?:pcs?|pieces?)\b/gi)];
          const sKg = kgAll2.reduce((t, m) => t + Number(m[1]), 0), sPc = pcAll2.reduce((t, m) => t + Number(m[1]), 0);
          if (it.unit === "pc" && pcAll2.length && !kgAll2.length && Number(it.quantity) > sPc + 0.5)
            bad(label, "'" + text + "': the message already gives " + sPc + " pc but " + it.quantity + " pc was entered for " + entry.name + " (a conversion was applied by mistake).");
          if (it.unit === "kg" && kgAll2.length && !pcAll2.length && Math.abs(Number(it.quantity) - sKg) > 0.01)
            bad(label, "'" + text + "': the message already gives " + sKg + " kg but " + it.quantity + " kg was entered for " + entry.name + ".");
        }
        const kgToPc = converts && it.unit === "pc" && kgNum && !pcNum, pcToKg = converts && it.unit === "kg" && pcNum && !kgNum;
        const check = (want, how) => {
          if (Math.abs(want - Number(it.quantity)) > 1)
            bad(label, "'" + text + "': quantity " + it.quantity + " " + it.unit + " does not match the rule (" + how + " gives about " + Math.round(want * 100) / 100 + ").");
        };
        if (cont) {
          const word = cont[2].toLowerCase().replace(/es$|s$/, "");
          const options = (rules.perUnit[key] || {})[word] || [];
          if (!options.length) bad(label, "'" + text + "': there is no rule for " + word + " of " + entry.name + ".");
          else if (options[0].unit !== it.unit) bad(label, "'" + text + "': " + word + " of " + entry.name + " must be entered in " + options[0].unit + ".");
          else if (!options.some((r) => Math.abs(Number(cont[1]) * r.n - Number(it.quantity)) <= 1))
            bad(label, "'" + text + "': quantity " + it.quantity + " " + it.unit + " does not match the rule (" + options.map((r) => Number(cont[1]) * r.n).join(" or ") + " expected).");
          else { convWords.push(words(entry.name).slice(0, 2)); warn(label, "Unit mismatch: " + entry.name + " (message said " + cont[1] + " " + word + ", '" + text + "') converted to " + it.quantity + " " + it.unit + " via the " + word + " rule."); }
        } else if (kgToPc || pcToKg) {
          const factor = rules.perKg[key];
          if (!factor)
            bad(label, "'" + text + "': " + entry.name + " is " + it.unit + " in the DB but the message used the other unit, and there is no conversion rule for it.");
          else {
            check(kgToPc ? Number(kgNum) * factor : Number(pcNum) / factor, factor + " pc per kg");
            convWords.push(words(entry.name).slice(0, 2));
            warn(label, "Unit mismatch: " + entry.name + " (backend " + it.unit + ", message said " + (kgToPc ? "kg" : "pc") + ", '" + text + "') converted to " + it.quantity + " via " + factor + " pc/kg (user override).");
          }
        }
      }
    });

    // The same item on more than one row (same SKU): enter it once, quantities and amounts added.
    const seen = {}, merged = [], mergedWords = [];
    (o.items || []).forEach((it) => {
      const first = seen[String(it.sku)];
      if (!first) { seen[String(it.sku)] = it; merged.push(it); return; }
      const unit = first.unit || "";
      const qty = Math.round((Number(first.quantity) + Number(it.quantity)) * 1000) / 1000;
      const amt = Math.round(((first.line_total || 0) + (it.line_total || 0)) * 100) / 100;
      const had = first._parts || [{ q: first.quantity, a: first.line_total || 0 }];
      had.push({ q: it.quantity, a: it.line_total || 0 });
      first._parts = had;
      first.message_text = String(first.message_text || "") + " + " + String(it.message_text || "");
      first.quantity = qty; first.line_total = amt;
      first.buying_price_per_unit = qty > 0 ? Math.round((amt / qty) * 100) / 100 : first.buying_price_per_unit;
    });
    merged.forEach((it) => {
      if (!it._parts) return;
      mergedWords.push(words(it.name).slice(0, 2));
      const u = it.unit || "";
      warn(label, "Duplicate item merged: " + it.name + " was on " + it._parts.length + " rows (" +
        it._parts.map((x) => x.q + " " + u + " for " + x.a).join(" + ") + "). Entered once as " + it.quantity + " " + u + " for " + it.line_total + " (" + it.buying_price_per_unit + " per " + u + ").");
      delete it._parts;
    });
    // A row that holds several quantities of one unit ("Long Brinjal 4kg,5kg 140rs"): the sum is entered, say so.
    if (defaultUnit !== "pc")
      merged.forEach((it) => {
        if (mergedWords.some((ws) => ws.join(" ") === words(it.name).slice(0, 2).join(" "))) return;
        const t = String(it.message_text || "");
        const nums = (re) => [...t.matchAll(re)].map((m) => m[1]);
        const parts = nums(/([\d.]+)\s*(?:kgs?|kilos?)\b/gi).length > 1 ? nums(/([\d.]+)\s*(?:kgs?|kilos?)\b/gi).map((n) => n + " kg")
          : nums(/([\d.]+)\s*(?:pcs?|pieces?)\b/gi).length > 1 ? nums(/([\d.]+)\s*(?:pcs?|pieces?)\b/gi).map((n) => n + " pc") : null;
        if (!parts) return;
        mergedWords.push(words(it.name).slice(0, 2));
        warn(label, "Several quantities on one row: " + it.name + " was given as '" + t + "' (" + parts.join(" + ") + "). Entered once as " + it.quantity + " " + (it.unit || "") + " for " + it.line_total + " (" + it.buying_price_per_unit + " per " + (it.unit || "") + ").");
      });
    o.items = merged;

    const actual = Math.round(
      ((o.items || []).reduce((s, i) => s + (i.line_total || 0), 0) +
        (o.additional_charges || []).reduce((s, c) => s + (c.amount || 0), 0)) * 100) / 100;
    o.computed_total = actual; // always the page's own sum, never the model's
    // A total written in a plain message (no tax) should equal the items; invoice tabs have their own checks.
    if (defaultUnit !== "pc" && o.stated_total != null && Math.abs(actual - Number(o.stated_total)) > 2)
      warn(label, "The message total is " + o.stated_total + " but the items add up to " + actual + ". Check the amounts (the total may also include tax or charges).");

    (o.unmatched_items || []).forEach((u) =>
      bad(label, "Unmatched: " + u.message_text + ". " + (u.reason || "")));
    (o.unit_mismatches || []).forEach((m) =>
      warn(label, "Unit mismatch: " + m.item + " (backend " + m.backend_unit + ", message said " + m.message_unit + ", '" + m.message_text + "') converted to " + m.converted_quantity + " via " + m.conversion_factor + "."));
    (o.new_outliers_detected || []).forEach((n) =>
      warn(label, "New estimated conversion: " + n.item + " at " + n.conversion_factor + "."));
    // Model warnings: drop the ones that only repeat what the page already shows
    // (a unit conversion listed above, or a "totals match / as expected" remark).
    const convItems = convWords;
    (o.warnings || []).forEach((w) => {
      const lw = String(w).toLowerCase();
      const repeatsConversion = /conver|override|unit mismatch/.test(lw) && convItems.some((ws) => ws.length && ws.every((x) => lw.includes(x)));
      const totalsFine = /computed_total|sum of line totals|number of rows/.test(lw) && /match|equal|expected|within|as stated/.test(lw);
      const notApplicable = /direct piece count|given directly|stated directly|as stated|as given|not triggered|not applicable|not applied|not used|no .{0,40}(given|present|found|mentioned)|n\/a/.test(lw);
      const repeatsMerge = /twice|duplicate|merg|combin|more than once|added together|summed|sum of|several quantities|total/.test(lw) && mergedWords.some((ws) => ws.length && ws.every((x) => lw.includes(x)));
      if (!repeatsConversion && !totalsFine && !notApplicable && !repeatsMerge) warn(label, w);
    });
  });
  return issues;
}

/* ---------- go / no-go for Selenium ---------- */
const isWin = /Win/i.test(navigator.platform);
function showNext(ready) {
  $("next").classList.remove("hidden");
  $("go").className = "go " + (ready ? "ok" : "bad");
  $("goMark").textContent = ready ? "\u2713" : "\u2715";
  $("goTitle").textContent = ready ? "Ready: proceed to Selenium" : "Not ready: do not run Selenium";
  $("goText").textContent = ready
    ? "purchase_orders.json is saved. Double-click " + (isWin ? "run_selenium.bat" : "run_selenium.command") +
      " in commands/" + (isWin ? "windows" : "mac") + ", or paste the command below."
    : "Fix the issues above and convert again. Nothing was saved, so Selenium would use an older purchase_orders.json.";
  $("goActions").classList.toggle("hidden", !ready);
}

/* ---------- rendering ---------- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (n) => (n == null ? "" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));

function render(orders, issues, saved) {
  $("result").classList.remove("hidden");
  const blocking = issues.filter((i) => i.level === "bad");
  const banner = $("banner");
  if (blocking.length) {
    banner.className = "banner bad";
    banner.textContent = blocking.length + " issue" + (blocking.length > 1 ? "s" : "") + " to fix";
  } else {
    banner.className = "banner ok";
    banner.textContent = "No issues";
  }
  $("issues").innerHTML = issues
    .map((i) => '<li class="' + i.level + '"><b>' + esc(i.label) + "</b>" + esc(i.text) + "</li>").join("");
  showNext(saved);

  $("summary").innerHTML = orders.map((o) => {
    const rows = (o.items || []).map((it, n) =>
      '<tr><td class="num">' + (n + 1) + "</td><td>" + esc(it.name) + '</td><td>' + esc(it.sku) + '</td><td class="num">' + esc(it.quantity) + " " + esc(it.unit) +
      '</td><td class="num">' + money(it.buying_price_per_unit) + '</td><td class="num">' + money(it.line_total) + "</td></tr>").join("");
    const charges = (o.additional_charges || []).map((c) =>
      '<tr><td colspan="5" class="muted">' + esc(c.description) + '</td><td class="num">' + money(c.amount) + "</td></tr>").join("");
    return "<p><b>" + esc(o.vendor || "no vendor") + "</b> · " + esc(o.delivery_date || "no date") + "</p>" +
      '<table><tr><th class="num">#</th><th>Item</th><th>SKU</th><th class="num">Qty</th><th class="num">Price/unit</th><th class="num">Line total</th></tr>' +
      rows + charges +
      '<tr><td colspan="5"><b>Total (items + charges)</b></td><td class="num"><b>' + money(o.computed_total) + "</b></td></tr></table>";
  }).join("");
  $("raw").textContent = JSON.stringify(orders, null, 2);
}

/* ---------- run command ---------- */
const pageDir = decodeURIComponent(location.pathname).replace(/\/[^/]*$/, "");
const runCommand = isWin
  ? '"' + pageDir.replace(/^\//, "").replace(/\//g, "\\") + '\\commands\\windows\\run_selenium.bat"'
  : 'bash "' + pageDir + '/commands/mac/run_selenium.command"';
$("runCmd").textContent = runCommand;
$("copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(runCommand);
    $("copyBtn").textContent = "Copied";
  } catch {
    $("copyBtn").textContent = "Copy it from the box";
  }
  setTimeout(() => ($("copyBtn").textContent = "Copy run command"), 2000);
});

/* ---------- attachments (Excel, PDF, Word -> plain text) ---------- */
function needLib(ok, what) {
  if (!ok) throw new Error(what + " reader could not load (needs internet once).");
}
async function fileToText(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  const buf = await file.arrayBuffer();
  let text = "";
  if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    needLib(typeof XLSX !== "undefined", "Excel");
    const wb = XLSX.read(buf, { type: "array" });
    text = wb.SheetNames.map((name) => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false }).trim();
      return csv ? "--- sheet: " + name + " ---\n" + csv : "";
    }).filter(Boolean).join("\n\n");
  } else if (ext === "pdf") {
    needLib(typeof pdfjsLib !== "undefined", "PDF");
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      pages.push(content.items.map((i) => i.str + (i.hasEOL ? "\n" : " ")).join("").trim());
    }
    text = pages.filter(Boolean).join("\n\n");
  } else if (ext === "docx") {
    needLib(typeof mammoth !== "undefined", "Word");
    text = (await mammoth.extractRawText({ arrayBuffer: buf })).value.trim();
  } else {
    throw new Error("Unsupported file type: " + file.name + " (use Excel, PDF or .docx).");
  }
  if (!text) throw new Error(file.name + " has no readable text (a scanned PDF can't be read; attach it as an image instead).");
  return text;
}
/* ---------- attachment list (files, dropped files, pasted images) ---------- */
const IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];
const DOC_EXT = ["xlsx", "xls", "csv", "pdf", "docx"];
const extOf = (f) => f.name.split(".").pop().toLowerCase();
const isImage = (f) => (f.type || "").startsWith("image/") || IMAGE_EXT.includes(extOf(f));
let thumbUrls = [];

function addFiles(files) {
  const rejected = [];
  for (const f of files) {
    if (isImage(f) || DOC_EXT.includes(extOf(f))) attachments.push(f);
    else rejected.push(f.name);
  }
  $("status").textContent = rejected.length ? "Not supported: " + rejected.join(", ") : "";
  renderFiles();
}
function renderFiles() {
  thumbUrls.forEach((u) => URL.revokeObjectURL(u));
  thumbUrls = [];
  const list = $("fileList");
  list.textContent = "";
  attachments.forEach((f, i) => {
    const chip = document.createElement("div");
    chip.className = "fchip";
    if (isImage(f)) {
      const img = document.createElement("img");
      const url = URL.createObjectURL(f);
      thumbUrls.push(url);
      img.src = url;
      chip.appendChild(img);
    } else {
      const ext = document.createElement("div");
      ext.className = "ext";
      ext.textContent = extOf(f);
      chip.appendChild(ext);
      if (extOf(f) === "pdf") pdfThumb(f, ext);
    }
    if (isImage(f) || extOf(f) === "pdf") {
      chip.classList.add("clickable");
      chip.title = "Click to view";
      chip.addEventListener("click", (e) => { if (!e.target.closest("button")) openPreview(f); });
    }
    const nm = document.createElement("div");
    nm.className = "nm";
    nm.textContent = f.name;
    const rm = document.createElement("button");
    rm.type = "button";
    rm.title = "Remove";
    rm.textContent = "\u00d7";
    rm.addEventListener("click", () => { attachments.splice(i, 1); renderFiles(); });
    chip.append(nm, rm);
    list.appendChild(chip);
  });
  $("filesInfo").textContent = attachments.length ? attachments.length + " attached. Drop or click to add more." : "Excel, PDF, Word or image";
  updateButton();
}
// First page of a PDF as the chip's thumbnail.
async function pdfThumb(file, el) {
  try {
    if (typeof pdfjsLib === "undefined") return;
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await pdf.getPage(1);
    const scale = 80 / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    if (!el.isConnected) return;
    const img = document.createElement("img");
    img.src = canvas.toDataURL("image/png");
    img.style.objectPosition = "top";
    el.replaceWith(img);
  } catch {}
}

// Larger view of an image or PDF.
let previewUrl = null;
function openPreview(f) {
  closePreview();
  previewUrl = URL.createObjectURL(f);
  $("previewName").textContent = f.name;
  const body = $("previewBody");
  if (isImage(f)) {
    const img = document.createElement("img");
    img.src = previewUrl;
    body.appendChild(img);
  } else {
    const frame = document.createElement("iframe");
    frame.src = previewUrl;
    body.appendChild(frame);
  }
  $("preview").classList.remove("hidden");
}
function closePreview() {
  $("preview").classList.add("hidden");
  $("previewBody").textContent = "";
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
}
$("previewClose").addEventListener("click", closePreview);
$("preview").addEventListener("click", (e) => { if (e.target === $("preview")) closePreview(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePreview(); });

$("files").addEventListener("change", () => {
  addFiles([...$("files").files]);
  $("files").value = "";
});
$("message").addEventListener("input", updateButton);
["dragenter", "dragover"].forEach((ev) => $("drop").addEventListener(ev, (e) => { e.preventDefault(); $("drop").classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => $("drop").addEventListener(ev, (e) => { e.preventDefault(); $("drop").classList.remove("over"); }));
$("drop").addEventListener("drop", (e) => addFiles([...e.dataTransfer.files]));

// Paste copied files or images (Cmd/Ctrl + V) anywhere on the page: a PDF or Excel copied in Finder/Explorer,
// a WhatsApp image, a screenshot, etc.
document.addEventListener("paste", (e) => {
  const files = [...(e.clipboardData ? e.clipboardData.files : [])];
  if (!files.length) return;
  // Copying a file also puts its name on the clipboard as text; don't paste that into the message box.
  // Pasted images keep the text paste (e.g. cells copied from Excel come with a picture of the cells).
  if (files.some((f) => !isImage(f)) || !e.clipboardData.types.includes("text/plain")) e.preventDefault();
  addFiles(files.map((f, n) => {
    if (f.name && !/^image\.\w+$/i.test(f.name)) return f;
    const kind = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
    return new File([f], "pasted-image-" + (attachments.length + n + 1) + "." + kind, { type: f.type });
  }));
});

// Shrink big photos/screenshots so the request stays small, and re-encode as JPEG.
// A tall photo (an invoice, a screenshot) is also sent as six zoomed, overlapping strips (top to bottom),
// because small print and handwritten ticks are misread when the whole page is one low-resolution picture.
async function imageToParts(file, maxSide = 2000) {
  const parts = [await imageToDataUrl(file, maxSide)];
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { return parts; }
  if (bmp.height < bmp.width * 1.25) return parts;
  const scale = Math.min(2.5, 2000 / bmp.width);
  for (const start of [0, 0.15, 0.3, 0.45, 0.6, 0.75]) {
    const y = Math.round(bmp.height * start), h = Math.min(Math.round(bmp.height * 0.25), bmp.height - y);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, y, bmp.width, h, 0, 0, canvas.width, canvas.height);
    parts.push(canvas.toDataURL("image/jpeg", 0.92));
  }
  return parts;
}
async function imageToDataUrl(file, maxSide = 2000) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error(file.name + " could not be read as an image (use jpg, png or webp)."); }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/* ---------- main ---------- */
$("convertBtn").addEventListener("click", async () => {
  const message = $("message").value.trim();
  const attached = attachments.slice();
  const status = (t) => ($("status").textContent = t);
  const tab = TABS[selectedTab()];
  const lists = [["prompts", "items", tab.list]];
  if (!message && !attached.length) return status("Paste a message or attach a file.");

  $("convertBtn").disabled = true;
  $("spin").classList.remove("hidden");
  $("next").classList.add("hidden");
  $("log").textContent = "";
  $("logWrap").classList.remove("hidden");
  $("logWrap").open = false;
  try {
    log("tab: " + tab.label + " | list: items/" + tab.list + " | rules: " + tab.rules.join(", ") + (tab.vendor ? " | vendor fixed: " + tab.vendor : ""));
    status("Reading project files…");
    const env = parseEnv(await readText(ENV_FILE));
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not found in .env");
    const systemPrompt = (await Promise.all(tab.rules.map((f) => readText(["prompts", "rules", f])))).join("\n\n");
    const itemTexts = await Promise.all(lists.map(readText));
    // one header, then every selected list's rows
    const itemsText = [itemTexts[0].split(/\r?\n/)[0]]
      .concat(itemTexts.map((t) => t.split(/\r?\n/).slice(1).join("\n")))
      .join("\n");
    status("Reading attachments…");
    const attachedBlocks = [];
    const imageParts = [];
    let zoomed = false;
    for (const f of attached) {
      try {
        if (isImage(f)) {
          const urls = await imageToParts(f);
          urls.forEach((u) => imageParts.push({ type: "image_url", image_url: { url: u, detail: "high" } }));
          if (urls.length > 1) zoomed = true;
          log("attachment " + f.name + " (" + Math.round(f.size / 1024) + " KB): image, sent as the full picture" + (urls.length > 1 ? " plus " + (urls.length - 1) + " zoomed strips" : ""));
        } else {
          const text = await fileToText(f);
          attachedBlocks.push("Attached file (" + f.name + ", converted to text):\n" + text);
          log("attachment " + f.name + " (" + Math.round(f.size / 1024) + " KB): read " + text.length + " characters of text");
        }
      } catch (e) {
        log("FAILED to read attachment " + f.name + " [" + e.name + ": " + e.message + "]");
        throw new Error("Could not read the attachment '" + f.name + "' (" + (e.name === "NotFoundError" ? "the file was moved, renamed or is not fully downloaded; attach it again" : e.message) + ").");
      }
    }

    // Model choice from the dropdown. Strong = gpt-4.1 (or .env OPENAI_MODEL), mini = gpt-4.1-mini (or .env OPENAI_MODEL_MINI).
    // A picture always uses the strong model (.env OPENAI_MODEL_IMAGE can change that). Auto picks mini only for short Fruits/Veggies text.
    const strongModel = env.OPENAI_MODEL || "gpt-4.1", miniModel = env.OPENAI_MODEL_MINI || "gpt-4.1-mini";
    const pick = selectedModel();
    const textRows = [message].concat(attachedBlocks).join("\n").split(/\r?\n/).filter((l) => l.trim()).length;
    let model, why;
    if (imageParts.length) { model = env.OPENAI_MODEL_IMAGE || strongModel; why = "picture attached"; }
    else if (pick === "mini") { model = miniModel; why = "you chose mini"; }
    else if (pick === "auto") {
      const small = (selectedTab() === "fruits" || selectedTab() === "veggies") && textRows <= AUTO_MAX_ROWS;
      model = small ? miniModel : strongModel;
      why = small ? "auto: short " + tab.label + " text, " + textRows + " lines" : "auto: " + (selectedTab() !== "fruits" && selectedTab() !== "veggies" ? tab.label + " tab" : textRows + " lines is long");
    } else { model = strongModel; why = "you chose GPT-4.1"; }
    log("model: " + model + " (" + why + ")");
    log("sending to " + model + ": prompt " + systemPrompt.length + " characters, " + (itemsText.split(/\r?\n/).length - 1) + " items, " + attached.length + " attachment(s)" + (message ? ", message typed" : ""));
    status("Asking " + model + "…");
    const userContent =
      "Today's date: " + todayISO() + " (use it to infer a missing year)\n\n" +
      "items.txt:\n" + itemsText + "\n\n" +
      (message ? "Vendor procurement message:\n" + message + "\n\n" : "") +
      attachedBlocks.map((b) => b + "\n\n").join("") +
      (imageParts.length ? "Attached image(s): " + imageParts.length + ", shown after this text. Read the text in them as the vendor message or invoice." + (zoomed ? " A tall picture is shown first as the full page, then as 6 zoomed strips (top to bottom) that overlap by half: use the zoomed strips to read small print, handwritten marks and numbers, and count each row only once even if it appears in two strips." : "") + "\n\n" : "") +
      "Convert everything in one pass. Output only the JSON array.";
    const choice = await callOpenAI(apiKey, model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: imageParts.length ? [{ type: "text", text: userContent }, ...imageParts] : userContent },
    ]);
    if (choice.finish_reason === "length")
      throw new Error("Model output was cut off (finish_reason=length). The JSON would be partial.");

    const orders = parseJsonArray(choice.message.content);
    // Tabs that belong to one vendor always use that vendor, whatever the model wrote.
    const extra = [];
    if (tab.vendor)
      orders.forEach((o) => {
        if (o.vendor !== tab.vendor) {
          if (o.vendor) extra.push({ level: "warn", label: (o.delivery_date || "") + " / " + o.vendor, text: "Vendor set to " + tab.vendor + " for this tab (the model wrote " + o.vendor + ")." });
          o.vendor = tab.vendor;
        }
      });
    const issues = extra.concat(validate(orders, loadCatalog(itemsText), tab.pcOnly ? "pc" : "", parseOverrides(systemPrompt), !!tab.checkTotal));
    if (tab.checkTotal)
      orders.forEach((o) => {
        if (o.stated_total != null && !(o.unmatched_items || []).length && Math.abs(o.computed_total - o.stated_total) > 2)
          issues.push({ level: "bad", label: (o.delivery_date || "") + " / " + (o.vendor || ""),
            text: "The line amounts add up to " + o.computed_total + " but the invoice total is " + o.stated_total + ". At least one row (quantity or amount) was misread; check the rows against the invoice." });
      });
    const clean = !issues.some((i) => i.level === "bad");

    if (clean) {
      status("Saving…");
      await writeText(OUTPUT, JSON.stringify(orders, null, 2));
    }
    log("result: " + orders.length + " order(s), " + issues.filter((i) => i.level === "bad").length + " blocking issue(s), " + issues.filter((i) => i.level === "warn").length + " warning(s)" + (clean ? "; saved purchase_orders.json" : "; NOT saved"));
    render(orders, issues, clean);
    status(clean ? "Done." : "Fix the prompt or message, then convert again.");
  } catch (e) {
    status("");
    log("FAILED: " + e.name + ": " + e.message);
    $("logWrap").open = true;
    $("result").classList.remove("hidden");
    $("banner").className = "banner bad";
    $("banner").textContent = "Failed: " + e.message;
    showNext(false);
    $("issues").innerHTML = "";
    $("summary").innerHTML = "";
    $("raw").textContent = "";
  } finally {
    $("spin").classList.add("hidden");
    updateButton();
  }
});

/* ---------- is this copy of the code out of date? ---------- */
const VERSION_URL = "https://raw.githubusercontent.com/sai-sambhu/trugreens-po-automation/main/assets/js/version.js";
const versionParts = (v) => String(v).split(/[.\-]/).map((n) => parseInt(n, 10) || 0);
function isNewer(remote, local) {
  const a = versionParts(remote), b = versionParts(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}
async function checkVersion() {
  const local = window.APP_RELEASE;
  $("versionNote").textContent = local ? "v" + local : "";
  if (!local) return;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(VERSION_URL + "?t=" + Date.now(), { cache: "no-store", signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) return;
    const remote = (((await res.text()).match(/APP_RELEASE\s*=\s*"([^"]+)"/)) || [])[1];
    if (!remote) return;
    if (isNewer(remote, local)) {
      $("updateBar").innerHTML = "A newer version (v" + esc(remote) + ") is available. Run <code>update_code</code> (or <code>git pull</code>), then refresh this page.";
      $("updateBar").classList.remove("hidden");
      $("versionNote").textContent = "v" + local + " · outdated, newest is v" + remote;
      $("versionNote").classList.add("old");
    } else {
      $("versionNote").textContent = "v" + local + " · up to date";
    }
  } catch (_) { /* offline or GitHub not reachable: say nothing */ }
}
checkVersion();
