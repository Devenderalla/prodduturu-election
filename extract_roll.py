#!/usr/bin/env python3
"""
extract_roll.py — turn the scanned SIR draft-roll PDFs into a local roll.json
that the app's volunteer search can load.

RUN THIS ON YOUR OWN MACHINE. The output contains real voter data:
  * roll.json is gitignored and must never be committed or uploaded;
  * the published site never contains it — each device imports it once
    (Settings → Voter roll → Import).

Why this exists: the supplied PDFs are image-only scans (one JPEG per page,
no text layer), so the records have to be OCR'd.

How it works, and why it is built this way:
  * Each record box is found by its EPIC code, an unmistakable pattern. A
    fixed row grid does not work - rows grow taller whenever a name wraps
    onto a second line, which silently knocks the grid out of alignment.
  * Each box is then OCR'd on its own, so one record's lines stay together.
  * Serial numbers are NOT trusted from any single reading. The roll numbers
    row-major across three columns, so column c's i-th box holds
    base + 3i + c. Every serial OCR did read is a vote for the page's base,
    and the majority wins - which repairs misreads instead of trusting them.
  * A box whose EPIC went undetected is recovered from the row pitch, since
    otherwise every serial below it in that column would shift by three.

NOT extracted, on purpose: the EPIC (voter-ID) number. A volunteer helping
someone find their polling part needs name → serial + part; the ID number
adds nothing to that and is the most sensitive field on the page. Pass
--include-epic only if you have a real reason.

Usage
-----
    python3 extract_roll.py --out roll.json

    # try a few pages first and eyeball the result
    python3 extract_roll.py --pages 5,6 --sample 10

Requirements (already installed on this machine, no root needed):
    tesseract  — /home/devendhar/.local/bin/tesseract-local
    Pillow     — via /home/devendhar/.local/bin/ocr-env.sh

If you move this to another machine:
    sudo apt install tesseract-ocr python3-pil
"""

import argparse, csv, glob, io, json, os, re, subprocess, sys, tempfile

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow missing. Run:  . ~/.local/bin/ocr-env.sh   (or: sudo apt install python3-pil)")


def find_tesseract():
    for cand in ('/home/devendhar/.local/bin/tesseract-local', 'tesseract'):
        try:
            subprocess.run([cand, '--version'], capture_output=True, check=True)
            return cand
        except Exception:
            continue
    sys.exit("tesseract not found. Run:  . ~/.local/bin/ocr-env.sh   (or: sudo apt install tesseract-ocr)")


# ---------------------------------------------------------------- parsing --
# The label separator is a colon on the page, but OCR renders it as ?, ;, +,
# * or # often enough that pinning it to ':' silently drops whole records.
SEP = r'[\s:;.?!,*|+#=-]{0,4}'

RE_SERIAL  = re.compile(r'^\s*(\d{1,4})\s*$')
RE_SER_EPIC= re.compile(r'^\s*(\d{1,4})\s+([A-Z]{2,4}\d{6,9})\s*$')
RE_NAME    = re.compile(r'^\s*Name' + SEP + r'(.+?)\s*$', re.I)
RE_REL     = re.compile(r'^\s*(Father|Mother|Husband|Wife|Other)s?\s*Name' + SEP + r'(.+?)\s*$', re.I)
RE_HOUSE   = re.compile(r'House\s*Number' + SEP + r'(\S+)', re.I)
RE_AGE     = re.compile(r'Age' + SEP + r'(\d{1,3})', re.I)
RE_GENDER  = re.compile(r'Gender' + SEP + r'(Male|Female|Third)', re.I)
RE_SECTION = re.compile(r'Section\s*No\s*and\s*Name\s*[:.]?\s*(.+?)\s*$', re.I)
RE_EPIC_TOK= re.compile(r'^[A-Z]{2,4}[0-9]{6,9}$')

# Each record box carries an EPIC code at its top-right. That code is a far more
# reliable landmark than a fixed grid: row heights vary whenever a name wraps
# onto a second line, which silently knocks a fixed grid out of alignment.
COL_BOUNDS = [(0.015, 0.337), (0.337, 0.660), (0.660, 0.990)]

NOISE = ('photo', 'available', 'name', 'house', 'age', 'gender', 'assembly', 'section', 'part')


