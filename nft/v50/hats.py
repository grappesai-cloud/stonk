"""Palariile.

Ce lipsea: volum. Erau benzi de patru randuri fara calota, iar borurile erau
scanduri de un pixel. La Vlad palaria are calota rotunjita cu trei tonuri, bor
care se lasa la capete si piese laterale (clapete de coif, curea de sapca).
Deasupra capului am doisprezece randuri libere; le foloseam pe patru.

Creastetul e la randul 9, centrul capului la x=25. `dy` coboara piesa: cele care
lasa tuburile la vedere stau cu doua randuri mai jos, fiindca acolo crestetul
original e sub cupola reconstruita.
"""
from .core import Layer

HC, HB = 25, 9
HATS = []


def hat(name, weight, hide_tubes=False, dy=0):
    def deco(fn):
        def wrapped(L):
            tmp = type(L)()
            fn(tmp)
            d = dy
            L.px[:] = tmp.shift(0, d).px if d else tmp.px
        HATS.append((name, weight, hide_tubes, wrapped))
        return fn
    return deco


def crown_dome(L, y0, y1, w_top, w_bot, main, lit, dark, flat_top=False):
    """Calota: se largeste in jos, cu fata luminata la stanga si umbra la dreapta."""
    n = y1 - y0
    for i, y in enumerate(range(y0, y1 + 1)):
        t = i / max(1, n)
        w = int(w_top + (w_bot - w_top) * (t if flat_top else t ** 0.62))
        L.rect(HC - w, y, HC + w, y, main)
        L.rect(HC - w, y, HC - w + max(1, w // 3), y, lit)
        L.rect(HC + w - max(0, w // 4), y, HC + w, y, dark)
    L.hline(HC - w_top, HC + w_top, y0, lit)


def brim(L, half, y, main, dark, droop=1):
    """Bor cu capetele lasate, nu o scandura."""
    L.rect(HC - half, y, HC + half, y, main)
    L.rect(HC - half + 2, y + 1, HC + half - 2, y + 1, dark)
    for k in range(droop):
        L.set(HC - half - 1 - k, y + 1 + k, main)
        L.set(HC + half + 1 + k, y + 1 + k, main)
        L.set(HC - half - 1 - k, y + 2 + k, dark)
        L.set(HC + half + 1 + k, y + 2 + k, dark)


@hat('Crown', 3, dy=3)
def _crown(L):
    G, D, Hl, J = (244, 196, 46), (166, 118, 10), (255, 240, 168), (214, 40, 74)
    for k in range(5):
        x = HC - 8 + k * 4
        L.rect(x - 1, 1, x + 1, 5, G)
        L.rect(x - 1, 1, x - 1, 5, Hl)
        L.set(x + 1, 2, D)
        L.set(x, 0, Hl)
    L.rect(HC - 9, 5, HC + 9, 8, G)
    L.hline(HC - 9, HC + 9, 5, Hl)
    L.hline(HC - 9, HC + 9, 8, D)
    for x in (HC - 6, HC, HC + 6):
        L.rect(x - 1, 6, x, 7, J)
        L.set(x - 1, 6, (250, 130, 150))


@hat('Top Hat', 4)
def _top(L):
    K, S, Hl, B = (30, 30, 38), (62, 62, 74), (96, 96, 112), (196, 28, 60)
    crown_dome(L, 0, 6, 5, 6, K, Hl, (12, 12, 16), flat_top=True)
    L.rect(HC - 7, 4, HC + 7, 6, B)
    L.hline(HC - 7, HC + 7, 4, (232, 72, 100))
    brim(L, 8, 7, K, S)


@hat('Wizard Hat', 3)
def _wiz(L):
    P, D, Hl, S = (98, 60, 176), (52, 28, 104), (140, 100, 224), (250, 224, 92)
    for i, y in enumerate(range(0, 8)):
        L.rect(HC - 2 - i, y, HC + 1 + i // 2, y, P)
        L.set(HC - 2 - i, y, Hl)
        L.set(HC + 1 + i // 2, y, D)
    brim(L, 8, 8, P, D)
    L.set(HC + 1, 3, S); L.set(HC - 4, 5, S); L.set(HC + 2, 6, S)


@hat('Pirate Tricorn', 3)
def _tri(L):
    K, S, T, W = (34, 30, 48), (70, 62, 92), (198, 160, 44), (238, 238, 234)
    crown_dome(L, 0, 6, 4, 6, K, S, (14, 12, 22))
    for i, y in enumerate((5, 6, 7, 8)):        # bor ridicat in trei colturi
        half = 5 + i * 2
        L.rect(HC - half, y, HC + half, y, K)
        L.set(HC - half, y, S)
    L.vline(HC - 10, 4, 8, K); L.vline(HC + 10, 4, 8, K)
    L.set(HC - 9, 3, K); L.set(HC + 9, 3, K)
    L.hline(HC - 10, HC + 10, 8, T)
    L.set(HC - 2, 3, W); L.set(HC + 1, 3, W)
    L.rect(HC - 2, 4, HC + 1, 4, W); L.set(HC - 1, 5, W); L.set(HC, 5, W)


@hat('Bandana', 6, dy=3)
def _band(L):
    R, D, Hl = (198, 36, 52), (132, 18, 32), (238, 86, 96)
    L.rect(HC - 7, 6, HC + 7, 9, R)
    L.hline(HC - 7, HC + 7, 6, Hl)
    L.hline(HC - 7, HC + 7, 9, D)
    for i in range(-6, 7, 3):
        L.set(HC + i, 8, D)
    L.rect(HC + 8, 7, HC + 10, 9, R)            # nod
    L.set(HC + 10, 10, D); L.set(HC + 9, 11, D)


@hat('Chef Hat', 3, dy=1)
def _chef(L):
    W, S, Hl = (246, 246, 242), (198, 198, 196), (255, 255, 255)
    for cx, cy, r in ((HC - 5, 2, 4), (HC + 5, 2, 4), (HC, 0, 5)):
        for y in range(cy - r + 1, cy + r):
            half = int((r * r - (y - cy) ** 2) ** .5)
            L.rect(cx - half, y, cx + half, y, W)
            L.set(cx - half, y, Hl)
    L.rect(HC - 6, 4, HC + 6, 8, W)
    L.hline(HC - 6, HC + 6, 8, S)
    L.hline(HC - 6, HC + 6, 6, S)
    L.vline(HC + 6, 4, 8, S)


@hat('Straw Hat', 5)
def _straw(L):
    S, D, B, Hl = (218, 182, 100), (156, 118, 44), (140, 92, 42), (244, 220, 156)
    crown_dome(L, 0, 6, 3, 6, S, Hl, D)
    L.rect(HC - 6, 6, HC + 6, 6, B)
    brim(L, 7, 7, S, D, 2)


@hat('Cowboy Hat', 4)
def _cow(L):
    B, D, Hl = (134, 86, 46), (82, 48, 22), (182, 132, 82)
    crown_dome(L, 0, 6, 3, 6, B, Hl, D)
    L.vline(HC, 2, 4, D)                        # sant pe mijloc
    L.rect(HC - 6, 6, HC + 6, 6, D)
    brim(L, 8, 7, B, D, 2)


@hat('Kabuto', 2)
def _kab(L):
    R, D, Hl, G, K = (172, 36, 42), (104, 16, 22), (214, 78, 78), (240, 198, 62), (38, 34, 40)
    crown_dome(L, 0, 7, 4, 7, R, Hl, D)
    L.hline(HC - 9, HC + 9, 7, D)
    L.hline(HC - 9, HC + 9, 6, K)
    for i in range(6):                          # coarne aurii
        L.rect(HC - 7 - i, 1 - i + (i * i) // 6, HC - 6 - i, 2 - i + (i * i) // 6, G)
        L.rect(HC + 6 + i, 1 - i + (i * i) // 6, HC + 7 + i, 2 - i + (i * i) // 6, G)
    L.rect(HC - 3, 3, HC + 3, 4, G)             # creasta frontala
    L.rect(HC - 1, 1, HC + 1, 3, G)
    for i, y in enumerate(range(8, 12)):        # clapete peste obraji
        w = 9 + i // 2
        L.rect(HC - w, y, HC - 6, y, D if i % 2 else K)
        L.rect(HC + 6, y, HC + w, y, D if i % 2 else K)
        L.set(HC - w, y, Hl)


@hat('Pith Helmet', 4)
def _pith(L):
    K, D, Hl = (208, 192, 142), (148, 132, 88), (240, 230, 194)
    crown_dome(L, 0, 6, 3, 6, K, Hl, D)
    L.hline(HC - 7, HC + 7, 6, D)
    brim(L, 8, 7, K, D, 1)
    L.vline(HC, 2, 5, Hl)


@hat('Cap', 6, dy=4)
def _cap(L):
    B, D, Hl = (40, 68, 158), (20, 36, 104), (78, 116, 214)
    crown_dome(L, 0, 7, 3, 6, B, Hl, D)
    L.hline(HC - 7, HC + 7, 7, D)
    L.rect(HC - 11, 6, HC - 6, 7, B)            # cozoroc spre stanga
    L.hline(HC - 11, HC - 6, 7, D)
    L.set(HC - 12, 7, D)
    L.set(HC, 1, D)


@hat('Beret', 4, dy=3)
def _beret(L):
    R, D, Hl = (192, 38, 60), (126, 16, 34), (232, 92, 108)
    for i, y in enumerate(range(3, 9)):
        w = 4 + i
        L.rect(HC - w, y, HC + w - 1, y, R)
        L.set(HC - w, y, Hl); L.set(HC + w - 1, y, D)
    L.hline(HC - 9, HC + 8, 8, D)
    L.rect(HC + 8, 3, HC + 9, 4, R)             # codita
    L.set(HC + 9, 2, D)


@hat('Space Dome', 2, True)
def _dome(L):
    G, S, R, D = (168, 216, 234), (240, 252, 255), (176, 184, 194), (108, 116, 128)
    cx, cy, r = 24, 13, 10
    for y in range(cy - r, cy + r + 1):
        dy = y - cy
        half = int((r * r - dy * dy) ** .5)
        if half <= 0:
            continue
        L.rect(cx - half, y, cx + half, y, G, 62)
        L.set(cx - half, y, R); L.set(cx + half, y, D)
    L.rect(cx - 3, cy - r, cx + 3, cy - r, R)
    for dx, dy in ((-6, -6), (-7, -5), (-7, -4), (-6, -3)):
        L.set(cx + dx, cy + dy, S)
    L.rect(cx - 6, cy + r - 1, cx + 6, cy + r + 1, R)   # guler
    L.hline(cx - 6, cx + 6, cy + r + 1, D)


@hat('Halo', 2, dy=5)
def _halo(L):
    G, W, D = (252, 220, 88), (255, 252, 220), (184, 138, 14)
    for y, (ho, hi) in ((0, (6, 3)), (1, (8, 5)), (2, (8, 5)), (3, (6, 3))):
        L.rect(HC - ho, y, HC - hi, y, G)       # inel vazut din unghi
        L.rect(HC + hi, y, HC + ho, y, G)
    L.rect(HC - 3, 0, HC + 3, 0, G)
    L.rect(HC - 3, 3, HC + 3, 3, D)
    L.hline(HC - 3, HC + 3, 0, W)
    L.set(HC - 8, 1, W); L.set(HC + 8, 2, D)


@hat('Horns', 3, dy=3)
def _horn(L):
    R, D, Hl = (182, 38, 48), (106, 12, 22), (232, 92, 96)
    for side in (-1, 1):
        for i in range(6):
            x = HC + side * (5 + i)
            y = 9 - i * 2 + (i * i) // 4
            w = 2 if i < 4 else 1
            L.rect(x - (w - 1 if side < 0 else 0), y, x + (w - 1 if side > 0 else 0), y + 1, R)
            L.set(x, y, Hl if side < 0 else D)
            L.set(x, y + 1, D)
    L.set(HC - 10, 2, D); L.set(HC + 10, 2, D)


@hat('Flames', 2)
def _fire(L):
    A, B, C = (250, 92, 22), (250, 176, 34), (252, 240, 160)
    L.rect(HC - 8, 6, HC + 8, 8, A)
    L.hline(HC - 8, HC + 8, 6, B)
    for x, top in ((HC - 6, 3), (HC - 2, 0), (HC + 2, 2), (HC + 6, 4)):
        L.rect(x, top, x + 1, 7, A)
        L.rect(x, top + 2, x + 1, 6, B)
        L.set(x, top, C)


@hat('Hard Hat', 5)
def _hard(L):
    Y, D, Hl, S = (250, 148, 20), (156, 78, 4), (252, 200, 96), (196, 108, 8)
    crown_dome(L, 0, 6, 3, 6, Y, Hl, D)
    L.vline(HC, 2, 5, Hl)                       # nervura
    L.vline(HC - 1, 2, 5, S); L.vline(HC + 1, 2, 5, S)
    L.rect(HC - 7, 6, HC + 7, 7, (44, 40, 44))   # banda inchisa
    brim(L, 8, 8, Y, D, 1)
    L.rect(HC - 3, 2, HC + 3, 3, Hl)


@hat('Headphones', 5, dy=2)
def _hp(L):
    K, S, C, Hl = (40, 40, 48), (108, 114, 124), (86, 216, 232), (150, 156, 168)
    for side in (-1, 1):
        x = HC + side * 8
        L.rect(x - 1, 6, x + 1, 12, K)
        L.set(x, 8, S); L.set(x, 9, C)
        L.vline(x - 1, 6, 12, Hl if side < 0 else K)
    for i, x in enumerate(range(HC - 8, HC + 9)):
        y = 5 - min(2, min(x - (HC - 8), (HC + 8) - x))
        L.set(x, y, S); L.set(x, y + 1, K)


@hat('Bucket Hat', 5)
def _buck(L):
    C, D, Hl = (76, 148, 120), (44, 98, 76), (116, 190, 158)
    crown_dome(L, 1, 7, 4, 6, C, Hl, D, flat_top=True)
    L.hline(HC - 7, HC + 7, 6, D)
    brim(L, 8, 8, C, D, 2)


@hat('Viking Helm', 2)
def _vik(L):
    S, D, Hl, Ho = (152, 160, 172), (94, 102, 116), (200, 208, 220), (228, 216, 188)
    crown_dome(L, 0, 7, 3, 6, S, Hl, D)
    L.vline(HC, 2, 7, Hl); L.vline(HC + 1, 2, 7, D)
    L.hline(HC - 7, HC + 7, 7, D)
    L.rect(HC - 1, 6, HC, 11, S)                # aparatoare de nas
    L.set(HC + 1, 6, D)
    for side in (-1, 1):
        for i in range(5):
            x = HC + side * (8 + i)
            y = 5 - i - (i * i) // 5
            L.rect(x, y, x + (0 if side < 0 else 1), y + 1, Ho)
            L.set(x, y, (250, 242, 220) if side < 0 else (176, 164, 138))


@hat('Party Hat', 4)
def _party(L):
    A, B, C = (238, 62, 116), (86, 216, 232), (250, 220, 92)
    for i, y in enumerate(range(1, 9)):
        w = i // 2
        L.rect(HC - w, y, HC + w, y, A if (y // 2) % 2 else B)
        L.set(HC - w, y, (255, 255, 255))
    L.rect(HC - 3, 0, HC + 3, 1, C)
    L.set(HC, 0, (255, 255, 255))
    L.rect(HC - 5, 9, HC + 5, 9, C)


@hat('Visor', 6, dy=6)
def _vis(L):
    C, D, S, K = (52, 200, 214), (24, 128, 142), (206, 250, 254), (36, 40, 46)
    L.rect(HC - 8, 4, HC + 8, 4, K)             # rama sus
    L.rect(HC - 8, 8, HC + 8, 8, K)             # rama jos
    L.vline(HC - 8, 4, 8, K); L.vline(HC + 8, 4, 8, K)
    L.rect(HC - 7, 5, HC + 7, 7, C, 138)        # lentila: ochiul se vede prin ea
    L.hline(HC - 7, HC + 7, 5, S)
    L.rect(HC + 9, 5, HC + 11, 7, K)            # curea


@hat('Laurel', 3, dy=3)
def _lau(L):
    G, D, Hl = (112, 184, 84), (58, 114, 44), (168, 222, 128)
    for i in range(8):
        y = 8 - i // 2
        for side in (-1, 1):
            x = HC + side * (10 - i)
            L.rect(x, y - 1, x, y, G)
            if i % 2 == 0:
                L.set(x + side, y - 2, Hl); L.set(x, y - 2, D)
    L.rect(HC - 2, 3, HC + 2, 4, (240, 206, 72))
    L.hline(HC - 2, HC + 2, 3, (255, 238, 150))


@hat('Beacon', 4, dy=3)
def _bea(L):
    S, D, R, W = (144, 152, 164), (88, 96, 110), (244, 56, 66), (252, 216, 216)
    L.rect(HC + 1, 3, HC + 2, 9, S)
    L.vline(HC + 2, 3, 9, D)
    L.rect(HC - 1, 0, HC + 3, 3, R)
    L.rect(HC - 1, 0, HC + 1, 1, W)
    L.rect(HC - 4, 8, HC + 5, 9, S)
    L.hline(HC - 4, HC + 5, 9, D)
    L.hline(HC - 4, HC + 5, 8, (188, 196, 208))
