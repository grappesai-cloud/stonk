"""Trasaturi noi, luate din plansele lui: incaltamintea, manusile, tuburile de pe
cap si ce poarta la gat. La el toate astea variaza, la mine erau fixe, si de aia
piesele mele semanau intre ele mai mult decat ale lui.

Incaltamintea si manusile sunt simple schimbari de culoare pe sloturile lui.
Tuburile pot fi si inlocuite cu alta forma (creasta, antene).
"""
from .core import Layer

SHOES, GLOVES, TUBES, NECKS = [], [], [], []


def shoe(name, weight, main, dark):
    SHOES.append((name, weight, (main, dark)))


def glove(name, weight, main, dark):
    GLOVES.append((name, weight, (main, dark)))


shoe('OG Pink', 26, (198, 32, 96), (150, 34, 88))
shoe('White Sneakers', 9, (240, 240, 236), (168, 168, 164))
shoe('Court Green', 7, (108, 206, 88), (62, 140, 48))
shoe('Red Runners', 7, (216, 52, 52), (146, 22, 28))
shoe('Work Boots', 8, (110, 74, 40), (68, 42, 18))
shoe('Steel Toe', 6, (146, 154, 166), (92, 100, 114))
shoe('Gold Kicks', 4, (238, 198, 72), (170, 130, 20))
shoe('Neon Sole', 5, (72, 232, 220), (24, 140, 148))
shoe('Void Black', 6, (46, 46, 54), (24, 24, 30))

glove('Grey Mitts', 30, (112, 128, 134), (70, 86, 92))
glove('Black Tactical', 9, (52, 54, 62), (28, 30, 36))
glove('Gold Gauntlet', 4, (236, 196, 76), (166, 128, 22))
glove('Neon Glow', 5, (96, 244, 196), (30, 148, 128))
glove('Rust Plate', 6, (162, 104, 58), (104, 62, 28))
glove('Bone', 6, (232, 228, 214), (166, 160, 146))


def tube(name, weight, draw=None, colours=None):
    """draw=None inseamna doar recolorare pe tuburile lui."""
    TUBES.append((name, weight, draw, colours))


tube('OG Black', 24, None, ((52, 52, 56), (24, 24, 28)))
tube('Neon Pink', 6, None, ((248, 72, 186), (150, 20, 108)))
tube('Neon Cyan', 6, None, ((72, 226, 240), (18, 128, 148)))
tube('Acid', 5, None, ((160, 244, 72), (78, 148, 20)))
tube('Chrome', 5, None, ((186, 194, 208), (108, 116, 130)))
tube('Gold Wire', 3, None, ((238, 200, 78), (156, 118, 16)))


def _mohawk(L):
    """Creasta cu tepi de inaltimi diferite, nu un bloc."""
    A, B, C = (218, 46, 98), (134, 14, 56), (252, 140, 182)
    for i, x in enumerate(range(20, 33, 2)):
        h = 8 - abs(i - 3) * 2
        top = 10 - max(2, h)
        L.rect(x, top, x + 1, 10, A)
        L.set(x, top, C)
        L.vline(x + 1, top + 1, 10, B)
    L.rect(19, 9, 33, 10, B)


def _antennae(L):
    """Doua antene groase cu bile care lumineaza."""
    S, D, R, Hl = (156, 164, 176), (92, 100, 114), (246, 78, 78), (252, 172, 172)
    for side, x in ((-1, 20), (1, 30)):
        for i in range(7):
            xx = x + side * (i // 3)
            L.rect(xx, 9 - i, xx + 1, 9 - i, S)
            L.set(xx + 1, 9 - i, D)
        bx = x + side * 2
        L.rect(bx - 1, 1, bx + 2, 3, R)
        L.rect(bx - 1, 1, bx, 1, Hl)
    L.rect(19, 9, 33, 10, D)


def _spikes(L):
    S, D, Hl = (176, 184, 198), (98, 106, 122), (226, 232, 244)
    for i, x in enumerate(range(19, 33, 3)):
        h = 7 - abs(i - 2)
        L.rect(x, 10 - h, x + 1, 10, S)
        L.set(x, 10 - h, Hl); L.set(x + 1, 10, D)


tube('Mohawk', 3, _mohawk, None)
tube('Antennae', 3, _antennae, None)
tube('Spikes', 3, _spikes, None)


def neck(name, weight):
    def deco(fn):
        NECKS.append((name, weight, fn))
        return fn
    return deco


@neck('Dog Tags', 5)
def _tags(L):
    S, D, K, Hl = (180, 188, 200), (108, 116, 130), (44, 46, 54), (226, 232, 242)
    for i, x in enumerate(range(17, 33)):
        y = 17 + abs(i - 7) // 2
        L.rect(x, y, x, y + 1, S if i % 2 else D)
    L.rect(22, 21, 26, 27, K)
    L.rect(23, 22, 25, 26, S)
    L.hline(23, 25, 22, Hl)
    L.hline(23, 25, 24, D); L.hline(23, 25, 25, D)
    L.rect(25, 20, 28, 26, K)
    L.rect(26, 21, 27, 25, D)


@neck('Bone Lei', 4)
def _lei(L):
    A, B, C, K = (242, 110, 150), (250, 210, 98), (148, 228, 142), (60, 44, 40)
    for i, x in enumerate(range(16, 34)):
        y = 17 + abs(i - 8) // 2
        c = (A, B, C)[i % 3]
        L.rect(x, y, x, y + 2, c)
        L.set(x, y, tuple(min(255, v + 40) for v in c))
        L.set(x, y + 2, K)


@neck('Medallion', 3)
def _med(L):
    G, K, Hl = (244, 206, 78), (58, 42, 8), (255, 246, 190)
    for i, x in enumerate(range(18, 32)):
        y = 18 + abs(i - 6) // 2
        L.set(x, y, G if i % 2 else K)
    import math
    for y in range(22, 29):
        for x in range(21, 29):
            d = math.hypot(x - 24.5, y - 25)
            if d <= 3.6:
                L.set(x, y, K if d > 2.6 else (Hl if x + y < 48 else G))


@neck('Bandana Tie', 5)
def _tie(L):
    R, D = (196, 44, 58), (132, 18, 34)
    L.rect(18, 17, 31, 19, R)
    L.hline(18, 31, 19, D)
    L.rect(23, 20, 26, 23, R)
    L.hline(23, 26, 23, D)


@neck('Cable Rig', 4)
def _rig(L):
    K, C, S = (44, 46, 54), (86, 216, 232), (128, 136, 148)
    L.rect(16, 16, 33, 19, K)
    L.hline(16, 33, 16, S)
    L.hline(16, 33, 19, (22, 24, 30))
    for x in (19, 23, 27, 31):
        L.rect(x, 17, x, 18, C)
    L.rect(18, 20, 21, 27, K)          # cutie de conexiuni
    L.rect(19, 21, 20, 26, (28, 30, 36))
    L.set(19, 22, C); L.set(20, 24, (250, 120, 90))
    for i in range(5):                 # cablu care atarna
        L.set(28 + (i % 2), 20 + i, S)