def clean_name(s):
    """Tesseract renders a trailing capital I as | or ! in this typeface."""
    s = s.replace('|', 'I').replace('!', 'I')
    s = re.sub(r'\b(Photo|Available)\b.*$', '', s, flags=re.I)
    s = re.sub(r"[^A-Za-z .'-]", ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return ' '.join(w.capitalize() if w.isupper() or w.islower() else w for w in s.split())


def parse_strip(text):
    """One column strip holds up to 10 records, read top to bottom."""
    records, cur = [], None

    def flush():
        nonlocal cur
        if cur and cur.get('name') and cur.get('serial') is not None:
            cur.pop('_last', None)
            records.append(cur)
        cur = None

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue

        m = RE_SER_EPIC.match(line) or RE_SERIAL.match(line)
        if m and not line.lower().startswith(NOISE):
            flush()
            cur = {'serial': int(m.group(1))}
            if m.re is RE_SER_EPIC:
                cur['_epic'] = m.group(2)
            continue

        if cur is None:
            continue

        mrel = RE_REL.match(line)
        if mrel:
            cur['relType'] = mrel.group(1).capitalize()
            cur['relName'] = clean_name(mrel.group(2))
            cur['_last'] = 'relName'
            continue

        mname = RE_NAME.match(line)
        if mname and 'name' not in cur:
            cur['name'] = clean_name(mname.group(1))
            cur['_last'] = 'name'
            continue

        mh = RE_HOUSE.search(line)
        if mh:
            cur['house'] = mh.group(1).strip('.,')
        ma = RE_AGE.search(line)
        if ma:
            cur['age'] = int(ma.group(1))
        mg = RE_GENDER.search(line)
        if mg:
            cur['gender'] = mg.group(1).capitalize()

        # A long name wraps onto its own line; append it to whichever field
        # was filled last (the roll wraps both voter and relation names).
        last = cur.get('_last')
        if (last and not mh and not ma and not mg
                and re.fullmatch(r"[A-Za-z .'|!-]+(\s+(Photo|Available))?", line, re.I)
                and not line.lower().startswith(NOISE)):
            cur[last] = clean_name(cur[last] + ' ' + line)

    flush()
    return records


# ------------------------------------------------------------------- OCR ---
def page_jpegs(pdf_path):
    data = open(pdf_path, 'rb').read()
    for i, m in enumerate(re.finditer(rb'\xff\xd8\xff', data)):
        s = m.start()
        e = data.find(b'\xff\xd9', s)
        if e > s:
            yield i + 1, data[s:e + 2]


def ocr(tess, img, psm='6', whitelist=None):
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
        img.save(f.name)
        tmp = f.name
    try:
        cmd = [tess, tmp, '-', '--psm', psm]
        if whitelist:
            cmd += ['-c', 'tessedit_char_whitelist=' + whitelist]
        r = subprocess.run(cmd, capture_output=True, text=True)
        return r.stdout
    finally:
        os.unlink(tmp)


def tsv_words(tess, img):
    """Word boxes for a whole page. Used only to locate the serial/EPIC line."""
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
        img.save(f.name)
        tmp = f.name
    base = tmp[:-4]
    try:
        subprocess.run([tess, tmp, base, 'tsv', '--psm', '11'], capture_output=True)
        with open(base + '.tsv', newline='') as fh:
            rows = list(csv.DictReader(fh, delimiter='\t', quoting=csv.QUOTE_NONE))
        return [r for r in rows if (r.get('text') or '').strip()]
    except Exception:
        return []
    finally:
        for f2 in (tmp, base + '.tsv'):
            if os.path.exists(f2):
                os.unlink(f2)


def page_anchors(tess, img, W):
    """Locate every record box on a page and the serial printed in it.

    Each box carries its serial at top-left and an EPIC code at top-right on
    the same line. The EPIC pattern is unmistakable, so it is the landmark;
    a fixed row grid is not usable because row heights grow whenever a name
    wraps onto a second line.

    Both x-bounds matter when pairing: records in the same row share a y
    across all three columns, so the serial must also sit inside this
    column's own x-range.
    """
    words = tsv_words(tess, img)
    nums = []
    for w in words:
        t = w['text'].strip()
        if re.fullmatch(r'[0-9]{1,4}', t):
            try:
                nums.append((int(w['left']), int(w['top']), int(t)))
            except (ValueError, KeyError):
                pass

    anchors = {0: [], 1: [], 2: []}
    for w in words:
        if not RE_EPIC_TOK.match(w['text'].strip()):
            continue
        try:
            ex, ey = int(w['left']), int(w['top'])
        except (ValueError, KeyError):
            continue
        col = 0 if ex < W * 0.34 else (1 if ex < W * 0.66 else 2)
        cx0 = W * COL_BOUNDS[col][0]
        colw = W * (COL_BOUNDS[col][1] - COL_BOUNDS[col][0])
        # The serial box sits at a consistent offset into each column
        # (~30% of its width). Anchoring on that, rather than "leftmost
        # number on the line", stops house numbers being read as serials.
        want_x = cx0 + 0.30 * colw
        cands = [(abs(x - want_x), v) for (x, y, v) in nums
                 if abs(x - want_x) <= 0.14 * colw and abs(y - ey) <= 15 and x < ex]
        serial = min(cands)[1] if cands else None
        anchors[col].append((ey, serial))
    return anchors


def fill_anchor_gaps(anchors):
    """Reconstruct the full 3-column grid of record boxes for a page.

    Boxes are found by their EPIC code, but OCR misses one occasionally.
    That matters beyond the lost row: serials are derived from a box's index
    within its column, so an undetected box shifts every serial below it.

    Detected boxes are clustered into rows by their y position, and any
    column with no box on a row gets a placeholder. A placeholder that turns
    out to be empty - the tail of the final row, say - yields no fields when
    OCR'd and is dropped, so over-filling is self-correcting while a missing
    box is not.
    """
    all_y = sorted(y for col in (0, 1, 2) for (y, _) in anchors[col])
    if len(all_y) < 4:
        return anchors, 0

    per_col_gaps = []
    for col in (0, 1, 2):
        ys = sorted(y for (y, _) in anchors[col])
        per_col_gaps += [ys[i + 1] - ys[i] for i in range(len(ys) - 1)]
    if not per_col_gaps:
        return anchors, 0
    per_col_gaps.sort()
    pitch = per_col_gaps[len(per_col_gaps) // 2]
    if pitch <= 0:
        return anchors, 0

    # cluster the y positions into rows
    tol = pitch * 0.45
    rows = []
    for y in all_y:
        if rows and y - rows[-1][-1] <= tol:
            rows[-1].append(y)
        else:
            rows.append([y])

    # a row may itself be missing entirely between two detected rows
    row_y = [sum(r) // len(r) for r in rows]
    filled_rows = [row_y[0]]
    for i in range(len(row_y) - 1):
        gap = row_y[i + 1] - row_y[i]
        extra = int(round(gap / float(pitch))) - 1
        for k in range(1, min(extra, 3) + 1):
            filled_rows.append(row_y[i] + int(pitch * k))
        filled_rows.append(row_y[i + 1])

    inserted = 0
    for col in (0, 1, 2):
        known = sorted(anchors[col])
        rebuilt = []
        for ry in filled_rows:
            match = [(y, sv) for (y, sv) in known if abs(y - ry) <= tol]
            if match:
                rebuilt.append(match[0])
            else:
                rebuilt.append((ry, None))
                inserted += 1
        anchors[col] = rebuilt
    return anchors, inserted


def solve_serials(anchors):
    """Derive every serial on the page from the grid, not from each box.

    The roll numbers row-major across three columns, so within one column
    consecutive boxes differ by exactly 3: column c's i-th box holds
    base + 3i + c. Every serial OCR did read is therefore a vote for the
    page's base number. Taking the majority fixes boxes whose serial was
    misread or not found at all, and is self-correcting rather than
    trusting any single reading.
    """
    votes = {}
    for col in (0, 1, 2):
        for i, (y, serial) in enumerate(sorted(anchors[col])):
            if serial is not None:
                b = serial - 3 * i - col
                votes[b] = votes.get(b, 0) + 1
    if not votes:
        return anchors, 0

    base = max(votes.items(), key=lambda kv: kv[1])[0]
    out, corrected = {0: [], 1: [], 2: []}, 0
    for col in (0, 1, 2):
        for i, (y, serial) in enumerate(sorted(anchors[col])):
            derived = base + 3 * i + col
            if serial != derived:
                corrected += 1
            out[col].append((y, derived))
    return out, corrected


def extract_pdf(tess, pdf_path, part, only_pages=None, quiet=False, debug=False):
    out = []
    last_section = ['']
    for pageno, blob in page_jpegs(pdf_path):
        if only_pages and pageno not in only_pages:
            continue
        img = Image.open(io.BytesIO(blob))
        W, H = img.size

        header = ocr(tess, img.crop((0, 0, W, int(H * 0.055))), psm='6')
        msec = RE_SECTION.search(header)
        if msec:
            section = msec.group(1).strip()
            last_section[0] = section
        else:
            # sections run across several pages and the header does not always
            # survive OCR; carry the last one forward rather than leaving blanks
            section = last_section[0]

        anchors = page_anchors(tess, img, W)
        boxes = sum(len(v) for v in anchors.values())
        anchors, inserted = fill_anchor_gaps(anchors)
        anchors, corrected = solve_serials(anchors)

        found, failed = [], []
        for col in (0, 1, 2):
            entries = sorted(anchors[col])
            x0, x1 = COL_BOUNDS[col]
            for i, (y, serial) in enumerate(entries):
                top = max(0, y - 22)
                bottom = (entries[i + 1][0] - 22) if i + 1 < len(entries) else int(H * 0.975)
                if bottom - top < 40:
                    continue
                cell = img.crop((int(W * x0), top, int(W * x1), bottom))

                # psm 6 reads the label lines most accurately, but a box that
                # defeats it often yields to a different segmentation mode.
                rec = None
                for psm in ('6', '4', '11'):
                    body = parse_strip('0\n' + ocr(tess, cell, psm=psm))
                    if body and body[0].get('name'):
                        rec = body[0]
                        break
                if rec is None:
                    failed.append((col, y, 'no fields'))
                    continue
                if serial is None:
                    failed.append((col, y, 'no serial'))
                    continue
                rec['serial'] = serial
                rec['part'] = str(part)
                if section:
                    rec['section'] = section
                found.append(rec)

        out.extend(found)
        if not quiet:
            ser = sorted(r['serial'] for r in found)
            span = '%d-%d' % (ser[0], ser[-1]) if ser else '-'
            gaps = [a for a in range(ser[0], ser[-1] + 1) if a not in ser] if ser else []
            expected = boxes + inserted
            flag = '' if len(found) == expected else '   <-- %d unparsed' % (expected - len(found))
            if corrected:
                flag += '  [%d serial(s) derived from grid]' % corrected
            if inserted:
                flag += '  [%d box(es) recovered from row pitch]' % inserted
            print('  part %s page %3d: %2d records (%d boxes) serials %s%s%s'
                  % (part, pageno, len(found), boxes, span,
                     ' MISSING %s' % gaps if gaps else '', flag), file=sys.stderr)
            if debug:
                for (c, y, why) in failed:
                    print('    [debug] col%d y=%d FAIL (%s)' % (c, y, why), file=sys.stderr)
    return out


# ------------------------------------------------------------------ main ---
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default='roll.json')
    ap.add_argument('--pages', help='comma-separated page numbers, for a quick trial')
    ap.add_argument('--sample', type=int, default=0, help='print N parsed records to check quality')
    ap.add_argument('--include-epic', action='store_true', help='keep EPIC numbers (off by default)')
    ap.add_argument('--debug', action='store_true',
                    help='report the structure of boxes that fail to parse (no personal data printed)')
    args = ap.parse_args()

    tess = find_tesseract()
    only = set(int(x) for x in args.pages.split(',')) if args.pages else None

    pdfs = []
    for pat, part, expected in (('*ENG-235*.pdf', '235', 1096), ('*ENG-236*.pdf', '236', 1018)):
        hits = sorted(glob.glob(pat))
        if not hits:
            print(f'! no PDF matching {pat} in this directory', file=sys.stderr)
            continue
        pdfs.append((hits[0], part, expected))
    if not pdfs:
        sys.exit('No roll PDFs found. Run this inside the folder holding the two PDFs.')

    all_recs = []
    for path, part, expected in pdfs:
        print(f'\n{os.path.basename(path)}  (part {part})', file=sys.stderr)
        recs = extract_pdf(tess, path, part, only, debug=args.debug)
        all_recs.extend(recs)

        serials = sorted(r['serial'] for r in recs)
        dupes = sorted({s for s in serials if serials.count(s) > 1})
        print(f'  -> {len(recs)} records, serials {serials[0] if serials else "-"}'
              f'..{serials[-1] if serials else "-"}', file=sys.stderr)
        if not only:
            missing = sorted(set(range(1, expected + 1)) - set(serials))
            print(f'  -> expected {expected}; missing {len(missing)}'
                  + (f' e.g. {missing[:10]}' if missing else ''), file=sys.stderr)
            if dupes:
                print(f'  -> DUPLICATE serials: {dupes[:10]}', file=sys.stderr)

    if not args.include_epic:
        for r in all_recs:
            r.pop('_epic', None)
    else:
        for r in all_recs:
            if '_epic' in r:
                r['epic'] = r.pop('_epic')

    if args.sample:
        print('\n--- sample (check these against the PDF) ---', file=sys.stderr)
        for r in all_recs[:args.sample]:
            print(f"  {r['part']}/{r['serial']:<5} {r.get('name','?'):<32}"
                  f" {r.get('relType','')} {r.get('relName','')} | {r.get('house','')}"
                  f" | {r.get('age','')} {r.get('gender','')}", file=sys.stderr)

    payload = {
        'generatedAt': __import__('datetime').datetime.now().isoformat(timespec='seconds'),
        'source': 'SIR 2026 draft electoral roll, AC 78-Penamaluru, parts 235 & 236',
        'includesEpic': bool(args.include_epic),
        'count': len(all_recs),
        'records': sorted(all_recs, key=lambda r: (r['part'], r['serial'])),
    }
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False)
    size = os.path.getsize(args.out) / 1024
    print(f'\nWrote {args.out}: {len(all_recs)} records, {size:.0f} KB', file=sys.stderr)
    print('This file contains real voter data. Do NOT commit or upload it.', file=sys.stderr)


if __name__ == '__main__':
    main()
