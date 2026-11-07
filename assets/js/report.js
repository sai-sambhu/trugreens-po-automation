/* Stock Report: builds an Excel file from the three PosBytz exports. Nothing is sent anywhere; it all runs in the browser. */

// What each export must contain. "qty" is the column that gets summed; "name" is the item variation column.
const EXPORTS = {
  purchase: { label: "Purchase order items", sku: "SKU", name: "Item Variation",      qty: "Ordered Qty", cat: "Item Category", cost: "Unit Buying Price" },
  sales:    { label: "Sold items",           sku: "SKU", name: "Variation Name",      qty: "Quantity",    cat: "Category Name", cost: "Unit Buying Price" },
  stock:    { label: "Current stock",        sku: "SKU", name: "Item Variation Name", qty: "Stock", cost: "Stock Value(Buying Price)" },
};
const REPORT_HEADERS = ["Item Category", "Item Variation", "Unit", "Purchased Qty", "Sold Qty", "Sold-Purchased", "Stock", "Wastage"];

const reportFiles = {};   // kind -> { name, rows }
let reportRows = null;    // finished table rows (arrays), without the header

/* ---------- switching between the two tools ---------- */
document.querySelectorAll('input[name="view"]').forEach((r) => r.addEventListener("change", () => {
  const v = document.querySelector('input[name="view"]:checked').value;
  $("viewPO").classList.toggle("hidden", v !== "po");
  $("viewReport").classList.toggle("hidden", v !== "report");
  document.body.classList.toggle("wide", v === "report");
  try { localStorage.setItem("tg_view", v); } catch {}
}));
try {
  if (localStorage.getItem("tg_view") === "report") {
    document.querySelector('input[name="view"][value="report"]').checked = true;
    $("viewPO").classList.add("hidden"); $("viewReport").classList.remove("hidden"); document.body.classList.add("wide");
  }
} catch {}

/* ---------- reading a file ---------- */
const skuKey = (v) => String(v ?? "").trim().replace(/^0+(?=.)/, "");
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };

async function readSheetRows(file) {
  const isCsv = /\.csv$/i.test(file.name);
  // raw:true keeps text exactly as written, so SKU "0019" does not turn into 19.
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: "string", raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
}

// The header row is not always the first row, so look for the row that holds the column names.
function toObjects(grid, kind) {
  const need = Object.values(EXPORTS[kind]).filter((v, i) => i > 0);
  const norm = (s) => String(s).replace(/^﻿/, "").trim().toLowerCase();
  const at = grid.slice(0, 30).findIndex((row) => need.every((n) => row.some((c) => norm(c) === n.toLowerCase())));
  if (at < 0) return null;
  const head = grid[at].map(norm);
  return grid.slice(at + 1).map((row) => {
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = row[i]; });
    return o;
  });
}

function guessKind(grid) {
  for (const k of Object.keys(EXPORTS)) if (toObjects(grid, k)) return k;
  return null;
}

const KIND_LABEL = { purchase: "Purchase order items", sales: "Sold items", stock: "Current stock" };
// Fallback when the columns are not recognised: guess from the file name.
function kindFromName(name) {
  const n = name.toLowerCase();
  if (/purchase/.test(n)) return "purchase";
  if (/stock/.test(n)) return "stock";
  if (/order/.test(n)) return "sales";
  return null;
}

const fmtWhen = (ms) => new Date(ms).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const dayOf = (ms) => new Date(ms).toDateString();
// The three files should come from the same download session. Warn when they do not, or are not from today.
function checkAges() {
  const box = $("reportAge");
  const fs = Object.values(reportFiles);
  let msg = "";
  if (fs.length) {
    const times = fs.map((f) => f.modified);
    const spread = Math.max(...times) - Math.min(...times);
    if (fs.length > 1 && spread > 6 * 3600 * 1000) msg = "These files were downloaded at different times (see the dates above). Sold, purchased and stock figures may not line up.";
    else if (dayOf(Math.max(...times)) !== dayOf(Date.now())) msg = "None of these files were downloaded today. Make sure they are the exports you want.";
  }
  box.textContent = msg;
  box.classList.toggle("hidden", !msg);
}

