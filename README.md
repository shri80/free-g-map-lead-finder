# Free G Map Lead Finder

Chrome extension that reads the business listings in the left panel of a Google Maps search
(visible and hidden fields), and optionally reads each business's own website for emails,
phone numbers and Facebook / LinkedIn / Instagram / X links. Export to CSV.

## Install (no store needed)
1. Download and unzip `free-g-map-lead-finder.zip` to a folder you will keep (do not delete it).
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.
4. Open a Google Maps search, reload the tab once, click the extension icon.

Chrome will show a "Disable developer mode extensions" notice on start-up. That notice appears for
every extension loaded this way and is normal.

## How to use
1. Search on Google Maps (for example "plumber in new jersey") so the results list shows on the left.
2. Click the extension icon. In **1 · Collect listings** set **Max scrolls** (0 = scroll to the end of the list) and press **Start**. **Stop** ends it any time. Closing the popup does not stop it.
3. When scrolling finishes the table fills in. Use **Extract now** to grab whatever is loaded at any moment.
4. Optional: in **2 · Enrich from websites** press **Get emails, phones & social**. Chrome asks once for permission to read the business websites.
5. Filter, sort, then **Download CSV** or **Copy JSON**. Orange columns are data that is not visible on the Maps card.

## How it works
- `content.js` runs on the Maps page. It scrolls the results panel to load more listings and reads each card.
  Visible fields (name, rating, category, address, hours, phone) come from the card text.
  Hidden fields (website, booking link, coordinates, place ID, CID, accessibility) come from the card's links and attributes.
- `background.js` (only after you click the enrich button) downloads each business's homepage and its contact page,
  then parses them for `mailto:` and `tel:` links, emails and phone numbers in the text, and Facebook, LinkedIn,
  Instagram and X links. Results are cached in `chrome.storage.local`.
- `popup.html` / `popup.js` is the interface: progress, table, search, sort and CSV / JSON export.

Limits: sites that block automated requests or render everything with JavaScript may return no contacts.
A website cannot tell mobile from landline, so numbers are listed as "site phones". Google may change the Maps page layout,
which can break field extraction until the selectors are updated.

## What it does and does not do
- Runs 100% in your browser. There is **no server, no analytics, no tracking, no account**.
- Nothing is uploaded anywhere. Results stay in the popup and in `chrome.storage.local` on your machine.
- No remote code is downloaded or executed. All code is in the 5 readable files in this folder.

## Permissions, in plain words
| Permission | Why |
|---|---|
| Access to `google.com/maps` pages | Read the listings panel on the page you are viewing. |
| `activeTab` | Talk to the current tab when you click the icon. |
| `storage` | Remember website results so they survive closing the popup. |
| Access to all websites (**optional**) | Asked **only** when you click "Get emails, phones & social", to download each business's public website. You can decline and still use step 1. |

## Verify it yourself
Files: `manifest.json`, `content.js`, `background.js`, `popup.html`, `popup.js`.
`background.js` contains the only `fetch()` calls, and they go only to the business websites listed in your results.
SHA-256 of the zip is published next to the download.

## Responsible use
You are responsible for how you use the data. Google Maps' Terms of Service restrict automated scraping,
and email / phone outreach is regulated (CAN-SPAM, TCPA, GDPR and local laws). Use small volumes and
respect opt-outs. Provided "as is", without warranty.
