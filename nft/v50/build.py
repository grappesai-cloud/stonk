"""Colectia Stonk Agents. Un singur personaj, cel al lui Vlad, extras 1:1 de pe plansa
lui si coborat pe grila lui nativa de 50x50. Restul sunt straturi desenate pe aceeasi
grila, cu aceeasi muchie neagra, ca sa fie acelasi mediu, nu colaj."""
import json, os, random, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from v50.core import (N, T, OUT, SUIT, SUITD, SUITX, EYE, EYED, MET, METD,
                      SHOE, SHOED, TUBE, BASE, BALD, BODY_MASK, Layer, compose, shade)
from v50 import hats, items, clothes, mats, scenes, fx, badges, parts, ink

OUTDIR = 'out/v50'
SIZE = 1000

SUITS = [
    ('OG Yellow', 22, (249, 214, 2)),
    ('Hazard Orange', 8, (240, 122, 24)),
    ('Toxic Green', 8, (108, 200, 52)),
    ('Deep Teal', 7, (34, 154, 158)),
    ('Void Black', 5, (38, 38, 46)),
    ('Bone White', 6, (234, 234, 228)),
    ('Blood Red', 6, (198, 44, 44)),
    ('Ultra Violet', 6, (132, 66, 200)),
    ('Bubblegum', 6, (238, 96, 158)),
    ('Steel Grey', 7, (128, 136, 148)),
    ('Copper', 6, (176, 106, 52)),
    ('Cobalt', 6, (46, 96, 214)),
    ('Mint', 5, (128, 224, 190)),
    ('Sand', 5, (206, 178, 118)),
    ('Crimson', 5, (152, 26, 62)),
    ('Slate Blue', 5, (78, 98, 156)),
    ('Moss', 5, (96, 122, 66)),
    ('Clay', 5, (188, 116, 84)),
    ('Ink', 4, (48, 44, 72)),
    ('Chalk', 4, (206, 202, 190)),
]

EYES = [
    ('Red', 30, (210, 30, 26)),
    ('Acid Green', 12, (108, 232, 74)),
    ('Ice Blue', 11, (86, 190, 240)),
    ('Violet', 9, (168, 96, 236)),
    ('Amber', 9, (244, 168, 32)),
    ('Cyan', 8, (52, 226, 226)),
    ('Bone', 6, (238, 238, 232)),
    ('Gold', 5, (246, 208, 72)),
    ('Void', 4, (22, 22, 28)),
]


# arhetipurile numite din plansele lui: combinatii fixe, nu aleatoare.
# scena si efectul raman libere, ca cele patru exemplare sa nu fie identice.
ARCHETYPES = [
    ('The Pirate',         dict(suit='Void Black',   eye='Amber',      hat='Pirate Tricorn', item='Cutlass',      cloth='Bandolier')),
    ('The Scientist',      dict(suit='Bone White',   eye='Acid Green', hat=None,             item='Flask',        cloth='Lab Coat')),
    ('The Cyber-Samurai',  dict(suit='Blood Red',    eye='Violet',     hat='Kabuto',         item='Katana',       cloth='Armor')),
    ('The Shaman',         dict(suit='Toxic Green',  eye='Violet',     hat='Horns',          item='Arcane Staff', cloth='Cape')),
    ('The Artist',         dict(suit='Bone White',   eye='Red',        hat='Beret',          item='Spray Can',    cloth='Apron')),
    ('The Botanist',       dict(mat='Overgrown',     eye='Acid Green', hat='Straw Hat',      item='Shovel',       cloth='Apron')),
    ('The Steampunk',      dict(suit='Copper',       eye='Amber',      hat='Top Hat',        item='Wrench',       cloth='Tool Belt')),
    ('The Cosmic Voyager', dict(mat='Cosmic',        eye='Cyan',       hat='Space Dome',     item='Diamond',      cloth=None)),
    ('The Alchemist',      dict(suit='Ultra Violet', eye='Gold',       hat='Wizard Hat',     item='Flask',        cloth='Cape')),
    ('The Explorer',       dict(suit='OG Yellow',    eye='Red',        hat='Pith Helmet',    item='Torch',        cloth='Hazard Vest')),
    ('The Chef',           dict(suit='OG Yellow',    eye='Red',        hat='Chef Hat',       item='Frying Pan',   cloth='Apron')),
    ('The Medic',          dict(suit='Bone White',   eye='Ice Blue',   hat=None,             item='Briefcase',    cloth='Medic Suit')),
]

