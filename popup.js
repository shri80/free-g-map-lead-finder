const HIDDEN = new Set([
  "website", "booking_link", "accessibility", "latitude", "longitude", "place_id", "cid",
  "hex_feature_id", "knowledge_graph_id", "maps_url", "cid_url",
  "emails", "site_phones", "facebook", "linkedin", "instagram", "twitter", "contact_page", "enrich_status",
]);
// columns behind the "IDs, coords & URLs" toggle
const TECH = new Set(["booking_link", "accessibility", "latitude", "longitude", "place_id", "cid",
  "hex_feature_id", "knowledge_graph_id", "maps_url", "cid_url", "contact_page", "enrich_status"]);
const ORDER = ["name", "rating", "reviews", "category", "address", "phone", "emails", "hours", "site_phones",
  "facebook", "linkedin", "instagram", "twitter", "website", "sponsored"];
const orderedCols = (row) => {
  const keys = Object.keys(row);
  return [...ORDER.filter((k) => keys.includes(k)), ...keys.filter((k) => !ORDER.includes(k))];
};
const LINKS = new Set(["website", "booking_link", "maps_url", "cid_url", "facebook", "linkedin", "instagram", "twitter", "contact_page"]);
const $ = (id) => document.getElementById(id);
const NEED = "Open a Google Maps search results page and reload it once.";

let rows = [];
let sortKey = "", sortDir = 1;
let timer = null, etimer = null, lastCount = -1;

// If the page was opened before the extension was installed/reloaded it has no live content
// script; inject it on demand instead of making the user refresh the Maps tab.
const tabMsg = async (m) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { return await chrome.tabs.sendMessage(tab.id, m); }
  catch (e) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tab.id, m);
  }
};
const bg = (m) => chrome.runtime.sendMessage(m);
const setBar = (id, pct, busy) => {
  $(id).classList.toggle("busy", !!busy);
  $(id).firstElementChild.style.width = Math.max(0, Math.min(100, pct)) + "%";
};

// ---------- step 1: collect ----------
async function extractNow() {
  let fresh;
  try { fresh = (await tabMsg({ type: "extract" })).rows; } catch (e) { $("status").textContent = NEED; return; }
  if (fresh.length || !rows.length) rows = fresh;   // never wipe the table if the page lost its list
  $("csv").disabled = $("copy").disabled = $("enrich").disabled = !rows.length;
  await mergeEnrich();
}

const START_LABEL = "\u25B6 Start";
function setStatus(text, cls) {
  $("status").textContent = text;
  $("status").className = "msg" + (cls ? " " + cls : "");
}

let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try { return await pollOnce(); } finally { polling = false; }
}
async function pollOnce() {
  let s;
  try { s = await tabMsg({ type: "status" }); } catch (e) { setStatus(NEED); return; }
  $("start").disabled = s.running;
  $("start").textContent = s.running ? "Running\u2026" : START_LABEL;
  $("stop").disabled = !s.running;
  const max = +$("max").value || 0;
  // always visible while running: indeterminate when unlimited, else at least a small sliver
  setBar("bar1", max ? Math.max(8, (s.scrolls / max) * 100) : 0, s.running && !max);
  if (s.running) {
    if (s.count + ":" + s.dDone !== lastCount) { lastCount = s.count + ":" + s.dDone; await extractNow(); }  // live table
    if (s.phase === "details") {
      setBar("bar1", s.dTotal ? Math.max(8, (s.dDone / s.dTotal) * 100) : 8, false);
      setStatus(`No phone/website on cards \u2014 reading details\u2026 ${s.dDone}/${s.dTotal}`, "running");
    } else setStatus(`Scrolling\u2026 ${s.scrolls}${max ? "/" + max : ""} scrolls \u00B7 ${s.count} listings`, "running");
  } else if (timer) {
    clearInterval(timer); timer = null; setBar("bar1", 100);
    await extractNow();
    setStatus(s.reason === "stopped"
      ? `\u25A0 Stopped \u2014 ${s.count} listings collected`
      : `\u2714 Done \u2014 ${s.count} listings collected` + (s.reason ? ` (${s.reason})` : ""), "done");
  } else {
    setStatus(`${s.count} listings loaded` + (s.reason ? ` \u00B7 ${s.reason} (${s.scrolls} scrolls)` : ""));
  }
  return s;
}

$("start").onclick = async () => {
  if (timer) return;
  lastCount = -1;
  $("start").disabled = true;
  $("start").textContent = "Running\u2026";
  $("stop").disabled = false;
  setBar("bar1", 8, !(+$("max").value));
  setStatus("Starting\u2026 scrolling the results list", "running");
  try { await tabMsg({ type: "start", maxScrolls: +$("max").value || 0, delayMs: +$("delay").value || 1500, details: $("details").checked }); }
  catch (e) {
    console.error(e);
    $("start").disabled = false; $("start").textContent = START_LABEL; $("stop").disabled = true;
    setBar("bar1", 0, false); setStatus(NEED + " (" + e.message + ")"); return;
  }
  timer = setInterval(poll, 500);
  poll();
};
$("stop").onclick = () => tabMsg({ type: "stop" });
$("go").onclick = extractNow;

