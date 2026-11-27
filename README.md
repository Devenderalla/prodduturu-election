# Prodduturu Election Analytics

### ▶ Live: https://devenderalla.github.io/prodduturu-election/

Open on any phone, any network. No sign-in. Add it to the home screen and it keeps
working with the network off.

Mobile-first, offline-capable election analytics for the **village president (Sarpanch)
election** in **Prodduturu village, Kankipadu Mandal, Andhra Pradesh**.

Plain HTML, CSS and JavaScript. No build step, no framework, no CDN, no server.
It runs from a phone browser and keeps every figure in local device storage.

---

## 1. Quick start

### Option A — open the file directly (fastest)

Open `index.html` in a browser. Everything works except the service worker
(installable/offline caching), which browsers only allow on `http(s)://`.

### Option B — serve locally (recommended; needed for PWA + phone testing)

```bash
cd prodduturu_election
python3 -m http.server 8080
# then open http://localhost:8080
```

Any static server works (`npx serve`, `php -S localhost:8080`, nginx, GitHub Pages…).

---

## 2. Testing on a phone

1. Put the laptop and the phone on the **same Wi-Fi**.
2. Start the server as above and find the laptop's LAN IP:
   ```bash
   hostname -I | awk '{print $1}'      # e.g. 192.168.1.14
   ```
3. On the phone open `http://192.168.1.14:8080`.
4. **Install it**: Chrome → ⋮ → *Add to Home screen*; Safari → Share → *Add to Home Screen*.
   It then opens full-screen with its own icon and works with the network off.

> Service workers require `https://` or `localhost`. Over a plain LAN IP the app still
> runs, but offline caching and install may be unavailable. For real offline use on
> volunteers' phones, host it over HTTPS (GitHub Pages, Netlify, Cloudflare Pages are
> all sufficient — it is a static site).

**Developing?** The service worker is cache-first, so an edited file may not appear.
Bump `CACHE` in `sw.js` (`prodduturu-election-v1.0.1` → `v1.0.2`), or in DevTools use
*Application → Service Workers → Unregister* and hard-reload.

---

### Option C — the live site (what volunteers use)

**https://devenderalla.github.io/prodduturu-election/** — served by GitHub Pages from
`main` at the repository root. Push to `main` and the site redeploys in under a minute.

Because the service worker is served too, a phone that has opened the link once keeps
working offline. After deploying a change, bump `CACHE` in `sw.js` or phones will keep
serving the previous version from their cache.

### Option D — artifact build (alternative host)

`web/index.html` is a single-page build for hosts that supply their own document
shell. Regenerate it after any edit to `index.html` or `css/styles.css`:

```bash
python3 build-web.py
```

It inlines the stylesheet and keeps the JS files at their existing paths, so the same
`js/` tree is published alongside it. The hosted build has **no service worker**, so it
needs a connection; the local copy (Options A/B) is the offline-capable one.

---

## 3. Modules

Bottom navigation, seven modules:

| Module | What it does |
|---|---|
| **Dashboard** | Registered voters, expected absentees, expected turnout + %, actual aggregate turnout, remaining turnout, valid votes, rejected votes, part-wise totals, donut + progress bars. |
| **Voter Search Demo** | Volunteer-facing read-only search over **fictional** demonstration records. Name (English/Telugu) or serial number; shows serial, polling part, and ward **only when verified**. |
| **Turnout** | Cumulative hourly readings per polling part, trend line, expected-vs-actual comparison, part-wise statistics, validated entry. |
| **Analytics** | Historical turnout comparison, historical results, hypothetical turnout scenarios, aggregate statistical uncertainty, configurable assumptions. |
| **Results** | Four candidates: name, symbol, officially reported votes, vote share, comparison chart, valid/rejected totals, reported leading margin, counting progress, result status. |
| **Expenses** | Lawful campaign expenditure register: category, description, amount, date, receipt reference, authorised vendor/staff, category chart, CSV export. |
| **Settings** | Election configuration, roll parts, candidates, language/theme, admin PIN, JSON backup/restore, CSV reports, reset, future-phase list. |

---

## 4. Election figures as shipped

All roll figures below were read off the **SUMMARY OF ELECTORS** page of each supplied
draft-roll PDF (Assembly Constituency **78-Penamaluru**, *Draft Electoral Roll of Special
Intensive Revision, 2026*, age as on 01-07-2026, published 31-07-2026):

| Part | Male | Female | Third gender | **Total** |
|---|---|---|---|---|
| Part 235 | 522 | 574 | 0 | **1,096** |
| Part 236 | 490 | 528 | 0 | **1,018** |
| **Total** | **1,012** | **1,102** | **0** | **2,114** |

