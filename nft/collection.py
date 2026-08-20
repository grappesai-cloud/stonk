# -*- coding: utf-8 -*-
"""
Colectia pe personajul lui Vlad.

  python3 collection.py --preview 9
  python3 collection.py --count 100
"""
import argparse, hashlib, json, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image
import vlad
from traits import CANVAS, OX, OY
from traits_v import HEADGEAR, HANDS, OUTFIT, PROPS
from pal_v import SUITS, DOMES, ACCENTS
from palettes import BACKGROUNDS, EFFECTS
from render import hexc, draw_grid
from gen import tone, overlays, paint_bg, paint_effect, pick

SCALE = 24
SEED = 'stonk-divers-v1'


# ---------------------------------------------------------------------------
# ARHETIPURILE. Astea sunt personajele din planşele lui Vlad: nu combinatii
# aleatoare, ci seturi care merg impreuna. Costumul, ce poarta pe cap, ce tine
# in mana si locul in care sta sunt legate; se rostogolesc doar cupola,
# accentul, efectul si care dintre fundalurile potrivite iese.
ARCHETYPES = {
    'THE EXPLORER':     dict(suit='HAZMAT YELLOW', head='NONE',          hand='NONE',
                             fit='PLAIN',      bgs=['STEEL BLUE','ASH','DOT GRID','WASTELAND'], w=16),
    'THE DIVER':        dict(suit='DIVE BLUE',     head='DIVE FINS',     hand='ANCHOR',
                             fit='STRIPES',    bgs=['DEEP SEA','ICE SHELF'], w=12),
    'THE LAVA WORKER':  dict(suit='HEAT GREY',     head='HARD HAT',      hand='WRENCH',
                             fit='HAZARD',     bgs=['LAVA FIELD','WASTELAND'], w=11),
    'THE JUNGLE SCOUT': dict(suit='ARMY DRAB',     head='PITH HELMET',   hand='MAGNIFIER',
                             fit='HARNESS',    bgs=['JUNGLE','WASTELAND'], w=10),
    'THE STREET ARTIST':dict(suit='HAZMAT YELLOW', head='BACKWARDS CAP', hand='SPRAY CAN',
                             fit='GRAFFITI',   bgs=['NEON ALLEY','GLITCH'], w=10),
    'THE SCIENTIST':    dict(suit='LAB WHITE',     head='LAB GLASSES',   hand='FLASK',
                             fit='LAB COAT',   bgs=['SERVER ROOM','TERMINAL'], w=9),
    'THE BOTANIST':     dict(suit='MOSS GREEN',    head='SPROUT',        hand='BUCKET',
                             fit='PLAIN',      bgs=['JUNGLE','DEEP MOSS'], w=8),
    'THE HACKER':       dict(suit='DEEP BLACK',    head='VISOR',         hand='JOYSTICK',
                             fit='DOT PANEL',  bgs=['TERMINAL','NEON ALLEY','THE PIT'], w=8),
    'THE PIRATE':       dict(suit='PIRATE BLACK',  head='BANDANA',       hand='CUTLASS',
                             fit='X MARK',     bgs=['WASTELAND','DEEP SEA'], w=7),
    'THE BEACHCOMBER':  dict(suit='BEACH YELLOW',  head='NONE',          hand='BUCKET',
                             fit='HAWAIIAN',   bgs=['SUNSET','CLAY'], w=6),
    'THE SPACE PILOT':  dict(suit='BONE WHITE',    head='BUBBLE HELM',   hand='RAY GUN',
                             fit='NUMBER 001', bgs=['ORBIT','VOID'], w=6),
    'THE PAINTER':      dict(suit='PAINT WHITE',   head='NONE',          hand='NONE',
                             fit='PAINT SPLAT',bgs=['CLAY','ASH','PLUM'], w=5),
    'THE INVENTOR':     dict(suit='COPPER',        head='TOP HAT',       hand='LANTERN',
                             fit='HARNESS',    bgs=['CLAY','SERVER ROOM'], w=5),
    'THE WATCHMAN':     dict(suit='NIGHT BLACK',   head='NONE',          hand='LANTERN',
                             fit='PLAIN',      bgs=['NEON ALLEY','VOID','SCANLINE'], w=5),
    'THE GAMER':        dict(suit='NIGHT BLACK',   head='CROWN',         hand='JOYSTICK',
                             fit='STRIPES',    bgs=['NEON ALLEY','THE PIT','GLITCH'], w=5),
    'THE SAMURAI':      dict(suit='SAMURAI RED',   head='KABUTO',        hand='BLADE',
                             fit='ARMOUR',     bgs=['NEON ALLEY','THE PIT'], w=4),
    'THE VOYAGER':      dict(suit='GALAXY VIOLET', head='HALO',          hand='ORB STAFF',
                             fit='STARFIELD',  bgs=['ORBIT','VOID'], w=3),
    'THE SHAMAN':       dict(suit='REEF GREEN',    head='CRYSTAL CROWN', hand='ORB STAFF',
                             fit='HARNESS',    bgs=['JUNGLE','ICE SHELF'], w=3),
    'THE KING':         dict(suit='GOLD FOIL',     head='CROWN',         hand='TRIDENT',
                             fit='ARMOUR',     bgs=['THE PIT','ORBIT'], w=2),
}

