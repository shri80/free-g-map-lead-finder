// Service worker: visits each business website, extracts emails / phones / social links.
// Results are saved in chrome.storage.local ("enrich" map keyed by website URL) so the
// popup can close and reopen without losing anything.

const state = { running: false, stop: false, done: 0, total: 0 };

const JUNK_EMAIL = /(\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$|sentry|wixpress|example\.com|domain\.com|yourdomain|email\.com$|u003e)/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g;

async function fetchText(url, ms = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow" });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !/html|text/i.test(type)) return { html: "", url: r.url };
    return { html: (await r.text()).slice(0, 1_500_000), url: r.url };
  } catch (e) {
    return { html: "", url: url, error: String(e.name || e) };
  } finally {
    clearTimeout(t);
  }
}

function decodeCf(hex) {
  try {
    const k = parseInt(hex.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k);
    return out;
  } catch (e) { return ""; }
}

function parsePage(html, baseUrl) {
  const out = { emails: new Set(), phones: new Set(), facebook: "", linkedin: "", instagram: "", twitter: "", contact: "" };
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].replace(/&amp;/g, "&"));

  for (const h of hrefs) {
    if (/^mailto:/i.test(h)) out.emails.add(decodeURIComponent(h.slice(7).split("?")[0]).trim());
    else if (/^tel:/i.test(h)) out.phones.add(decodeURIComponent(h.slice(4)).trim());
    else {
      let u;
      try { u = new URL(h, baseUrl); } catch (e) { continue; }
      const host = u.hostname.replace(/^www\./, ""), path = u.pathname;
      const clean = u.origin + u.pathname.replace(/\/$/, "");
      if (!out.facebook && /(^|\.)facebook\.com$/.test(host) && !/^\/(sharer|share|tr|plugins|dialog|login|policies)/i.test(path) && path.length > 1) out.facebook = clean;
      else if (!out.linkedin && /(^|\.)linkedin\.com$/.test(host) && /^\/(company|in|school)\//i.test(path)) out.linkedin = clean;
      else if (!out.instagram && /(^|\.)instagram\.com$/.test(host) && path.length > 1 && !/^\/(p|explore|accounts)\//.test(path)) out.instagram = clean;
      else if (!out.twitter && /(^|\.)(twitter|x)\.com$/.test(host) && path.length > 1 && !/^\/(share|intent)/i.test(path)) out.twitter = clean;
      if (!out.contact && /contact/i.test(path + u.search) && u.origin === new URL(baseUrl).origin) out.contact = u.href;
    }
  }
  for (const m of html.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) out.emails.add(decodeCf(m[1]));

  const text = html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0*64;|&commat;|\[at\]|\(at\)/gi, "@")
    .replace(/&nbsp;|&#160;/g, " ");
  for (const e of text.match(EMAIL_RE) || []) out.emails.add(e);
  for (const e of html.match(EMAIL_RE) || []) out.emails.add(e);
  for (const p of text.match(PHONE_RE) || []) out.phones.add(p.trim());
  return out;
}

function normPhone(p) {
  const d = p.replace(/\D/g, "");
  const n = d.length === 11 && d[0] === "1" ? d.slice(1) : d;
  return n.length === 10 ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : "";
}

async function enrichSite(site) {
  const res = { emails: [], phones: [], facebook: "", linkedin: "", instagram: "", twitter: "", contact_page: "", status: "ok" };
  const home = await fetchText(site);
  if (!home.html) return { ...res, status: "fetch failed" + (home.error ? ": " + home.error : "") };
  const pages = [parsePage(home.html, home.url)];
  const contact = pages[0].contact;
  if (contact && contact !== home.url) {
    const c = await fetchText(contact);
    if (c.html) pages.push(parsePage(c.html, c.url));
    res.contact_page = contact;
  }
  const domain = new URL(home.url).hostname.replace(/^www\./, "");
  const emails = new Set(), phones = new Set();
  for (const p of pages) {
    p.emails.forEach((e) => { e = e.toLowerCase(); if (e && !JUNK_EMAIL.test(e)) emails.add(e); });
    p.phones.forEach((x) => { const n = normPhone(x); if (n) phones.add(n); });
    for (const k of ["facebook", "linkedin", "instagram", "twitter"]) if (!res[k] && p[k]) res[k] = p[k];
  }
  // same-domain emails first
  res.emails = [...emails].sort((a, b) => (b.endsWith(domain) ? 1 : 0) - (a.endsWith(domain) ? 1 : 0)).slice(0, 5);
  res.phones = [...phones].slice(0, 5);
  return res;
}

async function runEnrich(sites, force) {
  Object.assign(state, { running: true, stop: false, done: 0, total: sites.length });
  const { enrich = {} } = await chrome.storage.local.get("enrich");
  const queue = sites.filter((s) => force || !enrich[s]);
  state.done = sites.length - queue.length;
  const worker = async () => {
    while (queue.length && !state.stop) {
      const site = queue.shift();
      try { enrich[site] = await enrichSite(site); } catch (e) { enrich[site] = { status: "error: " + e }; }
      state.done++;
      await chrome.storage.local.set({ enrich }); // also keeps the worker alive
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  state.running = false;
}

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg.type === "enrich") {
    if (!state.running) runEnrich([...new Set(msg.sites)], !!msg.force);
    send({ ok: true });
  } else if (msg.type === "enrichStop") { state.stop = true; send({ ok: true }); }
  else if (msg.type === "enrichStatus") send({ ...state });
  else if (msg.type === "enrichClear") chrome.storage.local.remove("enrich").then(() => send({ ok: true }));
  return true;
});
