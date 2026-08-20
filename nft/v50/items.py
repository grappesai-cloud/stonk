"""Obiectele, cu trei moduri de purtare in loc de unul singur.

Varianta veche atarna totul vertical in pumnul stang: obiectul iesea pe marginea
placii, bratul il acoperea si nu se intelegea ce e. La Vlad armele lungi stau
**pe spate, in diagonala**, cutiile stau **pe jos** langa picior, iar maruntisul
e tinut in pumn. Trei moduri, deci si trei siluete diferite in colectie.

Totul se deseneaza IN SPATELE corpului, deci ce trece peste trunchi dispare:
la modul de spate exact asta vrem, se vede manerul peste umar si varful sub sold.
"""
from .core import Layer

GX = 10          # pumnul stang
SX = 5           # obiectele mici: prind doar marginea manusii, degetele raman vizibile
ITEMS = []

# axa de pe spate: din stanga jos in dreapta sus, ca teaca de katana
BX0, BY0, BX1, BY1 = 9, 48, 44, 8


def item(name, weight, mode='hand'):
    def deco(fn):
        ITEMS.append((name, weight, fn))
        fn.mode = mode
        return fn
    return deco


def _lerp(a, b, t):
    return a + (b - a) * t


def diag(L, t0, t1, w, c, edge=None):
    """Bara pe axa de pe spate, intre doua fractiuni de lungime."""
    steps = 130
    for i in range(steps + 1):
        t = _lerp(t0, t1, i / steps)
        x = _lerp(BX0, BX1, t)
        y = _lerp(BY0, BY1, t)
        xi, yi = int(round(x)), int(round(y))
        for k in range(w):
            L.set(xi + k, yi, c)
        if edge is not None:
            L.set(xi + w, yi, edge)


def diag_at(t, dx=0, dy=0):
    return int(round(_lerp(BX0, BX1, t))) + dx, int(round(_lerp(BY0, BY1, t))) + dy


# ----------------------------------------------------------------- pe spate
@item('Katana', 3, 'back')
def _kat(L):
    S, D, K, G = (216, 224, 232), (150, 162, 176), (30, 28, 36), (198, 158, 44)
    diag(L, .18, .78, 2, (52, 50, 62), (26, 24, 32))     # teaca
    diag(L, .78, .86, 2, G)                              # garda
    diag(L, .86, 1.0, 2, K, (12, 12, 16))                # maner
    x, y = diag_at(.30)
    L.set(x, y, D); L.set(x + 1, y, S)


@item('Cutlass', 3, 'back')
def _cut(L):
    B, E, G, K = (222, 228, 236), (156, 166, 180), (204, 170, 52), (36, 34, 40)
    diag(L, .20, .74, 2, B, E)
    diag(L, .74, .82, 3, G)
    diag(L, .82, .96, 2, K)
    x, y = diag_at(.22)
    L.set(x - 1, y + 1, B); L.set(x - 2, y + 2, E)