function paintChecklist() {
  document.querySelectorAll("#checklist li").forEach((li) => {
    const f = reportFiles[li.dataset.kind];
    li.classList.toggle("done", !!f);
    li.querySelector("small").textContent = f ? `${f.name} · ${f.count} rows · ${fmtWhen(f.modified)}` : "Waiting for file";
  });
  checkAges();
  $("reportBtn").disabled = !Object.keys(EXPORTS).every((k) => reportFiles[k]);
  $("reportResult").classList.add("hidden");
}

async function addReportFiles(fileList) {
  const notes = [];
  for (const file of fileList) {
    try {
      const grid = await readSheetRows(file);
      const kind = guessKind(grid) || kindFromName(file.name);
      const rows = kind && toObjects(grid, kind);
      if (!rows) { notes.push(`${file.name}: not one of the three exports, skipped.`); continue; }
      const count = rows.filter((r) => String(r[EXPORTS[kind].sku.toLowerCase()] ?? "").trim()).length;
      const replaced = reportFiles[kind] && reportFiles[kind].name !== file.name;
      reportFiles[kind] = { name: file.name, rows, count, modified: file.lastModified };
      if (replaced) notes.push(`${KIND_LABEL[kind]}: replaced by ${file.name}.`);
    } catch { notes.push(`${file.name}: could not be opened, skipped.`); }
  }
  $("reportNotes").innerHTML = notes.map((n) => `<p>${n.replace(/[&<>]/g, "")}</p>`).join("");
  paintChecklist();
}