def build(token_id, force=None):
    rng = random.Random('%s#%d' % (SEED, token_id))
    f = force or {}
    keys = list(ARCHETYPES)
    arch = f.get('Archetype') or rng.choices(
        keys, weights=[ARCHETYPES[k]['w'] for k in keys], k=1)[0]
    A = ARCHETYPES[arch]

    suit = f.get('Suit')       or A['suit']
    head = f.get('Headgear')   or A['head']
    hand = f.get('Hand')       or A['hand']
    fit  = f.get('Outfit')     or A['fit']
    bg   = f.get('Background') or rng.choice(A['bgs'])
    dome = f.get('Dome')       or pick(rng, DOMES)
    acc  = f.get('Accent')     or pick(rng, ACCENTS)
    fx   = f.get('Effect')     or pick(rng, EFFECTS)

    (s_base, s_dark, s_glove, s_boot), _ = SUITS[suit]
    (d_col, d_hi, d_lo), _ = DOMES[dome]
    acc_col, _ = ACCENTS[acc]
    (bg_kind, bg1, bg2), _ = BACKGROUNDS[bg]
    fx_kind, _ = EFFECTS[fx]

    pal = {
        'k': hexc('#141210'),
        'h': hexc(tone(s_base, 1.18)), 's': hexc(s_base), 'd': hexc(s_dark),
        'e': hexc('#141210'),
        'g': hexc(s_glove), 'n': hexc(tone(s_glove, 0.7)),
        'm': hexc('#8d9294'),
        'v': hexc(d_col), 'w': hexc(d_hi), 'y': hexc(d_lo),
        'b': hexc(s_boot), 'c': hexc(tone(s_boot, 1.4)),
        'a': hexc(acc_col),
    }

    img = Image.new('RGBA', (CANVAS*SCALE, CANVAS*SCALE))
    paint_bg(img, bg_kind, bg1, bg2, rng)
    vig, shadow = overlays(CANVAS*SCALE)
    img = Image.alpha_composite(img, shadow)

    draw_grid(img, vlad.BASE,        pal, OX, OY, SCALE)
    draw_grid(img, OUTFIT[fit][0],   pal, scale=SCALE)
    draw_grid(img, HEADGEAR[head][0],pal, scale=SCALE)
    draw_grid(img, HANDS[hand][0],   pal, scale=SCALE)
    if arch in PROPS:                                  # obiecte care plutesc
        draw_grid(img, PROPS[arch], pal, scale=SCALE)
    paint_effect(img, fx_kind, rng, acc_col)
    img = Image.alpha_composite(img, vig)

    attrs = [('Archetype', arch), ('Background', bg), ('Suit', suit),
             ('Dome', dome), ('Headgear', head), ('Hand', hand),
             ('Outfit', fit), ('Accent', acc), ('Effect', fx)]
    dna = hashlib.sha1('|'.join(v for _, v in attrs).encode()).hexdigest()
    return img, attrs, dna

ARCH_TABLE = {k: (None, v['w']) for k, v in ARCHETYPES.items()}
TABLES = {'Archetype': ARCH_TABLE, 'Background': BACKGROUNDS, 'Dome': DOMES,
          'Accent': ACCENTS, 'Effect': EFFECTS}
