# -*- coding: utf-8 -*-
"""
Compune piesele din ARTA LUI VLAD, nu din desenul meu.

Personajul e decupat din planşele lui (vezi extract.py) si se aseaza peste
fundaluri. Culoarea costumului si a cupolei se schimba programatic, prin
rotirea nuantei doar in banda de galben, respectiv de rosu: asa raman toate
umbrele si toate detaliile lui, doar culoarea se muta.
"""
import colorsys, os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scenes import Painter, SCENES, C as SC

TILE = 1024
CANVAS = 40                      # grila logica a fundalurilor
BG_SCALE = 26                    # 40 x 26 = 1040, taiem la 1024

# banda de nuanta a costumului galben si a cupolei rosii, in grade
SUIT_BAND = (35, 70)
DOME_BAND = (345, 20)

def _in_band(h_deg, band):
    lo, hi = band
    return lo <= h_deg <= hi if lo <= hi else (h_deg >= lo or h_deg <= hi)

def recolor(img, suit_hue=None, dome_hue=None, suit_sat=1.0):
    """Muta nuanta costumului si a cupolei, pastrand umbrele originale."""
    if suit_hue is None and dome_hue is None:
        return img
    out = img.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            hh, ll, ss = colorsys.rgb_to_hls(r/255.0, g/255.0, b/255.0)
            if ss < 0.18:                     # gri: manusi, tuburi, petic
                continue
            deg = hh * 360.0
            if suit_hue is not None and _in_band(deg, SUIT_BAND):
                nh = suit_hue / 360.0
                ns = min(1.0, ss * suit_sat)
            elif dome_hue is not None and _in_band(deg, DOME_BAND):
                nh = dome_hue / 360.0
                ns = ss
            else:
                continue
            nr, ng, nb = colorsys.hls_to_rgb(nh, ll, ns)
            px[x, y] = (int(nr*255), int(ng*255), int(nb*255), a)
    return out

def scene_bg(name, rng):
    img = Image.new('RGBA', (CANVAS*BG_SCALE, CANVAS*BG_SCALE), (0, 0, 0, 255))
    SCENES[name](Painter(img, CANVAS, BG_SCALE), rng)
    return img.resize((TILE, TILE), Image.NEAREST)

def flat_bg(hex_col):
    return Image.new('RGBA', (TILE, TILE), SC(hex_col))

def place(bg, char, bottom_margin=0.09, height=0.70):
    """Aseaza personajul, marit din pixeli intregi ca sa ramana taios."""
    target_h = int(TILE * height)
    k = max(1, round(target_h / float(char.size[1])))
    ch = char.resize((char.size[0]*k, char.size[1]*k), Image.NEAREST)
    x = (TILE - ch.size[0]) // 2
    y = TILE - ch.size[1] - int(TILE * bottom_margin)
    out = bg.copy()
    out.alpha_composite(ch, (x, max(0, y)))
    return out
