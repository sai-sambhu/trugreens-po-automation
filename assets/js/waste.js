/* Waste Management: converts a pasted waste list into waste_management.json for Selenium.
   Uses prompts/waste_management/ (task, rules, groups) and the common lists in prompts/items/ (fruits + veggies).
   Reuses the helpers from app.js (readText, writeText, parseEnv, callOpenAI, parseJsonArray, loadCatalog, esc). */

const WASTE_OUTPUT = "waste_management.json";
const WASTE_LISTS = ["fruits.txt", "veggies_leafy.txt"];   // only fruits and veggies go into waste management
const WASTE_LOCATION = "Trugreens";
const WASTE_APPROVER = "Kanchana";

const wLog = (t) => { $("wLog").textContent += new Date().toTimeString().slice(0, 8) + "  " + t + "\n"; };
const wStatus = (t) => ($("wStatus").textContent = t);

/* ---------- folder (same folder as the Purchase Order tab) ---------- */
function wShowFolder() {
  const ok = typeof dir !== "undefined" && !!dir;
  $("wFolderPill").textContent = ok ? "connected: " + dir.name : "not connected";
  $("wFolderPill").className = "pill " + (ok ? "ok" : "idle");
  $("wFolderDot").className = "dot" + (ok ? " ok" : "");
  $("wFolderBtn").textContent = ok ? "Change folder" : "Choose folder";
  wUpdateButton();
}
function wUpdateButton() {
  const ok = typeof dir !== "undefined" && !!dir;
  $("wConvertBtn").disabled = !ok || !$("wMessage").value.trim();
}
$("wFolderBtn").addEventListener("click", () => $("folderBtn").click());
$("wMessage").addEventListener("input", wUpdateButton);
if (typeof setFolder === "function") {
  const prior = setFolder;
  setFolder = function (...args) { const r = prior.apply(this, args); wShowFolder(); return r; };
}
wShowFolder();
setTimeout(wShowFolder, 1500);   // the saved folder is restored a moment after the page loads

try { const m = localStorage.getItem("wasteModel"); if (m === "strong" || m === "mini") $("wModelSel").value = m; } catch (_) {}
$("wModelSel").addEventListener("change", () => { try { localStorage.setItem("wasteModel", $("wModelSel").value); } catch (_) {} });

/* ---------- splitting a group line (All brinjals, Raw banana with no size) ---------- */
// The AI only recognises the group and gives one total; the page divides it, so the maths is exact.
function splitGroup(code, qty, groups) {
  const g = groups[code];
  if (!g) return { error: "Unknown group " + code + "." };
  const n = g.skus.length, scale = Math.pow(10, g.decimals || 0);
  const total = Math.round(Number(qty) * scale);
  if (!Number.isFinite(total) || total <= 0) return { error: g.label + ": the quantity is not a positive number." };
  if ((g.decimals || 0) === 0 && Math.abs(Number(qty) - total) > 1e-9) return { error: g.label + ": pieces must be a whole number, got " + qty + "." };
  const base = Math.floor(total / n);
  const parts = Array(n).fill(base);
  const rest = total - base * n;
  if (g.split === "equal") parts[n - 1] += rest;                          // the last item takes the leftover grams
  else for (let i = 0; i < rest; i++) parts[i] += 1;                      // the first items take the extra pieces
  return {
    parts: g.skus.map((sku, i) => ({ sku, quantity: parts[i] / scale })).filter((p) => p.quantity > 0),
    label: g.label,
  };
}

/* ---------- validation of the AI answer ---------- */
const normText = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
const HAS_PC = /\d\s*(pcs?|pieces?)\b/i;
const HAS_KG = /\d\s*(kgs?|kilos?|gms?|grams?|g)\b/i;

