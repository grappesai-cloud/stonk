"""Hainele.

Varianta veche umplea trunchiul cu un dreptunghi: personajul parea revopsit, nu
imbracat. La Vlad haina are anatomie - guler in jurul gatului, revere care se
deschid in V, culoarea costumului se vede pe mijloc, mansetele stau separat pe
brate, iar tivul se termina la sold. Aici e scris asa.

Repere pe grila lui de 50: umeri randurile 16-18, trunchi x 17-32, bratul stang
x 9-16, cel drept x 33-39, soldul randul 32.
"""
import numpy as np
from .core import Layer, BODY_MASK, N

CLOTHES = []
CX, TOP, HEM = 24, 17, 32          # centrul trunchiului, umar, sold


def cloth(name, weight, clip=True, behind=False):
    def deco(fn):
        CLOTHES.append((name, weight, clip, behind, fn))
        return fn
    return deco


def clip_to_body(L):
    m = (L.px[:, :, 3] > 0) & ~BODY_MASK
    L.px[m] = 0
    return L


def sleeves(L, main, dark, y0=TOP + 1, y1=HEM + 2, cuff=None):
    for x0, x1 in ((9, 16), (33, 40)):
        L.rect(x0, y0, x1, y1, main)
        L.vline(x1 if x0 == 9 else x0, y0, y1, dark)
        if cuff:
            L.rect(x0, y1 - 1, x1, y1, cuff)


def collar(L, main, dark, light=None):
    L.rect(14, TOP - 1, 34, TOP + 1, main)
    L.hline(14, 34, TOP + 1, dark)
    if light:
        L.hline(14, 34, TOP - 1, light)


def jacket(L, main, dark, light, gap=3, hem=HEM, lapel=True,
           button=None, do_sleeves=True, do_collar=True):
    """Haina deschisa: doua panouri, gol pe mijloc, revere in V."""
    L.rect(16, TOP, CX - gap, hem, main)
    L.rect(CX + gap + 1, TOP, 34, hem, main)
    L.vline(CX - gap, TOP, hem, dark)
    L.vline(CX + gap + 1, TOP, hem, light)
    L.hline(16, CX - gap, hem, dark)
    L.hline(CX + gap + 1, 34, hem, dark)
    if lapel:
        for i in range(6):                       # reverele se deschid in V
            L.rect(CX - gap - i, TOP + 1 + i, CX - gap, TOP + 1 + i, light)
            L.rect(CX + gap + 1, TOP + 1 + i, CX + gap + 1 + i, TOP + 1 + i, dark)
    if button:
        for y in range(TOP + 8, hem - 1, 4):
            L.set(CX + gap + 2, y, button)
    if do_sleeves:
        sleeves(L, main, dark, TOP + 1, hem + 2)
    if do_collar:
        collar(L, main, dark, light)


@cloth('Lab Coat', 5)
def _lab(L):
    W, S, Hl, K = (242, 244, 246), (188, 192, 200), (255, 255, 255), (44, 46, 52)
    jacket(L, W, S, Hl, gap=3, hem=36, button=K)
    L.rect(19, 27, 22, 30, S)                    # buzunar
    L.hline(19, 22, 27, K)


@cloth('Tuxedo', 3)
def _tux(L):
    K, S, W, R = (32, 32, 40), (66, 66, 78), (244, 244, 240), (188, 32, 52)
    L.rect(CX - 4, TOP, CX + 5, 30, W)           # camasa
    jacket(L, K, (16, 16, 22), S, gap=4, hem=34, button=(200, 176, 96))
    L.rect(CX - 2, TOP + 1, CX + 3, TOP + 2, R)  # papion
    L.set(CX, TOP + 1, K); L.set(CX + 1, TOP + 2, K)


@cloth('Medic Suit', 4)
def _med(L):
    W, S, R, Hl = (244, 246, 244), (196, 200, 198), (206, 38, 46), (255, 255, 255)
    jacket(L, W, S, Hl, gap=2, hem=38, lapel=False, button=S)
    for cx, cy in ((20, 22), (31, 28)):
        L.rect(cx - 1, cy, cx + 1, cy, R); L.vline(cx, cy - 1, cy + 1, R)


