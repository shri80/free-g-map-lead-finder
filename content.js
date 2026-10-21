// Extracts business listings from the Google Maps left results panel.
// "Visible" = text shown on the card. "Hidden" = data only present in attributes/URLs.

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

  return {
    name,
    rating: rm ? rm[1] : "",
    reviews: rm ? rm[2].replace(/,/g, "") : "",
    category: parts[0] || "",
    address: parts.slice(1).join(", "),
    hours,
    phone,
    website,
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
const job = { running: false, stop: false, scrolls: 0, count: 0, reason: "" };

async function runJob(maxScrolls, delayMs) {
  const feed = document.querySelector('div[role="feed"]');
  Object.assign(job, { running: true, stop: false, scrolls: 0, reason: "" });
  if (!feed) { job.running = false; job.reason = "no results panel found"; return; }
  let last = -1, stable = 0;
  while (!job.stop) {
    if (maxScrolls > 0 && job.scrolls >= maxScrolls) { job.reason = "reached max scrolls"; break; }
    feed.scrollTo(0, feed.scrollHeight);
    job.scrolls++;
    await new Promise((r) => setTimeout(r, delayMs));
    const n = feed.querySelectorAll("a.hfpxzc").length;
    job.count = n;
    if (/reached the end of the list/i.test(feed.innerText)) { job.reason = "end of list"; break; }
    stable = n === last ? stable + 1 : 0;
    last = n;
    if (stable >= 4) { job.reason = "no new results"; break; }
  }
  if (job.stop) job.reason = "stopped";
  job.running = false;
}

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg.type === "start") { runJob(msg.maxScrolls, msg.delayMs || 1500); send({ ok: true }); }
  else if (msg.type === "stop") { job.stop = true; send({ ok: true }); }
  else if (msg.type === "status") {
    job.count = document.querySelectorAll('div[role="feed"] a.hfpxzc').length;
    send({ ...job });
  } else if (msg.type === "extract") send({ rows: extract() });
});