| Figure | Value | Where to change |
|---|---|---|
| Original estimated voters | 2,700 | Settings → Election configuration |
| Draft roll total | **2,114** | derived from the parts below |
| Part 235 | 1,096 | Settings → Electoral-roll parts |
| Part 236 | 1,018 | Settings → Electoral-roll parts |
| Expected absentees | 300 (editable) | Settings → Election configuration |
| Final official voter count | not set | Settings → Election configuration |
| Candidates | 4; candidate 1 symbol **Scissors**, rest configurable | Results → Edit candidates |

Until a final official count is entered **and** "use official count" is set to Yes, every
calculation uses the draft roll total (2,114).

### The arithmetic

```
expected turnout      = registered voters − expected absentees      (2,114 − 300 = 1,814)
expected turnout %    = expected turnout / registered × 100         (85.8 %)
actual turnout        = sum of the latest cumulative reading across parts
actual turnout %      = actual turnout / registered × 100
remaining turnout     = expected turnout − actual turnout
vote share %          = candidate votes / total valid votes × 100
counting progress %   = (valid + rejected) / actual turnout × 100
margin of error (95%) = 1.96 × √(p(1−p)/n) × 100
```

---

## 5. Volunteer mode vs admin mode

- **Volunteer mode** (default) — read-only. Dashboard, demo search, charts. No editing.
- **Admin mode** — all data entry: turnout readings, candidate votes, expenses, settings.

Toggle with the person icon in the header. An optional **device PIN**
(Settings → Admin PIN) gates the switch.

> **The PIN is a convenience lock on one device, not security.** It stops a volunteer
> casually tapping into admin mode. Anyone with the phone's browser tools can bypass it,
> because all code and data are on the device. Real multi-user access control needs a
> server — see *Future phases*, which is why the brief asks for authentication to be
> implemented separately rather than as a front-end mode switch.

---

## 6. Storage, backup, and the per-device caveat

Data is saved automatically to **IndexedDB**, falling back to **localStorage**, then to
memory. The engine in use is shown in the header and in Settings.

> ### Separate devices keep separate databases
> Everything lives in this browser on this device. Another phone running this app has its
> own independent database. **Figures do not sync between devices** unless a shared backend
> is added in a future phase. Move data with JSON backup export/import, and always export a
> backup before clearing browser data or reinstalling.

- **Export JSON backup** — full snapshot. *The admin PIN is deliberately excluded.*
- **Import JSON backup** — replaces everything on the device, after confirmation.
- **Export CSV reports** — one file with aggregate figures, parts, candidates, hourly
  turnout, expenses and historical elections.
- **Export expense CSV** — the expenditure register alone.
- **Reset all data** — restores the starting configuration, after confirmation.

---

## 6b. Loading the real electoral roll (optional, stays on your device)

Out of the box the volunteer search uses 48 fictional records. To search the **real**
draft roll, generate `roll.json` on your own machine and import it into each phone.

**The roll must never go into this repository or onto the public site.** It holds names,
relatives' names, house numbers and ages for ~2,114 people. Electoral rolls are supplied to
candidates for election use, not for publication, and this repo is public. `roll.json` is
listed in `.gitignore` — keep it that way.

### 1. Generate it

Put the two draft-roll PDFs in this folder and run:

```bash
. ~/.local/bin/ocr-env.sh        # tesseract + Pillow (already installed here, no root)
python3 extract_roll.py --out roll.json
```

The PDFs are image-only scans, so this OCRs all 83 pages — expect roughly 10 minutes. The
script reports, per page, how many records it found and **which serial numbers are missing**,
so you can see at a glance whether a page read cleanly. Expected totals: 1,096 for part 235
and 1,018 for part 236.

How it gets the numbering right (this took some doing):

- Each record box is located by its **EPIC code**, an unmistakable pattern. A fixed row grid
  does not work — rows grow taller whenever a name wraps to a second line, and the grid
  silently drifts out of alignment a third of the way down the page.
- **Serial numbers are never trusted from a single reading.** The roll numbers row-major
  across three columns, so column *c*'s *i*-th box holds `base + 3i + c`. Every serial OCR
  managed to read is a vote for the page's base number, and the majority wins. That repairs
  misreads rather than trusting them — early versions produced serials like `4` and `1212`
  by reading a house number or an age instead.
- A box whose EPIC went undetected is **recovered from the row pitch**, because otherwise
  every serial below it in that column would shift by three.