function checkWaste(result, message, catalog, groups) {
  const issues = [];
  const bad = (label, text) => issues.push({ level: "bad", label, text });
  const warn = (label, text) => issues.push({ level: "warn", label, text });
  const rows = [];

  for (const it of result.items || []) {
    const text = it.message_text || "";
    const sku = String(it.sku ?? "").trim();
    const label = text || sku;
    if (sku.startsWith("GROUP:")) {
      const code = sku.slice(6);
      const sp = splitGroup(code, it.quantity, groups);
      if (sp.error) { bad(label, sp.error); continue; }
      sp.parts.forEach((p) => rows.push({ sku: p.sku, quantity: p.quantity, message_text: text, fromGroup: sp.label }));
      warn(label, sp.label + " " + it.quantity + " split across " + sp.parts.length + " items: " +
        sp.parts.map((p) => (catalog[p.sku] ? catalog[p.sku].name : p.sku) + " " + p.quantity).join(", ") + ".");
      continue;
    }
    rows.push({ sku, quantity: Number(it.quantity), message_text: text });
  }

  // Name and unit always come from the list, never from the AI.
  const merged = new Map();
  for (const r of rows) {
    const c = catalog[r.sku];
    if (!c) { bad(r.message_text || r.sku, "SKU " + r.sku + " is not in the fruits or veggies list."); continue; }
    if (!Number.isFinite(r.quantity) || r.quantity <= 0) { bad(r.message_text || c.name, c.name + ": quantity must be a number above 0."); continue; }
    if (c.unit === "pc" && Math.abs(r.quantity - Math.round(r.quantity)) > 1e-9) { bad(r.message_text, c.name + " is counted in pieces, but the quantity is " + r.quantity + "."); continue; }
    if (!r.fromGroup) {
      if (c.unit === "kg" && HAS_PC.test(r.message_text) && !HAS_KG.test(r.message_text))
        { bad(r.message_text, c.name + " is a Weight item (kg) but the line gives pieces, and there is no conversion rule."); continue; }
      if (c.unit === "pc" && HAS_KG.test(r.message_text) && !HAS_PC.test(r.message_text))
        { bad(r.message_text, c.name + " is a Count item (pc) but the line gives kg or grams, and there is no conversion rule."); continue; }
    }
    const prev = merged.get(r.sku);
    if (prev) {
      warn(c.name, c.name + " appears more than once: " + prev.quantity + " + " + r.quantity + " = " + Math.round((prev.quantity + r.quantity) * 1000) / 1000 + " " + c.unit + ".");
      prev.quantity = Math.round((prev.quantity + r.quantity) * 1000) / 1000;
      prev.message_text += " + " + r.message_text;
    } else merged.set(r.sku, { name: c.name, sku: r.sku, quantity: Math.round(r.quantity * 1000) / 1000, unit: c.unit, message_text: r.message_text });
  }

  for (const u of result.unmatched_items || [])
    bad(u.message_text || "(line)", "Not matched: " + (u.reason || "no reason given") + (u.candidates && u.candidates.length ? " (could be: " + u.candidates.join(", ") + ")" : ""));
  for (const w of result.warnings || []) if (String(w).trim()) warn("Note", String(w));

  // Every line with a number must be covered by an item or an unmatched line, so nothing is dropped silently.
  const ignored = (result.ignored_lines || []).map(String).filter((l) => l.trim());
  ignored.filter((l) => /\d/.test(l)).forEach((l) => warn(l, "Skipped as not an item (heading, date or separator). Check it was not a real item."));
  const covered = (result.items || []).map((i) => normText(i.message_text)).concat((result.unmatched_items || []).map((u) => normText(u.message_text)), ignored.map(normText));
  message.split(/\r?\n/).map((l) => l.trim()).filter((l) => /\d/.test(l)).forEach((line) => {
    const n = normText(line);
    if (!covered.some((c) => c && (c.includes(n) || n.includes(c)))) bad(line, "This line is not in the result (the AI skipped it). Convert again.");
  });

  return { items: [...merged.values()], issues };
}

