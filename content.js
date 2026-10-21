(() => {
// Extracts business listings from the Google Maps left results panel.
// "Visible" = text shown on the card. "Hidden" = data only present in attributes/URLs.

// phone/website/address read from each listing's detail panel, keyed by listing url
const details = new Map();

function parseCard(a) {
  const card = a.closest("div.Nv2PK") || a.parentElement;
  const href = a.href || "";

  // ---- visible ----
  const lines = card.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
  const name = a.getAttribute("aria-label") || "";
  const ratingEl = card.querySelector('[role="img"][aria-label*="star"]');
  const ratingLabel = ratingEl ? ratingEl.getAttribute("aria-label") : "";
  const rm = ratingLabel.match(/([\d.]+)\s+stars?\s+([\d,]+)/i);
  // Category/address line = first line after the rating line that isn't hours or a button.
  // Service-area businesses have no address, so the line is just the category (no "·").
  const isHours = (l) => /^(Open|Closed|Opens|Closes)/i.test(l);
  const isBtn = (l) => /^(Website|Directions|Book online|Order online|Reserve|Call)$/i.test(l);
  const rIdx = lines.findIndex((l) => /^\d(\.\d)?\s*\(/.test(l));
  const rest = lines.slice(rIdx >= 0 ? rIdx + 1 : 1).filter((l) => l !== name);
  const infoLine = rest.find((l) => !isHours(l) && !isBtn(l) && !/^\+?\d[\d\s\-().]+$/.test(l)) || "";
  const parts = infoLine.split("·").map((s) => s.trim()).filter((s) => /[A-Za-z0-9]/.test(s));
  const hoursLine = lines.find((l) => /^(Open|Closed|Opens|Closes)/i.test(l)) || "";
  const phone = (hoursLine.match(/\+?\d[\d\s\-().]{7,}\d/) || [""])[0];
  const hours = hoursLine.replace(phone, "").replace(/·\s*$/, "").replace(/\s*·\s*$/, "").trim();

  // ---- hidden (attributes / urls) ----
  const links = [...card.querySelectorAll("a")];
  const website = (links.find((x) => /website/i.test(x.getAttribute("aria-label") || "")) || {}).href || "";
  const booking = (links.find((x) => /book/i.test(x.innerText)) || {}).href || "";
  const aria = [...card.querySelectorAll("[aria-label]")].map((x) => x.getAttribute("aria-label"));
  const access = aria.find((t) => /wheelchair/i.test(t)) || "";

  const hexId = (href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i) || [])[1] || "";
  let cid = "";
  try { if (hexId) cid = BigInt("0x" + hexId.split(":")[1].slice(2)).toString(); } catch (e) {}
  const lat = (href.match(/!3d(-?[\d.]+)/) || [])[1] || "";
  const lng = (href.match(/!4d(-?[\d.]+)/) || [])[1] || "";
  const placeId = (href.match(/!19s(ChIJ[\w-]+)/) || [])[1] || "";
  const kgmid = decodeURIComponent((href.match(/!16s([^!?]+)/) || [])[1] || "");

  const d = details.get(href) || {};
  return {
    name,
    rating: rm ? rm[1] : "",
    reviews: rm ? rm[2].replace(/,/g, "") : "",
    category: parts[0] || "",
    address: parts.slice(1).join(", ") || d.address || "",
    hours,
    phone: phone || d.phone || "",
    website: website || d.website || "",
    booking_link: booking,
    sponsored: /^Sponsored|Ad\b/.test(card.innerText.split("\n")[0]) ? "yes" : "",
    accessibility: access,
    latitude: lat,
    longitude: lng,
    place_id: placeId,
    cid,
    hex_feature_id: hexId,
    knowledge_graph_id: kgmid,
    maps_url: href,
    cid_url: cid ? "https://maps.google.com/?cid=" + cid : "",
  };
}

function extract() {
  return [...document.querySelectorAll('div[role="feed"] a.hfpxzc')].map(parseCard);
}

// ---- background scroll job (survives popup closing) ----
const job = { running: false, stop: false, phase: "", scrolls: 0, count: 0, reason: "", dDone: 0, dTotal: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scrollFeed(feed, maxScrolls, delayMs) {
  let last = -1, stable = 0;
  while (!job.stop) {
    if (maxScrolls > 0 && job.scrolls >= maxScrolls) { job.reason = "reached max scrolls"; break; }
    feed.scrollTo(0, feed.scrollHeight);
    job.scrolls++;
    await sleep(delayMs);
    const n = feed.querySelectorAll("a.hfpxzc").length;
    job.count = n;
    if (/reached the end of the list/i.test(feed.innerText)) { job.reason = "end of list"; break; }
    stable = n === last ? stable + 1 : 0;
    last = n;
    if (stable >= 4) { job.reason = "no new results"; break; }
  }
}

// Some card layouts (photo cards) show no phone/website; those live in the detail panel.
function readPanel(name) {
  const h = [...document.querySelectorAll('div[role="main"] h1')].find((x) => x.textContent.trim() === name);
  const panel = h && h.closest('div[role="main"]');
  if (!panel) return null;
  const site = panel.querySelector('a[data-item-id="authority"]');
  const ph = panel.querySelector('button[data-item-id^="phone"]');
  const ad = panel.querySelector('button[data-item-id="address"]');
  const clean = (el) => ((el && el.getAttribute("aria-label")) || "").replace(/^[^:]+:\s*/, "").trim();
  return { website: site ? site.href : "", phone: clean(ph), address: clean(ad) };
}

async function fetchDetails(feed) {
  const todo = [...feed.querySelectorAll("a.hfpxzc")].filter((a) => {
    if (details.has(a.href)) return false;
    const r = parseCard(a);
    return !r.website && !r.phone;
  });
  job.phase = "details";
  job.dDone = 0; job.dTotal = todo.length;
  // Safety net: if Maps doesn't handle our synthetic click itself, the browser would follow the
  // link and reload the whole page (killing the run and the data). Block that default action.
  const noNav = (e) => { if (!e.defaultPrevented && e.target.closest && e.target.closest("a.hfpxzc")) e.preventDefault(); };
  window.addEventListener("click", noNav, false);
  try { await openEach(todo); } finally { window.removeEventListener("click", noNav, false); }
  const close = document.querySelector('div[role="main"] button[aria-label="Close"]');
  if (close) close.click();                                 // back to the plain results list
}

async function openEach(todo) {
  for (const a of todo) {
    if (job.stop) break;
    const name = a.getAttribute("aria-label") || "";
    a.scrollIntoView({ block: "center" });
    a.click();
    let got = null, seenAt = 0;
    for (let t = 0; t < 30 && !job.stop; t++) {            // up to ~6 s for the panel
      await sleep(200);
      const r = readPanel(name);
      if (!r) continue;
      got = r;
      if (r.website || r.phone) break;
      seenAt = seenAt || t;
      if (t - seenAt >= 5) break;                          // panel open, nothing to read: give up
    }
    if (got) details.set(a.href, got);
    job.dDone++;
  }
}

async function runJob(maxScrolls, delayMs, wantDetails) {
  const feed = document.querySelector('div[role="feed"]');
  Object.assign(job, { running: true, stop: false, phase: "scroll", scrolls: 0, reason: "", dDone: 0, dTotal: 0 });
  if (!feed) { job.running = false; job.phase = ""; job.reason = "no results panel found"; return; }
  await scrollFeed(feed, maxScrolls, delayMs);
  if (wantDetails && !job.stop) await fetchDetails(feed);
  if (job.stop) job.reason = "stopped";
  job.phase = "";
  job.running = false;
}

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg.type === "start") { runJob(msg.maxScrolls, msg.delayMs || 1500, msg.details); send({ ok: true }); }
  else if (msg.type === "stop") { job.stop = true; send({ ok: true }); }
  else if (msg.type === "status") {
    job.count = document.querySelectorAll('div[role="feed"] a.hfpxzc').length;
    send({ ...job });
  } else if (msg.type === "extract") send({ rows: extract() });
});
})();
