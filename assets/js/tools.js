/* Computer tools (gear menu). The buttons only appear once setup_computer has been run for THIS folder.
   setup_computer writes the folder path into ".link_registered" inside the project folder; the page reads it and
   compares it with the folder it was opened from. Unregister deletes the file. */
const LINK_MARKER = ".link_registered";

const normPath = (p) => String(p).trim().replace(/\\/g, "/").replace(/^\/(?=[A-Za-z]:)/, "").replace(/\/+$/, "").toLowerCase();
const isMac = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
const registerFile = isMac ? "commands/mac/setup_computer.command" : "commands\\windows\\setup_computer.bat";

// Folder the page was opened from (only known when opened as a file).
function pageFolder() {
  if (location.protocol !== "file:") return null;
  try { return normPath(decodeURIComponent(location.pathname).replace(/\/[^\/]*$/, "")); } catch { return null; }
}

// The exact command for THIS computer and THIS folder (taken from the address the page was opened from), to paste in a terminal.
function setupCommand() {
  const here = location.protocol === "file:" ? decodeURIComponent(location.pathname).replace(/\/[^\/]*$/, "") : null;
  if (isMac) return here ? `bash "${here}/commands/mac/setup_computer.command"` : "bash commands/mac/setup_computer.command";
  if (here) return `cmd /c "${here.replace(/^\//, "").replace(/\//g, "\\")}\\commands\\windows\\setup_computer.bat"`;
  return "commands\\windows\\setup_computer.bat";
}
const cmdBox = () => `<div class="cmdbox"><code class="path" id="setupCmd"></code><button type="button" class="small" id="copySetup">Copy</button></div>
    <p class="altway"><b>Or without Terminal:</b> in the project folder, double-click <code>${registerFile}</code>.</p>`;

async function linkState() {
  if (typeof dir === "undefined" || !dir) return { s: "nofolder" };
  let text;
  try { text = await (await (await dir.getFileHandle(LINK_MARKER)).getFile()).text(); }
  catch { return { s: "missing" }; }
  const lines = text.split(/\r?\n/);
  const reg = lines[0].trim();
  if ((lines[1] || "").trim() !== "v3") return { s: "old" };   // set up with an older layout: the registered link no longer points at the right file
  const here = pageFolder();
  if (here && normPath(reg) !== here) return { s: "moved", reg };
  return { s: "ok" };
}

async function refreshTools() {
  const st = await linkState();
  const setup = $("gearSetup"), acts = $("gearActions");
  const text = {
    nofolder: `<p><b>Step 1: choose the project folder.</b> The page needs it to check whether this computer is set up.</p><button type="button" class="primary small" id="gearPick">Choose folder</button>`,
    missing:  `<p><b>First time on this computer.</b> Paste this in ${isMac ? "Terminal" : "Command Prompt"} and press Enter, then reopen this menu:</p>${cmdBox()}`,
    old:      `<p><b>The setup was updated.</b> Paste this in ${isMac ? "Terminal" : "Command Prompt"} and press Enter:</p>${cmdBox()}`,
    moved:    `<p><b>The link points to a different folder.</b> Paste this in ${isMac ? "Terminal" : "Command Prompt"} and press Enter:</p>${cmdBox()}`,
  };
  const ok = st.s === "ok";
  setup.innerHTML = ok ? "" : text[st.s];
  setup.classList.toggle("hidden", ok);
  const pick = $("gearPick");
  if (pick) pick.addEventListener("click", () => { $("gear").open = false; $("folderBtn").click(); });
  const cmdEl = $("setupCmd");
  if (cmdEl) {
    cmdEl.textContent = setupCommand();
    $("copySetup").addEventListener("click", async () => {
      const b = $("copySetup");
      try { await navigator.clipboard.writeText(cmdEl.textContent); }
      catch { const r = document.createRange(); r.selectNodeContents(cmdEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand("copy"); }
      b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1500);
    });
  }
  acts.classList.toggle("hidden", !ok);
  $("runLink").classList.toggle("hidden", !ok);
  // Update code is only enabled when the version check found the code outdated.
  const outdated = !!window.APP_OUTDATED;
  const up = $("gearUpdate");
  up.classList.toggle("disabled", !outdated);
  up.setAttribute("aria-disabled", String(!outdated));
  $("gearUpdateNote").textContent = outdated ? "A newer version is available." : "Already up to date.";
  const bar = $("barUpdate");
  if (bar) bar.classList.toggle("hidden", !ok);
  $("gear").classList.toggle("needs", st.s !== "ok");
}

// Re-check whenever the menu is opened, and when the folder gets connected.
$("gear").addEventListener("toggle", () => { if ($("gear").open) refreshTools(); });
if (typeof setFolder === "function") {
  const original = setFolder;
  setFolder = function (...args) { const r = original.apply(this, args); refreshTools(); return r; };
}
refreshTools();
setTimeout(refreshTools, 1500); // the saved folder is restored a moment after the page loads

// Block clicks on a disabled Update code link; re-check when the version check finishes.
$("gearUpdate").addEventListener("click", (e) => { if (!window.APP_OUTDATED) e.preventDefault(); });
document.addEventListener("tg-version", refreshTools);