@cloth('Hawaiian Shirt', 4)
def _haw(L):
    C, D, Hl, F, G = (34, 158, 152), (18, 106, 104), (86, 208, 200), (240, 96, 118), (250, 214, 92)
    jacket(L, C, D, Hl, gap=2, hem=29, button=(250, 250, 244))
    for (x, y) in ((18, 21), (30, 20), (20, 26), (32, 25), (17, 27), (33, 22)):
        L.set(x, y, F); L.set(x + 1, y, F); L.set(x, y + 1, F); L.set(x + 1, y + 1, G)


@cloth('Puffer Jacket', 4)
def _puf(L):
    C, D, Hl = (56, 92, 190), (30, 56, 132), (98, 142, 232)
    jacket(L, C, D, Hl, gap=2, hem=30, lapel=False)
    for y in range(TOP + 2, 30, 3):              # cusaturi orizontale
        L.hline(16, CX - 2, y, D); L.hline(CX + 3, 34, y, D)
        L.hline(10, 15, y, D); L.hline(34, 39, y, D)
        L.hline(16, CX - 2, y - 1, Hl); L.hline(CX + 3, 34, y - 1, Hl)


@cloth('Poncho', 4)
def _pon(L):
    A, B, C = (176, 92, 52), (120, 54, 30), (230, 198, 122)
    for i, y in enumerate(range(TOP, 36)):       # se largeste spre poale
        w = 9 + i // 3
        L.rect(CX - w, y, CX + 1 + w, y, A)
    for y in (TOP + 4, TOP + 10, TOP + 15):
        L.hline(10, 39, y, C); L.hline(10, 39, y + 1, B)
    L.rect(CX - 4, TOP, CX + 5, TOP + 3, B)      # gura pentru cap
    L.hline(10, 39, 36, B)


@cloth('Hazard Vest', 5)
def _vest(L):
    O, D, Hl, S = (244, 132, 24), (176, 82, 6), (252, 180, 90), (226, 234, 242)
    L.rect(17, TOP + 3, CX - 3, 31, O)           # panouri fata
    L.rect(CX + 4, TOP + 3, 32, 31, O)
    L.hline(17, CX - 3, 31, D); L.hline(CX + 4, 32, 31, D)
    for i in range(5):                           # bretele peste umeri
        L.rect(CX - 6 - i, TOP + i, CX - 4 - i, TOP + i, O)
        L.rect(CX + 5 + i, TOP + i, CX + 7 + i, TOP + i, O)
    L.hline(17, 32, 24, S); L.hline(17, 32, 25, D)
    L.hline(17, 32, 28, S)
    L.vline(17, TOP + 3, 31, Hl); L.vline(32, TOP + 3, 31, D)


@cloth('Armor', 3)
def _arm(L):
    G, D, Hl, K = (140, 148, 160), (86, 94, 108), (196, 204, 216), (40, 44, 54)
    L.rect(18, TOP + 1, 31, 30, G)               # plastron
    L.hline(18, 31, TOP + 1, Hl)
    L.hline(18, 31, 30, D)
    L.vline(CX, TOP + 1, 30, Hl); L.vline(CX + 1, TOP + 1, 30, D)
    for y in (22, 26):
        L.hline(18, 31, y, D); L.hline(18, 31, y + 1, Hl)
    for x0, x1 in ((11, 19), (30, 38)):          # umerare
        for i, y in enumerate(range(TOP - 1, TOP + 6)):
            k = i // 3
            L.rect(x0 + k, y, x1 - k, y, G)
            L.hline(x0 + k, x1 - k, y, Hl if i == 0 else G)
        L.hline(x0, x1, TOP + 5, D)
    L.rect(17, 30, 32, 32, K)                    # centura
    L.rect(CX - 2, 30, CX + 3, 32, (206, 172, 62))


@cloth('Apron', 5)
def _apr(L):
    W, S, R = (240, 240, 236), (192, 192, 188), (198, 46, 62)
    L.rect(20, TOP + 2, 29, 22, W)               # pieptar
    L.rect(18, 23, 31, 37, W)                    # poale
    L.hline(18, 31, 37, S)
    L.vline(18, 23, 37, S); L.vline(31, 23, 37, S)
    for i in range(4):                           # bretele
        L.set(19 - i + 1, TOP + 1 - i + 1, W); L.set(30 + i - 1, TOP + 1 - i + 1, W)
    L.hline(18, 31, 27, S)
    L.rect(22, 31, 27, 34, R)