# tabelele normalizate: (nume, greutate, incarcatura)
T_SUIT = [(n, w, ('flat', c)) for n, w, c in SUITS] + \
         [(n, w, ('mat', f)) for n, w, f in mats.MATS]
T_EYE = [(n, w, c) for n, w, c in EYES]
T_HAT = [(n, w, (fn, hide)) for n, w, hide, fn in hats.HATS]
T_ITEM = [(n, w, fn) for n, w, fn in items.ITEMS]   # fn.mode = hand/back/ground
T_CLOTH = [(n, w, (fn, clip, behind)) for n, w, clip, behind, fn in clothes.CLOTHES]
T_SCENE = [(n, w, fn) for n, w, fn in scenes.SCENES]
T_FX = [(n, w, fn) for n, w, fn in fx.FX]
T_BADGE = [(n, w, fn) for n, w, fn in badges.BADGES]
T_SHOE = [(n, w, c) for n, w, c in parts.SHOES]
T_GLOVE = [(n, w, c) for n, w, c in parts.GLOVES]
T_TUBE = [(n, w, (d, c)) for n, w, d, c in parts.TUBES]
T_NECK = [(n, w, fn) for n, w, fn in parts.NECKS]

AXES = {'Suit': T_SUIT, 'Eye': T_EYE, 'Headwear': T_HAT, 'Held Item': T_ITEM,
        'Outfit': T_CLOTH, 'Scene': T_SCENE, 'Effect': T_FX, 'Badge': T_BADGE,
        'Footwear': T_SHOE, 'Hands': T_GLOVE, 'Crest': T_TUBE, 'Neckwear': T_NECK}


def pick(rng, table, none_weight=0, boost=None):
    """Alege dupa greutate. `boost` inmulteste greutatea trasaturilor din lotul curent."""
    b = boost or {}
    ws = [w * b.get(n, 1) for n, w, _ in table]
    tot = sum(ws) + none_weight
    r = rng.random() * tot
    if r < none_weight:
        return None
    r -= none_weight
    for row, w in zip(table, ws):
        r -= w
        if r <= 0:
            return row
    return table[-1]


def by_name(table, name):
    for row in table:
        if row[0] == name:
            return row
    raise KeyError(name)


def choose(rng, axis, fixed, key, lot, none_key=None):
    """Un singur loc pentru: valoare impusa, valoare goala impusa, sau tragere cu boost."""
    table = AXES[axis]
    if key in fixed:
        v = fixed[key]
        return by_name(table, v) if v else None
    only = (lot or {}).get('only', {}).get(axis)
    if only:
        table = [r for r in table if r[0] in only]
    nw = 0
    if none_key and lot:
        nw = lot.get('none', {}).get(none_key, 0)
    elif none_key:
        nw = {'hat': 30, 'item': 34, 'cloth': 40, 'fx': 46, 'badge': 58}[none_key]
    return pick(rng, table, nw, (lot or {}).get('boost', {}).get(axis))


