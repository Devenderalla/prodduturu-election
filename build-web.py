#!/usr/bin/env python3
"""Regenerate web/index.html for hosted deployment.

The Claude artifact host (and some static hosts) supply their own
<!doctype>/<html>/<head>/<body>, so the hosted page must be body-content
only, with the stylesheet inlined. Run this after editing index.html or
css/styles.css, then republish.

    python3 build-web.py
"""
import pathlib

root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'css' / 'styles.css').read_text(encoding='utf-8')

body = html.split('<body>', 1)[1].rsplit('</body>', 1)[0]

out = (
    '<title>Prodduturu Election Analytics</title>\n'
    '<style>\n' + css + '\n</style>\n'
    + body.strip() + '\n'
)

target = root / 'web' / 'index.html'
target.parent.mkdir(exist_ok=True)
target.write_text(out, encoding='utf-8')

assert '<body' not in out.lower() and '<head>' not in out.lower()
print(f'wrote {target} ({len(out)} bytes)')
print('JS files are published alongside, unchanged, at their own paths.')