Verified on four sample pages: 30/30 records per page, serial runs exactly 61–90 and 91–120
with no gaps, 7/7 records matching the scan field-for-field, and every field populated on all
120 records.

Check a few before trusting it:

```bash
python3 extract_roll.py --pages 5,6 --sample 10   # quick trial on two pages
```

Compare those rows against the PDF. OCR on this typeface is good but not perfect — a trailing
capital `I` can come through as `|`, which the script already corrects. Anything still wrong
can be hand-edited in `roll.json`.

**EPIC (voter-ID) numbers are deliberately excluded.** A volunteer needs name → serial + part
to tell someone where to vote; the ID number adds nothing to that and is the most sensitive
field on the page. `--include-epic` exists but think before using it.

### 2. Import it on each phone

Open the app → **Settings → Voter roll → Import roll.json**. The search switches to the real
roll immediately, the header stops saying "Demo", and the banner turns green.

Share `roll.json` with volunteers **directly** — WhatsApp, USB, a private transfer. Never post
it anywhere public.

### What this guarantees

- The roll is stored under its own database key, so **JSON state backups never contain it**
  (verified: a full backup with a 2,114-record roll loaded is ~1.3 KB and holds no voter data).
- The roll never reaches the published website; each device holds its own copy.
- Removing it is one tap: **Settings → Voter roll → Remove roll from this device**.
- With no roll imported, everything falls back to the fictional demo records.

---

## 7. Scope and deliberate limits

This app models **aggregate** election statistics only. It does **not** contain, and is not
built to contain:

- individual political-support or "which way will they vote" classifications;
- any link between a payment and a voter, or between an expense and voting behaviour;
- per-voter tracking of who has or has not voted.

The volunteer search operates on **48 fictional demonstration records** in
`js/data/demo-voters.js` unless a real roll is imported locally (see section 6b). They are
invented. No real electoral roll is loaded into the app
in this phase, and the supplied draft-roll PDFs are excluded from version control by
`.gitignore` because they contain real voter personal data.

**About the supplied PDFs.** Both are *scanned images* — 42 and 41 pages, one JPEG per
page, with no embedded text layer at all. Only the aggregate summary figures above were
taken from them (counts, constituency, publication dates); no elector record was read into
the app. Turning the scans into searchable records would require genuine OCR of ~83 scanned
pages, which is exactly the work the brief defers to a future phase.

Analytics scenarios are labelled **HYPOTHETICAL** and are plain arithmetic on assumptions
the user types in. They are never attributed to a candidate, so the module cannot and does
not output a winner prediction. The Results module stores only counts that have been
officially reported at the counting centre.

---

## 8. Project layout

```
index.html                 app shell: header, nav, modal, toast host
manifest.webmanifest       PWA manifest
sw.js                      service worker (cache-first offline shell)
css/styles.css             design tokens, light/dark, components
icons/icon.svg             app icon
js/
  i18n.js                  English + Telugu dictionaries (282 keys each)
  db.js                    IndexedDB → localStorage → memory
  state.js                 defaults, hydration, derived statistics, persistence
  charts.js                dependency-free SVG donut/bar/line/progress
  ui.js                    toasts, dialogs, formatting, CSV/JSON download, PIN hashing
  app.js                   boot, router, mode/theme/language
  data/demo-voters.js      fictional demonstration records
  views/                   one file per module
```

**Adding a module** — drop `js/views/<name>.js` exporting
`App.views.<name> = { titleKey, render(root) }`, add it to `ROUTES` in `app.js`, add a
nav button in `index.html`, and list the file in `sw.js`.

---

## 9. Future phases (not implemented)

Listed in Settings and marked *FUTURE PHASE*: OCR for aggregate document statistics,
anonymised document-processing demo, secure team authentication, cloud database,
real-time aggregate synchronisation, role-based permissions, audit logs, packaged
installable PWA. The module boundaries above are what make each addable without a rewrite.

---

## 10. Verified

Rendered in Chrome 157 at 360×740 and 390×844:

- all seven screens render with **zero console errors**, in English and Telugu;
- **no horizontal scrolling** on any screen at 360px;
- turnout 420 + 395 → 815 aggregate, remaining 999, 38.6% — correct;
- votes 312/255/140/88 → 795 valid, 57 margin, shares 39.2/32.1/17.6/11.1% — correct;
- validation blocks counts above a part's ceiling and cumulative counts that go backwards;
- expense entry, category chart and totals correct;
- JSON backup → reset → restore round-trips every figure exactly;
- part gender counts sum exactly to the part totals and to 2,114;
- backups written before the gender fields existed still import cleanly.
