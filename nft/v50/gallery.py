"""Construieste pagina galeriei. Miniaturile stau intr-un atlas pe fiecare lot:
o singura imagine decodata o data, in loc de doua mii de imagini separate."""
import base64, io, json, os, sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from v50 import lots

TIERS = ['1 of 1', 'Mythic', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common']
KEYS = ['Suit', 'Headwear', 'Crest', 'Held Item', 'Outfit', 'Neckwear', 'Badge',
        'Footwear', 'Hands', 'Scene', 'Effect', 'Eye']
TILE = 100
COLS = 10


def build():
    rows = json.load(open('out/v50/_thumbs.json'))
    by = {}
    for r in rows:
        by.setdefault(r['l'], []).append(r)

    atlases, out_rows, total = {}, [], 0
    for lot in lots.LOTS:
        items = by[lot['code']]
        n = len(items)
        h = (n + COLS - 1) // COLS
        at = Image.new('RGB', (COLS * TILE, h * TILE), (10, 10, 12))
        for i, r in enumerate(items):
            im = Image.open(f"out/v50/images/{r['n']:05d}.png").resize((TILE, TILE), Image.NEAREST)
            at.paste(im, ((i % COLS) * TILE, (i // COLS) * TILE))
            out_rows.append({'n': r['n'], 't': r['t'], 'tier': r['tier'], 'rank': r['rank'],
                             'l': r['l'], 'a': r['a'], 'i': i})
        b = io.BytesIO()
        at.quantize(colors=80, method=Image.MEDIANCUT).save(b, 'PNG', optimize=True)
        total += b.tell()
        atlases[lot['code']] = {'d': base64.b64encode(b.getvalue()).decode(), 'rows': h}

    L = [{'code': l['code'], 'name': l['name'], 'blurb': l['blurb'], 'n': len(by[l['code']])}
         for l in lots.LOTS]
    present = [t for t in TIERS if any(r['tier'] == t for r in rows)]

    html = open('v50/gallery.tpl.html').read()
    html = (html.replace('__ROWS__', json.dumps(out_rows, separators=(',', ':')))
                .replace('__ATLAS__', json.dumps(atlases, separators=(',', ':')))
                .replace('__LOTS__', json.dumps(L))
                .replace('__KEYS__', json.dumps(KEYS))
                .replace('__TIERS__', json.dumps(present)))
    open('gallery_v50.html', 'w').write(html)
    print('atlase:', round(total / 1024 / 1024, 2), 'MB | pagina:',
          round(os.path.getsize('gallery_v50.html') / 1024 / 1024, 2), 'MB')


if __name__ == '__main__':
    build()
