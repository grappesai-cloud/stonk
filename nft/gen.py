# -*- coding: utf-8 -*-
"""
Generatorul colectiei STONK AGENTS.

Fiecare piesa se obtine dintr-o samanta determinista (colectie + numar), deci
aceeasi comanda scoate mereu aceleasi imagini. Nimic nu e generat cu AI: totul
e desenat din cod, deci iese instant si se poate regenera oricand.

  python3 gen.py --preview 9        -> o plansa de proba
  python3 gen.py --count 2000       -> colectia intreaga + metadate
"""
import argparse, hashlib, json, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw, ImageFilter
from sprite import BASE
from traits import CANVAS, OX, OY, TOPS, HEADGEAR, TOOLS, EMBLEMS
from palettes import SUITS, LENSES, ACCENTS, BACKGROUNDS, EFFECTS
from scenes import Painter, SCENES, C as SC
from render import hexc, draw_grid

SCALE = 24                      # 40 x 24 = 960 px pe latura
SEED_SALT = 'stonk-agents-v1'


def tone(h, f):
    """Ia o culoare si o face mai deschisa (f>1) sau mai inchisa (f<1)."""
    h = h.lstrip('#')
    v = [int(h[i:i+2], 16) for i in (0, 2, 4)]
    return '#%02x%02x%02x' % tuple(max(0, min(255, int(c * f))) for c in v)

def _radial(size, inner, outer, power=2.2):
    """Degrade radial mic, marit dupa aceea: iese neted si costa nimic."""
    n = 64
    g = Image.new('L', (n, n))
    px = g.load()
    c = (n - 1) / 2.0
    for y in range(n):
        for x in range(n):
            d = min(1.0, (((x-c)**2 + (y-c)**2) ** 0.5) / c)
            px[x, y] = int(inner + (outer - inner) * (d ** power))
    return g.resize((size, size), Image.BICUBIC)

_VIG = None
_SHADOW = None

def overlays(size):
    """Vinieta si umbra de pe sol, calculate o singura data pentru toata rularea."""
    global _VIG, _SHADOW
    if _VIG is None:
        mask = _radial(size, 0, 100)
        _VIG = Image.new('RGBA', (size, size), (0, 0, 0, 255))
        _VIG.putalpha(mask)

        _SHADOW = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        sh = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(sh)
        u = size / float(CANVAS)
        d.ellipse([9*u, 30.4*u, 31*u, 33.2*u], fill=(0, 0, 0, 120))
        _SHADOW = sh.filter(ImageFilter.GaussianBlur(radius=u * 0.7))
    return _VIG, _SHADOW

# --------------------------------------------------------------------------
def pick(rng, table):
    """Alege o cheie din tabel, dupa ponderi."""
    keys = list(table.keys())
    weights = [table[k][1] for k in keys]
    return rng.choices(keys, weights=weights, k=1)[0]