/* ---------- render ---------- */
function wRender(items, issues, saved) {
  $("wResult").classList.remove("hidden");
  const nBad = issues.filter((i) => i.level === "bad").length;
  const nWarn = issues.filter((i) => i.level === "warn").length;
  $("wBanner").className = "banner " + (nBad ? "bad" : "ok");
  $("wBanner").textContent = nBad
    ? nBad + " problem(s) to fix. Nothing was saved."
    : "Clean: " + items.length + " items saved for Selenium" + (nWarn ? " (" + nWarn + " note(s) below)" : "") + ".";
  $("wIssues").innerHTML = issues
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "bad" ? -1 : 1))
    .map((i) => `<li class="${i.level}"><b>${esc(i.label)}</b>${esc(i.text)}</li>`).join("");
  $("wSummary").innerHTML = items.length
    ? `<table><thead><tr><th>#</th><th>Item</th><th>SKU</th><th class="num">Quantity</th><th>Unit</th><th>Original line</th></tr></thead><tbody>` +
      items.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.sku)}</td><td class="num">${r.quantity}</td><td>${r.unit}</td><td class="muted">${esc(r.message_text)}</td></tr>`).join("") +
      `</tbody></table>`
    : "";
  $("wNext").classList.toggle("hidden", !saved);
}

/* ---------- Selenium card ---------- */
function wRunCommand() {
  const here = location.protocol === "file:" ? decodeURIComponent(location.pathname).replace(/\/[^\/]*$/, "") : null;
  if (isMac) return here ? `bash "${here}/commands/mac/selenium_create_waste_entry.command"` : "bash commands/mac/selenium_create_waste_entry.command";
  if (here) return `cmd /c "${here.replace(/^\//, "").replace(/\//g, "\\")}\\commands\\windows\\selenium_create_waste_entry.bat"`;
  return "commands\\windows\\selenium_create_waste_entry.bat";
}
async function wShowRun() {
  let ok = false;
  try { ok = typeof linkState === "function" && (await linkState()).s === "ok"; } catch (_) {}
  $("wRunLink").classList.toggle("hidden", !ok);
  $("wManual").open = !ok;
  $("wRunCmd").textContent = wRunCommand();
}
$("wCopyBtn").addEventListener("click", async () => {
  const el = $("wRunCmd"), b = $("wCopyBtn");
  try { await navigator.clipboard.writeText(el.textContent); }
  catch { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand("copy"); }
  b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1500);
});

/* ---------- main ---------- */
$("wConvertBtn").addEventListener("click", async () => {
  const message = $("wMessage").value.trim();
  if (!message) return wStatus("Paste the waste list first.");
  $("wConvertBtn").disabled = true;
  $("wSpin").classList.remove("hidden");
  $("wNext").classList.add("hidden");
  $("wLog").textContent = "";
  $("wLogWrap").classList.remove("hidden");
  $("wLogWrap").open = false;
  try {
    wStatus("Reading project files…");
    const env = parseEnv(await readText(ENV_FILE));
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not found in .env");
    const [prompt, rules, groupsText, ...lists] = await Promise.all([
      readText(["prompts", "waste_management", "prompt.txt"]),
      readText(["prompts", "waste_management", "rules.txt"]),
      readText(["prompts", "waste_management", "groups.json"]),
      ...WASTE_LISTS.map((f) => readText(["prompts", "items", f])),
    ]);
    const groups = JSON.parse(groupsText);
    // one header, then the rows of both lists
    const itemsText = [lists[0].split(/\r?\n/)[0]].concat(lists.map((t) => t.split(/\r?\n/).slice(1).join("\n"))).join("\n");
    const catalog = loadCatalog(itemsText);

    const model = $("wModelSel").value === "mini" ? (env.OPENAI_MODEL_MINI || "gpt-4.1-mini") : (env.OPENAI_MODEL || "gpt-4.1");
    // The part that never changes goes first (prompt and list), the message goes last.
    wLog("model: " + model + " | " + (itemsText.split(/\r?\n/).length - 1) + " items | " + message.split(/\r?\n/).filter((l) => l.trim()).length + " lines");
    wStatus("Asking " + model + "…");
    const choice = await callOpenAI(env.OPENAI_API_KEY, model, [
      { role: "system", content: prompt + "\n\n" + rules },
      { role: "user", content: "items.txt:\n" + itemsText + "\n\nWaste message:\n" + message + "\n\nOutput only the JSON object." },
    ]);
    if (choice.finish_reason === "length") throw new Error("Model output was cut off, so the JSON would be partial. Convert fewer lines at a time.");
    const result = parseJsonArray(choice.message.content)[0] || {};

    const { items, issues } = checkWaste(result, message, catalog, groups);
    const clean = !issues.some((i) => i.level === "bad") && items.length > 0;
    if (!items.length && !issues.length) issues.push({ level: "bad", label: "Empty", text: "No items were found in the message." });
    if (clean) {
      wStatus("Saving…");
      await writeText(WASTE_OUTPUT, JSON.stringify({
        location: WASTE_LOCATION, approver: WASTE_APPROVER, created: new Date().toISOString(),
        items: items.map((r) => ({ name: r.name, sku: r.sku, quantity: r.quantity, unit: r.unit, message_text: r.message_text })),
      }, null, 2));
    }
    $("wRaw").textContent = JSON.stringify(result, null, 2);
    wLog("result: " + items.length + " items, " + issues.filter((i) => i.level === "bad").length + " blocking, " + issues.filter((i) => i.level === "warn").length + " notes" + (clean ? "; saved " + WASTE_OUTPUT : "; NOT saved"));
    wRender(items, issues, clean);
    if (clean) await wShowRun();
    wStatus(clean ? "Done." : "Fix the message, then convert again.");
  } catch (e) {
    wStatus("");
    wLog("FAILED: " + e.name + ": " + e.message);
    $("wLogWrap").open = true;
    $("wResult").classList.remove("hidden");
    $("wBanner").className = "banner bad";
    $("wBanner").textContent = "Failed: " + e.message;
    $("wIssues").innerHTML = "";
    $("wSummary").innerHTML = "";
    $("wRaw").textContent = "";
  } finally {
    $("wSpin").classList.add("hidden");
    wUpdateButton();
  }
});