def build_spec(rng, fixed=None, lot=None):
    f = dict(fixed or {})
    if 'mat' in f:
        f['suit'] = f.pop('mat')

    suit = choose(rng, 'Suit', f, 'suit', lot)
    kind, payload = suit[2]
    material = payload if kind == 'mat' else None
    suit_c = payload if kind == 'flat' else (249, 214, 2)

    eye = choose(rng, 'Eye', f, 'eye', lot)
    h = choose(rng, 'Headwear', f, 'hat', lot, 'hat')
    it = choose(rng, 'Held Item', f, 'item', lot, 'item')
    cl = choose(rng, 'Outfit', f, 'cloth', lot, 'cloth')
    sc = choose(rng, 'Scene', f, 'scene', lot)
    fe = choose(rng, 'Effect', f, 'fx', lot, 'fx')
    bd = choose(rng, 'Badge', f, 'badge', lot, 'badge')
    sh_ = choose(rng, 'Footwear', f, 'shoe', lot)
    gl = choose(rng, 'Hands', f, 'glove', lot)
    tb = choose(rng, 'Crest', f, 'crest', lot)
    # sub cupola de sticla nu exista tuburi: trasatura trebuie sa spuna asta,
    # altfel metadata promite o creasta pe care nu o vezi
    sealed = bool(h and h[2][1])
    nk = choose(rng, 'Neckwear', f, 'neck', lot, 'neck')

    return {
        'suit': suit[0], 'suit_c': suit_c, 'material_fn': material,
        'eye': eye[0], 'eye_c': eye[2],
        'hat': h[0] if h else 'None', 'hat_fn': h[2][0] if h else None,
        'hide_tubes': bool(h and h[2][1]),
        'item': it[0] if it else 'None', 'item_fn': it[2] if it else None,
        'item_mode': getattr(it[2], 'mode', 'hand') if it else None,
        'cloth': cl[0] if cl else 'None', 'cloth_fn': cl[2][0] if cl else None,
        'cloth_clip': cl[2][1] if cl else True, 'cloth_behind': cl[2][2] if cl else False,
        'scene': sc[0], 'scene_fn': sc[2],
        'fx': fe[0] if fe else 'None', 'fx_fn': fe[2] if fe else None,
        'badge': bd[0] if bd else 'Stock Panel', 'badge_fn': bd[2] if bd else None,
        'shoe': sh_[0], 'shoe_c': sh_[2],
        'glove': gl[0], 'glove_c': gl[2],
        'crest': 'Sealed' if sealed else tb[0],
        'crest_draw': None if sealed else tb[2][0], 'crest_c': tb[2][1],
        'neck': nk[0] if nk else 'None', 'neck_fn': nk[2] if nk else None,
    }


def dna(s):
    return '|'.join(str(s[k]) for k in
                    ('suit', 'eye', 'hat', 'item', 'cloth', 'scene', 'fx', 'badge'))