// ---------- step 2: enrich ----------
async function mergeEnrich() {
  const { enrich = {} } = await chrome.storage.local.get("enrich");
  rows.forEach((r) => {
    const e = enrich[r.website] || {};
    r.emails = (e.emails || []).join("; ");
    r.site_phones = (e.phones || []).join("; ");
    r.facebook = e.facebook || "";
    r.linkedin = e.linkedin || "";
    r.instagram = e.instagram || "";
    r.twitter = e.twitter || "";
    r.contact_page = e.contact_page || "";
    r.enrich_status = r.website ? e.status || "" : "no website";
  });
  render();
}

async function epoll() {
  const s = await bg({ type: "enrichStatus" });
  $("enrichStop").disabled = !s.running;
  $("enrich").disabled = s.running || !rows.length;
  $("estatus").textContent = s.total ? `Websites ${s.done}/${s.total}${s.running ? " …" : " · done"}` : "";
  setBar("bar2", s.total ? (s.done / s.total) * 100 : 0);
  await mergeEnrich();
  if (!s.running && etimer) { clearInterval(etimer); etimer = null; }
}

$("enrich").onclick = async () => {
  const sites = rows.map((r) => r.website).filter(Boolean);
  if (!sites.length) { $("estatus").textContent = "No websites in the table."; return; }
  // Website access is requested only now, on user click (must be the first await in the handler).
  const granted = await chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] });
  if (!granted) { $("estatus").textContent = "Permission denied. It is needed to read the business websites."; return; }
  await bg({ type: "enrich", sites, force: $("force").checked });
  etimer = setInterval(epoll, 1000);
  epoll();
};
$("enrichStop").onclick = () => bg({ type: "enrichStop" });

// ---------- table ----------
function visibleRows() {
  const q = $("q").value.trim().toLowerCase();
  let out = rows.filter((r) =>
    (!q || Object.values(r).some((v) => String(v).toLowerCase().includes(q))) &&
    (!$("onlyEmail").checked || r.emails));
  if (sortKey) {
    out = [...out].sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      const nx = parseFloat(x), ny = parseFloat(y);
      const c = !isNaN(nx) && !isNaN(ny) && /^[\d.,-]+$/.test(x + y) ? nx - ny : String(x).localeCompare(String(y));
      return c * sortDir;
    });
  }
  return out;
}

function cell(td, key, v) {
  if (!v) return;
  if (LINKS.has(key)) {
    const a = document.createElement("a");
    a.href = v; a.target = "_blank"; a.rel = "noreferrer";
    a.textContent = v.replace(/^https?:\/\/(www\.)?/, "");
    td.appendChild(a);
  } else if (key === "enrich_status") {
    const s = document.createElement("span");
    s.className = "pill " + (v === "ok" ? "ok" : /fail|error/.test(v) ? "bad" : "");
    s.textContent = v;
    td.appendChild(s);
  } else td.textContent = v;
  td.title = v;
}

function render() {
  const t = $("t");
  t.innerHTML = "";
  const list = visibleRows();
  $("count").textContent = rows.length ? `${list.length}/${rows.length}` : "";
  $("empty").style.display = rows.length ? "none" : "block";
  if (!rows.length) return;
  const showHid = $("hidcols").checked;
  const cols = orderedCols(rows[0]).filter((c) => showHid || !TECH.has(c));
  const head = t.createTHead().insertRow();
  cols.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c.replace(/_/g, " ") + (sortKey === c ? (sortDir > 0 ? " ▲" : " ▼") : "");
    if (HIDDEN.has(c)) th.className = "hid";
    th.onclick = () => { sortDir = sortKey === c ? -sortDir : 1; sortKey = c; render(); };
    head.appendChild(th);
  });
  const body = t.createTBody();
  list.forEach((r) => {
    const tr = body.insertRow();
    cols.forEach((c) => cell(tr.insertCell(), c, r[c]));
  });
}
["q", "hidcols", "onlyEmail"].forEach((id) => $(id).addEventListener("input", render));

// ---------- export ----------
function toCSV(list) {
  const cols = orderedCols(list[0]);
  const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  return [cols.join(","), ...list.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
$("copy").onclick = () => navigator.clipboard.writeText(JSON.stringify(visibleRows(), null, 2));
$("csv").onclick = () => {
  const list = visibleRows();
  if (!list.length) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + toCSV(list)], { type: "text/csv" }));
  a.download = "maps-listings.csv";
  a.click();
};

// ---------- on open: resume whatever is running ----------
(async () => {
  try {
    const s = await poll();
    if (s && s.running) timer = setInterval(poll, 700);
    if (s && !s.running && s.count) await extractNow();
    const e = await bg({ type: "enrichStatus" });
    if (e.running) etimer = setInterval(epoll, 1000);
  } catch (e) {}
})();