const rin = $("reportFilesInput"), rdrop = $("reportDrop");
rin.addEventListener("change", () => { addReportFiles([...rin.files]); rin.value = ""; });
["dragenter", "dragover"].forEach((ev) => rdrop.addEventListener(ev, (e) => { e.preventDefault(); rdrop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => rdrop.addEventListener(ev, (e) => { e.preventDefault(); rdrop.classList.remove("over"); }));
rdrop.addEventListener("drop", (e) => addReportFiles([...e.dataTransfer.files]));

/* ---------- building the report ---------- */
const CAT_HEADERS = ["Item Category", "Purchase Value", "Sold Value", "Diff", "Stock Value"];
const NO_CAT = "Not bought or sold in this period";

function buildReport() {
  const items = new Map(); // sku key -> { cat, name, bought, sold, stock, bval, sval }
  const get = (k) => { if (!items.has(k)) items.set(k, { cat: "", name: "", bought: 0, sold: 0, stock: 0, bval: 0, sval: 0, unit: "" }); return items.get(k); };
  const field = (kind, key) => EXPORTS[kind][key].toLowerCase();
  const text = (v) => String(v ?? "").trim();
  // kg for weight items, pc for count items
  const unitOf = (v) => (/weight|kg/i.test(v) ? "kg" : /count|pc/i.test(v) ? "pc" : "");

  for (const r of reportFiles.purchase.rows) {
    const k = skuKey(r[field("purchase", "sku")]); if (!k) continue;
    const it = get(k), q = num(r[field("purchase", "qty")]);
    it.bought += q;
    it.unit = it.unit || unitOf(r["unit measure type"]);
    it.bval += q * num(r[field("purchase", "cost")]);     // quantity x cost of the product
    it.name = it.name || text(r[field("purchase", "name")]);
    it.cat = it.cat || text(r[field("purchase", "cat")]);
  }
  for (const r of reportFiles.sales.rows) {
    const k = skuKey(r[field("sales", "sku")]); if (!k) continue;
    const it = get(k), q = num(r[field("sales", "qty")]);
    it.sold += q;
    it.unit = it.unit || unitOf(r["unit of measure"]);
    it.sval += q * num(r[field("sales", "cost")]);        // quantity x cost of the product (not the selling price)
    it.name = it.name || text(r[field("sales", "name")]);
    it.cat = it.cat || text(r[field("sales", "cat")]);
  }
  // Stock has no category: it is taken from the same SKU in the purchase or sold file.
  const stockBySku = new Map();
  for (const r of reportFiles.stock.rows) {
    const k = skuKey(r[field("stock", "sku")]); if (!k) continue;
    const s = stockBySku.get(k) || { qty: 0, val: 0 };
    const raw = text(r[field("stock", "qty")]), q = num(raw);   // "28 kg " / "12 Count ": the number in front
    s.qty += q; s.val += num(r[field("stock", "cost")]);
    stockBySku.set(k, s);
    if (items.has(k)) { const it = items.get(k); it.name = it.name || text(r[field("stock", "name")]); it.unit = it.unit || unitOf(raw); }
  }
  for (const [k, s] of stockBySku) if (items.has(k)) items.get(k).stock = s.qty;

  const round = (n) => Math.round(n * 1000) / 1000;
  const money = (n) => Math.round(n * 100) / 100;
  const list = [...items.entries()].sort((a, b) =>
    a[1].cat.localeCompare(b[1].cat) || a[1].name.localeCompare(b[1].name));
  const rows = list.map(([, it]) => {
    const diff = round(it.sold - it.bought);
    return [it.cat, it.name, it.unit, round(it.bought), round(it.sold), diff, round(it.stock), round(it.stock + diff)];
  });

  const cats = new Map();
  const cat = (c) => { if (!cats.has(c)) cats.set(c, { b: 0, s: 0, v: 0 }); return cats.get(c); };
  for (const it of items.values()) { const c = cat(it.cat || "No category"); c.b += it.bval; c.s += it.sval; }
  for (const [k, s] of stockBySku) {
    const c = cat(items.has(k) ? (items.get(k).cat || "No category") : NO_CAT);
    c.v += s.val;
  }
  const catRows = [...cats.entries()]
    .sort((a, b) => (a[0] === NO_CAT) - (b[0] === NO_CAT) || a[0].localeCompare(b[0]))
    .map(([name, c]) => [name, money(c.b), money(c.s), money(c.s - c.b), money(c.v)]);
  const total = ["Total", ...[1, 2, 3, 4].map((i) => money(catRows.reduce((t, r) => t + r[i], 0)))];

  const missingStock = list.filter(([k]) => !stockBySku.has(k)).map(([, it]) => it.name);
  const noCatCount = [...stockBySku.keys()].filter((k) => !items.has(k)).length;
  return { rows, catRows, total, missingStock, noCatCount };
}

// Table with a filter box under every column and click-to-sort headers.
// Text columns: type part of a name. Number columns: type 100, >100, <0, >=5, <=5 or =28.
function numMatch(v, q) {
  const m = q.trim().match(/^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return String(v).includes(q.trim());
  const n = parseFloat(m[2]);
  switch (m[1]) { case ">": return v > n; case "<": return v < n; case ">=": return v >= n; case "<=": return v <= n; default: return v === n; }
}
function renderTable(el, headers, rows, textCols, negCols, totalRow) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const filters = headers.map(() => "");
  let sortCol = -1, sortDir = 1;
  const line = (r, cls) => `<tr class="${cls}">` + r.map((v, i) =>
    i < textCols ? `<td>${esc(v)}</td>` : `<td class="num${negCols.includes(i) && v < 0 ? " neg" : ""}">${v}</td>`).join("") + "</tr>";
  el.innerHTML = `<table><thead><tr>${headers.map((h, i) =>
      `<th class="sortable ${i >= textCols ? "num" : ""}" data-c="${i}">${h}<i></i></th>`).join("")}</tr>
    <tr class="filters">${headers.map((h, i) => `<th class="${i >= textCols ? "num" : ""}"><input data-c="${i}" placeholder="${i >= textCols ? "e.g. >0" : "filter"}" aria-label="Filter ${h}"></th>`).join("")}</tr></thead>
    <tbody></tbody></table><p class="rowcount muted"></p>`;
  const body = el.querySelector("tbody"), count = el.querySelector(".rowcount");
  function draw() {
    let list = rows.filter((r) => filters.every((q, i) => !q.trim() ||
      (i < textCols ? String(r[i]).toLowerCase().includes(q.trim().toLowerCase()) : numMatch(r[i], q))));
    if (sortCol >= 0) list = [...list].sort((a, b) => (typeof a[sortCol] === "number" ? a[sortCol] - b[sortCol] : String(a[sortCol]).localeCompare(String(b[sortCol]))) * sortDir);
    body.innerHTML = list.map((r) => line(r, "")).join("") + (totalRow ? line(totalRow, "total") : "");
    count.textContent = list.length === rows.length ? `${rows.length} rows` : `Showing ${list.length} of ${rows.length} rows`;
    el.querySelectorAll("th.sortable").forEach((th) => th.dataset.dir = +th.dataset.c === sortCol ? (sortDir > 0 ? "asc" : "desc") : "");
  }
  el.querySelectorAll(".filters input").forEach((inp) => inp.addEventListener("input", () => { filters[+inp.dataset.c] = inp.value; draw(); }));
  el.querySelectorAll("th.sortable").forEach((th) => th.addEventListener("click", () => {
    const c = +th.dataset.c; sortDir = sortCol === c ? -sortDir : 1; sortCol = c; draw();
  }));
  draw();
}

let reportCats = null;
$("reportBtn").addEventListener("click", () => {
  const { rows, catRows, total, missingStock, noCatCount } = buildReport();
  reportRows = rows; reportCats = [...catRows, total];
  const issues = $("reportIssues");
  issues.innerHTML = "";
  const note = (cls, title, body) => { const li = document.createElement("li"); li.className = cls; li.innerHTML = `<b>${title}</b>${body}`; issues.appendChild(li); };
  if (missingStock.length)
    note("warn", "Not in the stock file", `Stock counted as 0 for: ${missingStock.slice(0, 8).map((s) => s.replace(/[&<>]/g, "")).join(", ")}${missingStock.length > 8 ? ` and ${missingStock.length - 8} more` : ""}.`);
  const un = catRows.find((r) => r[0] === NO_CAT);
  if (un) note("warn", "Some stock has no category",
    `${noCatCount.toLocaleString("en-IN")} items are in your stock file but were not bought or sold in these files, so their category is unknown. Their stock (worth ${un[4].toLocaleString("en-IN")}) is kept in the last row, "${NO_CAT}", so the total stock value stays correct.`);
  const b = $("reportBanner");
  b.className = "banner ok";
  b.textContent = `Report ready: ${rows.length} items, ${catRows.length} categories`;
  renderTable($("reportTable"), REPORT_HEADERS, rows, 3, [5, 7]);
  renderTable($("reportTable2"), CAT_HEADERS, catRows, 1, [3], total);
  $("reportResult").classList.remove("hidden");
  $("reportStatus").textContent = "";
});

$("reportDownload").addEventListener("click", () => {
  if (!reportRows) return;
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([REPORT_HEADERS, ...reportRows]);
  ws1["!cols"] = [{ wch: 18 }, { wch: 34 }, { wch: 7 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 10 }];
  ws1["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: reportRows.length, c: REPORT_HEADERS.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, ws1, "Item-wise Stock");
  const ws2 = XLSX.utils.aoa_to_sheet([CAT_HEADERS, ...reportCats]);
  ws2["!cols"] = [{ wch: 34 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  ws2["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: reportCats.length - 1, c: CAT_HEADERS.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, ws2, "Category-wise Summary");
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  XLSX.writeFile(wb, `Stock Report ${stamp}.xlsx`);
});

/* ---------- auto-select the newest exports from the Downloads folder ---------- */
// A web page cannot look into Downloads by itself. The first click asks you to pick that folder once; it is remembered after that.
const AUTO_PATTERNS = {
  purchase: /purchase.?order.?items/i,
  sales: /order.?items/i,
  stock: /stocks?\b|stocks?[_\-. ]/i,
};
const EXPORT_EXT = /\.(csv|xlsx|xls)$/i;
const kindOfDownload = (name) => {
  if (!EXPORT_EXT.test(name)) return null;
  if (AUTO_PATTERNS.purchase.test(name)) return "purchase";
  if (AUTO_PATTERNS.sales.test(name)) return "sales";
  if (AUTO_PATTERNS.stock.test(name)) return "stock";
  return null;
};

// From any list of files, keep only the newest of each kind and load them.
async function selectNewest(files) {
  const newest = {};
  for (const file of files) {
    const kind = kindOfDownload(file.name);
    if (kind && (!newest[kind] || file.lastModified > newest[kind].lastModified)) newest[kind] = file;
  }
  delete reportFiles.purchase; delete reportFiles.sales; delete reportFiles.stock;
  await addReportFiles(Object.values(newest));
  const missing = Object.keys(EXPORTS).filter((k) => !reportFiles[k]).map((k) => KIND_LABEL[k]);
  $("autoHint").textContent = missing.length
    ? `Not found: ${missing.join(", ")}. Add them above, or check the selection.`
    : "Latest three exports selected.";
  return missing.length === 0;
}

const pickerError = (e) => ($("autoHint").textContent = e && e.name === "AbortError"
  ? "Nothing chosen." : "Could not read the files. Drop them in the box above instead.");

// Main button: a file picker that opens in Downloads (Chrome blocks picking Downloads as a folder, but allows this).
$("autoBtn").addEventListener("click", async () => {
  if (!window.showOpenFilePicker) { $("autoHint").textContent = "This browser cannot do this. Use Chrome or Edge, or drop the files above."; return; }
  try {
    const handles = await window.showOpenFilePicker({
      id: "tg-downloads", startIn: "downloads", multiple: true,
      types: [{ description: "Exports", accept: { "text/csv": [".csv"], "application/vnd.ms-excel": [".xls"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }],
    });
    await selectNewest(await Promise.all(handles.map((h) => h.getFile())));
  } catch (e) { pickerError(e); }
});

// Second button: a normal folder (not Downloads itself), remembered after the first time.
$("autoChange").addEventListener("click", async () => {
  if (!window.showDirectoryPicker) { $("autoHint").textContent = "This browser cannot read folders. Use Chrome or Edge."; return; }
  try {
    let handle = await idbGet("exportDir");
    if (handle && (await handle.queryPermission({ mode: "read" })) !== "granted" &&
        (await handle.requestPermission({ mode: "read" })) !== "granted") handle = null;
    if (!handle) {
      handle = await window.showDirectoryPicker({ id: "tg-exports", mode: "read" });
      await idbSet("exportDir", handle);
    }
    const files = [];
    for await (const entry of handle.values()) if (entry.kind === "file" && kindOfDownload(entry.name)) files.push(await entry.getFile());
    if (!(await selectNewest(files))) await idbSet("exportDir", null); // wrong folder: ask again next time
  } catch (e) { pickerError(e); }
});

/* ---------- tabs inside the report ---------- */
const RTAB_NOTES = {
  items: "One row per item: purchased, sold, stock and wastage (Stock + Sold - Purchased).",
  cats: "One row per category, values at cost price. Stock Value uses the category found from the purchase and sold files.",
};
function showReportTab() {
  const t = document.querySelector('input[name="rtab"]:checked').value;
  $("reportTable").classList.toggle("hidden", t !== "items");
  $("reportTable2").classList.toggle("hidden", t !== "cats");
  $("rtabNote").textContent = RTAB_NOTES[t];
}
document.querySelectorAll('input[name="rtab"]').forEach((r) => r.addEventListener("change", showReportTab));
showReportTab();
