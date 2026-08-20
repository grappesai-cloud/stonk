"""Obiecte de scena desenate direct pe grila de 100, cu mai multe tonuri si lumina.
Aici sta diferenta dintre un fundal plat si unul care pare desenat de mana."""
import math
import numpy as np
from .hires import H, lerp, mul, BAYER

GROUND = 88


def _rnd(seed):
    return np.random.default_rng(seed)


def px(L, x, y, c, a=255):
    L.fine(x, y, c, a)


def box(L, x0, y0, x1, y1, c):
    for y in range(max(0, y0), min(H, y1 + 1)):
        for x in range(max(0, x0), min(H, x1 + 1)):
            L.fine(x, y, c)


def hl(L, x0, x1, y, c):
    box(L, x0, y, x1, y, c)


def vl(L, x, y0, y1, c):
    box(L, x, y0, x, y1, c)


def sky(L, y0, y1, top, bot, dither=0.09):
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0)
        base = lerp(top, bot, t)
        for x in range(H):
            f = 1.0 + dither * (BAYER[y % 4, x % 4] - .5) * 2
            L.fine(x, y, mul(base, f))


def stars(L, n, y1=60, seed=1, c=(232, 238, 250)):
    r = _rnd(seed)
    for _ in range(n):
        x, y = int(r.random() * H), int(r.random() * y1)
        b = r.random()
        L.fine(x, y, c if b > .6 else mul(c, .62))
        if b > .93:
            L.fine(x - 1, y, mul(c, .5)); L.fine(x + 1, y, mul(c, .5))


def ground(L, c, y=GROUND, texture=True, seed=2):
    box(L, 0, y, H - 1, H - 1, c)
    hl(L, 0, H - 1, y, mul(c, 1.22))
    hl(L, 0, H - 1, y + 1, mul(c, 1.08))
    if texture:
        r = _rnd(seed)
        for _ in range(150):
            x, yy = int(r.random() * H), y + 2 + int(r.random() * (H - y - 2))
            L.fine(x, yy, mul(c, 0.82 if r.random() > .5 else 1.14))