def paint_bg(img, kind, c1, c2, rng):
    """Fundalul, desenat procedural. Fara fisiere, fara AI."""
    if kind == 'scene':
        SCENES[c1](Painter(img, CANVAS, SCALE), rng)
        return
    px = img.load()
    w = img.size[0]
    a = hexc(c1)
    for y in range(w):
        for x in range(w):
            px[x, y] = a
    if kind == 'flat':
        return
    b = hexc(c2)

    if kind == 'grid':                       # puncte pe grila, ca holograma
        for gy in range(0, CANVAS, 3):
            for gx in range(0, CANVAS, 3):
                for yy in range(gy*SCALE, gy*SCALE + max(2, SCALE//6)):
                    for xx in range(gx*SCALE, gx*SCALE + max(2, SCALE//6)):
                        px[xx, yy] = b
    elif kind == 'scan':                     # linii orizontale
        for gy in range(0, CANVAS, 2):
            for yy in range(gy*SCALE, gy*SCALE + max(2, SCALE//8)):
                for xx in range(w):
                    px[xx, yy] = b
    elif kind == 'vgrad':                    # degrade vertical
        for gy in range(CANVAS):
            t = gy / (CANVAS - 1.0)
            col = tuple(int(a[i] + (b[i]-a[i])*t) for i in range(4))
            for yy in range(gy*SCALE, (gy+1)*SCALE):
                for xx in range(w):
                    px[xx, yy] = col
    elif kind == 'stars':                    # praf de stele
        for _ in range(70):
            gx, gy = rng.randrange(CANVAS), rng.randrange(CANVAS)
            for yy in range(gy*SCALE, gy*SCALE + max(2, SCALE//8)):
                for xx in range(gx*SCALE, gx*SCALE + max(2, SCALE//8)):
                    px[xx, yy] = b
    elif kind == 'glitch':                   # benzi rupte
        for _ in range(9):
            gy = rng.randrange(CANVAS)
            x0 = rng.randrange(0, CANVAS//2)
            x1 = rng.randrange(CANVAS//2, CANVAS)
            for yy in range(gy*SCALE, (gy+1)*SCALE):
                for xx in range(x0*SCALE, x1*SCALE):
                    px[xx, yy] = b


def paint_effect(img, kind, rng, accent):
    """Efectul de deasupra: rar, dar cand apare se vede din prima."""
    if kind == 'none':
        return
    p = Painter(img, CANVAS, SCALE)
    if kind == 'embers':                       # scantei care plutesc
        for _ in range(26):
            x, y = rng.randrange(CANVAS), rng.randrange(2, 34)
            p.dot(x, y, SC(rng.choice(['#ffb03d', '#ff6a1f']), 210))
    elif kind == 'static':                     # benzi de bruiaj
        for _ in range(7):
            y = rng.randrange(4, 36)
            x0 = rng.randrange(0, 24)
            p.hline(y, x0, min(39, x0 + rng.randrange(6, 18)), SC('#ffffff', 90))
            p.hline(y+1, x0, min(39, x0 + rng.randrange(4, 12)), SC('#ff3d9e', 70))
    elif kind == 'sweep':                      # o dunga de scanare
        y = rng.randrange(8, 28)
        for i, a in enumerate((40, 120, 200, 120, 40)):
            p.hline(y + i - 2, 0, 39, SC('#c6ff3d', a))
    elif kind == 'halo':                       # aura in jurul agentului
        for r, a in ((13, 26), (11, 40), (9, 58)):
            for t in range(0, 360, 6):
                import math
                x = int(20 + math.cos(math.radians(t)) * r)
                y = int(19 + math.sin(math.radians(t)) * r)
                p.dot(x, y, SC(accent, a))
    elif kind == 'fallout':                    # praf radioactiv care cade
        for _ in range(34):
            x, y = rng.randrange(CANVAS), rng.randrange(CANVAS)
            p.dot(x, y, SC('#9dff5e', 150))

# --------------------------------------------------------------------------
def build(token_id, collection=SEED_SALT, force=None):
    """Alege trasaturile pentru o piesa si intoarce (imagine, atribute, adn)."""
    rng = random.Random('%s#%d' % (collection, token_id))

    f = force or {}
    suit_name  = f.get('Suit')       or pick(rng, SUITS)
    lens_name  = f.get('Lens')       or pick(rng, LENSES)
    acc_name   = f.get('Accent')     or pick(rng, ACCENTS)
    bg_name    = f.get('Background') or pick(rng, BACKGROUNDS)
    top_name   = f.get('Rig')        or pick(rng, TOPS)
    head_name  = f.get('Headgear')   or pick(rng, HEADGEAR)
    tool_name  = f.get('Tool')       or pick(rng, TOOLS)
    embl_name  = f.get('Emblem')     or pick(rng, EMBLEMS)
    fx_name    = f.get('Effect')     or pick(rng, EFFECTS)

    (s_light, s_dark, s_glove, s_boot), _ = SUITS[suit_name]
    (l_col, l_hi), _ = LENSES[lens_name]
    acc_col, _ = ACCENTS[acc_name]
    (bg_kind, bg1, bg2), _ = BACKGROUNDS[bg_name]
    fx_kind, _ = EFFECTS[fx_name]

    pal = {
        'k': hexc('#0a0f0c'),
        'h': hexc(tone(s_light, 1.22)),      # partea luminata
        's': hexc(s_light),
        'd': hexc(s_dark),
        'e': hexc(tone(s_dark, 0.70)),       # umbra adanca
        'm': hexc('#9aa691'), 'n': hexc('#4d574a'),
        'v': hexc(l_col),
        'w': hexc(l_hi),
        'y': hexc(tone(l_col, 0.58)),        # lentila, partea umbrita
        'a': hexc(acc_col),
        'b': hexc(s_boot),
        'c': hexc(tone(s_boot, 1.75)),       # cizma, partea luminata
        'g': hexc(s_glove),
    }

    img = Image.new('RGBA', (CANVAS*SCALE, CANVAS*SCALE))
    paint_bg(img, bg_kind, bg1, bg2, rng)

    vig, shadow = overlays(CANVAS*SCALE)
    img = Image.alpha_composite(img, shadow)                     # umbra pe sol

    draw_grid(img, TOPS[top_name][0],     pal, scale=SCALE)      # in spate
    draw_grid(img, BASE,                  pal, OX, OY, SCALE)    # agentul
    draw_grid(img, EMBLEMS[embl_name][0], pal, scale=SCALE)
    draw_grid(img, HEADGEAR[head_name][0],pal, scale=SCALE)
    draw_grid(img, TOOLS[tool_name][0],   pal, scale=SCALE)

    paint_effect(img, fx_kind, rng, acc_col)                     # efect deasupra
    img = Image.alpha_composite(img, vig)                        # vinieta

    attrs = [
        ('Background', bg_name), ('Suit', suit_name), ('Lens', lens_name),
        ('Rig', top_name), ('Headgear', head_name), ('Tool', tool_name),
        ('Emblem', embl_name), ('Accent', acc_name), ('Effect', fx_name),
    ]
    dna = hashlib.sha1('|'.join(v for _, v in attrs).encode()).hexdigest()
    return img, attrs, dna

# --------------------------------------------------------------------------
# ---- clasa agentului: modulul din spate spune ce munca face ---------------
RIG_TO_CLASS = {
    'BELL RIG':    'The Ringer',
    'PICK RIG':    'The Miner',
    'CRATE RIG':   'The Stocker',
    'BALLOT RIG':  'The Lobbyist',
    'WHEEL RIG':   'The Courier',
    'TWIN TANK':   'Unassigned',
    'NAKED':       'Unassigned',
}

# raritatea trasaturilor rare, folosita ca sa dam un scor fiecarei piese
# Cat cantareste fiecare trasatura in clasament. Fundalul e coborat intentionat:
# altfel o singura scena rara ar decide singura topul, iar restul trasaturilor
# nu ar mai conta.
WEIGHT = {'Background': 0.35, 'Accent': 0.5, 'Emblem': 0.7, 'Suit': 1.0,
          'Lens': 1.0, 'Headgear': 1.0, 'Rig': 1.0, 'Tool': 1.2, 'Effect': 1.6}

def rarity_score(attrs, tables):
    """Scor mic = piesa banala, scor mare = piesa rara."""
    total = 0.0
    for key, value in attrs:
        tbl = tables.get(key)
        if not tbl:
            continue
        s = sum(w for _, w in tbl.values())
        w = tbl[value][1]
        total += (s / float(w)) * WEIGHT.get(key, 1.0)
    return round(total, 2)

TABLES = {'Background': BACKGROUNDS, 'Suit': SUITS, 'Lens': LENSES,
          'Rig': TOPS, 'Headgear': HEADGEAR, 'Tool': TOOLS,
          'Emblem': EMBLEMS, 'Accent': ACCENTS, 'Effect': EFFECTS}

TIERS = [(0.90, 'Mythic'), (0.97, 'Epic'), (0.995, 'Rare')]   # praguri pe pozitie


# Piesele unice. Nu se rostogolesc: sunt scrise de mana, exista intr-un singur
# exemplar si primesc tier propriu. Cercetarea zice ca fiecare colectie are
# nevoie de cateva piese despre care sa se poata povesti.
ONE_OF_ONES = [
    ('THE FIRST RINGER',  {'Suit':'GOLD FOIL','Lens':'AMBER','Rig':'BELL RIG',
                           'Headgear':'CROWN','Tool':'BELL','Emblem':'HEX',
                           'Background':'THE PIT','Accent':'GOLD','Effect':'HALO'}),
    ('NIGHT SHIFT',       {'Suit':'VOID BLACK','Lens':'RED','Rig':'PICK RIG',
                           'Headgear':'HORNS','Tool':'PICKAXE','Emblem':'SKULL',
                           'Background':'NEON ALLEY','Accent':'RED','Effect':'SCAN SWEEP'}),
    ('THE DROWNED',       {'Suit':'COOLANT BLUE','Lens':'CYAN','Rig':'CRATE RIG',
                           'Headgear':'HALO','Tool':'CRATE','Emblem':'HAZARD',
                           'Background':'DEEP SEA','Accent':'CYAN','Effect':'HALO'}),
    ('MELTDOWN',          {'Suit':'RUST RED','Lens':'AMBER','Rig':'WHEEL RIG',
                           'Headgear':'MOHAWK','Tool':'BLADE','Emblem':'HAZARD',
                           'Background':'LAVA FIELD','Accent':'AMBER','Effect':'EMBERS'}),
    ('COLD STORAGE',      {'Suit':'CHROME','Lens':'WHITE','Rig':'BALLOT RIG',
                           'Headgear':'VISOR SHADE','Tool':'BAG','Emblem':'DOLLAR',
                           'Background':'ICE SHELF','Accent':'WHITE','Effect':'NONE'}),
    ('CORRUPTED',         {'Suit':'HOT MAGENTA','Lens':'DEAD','Rig':'NAKED',
                           'Headgear':'NONE','Tool':'NONE','Emblem':'BLANK',
                           'Background':'GLITCH','Accent':'CYAN','Effect':'STATIC'}),
]

def unique_slots(count):
    """Imprastie piesele unice prin colectie, nu le pune toate la inceput."""
    marks = [0.013, 0.187, 0.404, 0.626, 0.848, 0.977]
    return {max(1, min(count, int(round(count * m)))): u
            for m, u in zip(marks, ONE_OF_ONES)}

def build_collection(count, out):
    """Scrie count imagini + metadate, fara doua piese identice."""
    img_dir = os.path.join(out, 'images')
    met_dir = os.path.join(out, 'metadata')
    os.makedirs(img_dir, exist_ok=True)
    os.makedirs(met_dir, exist_ok=True)

    uniques = unique_slots(count)
    seen, rows, tally, names = set(), [], {}, {}
    token, tries = 1, 0
    while token <= count:
        tries += 1
        if token in uniques:
            name, forced = uniques[token]
            img, attrs, dna = build(token, force=forced)
            names[token] = name
        else:
            img, attrs, dna = build(token if tries == token else token * 1000 + tries)
            if dna in seen:                  # aceeasi combinatie: mai incearca
                continue
        seen.add(dna)
        img.save(os.path.join(img_dir, '%d.png' % token))
        rows.append((token, attrs, rarity_score(attrs, TABLES)))
        for k, v in attrs:
            tally.setdefault(k, {}).setdefault(v, 0)
            tally[k][v] += 1
        token += 1

    # tier-ul se da pe pozitia in clasament, ca sa iasa procente exacte
    order = sorted(rows, key=lambda r: r[2])
    tier_of = {}
    n = len(order)
    for i, (tok, _, _) in enumerate(order):
        p = i / float(n)
        tier = 'Common'
        for thr, name in reversed(TIERS):
            if p >= thr:
                tier = name
        if p >= 0.995: tier = 'Mythic'
        elif p >= 0.97: tier = 'Epic'
        elif p >= 0.90: tier = 'Rare'
        elif p >= 0.65: tier = 'Uncommon'
        else: tier = 'Common'
        tier_of[tok] = tier
    for tok in names:
        tier_of[tok] = '1 of 1'

    for tok, attrs, score in rows:
        meta = {
            'name': (names[tok] + ' (Agent #%d)' % tok) if tok in names
                    else 'Stonk Agent #%d' % tok,
            'description': 'An ERC-6551 worker for the StonkBrokers ecosystem. '
                           'Traits are rolled at mint and never change.',
            'image': 'ipfs://REPLACE_CID/%d.png' % tok,
            'external_url': 'https://stonk.grappes.dev',
            'attributes': [{'trait_type': k, 'value': v} for k, v in attrs] + [
                {'trait_type': 'Class', 'value': RIG_TO_CLASS[dict(attrs)['Rig']]},
                {'trait_type': 'Tier', 'value': tier_of[tok]},
            ],
        }
        with open(os.path.join(met_dir, '%d.json' % tok), 'w') as f:
            json.dump(meta, f, indent=1)

    with open(os.path.join(out, 'rarity.json'), 'w') as f:
        json.dump({'count': count,
                   'traits': {k: {vv: {'count': c, 'percent': round(100.0*c/count, 2)}
                                  for vv, c in sorted(v.items(), key=lambda x: -x[1])}
                              for k, v in tally.items()}}, f, indent=1)

    print('%d piese unice scrise in %s' % (count, out))
    for k in ('Rig', 'Suit', 'Lens'):
        top = sorted(tally[k].items(), key=lambda x: -x[1])
        print('  %-6s' % k, ', '.join('%s %d%%' % (a, round(100.0*b/count)) for a, b in top[:4]))

def preview(n, out):
    """Plansa de proba: n piese intr-o grila patrata."""
    import math
    side = int(math.ceil(math.sqrt(n)))
    tile = CANVAS * SCALE
    sheet = Image.new('RGBA', (side*tile, side*tile), (10, 13, 10, 255))
    for i in range(n):
        img, attrs, _ = build(i + 1)
        sheet.paste(img, ((i % side) * tile, (i // side) * tile))
        print('#%-4d %s' % (i+1, ' / '.join(v for _, v in attrs)))
    sheet.thumbnail((1600, 1600), Image.NEAREST)
    sheet.save(out)
    print('->', out, sheet.size)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', type=int)
    ap.add_argument('--count', type=int)
    ap.add_argument('--out', default='out')
    a = ap.parse_args()
    if a.preview:
        preview(a.preview, os.path.join(a.out, 'preview.png'))
    elif a.count:
        build_collection(a.count, a.out)

if __name__ == '__main__':
    main()