@cloth('Bandolier', 6)
def _bnd(L):
    B, D, G = (108, 70, 36), (68, 42, 16), (206, 176, 70)
    for i in range(19):
        x = 15 + i
        y = TOP + 1 + i * 14 // 19
        L.rect(x, y, x, y + 2, B)
        L.set(x, y + 2, D)
        if i % 4 == 1:
            L.set(x, y + 1, G)
    L.rect(16, 30, 33, 32, B)                    # centura
    L.hline(16, 33, 32, D)
    L.rect(CX - 2, 30, CX + 2, 32, G)


@cloth('Scarf', 6)
def _sca(L):
    R, D, Hl = (196, 40, 56), (134, 18, 34), (232, 96, 108)
    L.rect(14, TOP - 1, 34, TOP + 2, R)
    L.hline(14, 34, TOP + 2, D); L.hline(14, 34, TOP - 1, Hl)
    L.rect(30, TOP + 3, 33, 28, R)               # capat lasat
    L.vline(33, TOP + 3, 28, D)
    L.hline(30, 33, 28, D)


@cloth('Tool Belt', 6)
def _tb(L):
    B, D, S, G = (112, 76, 38), (70, 42, 16), (172, 180, 192), (206, 172, 62)
    L.rect(15, 29, 34, 32, B)
    L.hline(15, 34, 32, D); L.hline(15, 34, 29, (150, 106, 58))
    L.rect(CX - 2, 29, CX + 2, 32, G)
    for x in (17, 30):
        L.rect(x, 32, x + 3, 37, B)
        L.hline(x, x + 3, 37, D)
        L.rect(x + 1, 33, x + 2, 35, S)


@cloth('Gold Chains', 5)
def _gc(L):
    G, K, Hl = (248, 214, 86), (58, 42, 8), (255, 246, 190)
    f = getattr(L, 'fine', None)
    if f is None:
        L.rect(16, 18, 34, 20, G)
        return
    for y0, x0, x1 in ((38, 32, 68), (50, 38, 62)):
        for i, x in enumerate(range(x0, x1, 4)):
            y = y0 + abs(i - (x1 - x0) // 8)
            f(x, y, K); f(x + 3, y, K)
            f(x + 1, y, G); f(x + 2, y, G)
            f(x + 1, y - 1, Hl); f(x + 2, y + 1, K)
    import math
    cx, cy, r = 50, 60, 6
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            d = math.hypot(x - cx, y - cy)
            if d > r:
                continue
            f(x, y, K if d > r - 1.4 else (G if d > r - 2.6 else
              (Hl if (x - cx) + (y - cy) < -1 else G)))


@cloth('Backpack', 5, clip=False, behind=True)
def _bp(L):
    B, D, S, Hl = (74, 96, 66), (42, 58, 38), (168, 152, 96), (104, 132, 92)
    L.rect(5, 19, 14, 38, B)                     # ranita in spatele umarului
    L.hline(5, 14, 19, Hl); L.hline(5, 14, 38, D)
    L.vline(5, 19, 38, Hl); L.vline(14, 19, 38, D)
    L.hline(5, 14, 27, S); L.hline(5, 14, 28, D)
    L.rect(35, 19, 44, 38, B)
    L.hline(35, 44, 19, Hl); L.hline(35, 44, 38, D)
    L.hline(35, 44, 27, S); L.hline(35, 44, 28, D)
    L.rect(7, 15, 12, 18, D); L.rect(37, 15, 42, 18, D)


@cloth('Cape', 3, clip=False, behind=True)
def _cape(L):
    C, D, Hl = (128, 26, 46), (74, 10, 24), (176, 48, 72)
    for y in range(TOP + 1, 44):
        w = (y - TOP) // 6
        L.rect(9 - w, y, 13, y, C)
        L.rect(35, y, 39 + w, y, C)
        L.set(9 - w, y, D); L.set(39 + w, y, D)
        if (y - TOP) % 7 == 0:
            L.set(11, y, D); L.set(37, y, D)
    L.rect(13, TOP - 1, 35, TOP + 2, C)
    L.hline(13, 35, TOP + 2, D); L.hline(13, 35, TOP - 1, Hl)
