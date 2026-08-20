# -*- coding: utf-8 -*-
"""
Colectia construita din ARTA LUI VLAD.

Personajul si cele noua variante ale lui sunt decupate din planşele lui
(extract.py). Aici doar se compun: fundal desenat, personaj, recolorare de
costum si cupola prin rotirea nuantei, efect rar deasupra.

  python3 real_collection.py --preview 9
  python3 real_collection.py --count 100
"""
import argparse, hashlib, json, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image
from compose import recolor, place, TILE
from scenes import Painter, SCENES, C as SC
from palettes import BACKGROUNDS, EFFECTS

CANVAS = 40
SEED = 'stonk-vlad-v1'
REF = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ref')

# cele noua variante decupate din planşa lui, cu cupola lor nativa
BASES = {
    'BASE':           dict(f='char_1.png', dome='RED',   w=26),
    'SENSOR':         dict(f='char_5.png', dome='GREEN', w=14),
    'ADVANCED BOOTS': dict(f='char_2.png', dome='CYAN',  w=12),
    'COMM-UNIT':      dict(f='char_3.png', dome='RED',   w=11),
    'MECHANIC':       dict(f='char_4.png', dome='GREEN', w=10),
    'DUAL-EYE':       dict(f='char_8.png', dome='BLUE',  w=9),
    'ARCADE':         dict(f='char_9.png', dome='BLUE',  w=8),
    'COLLECTOR':      dict(f='char_7.png', dome='RED',   w=6),
    'CROWNED':        dict(f='char_6.png', dome='RED',   w=4),
}

# nuanta costumului, in grade. Galbenul lui e canonic, deci nu se roteste.
SUITS = {
    'HAZMAT YELLOW': (None, 30),
    'DIVE BLUE':     (205, 12),
    'REEF GREEN':    (105, 11),
    'RESCUE ORANGE': (22,  10),
    'DEEP PURPLE':   (275, 8),
    'HOT MAGENTA':   (320, 7),
    'TOXIC LIME':    (78,  6),
    'ICE CYAN':      (185, 5),
    'BLOOD RED':     (355, 3),
    'VOID GREY':     (210, 2),      # cu saturatie taiata, vezi mai jos
}
DESAT = {'VOID GREY': 0.18}

# cupola se poate roti doar la variantele cu cupola rosie
DOMES = {
    'RED':    (None, 30), 'AMBER': (35, 16), 'GREEN': (110, 13),
    'CYAN':   (185, 11),  'VIOLET': (280, 8), 'PINK': (330, 6),
}

def pick(rng, table):
    keys = list(table)
    return rng.choices(keys, weights=[table[k][1] for k in keys], k=1)[0]

_chars = {}
def char(name):
    if name not in _chars:
        _chars[name] = Image.open(os.path.join(REF, BASES[name]['f'])).convert('RGBA')
    return _chars[name]

