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
