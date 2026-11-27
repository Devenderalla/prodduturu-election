# Prodduturu Election Analytics

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

## 7. Scope and deliberate limits

This app models **aggregate** election statistics only. It does **not** contain, and is not
built to contain:

- individual political-support or "which way will they vote" classifications;
- any link between a payment and a voter, or between an expense and voting behaviour;
- per-voter tracking of who has or has not voted.

The volunteer search operates on **48 fictional demonstration records** in
`js/data/demo-voters.js`. They are invented. No real electoral roll is loaded into the app
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