def background(kind, c1, c2, rng):
    """Fundalul, desenat mic si marit cu pixeli intregi: ramane taios."""
    small = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 255))
    p = Painter(small, CANVAS, 1)
    if kind == 'scene':
        SCENES[c1](p, rng)
    elif kind == 'flat':
        p.fill(SC(c1))
    elif kind == 'vgrad':
        p.vgrad(SC(c1), SC(c2))
    elif kind == 'grid':
        p.fill(SC(c1))
        for y in range(0, CANVAS, 3):
            for x in range(0, CANVAS, 3):
                p.dot(x, y, SC(c2))
    elif kind == 'scan':
        p.fill(SC(c1))
        for y in range(0, CANVAS, 2):
            p.hline(y, 0, CANVAS-1, SC(c2))
    elif kind == 'stars':
        p.fill(SC(c1))
        for _ in range(70):
            p.dot(rng.randrange(CANVAS), rng.randrange(CANVAS), SC(c2))
    elif kind == 'glitch':
        p.fill(SC(c1))
        for _ in range(9):
            y = rng.randrange(CANVAS)
            p.hline(y, rng.randrange(0, CANVAS//2), rng.randrange(CANVAS//2, CANVAS), SC(c2))
    return small.resize((TILE, TILE), Image.NEAREST)

def effect(img, kind, rng):
    if kind == 'none':
        return img
    over = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    p = Painter(over, CANVAS, 1)
    if kind == 'embers':
        for _ in range(26):
            p.dot(rng.randrange(CANVAS), rng.randrange(2, 34), SC('#ffb03d', 220))
    elif kind == 'static':
        for _ in range(7):
            y = rng.randrange(4, 36); x0 = rng.randrange(0, 24)
            p.hline(y, x0, min(39, x0 + rng.randrange(6, 18)), SC('#ffffff', 110))
    elif kind == 'sweep':
        # sub linia capului, altfel taie fata si pare defect, nu efect
        y = rng.randrange(26, 36)
        for i, a in enumerate((40, 90, 40)):
            p.hline(y + i - 1, 0, 39, SC('#c6ff3d', a))
    elif kind == 'halo':
        import math
        for r, a in ((15, 40), (13, 60)):
            for t in range(0, 360, 5):
                p.dot(int(20 + math.cos(math.radians(t))*r),
                      int(20 + math.sin(math.radians(t))*r), SC('#c6ff3d', a))
    elif kind == 'fallout':
        for _ in range(34):
            p.dot(rng.randrange(CANVAS), rng.randrange(CANVAS), SC('#9dff5e', 170))
    return Image.alpha_composite(img, over.resize((TILE, TILE), Image.NEAREST))

def build(token_id, force=None):
    rng = random.Random('%s#%d' % (SEED, token_id))
    f = force or {}
    base = f.get('Base')       or pick(rng, {k: (None, v['w']) for k, v in BASES.items()})
    suit = f.get('Suit')       or pick(rng, SUITS)
    bg   = f.get('Background') or pick(rng, BACKGROUNDS)
    fx   = f.get('Effect')     or pick(rng, EFFECTS)

    native = BASES[base]['dome']
    if native == 'RED':                       # doar cupola rosie se poate roti
        dome = f.get('Dome') or pick(rng, DOMES)
    else:
        dome = native

    suit_hue, _ = SUITS[suit]
    dome_hue = DOMES[dome][0] if dome in DOMES and native == 'RED' else None
    (bg_kind, bg1, bg2), _ = BACKGROUNDS[bg]
    fx_kind, _ = EFFECTS[fx]

    art = recolor(char(base), suit_hue, dome_hue, DESAT.get(suit, 1.0))
    img = place(background(bg_kind, bg1, bg2, rng), art)
    img = effect(img, fx_kind, rng)

    attrs = [('Base', base), ('Suit', suit), ('Dome', dome),
             ('Background', bg), ('Effect', fx)]
    dna = hashlib.sha1('|'.join(v for _, v in attrs).encode()).hexdigest()
    return img, attrs, dna

TABLES = {'Base': {k: (None, v['w']) for k, v in BASES.items()},
          'Suit': SUITS, 'Dome': DOMES,
          'Background': BACKGROUNDS, 'Effect': EFFECTS}
WEIGHT = {'Base': 2.0, 'Suit': 1.3, 'Dome': 1.0, 'Effect': 1.6, 'Background': 0.35}

def score(attrs):
    t = 0.0
    for k, v in attrs:
        tbl = TABLES.get(k)
        if not tbl or v not in tbl:
            continue
        t += (sum(w for _, w in tbl.values()) / float(tbl[v][1])) * WEIGHT[k]
    return round(t, 2)

ONE_OF_ONES = [
    ('THE FIRST', {'Base':'CROWNED','Suit':'HAZMAT YELLOW','Dome':'AMBER',
                   'Background':'THE PIT','Effect':'HALO'}),
    ('MELTDOWN',  {'Base':'COMM-UNIT','Suit':'BLOOD RED','Dome':'AMBER',
                   'Background':'LAVA FIELD','Effect':'EMBERS'}),
    ('THE DEEP',  {'Base':'SENSOR','Suit':'ICE CYAN',
                   'Background':'DEEP SEA','Effect':'HALO'}),
    ('NIGHT RUN', {'Base':'ARCADE','Suit':'VOID GREY',
                   'Background':'NEON ALLEY','Effect':'SCAN SWEEP'}),
    ('CORRUPTED', {'Base':'DUAL-EYE','Suit':'HOT MAGENTA',
                   'Background':'GLITCH','Effect':'STATIC'}),
]

def slots(count):
    return {max(1, min(count, int(round(count*m)))): u
            for m, u in zip([0.01, 0.24, 0.48, 0.72, 0.96], ONE_OF_ONES)}

def build_collection(count, out):
    img_dir, met_dir = os.path.join(out,'images'), os.path.join(out,'metadata')
    os.makedirs(img_dir, exist_ok=True); os.makedirs(met_dir, exist_ok=True)
    uniq = slots(count)
    seen, rows, tally, names = set(), [], {}, {}
    token, tries = 1, 0
    while token <= count:
        tries += 1
        if token in uniq:
            name, forced = uniq[token]
            img, attrs, dna = build(token, force=forced); names[token] = name
        else:
            img, attrs, dna = build(token if tries == token else token*1000+tries)
            if dna in seen:
                continue
        seen.add(dna)
        img.save(os.path.join(img_dir, '%d.png' % token))
        rows.append((token, attrs, score(attrs)))
        for k, v in attrs:
            tally.setdefault(k, {}).setdefault(v, 0); tally[k][v] += 1
        token += 1

    order = sorted(rows, key=lambda r: r[2]); n = len(order); tier = {}
    for i, (tok, _, _) in enumerate(order):
        p = i / float(n)
        tier[tok] = ('Mythic' if p >= .99 else 'Epic' if p >= .96 else
                     'Rare' if p >= .89 else 'Uncommon' if p >= .65 else 'Common')
    for tok in names:
        tier[tok] = '1 of 1'

    for tok, attrs, _ in rows:
        json.dump({
            'name': (names[tok] + ' (#%d)' % tok) if tok in names else 'Stonk Agent #%d' % tok,
            'description': 'An ERC-6551 worker for the StonkBrokers ecosystem. '
                           'Traits are rolled at mint and never change.',
            'image': 'ipfs://REPLACE_CID/%d.png' % tok,
            'external_url': 'https://stonk.grappes.dev',
            'attributes': [{'trait_type': k, 'value': v} for k, v in attrs] +
                          [{'trait_type': 'Tier', 'value': tier[tok]}],
        }, open(os.path.join(met_dir, '%d.json' % tok), 'w'), indent=1)

    json.dump({'count': count, 'traits': {k: {vv: {'count': c,
               'percent': round(100.0*c/count, 2)} for vv, c in
               sorted(v.items(), key=lambda x: -x[1])} for k, v in tally.items()}},
              open(os.path.join(out, 'rarity.json'), 'w'), indent=1)
    print('%d piese unice in %s' % (count, out))

def preview(n):
    import math
    side = int(math.ceil(math.sqrt(n)))
    sh = Image.new('RGBA', (side*TILE, side*TILE))
    for i in range(n):
        img, attrs, _ = build(i+1)
        sh.paste(img, ((i % side)*TILE, (i // side)*TILE))
        print('#%-3d %s' % (i+1, ' / '.join(v for _, v in attrs)))
    sh.thumbnail((1500, 1500), Image.LANCZOS)
    sh.save('out/preview_real.png')

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', type=int); ap.add_argument('--count', type=int)
    ap.add_argument('--out', default='out/real')
    a = ap.parse_args()
    if a.preview: preview(a.preview)
    elif a.count: build_collection(a.count, a.out)