# costumul, casca, obiectul si insemnele vin din arhetip, deci nu se puncteaza
# separat: altfel acelasi lucru ar fi numarat de cinci ori.
WEIGHT = {'Archetype': 2.2, 'Dome': 1.0, 'Effect': 1.6,
          'Background': 0.35, 'Accent': 0.4}

def score(attrs):
    t = 0.0
    for k, v in attrs:
        if k not in TABLES:
            continue
        tbl = TABLES[k]
        t += (sum(w for _, w in tbl.values()) / float(tbl[v][1])) * WEIGHT[k]
    return round(t, 2)

ONE_OF_ONES = [
    ('THE FIRST DIVER', {'Archetype':'THE KING','Suit':'GOLD FOIL','Dome':'AMBER',
                         'Headgear':'CROWN','Hand':'TRIDENT','Outfit':'ARMOUR',
                         'Background':'THE PIT','Accent':'GOLD','Effect':'HALO'}),
    ('BLACK LUNG',      {'Archetype':'THE WATCHMAN','Suit':'NIGHT BLACK','Dome':'DEAD',
                         'Headgear':'NONE','Hand':'LANTERN','Outfit':'X MARK',
                         'Background':'LAVA FIELD','Accent':'RED','Effect':'EMBERS'}),
    ('THE DROWNED',     {'Archetype':'THE DIVER','Suit':'REEF GREEN','Dome':'CYAN',
                         'Headgear':'DIVE FINS','Hand':'ANCHOR','Outfit':'STRIPES',
                         'Background':'DEEP SEA','Accent':'WHITE','Effect':'HALO'}),
    ('WHITEOUT',        {'Archetype':'THE SPACE PILOT','Suit':'CHROME','Dome':'WHITE',
                         'Headgear':'BUBBLE HELM','Hand':'FLAG','Outfit':'NUMBER 001',
                         'Background':'ICE SHELF','Accent':'CYAN','Effect':'NONE'}),
    ('CORRUPTED',       {'Archetype':'THE SAMURAI','Suit':'MAGENTA','Dome':'VIOLET',
                         'Headgear':'KABUTO','Hand':'BLADE','Outfit':'ARMOUR',
                         'Background':'GLITCH','Accent':'LIME','Effect':'STATIC'}),
]

def slots(count):
    marks = [0.01, 0.23, 0.47, 0.71, 0.95]
    return {max(1, min(count, int(round(count * m)))): u
            for m, u in zip(marks, ONE_OF_ONES)}

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
            tally.setdefault(k, {}).setdefault(v, 0)
            tally[k][v] += 1
        token += 1

    order = sorted(rows, key=lambda r: r[2]); n = len(order); tier = {}
    for i, (tok, _, _) in enumerate(order):
        p = i / float(n)
        tier[tok] = ('Mythic' if p >= .99 else 'Epic' if p >= .96 else
                     'Rare' if p >= .89 else 'Uncommon' if p >= .65 else 'Common')
    for tok in names:
        tier[tok] = '1 of 1'

    for tok, attrs, sc in rows:
        json.dump({
            'name': (names[tok] + ' (Diver #%d)' % tok) if tok in names
                    else 'Stonk Diver #%d' % tok,
            'description': 'A deep-shift worker for the StonkBrokers ecosystem. '
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

def preview(n, out):
    import math
    side = int(math.ceil(math.sqrt(n))); tile = CANVAS*SCALE
    sh = Image.new('RGBA', (side*tile, side*tile), (10,13,10,255))
    for i in range(n):
        img, attrs, _ = build(i+1)
        sh.paste(img, ((i % side)*tile, (i // side)*tile))
        print('#%-3d %s' % (i+1, ' / '.join(v for _, v in attrs)))
    sh.thumbnail((1600,1600), Image.NEAREST); sh.save(out); print('->', out)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', type=int); ap.add_argument('--count', type=int)
    ap.add_argument('--out', default='out/divers')
    a = ap.parse_args()
    if a.preview: preview(a.preview, 'out/preview_v.png')
    elif a.count: build_collection(a.count, a.out)