@item('Scythe', 2, 'back')
def _scy(L):
    W, D, S, E = (98, 68, 34), (64, 42, 16), (216, 222, 232), (146, 156, 170)
    diag(L, .05, .95, 2, W, D)
    x, y = diag_at(.95)
    for i in range(9):                                    # lama curbata
        L.set(x - 1 - i, y - (i * i) // 9, S)
        L.set(x - 1 - i, y - (i * i) // 9 + 1, E)


@item('Battle Axe', 3, 'back')
def _axe(L):
    W, D, S, E = (146, 96, 44), (98, 60, 24), (208, 216, 226), (140, 150, 164)
    diag(L, .10, .88, 2, W, D)
    x, y = diag_at(.88)
    for i in range(7):
        k = 3 if 1 <= i <= 5 else 1
        L.rect(x - k, y - i, x + k + 1, y - i, S)
    L.rect(x - 3, y - 3, x - 2, y - 2, E)


@item('Trident', 2, 'back')
def _tri(L):
    S, D = (190, 198, 208), (124, 134, 148)
    diag(L, .06, .90, 2, S, D)
    x, y = diag_at(.90)
    for dx in (-4, 0, 4):
        L.rect(x + dx, y - 5, x + dx + 1, y, S)
    L.rect(x - 4, y - 1, x + 5, y, S)


@item('Arcane Staff', 3, 'back')
def _staff(L):
    W, D, O, Hl = (120, 84, 44), (80, 52, 22), (112, 216, 234), (224, 250, 255)
    diag(L, .04, .92, 2, W, D)
    x, y = diag_at(.94)
    for dy, half in ((-3, 1), (-2, 2), (-1, 2), (0, 1)):
        L.rect(x - half, y + dy, x + 1 + half, y + dy, O)
    L.set(x, y - 2, Hl)


@item('Banner', 1, 'back')
def _ban(L):
    W, D, C, S = (120, 84, 44), (80, 52, 22), (176, 34, 58), (232, 196, 72)
    diag(L, .02, .98, 2, W, D)
    x, y = diag_at(.86)
    for j in range(11):
        w = 8 if j < 8 else 8 - (j - 7) * 2
        L.rect(x + 2, y - 9 + j, x + 1 + w, y - 9 + j, C)
        L.set(x + 1 + w, y - 9 + j, (120, 20, 40))
    L.rect(x + 4, y - 6, x + 6, y - 4, S)


@item('Guitar', 3, 'back')
def _gui(L):
    W, D, S, K = (166, 92, 42), (110, 56, 22), (208, 214, 222), (40, 34, 26)
    diag(L, .12, .74, 2, W, D)
    x, y = diag_at(.10)
    for j, (a, b) in enumerate(((2, 7), (1, 8), (0, 9), (0, 9), (1, 8), (2, 7))):
        L.rect(x - b, y - 4 + j, x - a, y - 4 + j, W)
    L.rect(x - 6, y - 2, x - 4, y, K)
    x2, y2 = diag_at(.78)
    L.rect(x2, y2 - 2, x2 + 3, y2, D)


@item('Baseball Bat', 4, 'back')
def _bat(L):
    W, D = (176, 130, 68), (124, 86, 36)
    diag(L, .14, .72, 2, W, D)
    diag(L, .72, .95, 3, W, D)


@item('Shovel', 4, 'back')
def _sho(L):
    W, D, S, E = (124, 88, 46), (84, 54, 22), (172, 182, 194), (116, 126, 140)
    diag(L, .16, .92, 2, W, D)
    x, y = diag_at(.14)
    L.rect(x - 3, y - 5, x + 3, y, S)
    L.hline(x - 3, x + 3, y, E)


@item('Pickaxe', 4, 'back')
def _pick(L):
    W, D, S, E = (132, 92, 46), (88, 58, 22), (176, 186, 198), (116, 126, 140)
    diag(L, .10, .92, 2, W, D)
    x, y = diag_at(.92)
    for i in range(6):
        L.set(x - 1 - i, y - 1 - (i * i) // 8, S)
        L.set(x + 2 + i, y - 1 - (i * i) // 8, S)
    L.rect(x - 1, y - 2, x + 2, y - 1, E)


@item('Umbrella', 4, 'back')
def _umb(L):
    W, D, C, S = (108, 76, 40), (72, 46, 18), (48, 62, 156), (200, 214, 232)
    diag(L, .06, .88, 2, W, D)
    x, y = diag_at(.90)
    for dy, half in ((-4, 1), (-3, 3), (-2, 5), (-1, 6)):
        L.rect(x - half, y + dy, x + 1 + half, y + dy, C if dy % 2 else S)
    L.rect(x - 7, y, x + 8, y, D)


# ------------------------------------------------------------- purtat in mana
# Pumnul stang: manusa ocupa x 10-13, randurile 34-41. Obiectul purtat se deseneaza
# IN FATA, cu toarta peste degete si corpul atarnand sub el. Desenat in spate,
# manusa acoperea toarta si obiectul parea doar pus alaturi pe jos.
HX, HY = 11, 40


def handle(L, c, dark, y0=33, y1=40, half=3):
    """Toarta ca un arc peste pumn: bara sus si doua brate laterale, cu degetele
    la vedere intre ele. O toarta plina acopera toata manusa si nu se mai vede
    ca e tinuta; asta e diferenta dintre tinut si pus alaturi."""
    L.rect(HX - half, y0, HX + half + 1, y0, (0, 0, 0))
    L.rect(HX - half, y0 + 1, HX + half + 1, y0 + 1, c)
    L.rect(HX - half, y0 + 2, HX + half + 1, y0 + 2, dark)
    for x in (HX - half, HX + half + 1):
        L.vline(x, y0, y1, c)
        L.set(x, y1, dark)
    L.vline(HX - half - 1, y0 + 1, y1, (0, 0, 0))
    L.vline(HX + half + 2, y0 + 1, y1, (0, 0, 0))


@item('Briefcase', 4, 'carry')
def _case(L):
    B, D, Hl, G = (120, 82, 44), (74, 46, 20), (162, 116, 66), (212, 176, 66)
    handle(L, (150, 106, 58), D, 34, 39, 3)
    L.rect(3, 39, 20, 48, B)
    L.hline(3, 20, 39, Hl); L.hline(3, 20, 48, D)
    L.vline(3, 39, 48, Hl); L.vline(20, 39, 48, D)
    L.hline(4, 19, 43, D)
    L.rect(HX - 2, 42, HX + 3, 44, G)
    L.hline(HX - 2, HX + 3, 42, (244, 216, 128))


@item('Money Bag', 3, 'carry')
def _bag(L):
    B, D, Hl, G = (204, 192, 162), (136, 124, 96), (236, 228, 204), (210, 174, 64)
    handle(L, (166, 154, 124), D, 33, 38, 2)
    L.rect(HX - 4, 38, HX + 5, 40, D)
    for y, (a, b) in zip(range(40, 49), ((5, 17), (4, 18), (3, 19), (2, 20), (2, 20),
                                          (2, 20), (3, 19), (4, 18), (6, 16))):
        L.rect(a, y, b, y, B)
        L.set(a, y, Hl); L.set(b, y, D)
    L.rect(9, 43, 14, 45, G)
    L.hline(9, 14, 43, (246, 216, 128))


@item('Lantern', 4, 'carry')
def _lan(L):
    S, D, G, Hl, W = (152, 160, 172), (92, 100, 114), (250, 216, 120), (198, 206, 218), (255, 246, 200)
    handle(L, Hl, D, 32, 37, 4)
    L.rect(4, 37, 19, 39, S)
    L.hline(4, 19, 37, Hl)
    L.rect(4, 39, 19, 46, G)
    L.vline(4, 39, 46, D); L.vline(19, 39, 46, D); L.vline(11, 39, 46, D)
    L.rect(8, 41, 15, 44, W)
    L.rect(3, 47, 20, 49, S)
    L.hline(3, 20, 47, Hl)


@item('Crate of Bricks', 3, 'carry')
def _crate(L):
    B, D, Hl, G = (154, 112, 66), (96, 64, 30), (192, 150, 96), (216, 180, 70)
    handle(L, (128, 90, 48), D, 34, 39, 3)
    L.rect(2, 39, 21, 48, B)
    L.hline(2, 21, 39, Hl); L.hline(2, 21, 48, D)
    L.vline(2, 39, 48, Hl); L.vline(21, 39, 48, D)
    L.hline(3, 20, 43, D)
    for x in (5, 11, 17):
        L.rect(x, 40, x + 3, 42, G)
        L.hline(x, x + 3, 40, (246, 220, 132))


# ------------------------------------------------------------------ in pumn
@item('Pistol', 4)
def _gun(L):
    K, S = (46, 46, 54), (110, 116, 126)
    L.rect(SX - 4, 33, SX + 3, 35, K)
    L.hline(SX - 4, SX + 3, 33, S)
    L.rect(SX + 1, 36, SX + 3, 41, K)
    L.rect(SX - 6, 34, SX - 4, 34, S)


@item('Spray Can', 5)
def _spray(L):
    C, D, K, W = (232, 62, 128), (168, 28, 84), (40, 40, 46), (250, 250, 246)
    L.rect(SX - 3, 32, SX + 2, 43, C)
    L.vline(SX + 2, 32, 43, D)
    L.hline(SX - 3, SX + 2, 32, (250, 130, 180))
    L.rect(SX - 3, 36, SX + 2, 37, W)
    L.rect(SX - 2, 29, SX + 1, 31, K)
    for i, y in enumerate((25, 26, 27)):
        L.set(SX - 2 - i, y, W)


@item('Frying Pan', 4)
def _pan(L):
    K, S = (38, 38, 44), (92, 96, 104)
    L.rect(SX - 5, 29, SX + 3, 34, K)
    L.hline(SX - 5, SX + 3, 29, S)
    L.hline(SX - 5, SX + 3, 34, (18, 18, 22))
    L.rect(SX + 3, 35, SX + 4, 42, K)


@item('Flask', 5)
def _flask(L):
    G, L2, K, W = (110, 220, 140), (188, 250, 206), (200, 210, 214), (250, 255, 252)
    for y, (a, b) in zip(range(33, 41), ((3, 6), (2, 7), (1, 8), (1, 8), (1, 8),
                                          (1, 8), (2, 7), (3, 6))):
        L.rect(SX - 5 + a, y, SX - 5 + b, y, G)
    L.hline(SX - 3, SX + 2, 33, L2)
    L.rect(SX - 1, 28, SX, 32, K)
    L.rect(SX - 2, 26, SX + 1, 27, K)
    L.set(SX - 2, 35, W)


@item('Joystick', 3)
def _joy(L):
    K, R, S = (40, 40, 48), (216, 40, 60), (150, 156, 166)
    L.rect(SX - 4, 37, SX + 4, 43, K)
    L.hline(SX - 4, SX + 4, 37, S)
    L.rect(SX - 1, 31, SX, 36, S)
    L.rect(SX - 2, 28, SX + 1, 30, R)
    L.set(SX - 2, 28, (250, 120, 140))


@item('Diamond', 2)
def _dia(L):
    C, W, D = (110, 226, 240), (238, 252, 255), (52, 156, 186)
    for y, half in ((30, 0), (31, 1), (32, 2), (33, 3), (34, 3), (35, 2), (36, 1), (37, 0)):
        L.rect(SX - half, y, SX + 1 + half, y, C)
    L.set(SX, 31, W); L.set(SX, 32, W); L.set(SX + 1, 33, D)


@item('Wrench', 4)
def _wr(L):
    S, D = (170, 180, 192), (112, 122, 136)
    L.rect(SX - 1, 26, SX, 43, S)
    L.vline(SX, 26, 43, D)
    L.rect(SX - 3, 23, SX + 2, 25, S)
    L.rect(SX - 1, 23, SX, 24, (0, 0, 0))
    L.rect(SX - 3, 44, SX + 2, 45, S)


@item('Torch', 3)
def _torch(L):
    W, D, A, B, C = (118, 82, 42), (78, 50, 20), (250, 96, 22), (250, 178, 34), (252, 240, 160)
    L.rect(SX - 1, 27, SX, 44, W)
    L.vline(SX, 27, 44, D)
    L.rect(SX - 2, 22, SX + 1, 26, A)
    L.rect(SX - 1, 20, SX, 25, B)
    L.set(SX - 1, 18, C); L.set(SX, 19, C)


@item('Chain', 4)
def _chn(L):
    S, D = (162, 170, 182), (104, 112, 126)
    for i, y in enumerate(range(26, 46, 3)):
        x = SX - 1 if i % 2 else SX
        L.rect(x, y, x + 2, y + 1, S)
        L.hline(x, x + 2, y + 1, D)
        L.set(x + 1, y + 2, D)
