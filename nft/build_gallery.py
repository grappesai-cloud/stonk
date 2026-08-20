# -*- coding: utf-8 -*-
"""Impacheteaza esantionul intr-o pagina de sine statatoare: imagini si
fonturi intra in fisier ca date, deci merge oriunde, fara server."""
import base64, io, json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.join(HERE, 'out', 'real')
FONTS = '/Users/alexandrucojanu/stonk-agents/assets/fonts'
THUMB = 320

def b64_font(name):
    with open(os.path.join(FONTS, name), 'rb') as f:
        return base64.b64encode(f.read()).decode()

def b64_thumb(path):
    # vinieta e un degrade, iar degradeurile umfla PNG-ul. Reducem paleta:
    # marginile pixelilor raman taioase, iar fisierul scade de cateva ori.
    im = Image.open(path).convert('RGB').resize((THUMB, THUMB), Image.NEAREST)
    im = im.quantize(colors=96, method=Image.MEDIANCUT, dither=Image.NONE)
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode()

def collect():
    items = []
    md = os.path.join(SAMPLE, 'metadata')
    for i in sorted(int(f.split('.')[0]) for f in os.listdir(md) if f.endswith('.json')):
        meta = json.load(open(os.path.join(md, '%d.json' % i)))
        attrs = {a['trait_type']: a['value'] for a in meta['attributes']}
        items.append({
            'id': i,
            'name': meta['name'],
            'img': b64_thumb(os.path.join(SAMPLE, 'images', '%d.png' % i)),
            'attrs': attrs,
        })
    rarity = json.load(open(os.path.join(SAMPLE, 'rarity.json')))
    return items, rarity

if __name__ == '__main__':
    items, rarity = collect()
    payload = {'items': items, 'rarity': rarity}
    out = os.path.join(HERE, 'gallery-data.json')
    json.dump(payload, open(out, 'w'))
    fonts = {'archivo': b64_font('archivo-latin.woff2'),
             'mono': b64_font('jetbrains-mono-latin.woff2')}
    json.dump(fonts, open(os.path.join(HERE, 'gallery-fonts.json'), 'w'))
    kb = os.path.getsize(out) / 1024
    print('date: %d piese, %.0f KB' % (len(items), kb))
    print('fonturi: %.0f KB' % (sum(len(v) for v in fonts.values()) / 1024))
