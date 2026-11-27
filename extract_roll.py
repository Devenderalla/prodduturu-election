#!/usr/bin/env python3
"""
extract_roll.py — turn the scanned SIR draft-roll PDFs into a local roll.json
that the app's volunteer search can load.

RUN THIS ON YOUR OWN MACHINE. The output contains real voter data:
  * roll.json is gitignored and must never be committed or uploaded;
  * the published site never contains it — each device imports it once
    (Settings → Voter roll → Import).

Why this exists: the supplied PDFs are image-only scans (one JPEG per page,
no text layer), so the records have to be OCR'd. Each data page is a 3x10
grid of record boxes; we crop each page into three column strips so OCR keeps
one record's lines together, then parse the roll's fixed field labels.

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

import argparse, glob, io, json, os, re, subprocess, sys, tempfile

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
RE_SERIAL  = re.compile(r'^\s*(\d{1,4})\s*$')
RE_SER_EPIC= re.compile(r'^\s*(\d{1,4})\s+([A-Z]{2,4}\d{6,9})\s*$')
RE_NAME    = re.compile(r'^\s*Name\s*[:;.]\s*(.+?)\s*$', re.I)
RE_REL     = re.compile(r'^\s*(Father|Mother|Husband|Wife|Other)s?\s*Name\s*[:;.]\s*(.+?)\s*$', re.I)
RE_HOUSE   = re.compile(r'House\s*Number\s*[:;.]\s*(\S+)', re.I)
RE_AGE     = re.compile(r'Age\s*[:;#.]?\s*(\d{1,3})', re.I)
RE_GENDER  = re.compile(r'Gender\s*[:;+.]?\s*(Male|Female|Third)', re.I)
RE_SECTION = re.compile(r'Section\s*No\s*and\s*Name\s*[:.]?\s*(.+?)\s*$', re.I)

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


def ocr(tess, img, psm='6'):
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
        img.save(f.name)
        tmp = f.name
    try:
        r = subprocess.run([tess, tmp, '-', '--psm', psm], capture_output=True, text=True)
        return r.stdout
    finally:
        os.unlink(tmp)


def extract_pdf(tess, pdf_path, part, only_pages=None, quiet=False):
    out = []
    for pageno, blob in page_jpegs(pdf_path):
        if only_pages and pageno not in only_pages:
            continue
        img = Image.open(io.BytesIO(blob))
        W, H = img.size

        header = ocr(tess, img.crop((0, 0, W, int(H * 0.040))), psm='6')
        msec = RE_SECTION.search(header)
        section = msec.group(1).strip() if msec else ''

        top, bottom = int(H * 0.030), int(H * 0.975)
        strips = [(0.015, 0.337), (0.337, 0.660), (0.660, 0.990)]

        found = []
        for a, b in strips:
            txt = ocr(tess, img.crop((int(W * a), top, int(W * b), bottom)), psm='6')
            found.extend(parse_strip(txt))

        for r in found:
            r['part'] = str(part)
            if section:
                r['section'] = section
        out.extend(found)
        if not quiet:
            print(f'  part {part} page {pageno:>3}: {len(found):>2} records', file=sys.stderr)
    return out


# ------------------------------------------------------------------ main ---
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default='roll.json')
    ap.add_argument('--pages', help='comma-separated page numbers, for a quick trial')
    ap.add_argument('--sample', type=int, default=0, help='print N parsed records to check quality')
    ap.add_argument('--include-epic', action='store_true', help='keep EPIC numbers (off by default)')
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
        recs = extract_pdf(tess, path, part, only)
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