def render(spec):
    suit_c = spec['suit_c']
    eye_c = spec['eye_c']
    material = spec.get('material_fn')

    pal = {
        OUT: (1, 1, 1),
        SUIT: suit_c,
        SUITD: shade(suit_c, 0.74),
        SUITX: shade(suit_c, 0.48),
        EYE: eye_c,
        EYED: shade(eye_c, 0.68),
        MET: (112, 128, 134), METD: (70, 86, 92),
        SHOE: (198, 32, 96), SHOED: (150, 34, 88),
        TUBE: (52, 52, 56),
    }

    b = BALD.copy() if spec.get('hide_tubes') else BASE.copy()
    occ = b != T

    body = Layer()
    for y in range(N):
        for x in range(N):
            s = b[y, x]
            if s == T:
                continue
            if material and s in (SUIT, SUITD, SUITX):
                body.set(x, y, material(x, y, s))
            else:
                body.set(x, y, pal[s])

    # straturile din fata corpului, ca sa stiu unde cade silueta
    front = []
    if spec.get('cloth_fn') and not spec.get('cloth_behind'):
        C = Layer(); spec['cloth_fn'](C)
        if spec['cloth_clip']:
            clothes.clip_to_body(C)
        front.append(C)
    crest_layer = None
    if spec.get('crest_draw') and not spec.get('hide_tubes'):
        Cr = Big(); spec['crest_draw'](Cr)
        hires.bevel(Cr.px, Cr.px[:, :, 3] > 0, 1.14, 0.86, 1.05, 0.93)
        crest_layer = ink.outline_big(Cr, occ)

    neck_layer = None
    if spec.get('neck_fn'):
        Nk = Big(); spec['neck_fn'](Nk)
        hires.bevel(Nk.px, Nk.px[:, :, 3] > 0, 1.18, 0.82, 1.06, 0.92)
        neck_layer = Nk

    hat_layer = None
    if spec.get('hat_fn'):
        H = Layer(); spec['hat_fn'](H)
        hat_layer = ink.outline(H, occ)

    cape = None
    if spec.get('cloth_behind'):
        C = Layer(); spec['cloth_fn'](C)
        cape = ink.outline(C, np.zeros((N, N), bool))

    item_layer = None
    if spec.get('item_fn'):
        I = Layer(); spec['item_fn'](I)
        item_layer = ink.outline(I, np.zeros((N, N), bool))

    bg = Layer()
    spec['scene_fn'](bg)

    # silueta completa, ca sa desprind personajul de scene incarcate
    sil = (body.px[:, :, 3] > 0)
    for L2 in [x for x in (cape, item_layer, hat_layer) if x is not None]:
        sil |= (L2.px[:, :, 3] > 0)
    def grow(m, r):
        o = np.zeros((N, N), bool)
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                ys0, ys1 = max(0, dy), min(N, N + dy)
                xs0, xs1 = max(0, dx), min(N, N + dx)
                o[ys0:ys1, xs0:xs1] |= m[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
        return o
    r1 = grow(sil, 1) & ~sil
    r2 = grow(sil, 2) & ~grow(sil, 1)
    for ring, f in ((r1, 0.62), (r2, 0.84)):
        bg.px[ring, :3] = (bg.px[ring, :3] * f).astype(np.int16)

    # umbra de contact sub talpi
    for i, (x0, x1) in enumerate(((13, 34), (15, 32), (18, 29))):
        y = 45 + i
        if y < N:
            row = bg.px[y, x0:x1 + 1]
            bg.px[y, x0:x1 + 1, :3] = (row[:, :3] * 0.62).astype(np.int16)

    # lumina de muchie, dupa ce stiu culoarea scenei
    char_m = body.px[:, :, 3] > 0
    inner = char_m & (big != OUT)
    rim_c = (255, 238, 186) if special else key
    hires.rim_light(body.px, char_m, inner, rim_c, 0.62 if special else 0.42)
    if hat_layer is not None:
        hm = hat_layer.px[:, :, 3] > 0
        hin = hm & ~np.all(hat_layer.px[:, :, :3] < 12, axis=2)
        hires.rim_light(hat_layer.px, hm, hin, rim_c, 0.50 if special else 0.34)

    if special:
        hires.backlight(bg.px, sil, (250, 214, 120), 5, 0.20)

    layers = [bg]
    if cape is not None:
        layers.append(cape)
    if item_layer is not None and not item_front:
        layers.append(item_layer)
    layers.append(body)
    if crest_layer is not None:
        layers.append(crest_layer)
    if neck_layer is not None:
        layers.append(neck_layer)
    if item_layer is not None and item_front:
        layers.append(item_layer)
    if spec.get('badge_fn'):
        B = Layer(); spec['badge_fn'](B)
        layers.append(B)
    layers.extend(front)
    if hat_layer is not None:
        layers.append(hat_layer)
    if spec.get('fx_fn'):
        F = Layer(); spec['fx_fn'](F)
        layers.append(F)

    return compose(layers, SIZE)




# ---------------------------------------------------------------- grila mare
from v50 import hires
from v50.hires import Big, H, S

HI_SIZE = 1000


def _char_hi(spec):
    """Personajul la 100: silueta lui, marita exact, plus straturile de lumina."""
    suit_c, eye_c = spec['suit_c'], spec['eye_c']
    material = spec.get('material_fn')
    gm, gd = spec.get('glove_c', ((112, 128, 134), (70, 86, 92)))
    sm, sd = spec.get('shoe_c', ((198, 32, 96), (150, 34, 88)))
    tc = spec.get('crest_c') or ((52, 52, 56), (24, 24, 28))
    pal = {OUT: (1, 1, 1), SUIT: suit_c, SUITD: shade(suit_c, 0.74),
           SUITX: shade(suit_c, 0.48), EYE: eye_c, EYED: shade(eye_c, 0.68),
           MET: gm, METD: gd, SHOE: sm, SHOED: sd, TUBE: tc[0]}

    # creasta desenata inlocuieste tuburile lui
    replace_crest = spec.get('crest_draw') is not None
    small = BALD if (spec.get('hide_tubes') or replace_crest) else BASE
    big = hires.upscale(small)
    L = Big()
    ys, xs = np.nonzero(big != T)
    for y, x in zip(ys, xs):
        s = big[y, x]
        if material is not None and s in (SUIT, SUITD, SUITX):
            L.px[y, x] = (*material(x, y, s), 255)   # tipar la rezolutia mare
        else:
            L.px[y, x] = (*pal[s], 255)

    suit_m = np.isin(big, (SUIT, SUITD, SUITX))
    if material is None:
        hires.soften_shade(L.px, big == SUIT, big == SUITD, 0.45)
        hires.soften_shade(L.px, big == SUITD, big == SUITX, 0.45)
    hires.body_gradient(L.px, suit_m, 1.10, 0.86)
    hires.form_shade(L.px, suit_m)
    for slot in (MET, METD, SHOE, SHOED):
        m = big == slot
        if m.any():
            hires.bevel(L.px, m, 1.18, 0.82, 1.07, 0.92)
    eye_m = np.isin(big, (EYE, EYED))
    if eye_m.any():
        hires.lens(L.px, eye_m)
    tube_m = big == TUBE
    if tube_m.any():
        hires.tube_light(L.px, tube_m, 1.5 if spec.get('crest_c') else 1.6)
    return L, big


def _fringe(bg, floor_y=88):
    """Plan apropiat: smocuri din culoarea solului, in fata picioarelor.
    Un singur rand de detaliu, dar el da adancimea."""
    rng = np.random.default_rng(7)
    base = bg.px[min(H - 1, floor_y + 6), H // 2, :3]
    near = hires.mul(tuple(int(v) for v in base), 0.66)
    lit = hires.mul(tuple(int(v) for v in base), 0.86)
    for x in range(H):
        h = int(2 + rng.random() * 5)
        for y in range(H - h, H):
            bg.px[y, x] = (*(lit if y == H - h else near), 255)


def render(spec):
    body, big = _char_hi(spec)
    occ = big != T

    front = []
    if spec.get('cloth_fn') and not spec.get('cloth_behind'):
        C = Big(); spec['cloth_fn'](C)
        if spec['cloth_clip']:
            m = (C.px[:, :, 3] > 0) & ~np.isin(big, (SUIT, SUITD, SUITX))
            C.px[m] = 0
        hires.form_shade(C.px, C.px[:, :, 3] > 0, 3, .13, .17, .08)
        front.append(C)
    badge_layer = None
    if spec.get('badge_fn'):
        B = Big(); spec['badge_fn'](B)
        hires.bevel(B.px, B.px[:, :, 3] > 0, 1.16, 0.84, 1.06, 0.93)
        badge_layer = B                     # se pune PESTE haina: petic cusut pe ea

    crest_layer = None
    if spec.get('crest_draw') and not spec.get('hide_tubes'):
        Cr = Big(); spec['crest_draw'](Cr)
        hires.bevel(Cr.px, Cr.px[:, :, 3] > 0, 1.14, 0.86, 1.05, 0.93)
        crest_layer = ink.outline_big(Cr, occ)

    neck_layer = None
    if spec.get('neck_fn'):
        Nk = Big(); spec['neck_fn'](Nk)
        hires.bevel(Nk.px, Nk.px[:, :, 3] > 0, 1.18, 0.82, 1.06, 0.92)
        neck_layer = Nk

    hat_layer = None
    if spec.get('hat_fn'):
        Hh = Big(); spec['hat_fn'](Hh)
        hires.bevel(Hh.px, Hh.px[:, :, 3] > 0, 1.12, 0.86, 1.05, 0.93)
        hat_layer = ink.outline_big(Hh, occ)

    cape = None
    if spec.get('cloth_behind'):
        C = Big(); spec['cloth_fn'](C)
        hires.form_shade(C.px, C.px[:, :, 3] > 0, 3, .12, .18, .07)
        cape = ink.outline_big(C, np.zeros((H, H), bool))

    # obiectul: pe spate si pe jos se deseneaza in spatele corpului, ca sa treaca
    # in spatele trunchiului; cel din pumn merge in fata, altfel bratul il acopera
    item_layer, item_front = None, spec.get('item_mode') in ('hand', 'carry')
    if spec.get('item_fn'):
        I = Big(); spec['item_fn'](I)
        hires.bevel(I.px, I.px[:, :, 3] > 0, 1.16, 0.84, 1.06, 0.92)
        item_layer = ink.outline_big(I, np.zeros((H, H), bool) if not item_front else occ)

    special = spec.get('one_of_one')

    bg = Big()
    spec['scene_fn'](bg)
    hires.emboss(bg.px, 1.09, 0.90)
    hires.grain(bg.px, 84, H - 1, 0.05)
    _fringe(bg)
    key = hires.key_colour(bg.px)
    hires.recede(bg.px)
    if special:
        hires.spotlight(bg.px, lift=0.24)
    hires.vignette(bg.px, 0.15 if special else 0.12)

    sil = body.px[:, :, 3] > 0
    for L2 in (cape, item_layer, hat_layer, crest_layer):
        if L2 is not None:
            sil |= L2.px[:, :, 3] > 0

    def grow(m, r):
        o = np.zeros((H, H), bool)
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                ys0, ys1 = max(0, dy), min(H, H + dy)
                xs0, xs1 = max(0, dx), min(H, H + dx)
                o[ys0:ys1, xs0:xs1] |= m[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
        return o
    # cu scene desenate, muchia neagra desprinde singura; haloul ramane discret
    g1, g2 = grow(sil, 1), grow(sil, 4)
    for ring, f in (((g1 & ~sil), 0.80), ((g2 & ~g1), 0.92)):
        bg.px[ring, :3] = (bg.px[ring, :3] * f).astype(np.int16)

    for i, (x0, x1) in enumerate(((26, 69), (30, 65), (35, 60), (39, 56))):
        y = 90 + i
        if y < H:
            bg.px[y, x0:x1 + 1, :3] = (bg.px[y, x0:x1 + 1, :3] * 0.60).astype(np.int16)

    # lumina de muchie, dupa ce stiu culoarea scenei
    char_m = body.px[:, :, 3] > 0
    inner = char_m & (big != OUT)
    rim_c = (255, 238, 186) if special else key
    hires.rim_light(body.px, char_m, inner, rim_c, 0.62 if special else 0.42)
    if hat_layer is not None:
        hm = hat_layer.px[:, :, 3] > 0
        hin = hm & ~np.all(hat_layer.px[:, :, :3] < 12, axis=2)
        hires.rim_light(hat_layer.px, hm, hin, rim_c, 0.50 if special else 0.34)

    if special:
        hires.backlight(bg.px, sil, (250, 214, 120), 5, 0.20)

    layers = [bg]
    if cape is not None:
        layers.append(cape)
    if item_layer is not None and not item_front:
        layers.append(item_layer)
    layers.append(body)
    if crest_layer is not None:
        layers.append(crest_layer)
    if item_layer is not None and item_front:
        layers.append(item_layer)
    layers.extend(front)
    if badge_layer is not None:
        layers.append(badge_layer)
    if neck_layer is not None:             # lantul atarna peste haina, nu sub ea
        layers.append(neck_layer)
    if hat_layer is not None:
        layers.append(hat_layer)
    if spec.get('fx_fn'):
        F = Big(); spec['fx_fn'](F)
        layers.append(F)

    out = np.zeros((H, H, 3), dtype=np.int16)
    for L in layers:
        a = L.px[:, :, 3]
        full = a >= 255
        out[full] = L.px[full][:, :3]
        part = (a > 0) & (a < 255)
        if part.any():
            f = (a[part] / 255.0)[:, None]
            out[part] = (out[part] * (1 - f) + L.px[part][:, :3] * f).astype(np.int16)
    if special:
        hires.gold_dust(out, 34, spec.get('dust_seed', 5))
        hires.crest_frame(out)
    elif spec.get('frame'):
        hires.crest_frame(out, spec['frame'], inset=2, notch=5, a=0.5)
    from PIL import Image
    return Image.fromarray(out.astype('uint8')).resize((HI_SIZE, HI_SIZE), Image.NEAREST)