def rock(L, cx, cy, w, h, base, moss=None, seed=3):
    """Stanca cu silueta neregulata, fata luminata si umbra, optional muschi."""
    r = _rnd(seed)
    lit, mid, dark = mul(base, 1.28), base, mul(base, 0.66)
    # silueta se largeste spre baza si are muchii frante, nu rotunde
    prof, step = [], 0
    for i in range(h):
        t = i / max(1, h - 1)
        ww = int(w * (0.14 + 0.86 * t ** 0.78))
        if r.random() > .62:
            step = int(r.integers(-1, 3))
        prof.append(max(1, ww + step))
    for i, ww in enumerate(prof):
        y = cy - h + i
        box(L, cx - ww, y, cx + ww, y, mid)
        box(L, cx - ww, y, cx - ww + max(1, ww // 2), y, lit)   # fata luminata
        box(L, cx + ww - max(1, ww // 3), y, cx + ww, y, dark)
        if i and prof[i - 1] < ww:                              # muchia de sus
            box(L, cx - ww, y, cx - prof[i - 1] - 1, y, mul(base, 1.42))
            box(L, cx + prof[i - 1] + 1, y, cx + ww, y, mul(base, 1.05))
    for k in range(h // 3):
        y = cy - h + 2 + int(r.random() * (h - 3))
        x = cx - prof[min(len(prof) - 1, y - cy + h)] + 2
        box(L, x, y, x + int(r.random() * 4) + 1, y, dark)
    if moss:
        for _ in range(w):
            i = int(r.random() * (h // 2))
            y = cy - h + i
            ww = prof[i]
            x = cx - ww + int(r.random() * ww * 2)
            L.fine(x, y, moss)
            if r.random() > .5:
                L.fine(x, y + 1, mul(moss, .78))


def tuft(L, x, y, h, c, seed=4):
    """Smoc de iarba cu fire de latimi diferite."""
    r = _rnd(seed + x)
    for k in range(3 + int(r.random() * 3)):
        dx = x + k - 2
        hh = max(2, int(h * (.5 + r.random() * .7)))
        for i in range(hh):
            L.fine(dx + (1 if i > hh * .7 and k % 2 else 0), y - i,
                   mul(c, 1.18) if i > hh - 2 else c)


def bamboo(L, x, y0, y1, c, seed=5):
    lit, dark = mul(c, 1.3), mul(c, .6)
    box(L, x, y0, x + 3, y1, c)
    vl(L, x, y0, y1, lit)
    vl(L, x + 3, y0, y1, dark)
    for y in range(y0 + 4, y1, 9):
        hl(L, x, x + 3, y, dark)
        hl(L, x, x + 3, y + 1, lit)
    r = _rnd(seed)
    for y in range(y0 + 6, y1 - 6, 14):
        d = 1 if r.random() > .5 else -1
        for i in range(5):
            L.fine(x + (4 if d > 0 else -1) + d * i, y - i, lit if i < 2 else c)


def building(L, x, y, w, h, c, win=(250, 224, 140), seed=6, lit=.5):
    r = _rnd(seed)
    box(L, x, y, x + w, y + h, c)
    vl(L, x, y, y + h, mul(c, 1.25))
    vl(L, x + w, y, y + h, mul(c, .68))
    hl(L, x, x + w, y, mul(c, 1.35))
    for wy in range(y + 3, y + h - 2, 5):
        for wx in range(x + 2, x + w - 1, 4):
            if r.random() < lit:
                box(L, wx, wy, wx + 1, wy + 2, win)
                L.fine(wx, wy, mul(win, 1.2))
            else:
                box(L, wx, wy, wx + 1, wy + 2, mul(c, .72))


def pillar(L, x, y0, y1, c, seed=7):
    lit, dark = mul(c, 1.24), mul(c, .66)
    box(L, x, y0, x + 7, y1, c)
    vl(L, x, y0, y1, lit); vl(L, x + 1, y0, y1, mul(c, 1.1))
    vl(L, x + 6, y0, y1, dark); vl(L, x + 7, y0, y1, mul(c, .52))
    box(L, x - 2, y0, x + 9, y0 + 3, mul(c, 1.05))
    hl(L, x - 2, x + 9, y0, lit)
    box(L, x - 2, y1 - 3, x + 9, y1, mul(c, .88))
    for y in range(y0 + 6, y1 - 4, 7):
        hl(L, x + 1, x + 6, y, dark)


def water(L, y0, y1, c, seed=8, ripple=(230, 244, 250)):
    r = _rnd(seed)
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0)
        hl(L, 0, H - 1, y, lerp(mul(c, 1.15), mul(c, .7), t))
    for _ in range(26):
        y = y0 + int(r.random() * (y1 - y0))
        x = int(r.random() * H)
        w = 2 + int(r.random() * 6)
        hl(L, x, x + w, y, mul(ripple, .5 + r.random() * .5))


def pipes(L, x0, x1, y, c, seed=9):
    lit, dark = mul(c, 1.3), mul(c, .6)
    box(L, x0, y, x1, y + 3, c)
    hl(L, x0, x1, y, lit); hl(L, x0, x1, y + 3, dark)
    r = _rnd(seed)
    for x in range(x0 + 4, x1, 11):
        box(L, x, y - 1, x + 2, y + 4, mul(c, .84))
        if r.random() > .6:
            L.fine(x + 1, y - 2, (232, 96, 60))


def crate(L, x, y, s, c):
    lit, dark = mul(c, 1.28), mul(c, .62)
    box(L, x, y, x + s, y + s, c)
    hl(L, x, x + s, y, lit); vl(L, x, y, y + s, mul(c, 1.12))
    hl(L, x, x + s, y + s, dark); vl(L, x + s, y, y + s, dark)
    for i in range(1, s, max(2, s // 3)):
        hl(L, x + 1, x + s - 1, y + i, mul(c, .82))


def neon(L, x, y, w, h, c, seed=10):
    box(L, x, y, x + w, y + h, mul(c, .32))
    box(L, x + 1, y + 1, x + w - 1, y + h - 1, c)
    hl(L, x + 1, x + w - 1, y + 1, mul(c, 1.5))
    for k in range(-1, 2):
        L.fine(x - 1, y + h // 2 + k, mul(c, .5))
        L.fine(x + w + 1, y + h // 2 + k, mul(c, .5))


def rubble(L, y, c, n=22, seed=11):
    r = _rnd(seed)
    for _ in range(n):
        x = int(r.random() * H)
        w = 1 + int(r.random() * 3)
        box(L, x, y - int(r.random() * 3), x + w, y, mul(c, .7 + r.random() * .5))


def glow(L, cx, cy, rad, c, peak=110):
    """Halou moale, nu disc plin: cade repede, ca sa nu apara un cerc de culoare."""
    for y in range(max(0, cy - rad), min(H, cy + rad + 1)):
        for x in range(max(0, cx - rad), min(H, cx + rad + 1)):
            d = math.hypot(x - cx, y - cy)
            if d <= rad:
                a = int(peak * (1 - d / rad) ** 2.6)
                if a > 3:
                    L.fine(x, y, c, a)


def volcano(L, cx, base_y, w, h, rock_c, lava_c=(250, 128, 30)):
    """Con cu crater si scurgere, in loc de un bulgare cu un cerc peste."""
    dark, lit = mul(rock_c, .62), mul(rock_c, 1.24)
    for i in range(h):
        t = i / max(1, h - 1)
        ww = int(w * (0.18 + 0.82 * t))
        y = base_y - h + i
        box(L, cx - ww, y, cx + ww, y, rock_c)
        box(L, cx - ww, y, cx - ww + max(1, ww // 2), y, lit)
        box(L, cx + ww - max(1, ww // 3), y, cx + ww, y, dark)
    cw = max(2, int(w * .2))
    box(L, cx - cw, base_y - h, cx + cw, base_y - h + 1, lava_c)
    box(L, cx - cw + 1, base_y - h, cx + cw - 1, base_y - h, mul(lava_c, 1.4))
    glow(L, cx, base_y - h, 9, lava_c, 120)
    for k in range(h // 2):                                   # scurgere
        y = base_y - h + 2 + k * 2
        x = cx + int(2.2 * math.sin(k * .7))
        box(L, x, y, x + 1, y + 1, lava_c)
