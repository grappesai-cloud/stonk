"""Insigna de pe piept. Panoul original al lui sta la (25-27, 20-23);
variantele se deseneaza peste el, pe aceeasi suprafata."""
from .core import Layer

BX, BY = 25, 20
BADGES = []


def badge(name, weight):
    def deco(fn):
        BADGES.append((name, weight, fn))
        return fn
    return deco


@badge('Biohazard', 4)
def _bio(L):
    Y, K = (244, 208, 40), (24, 22, 20)
    L.rect(BX - 1, BY - 1, BX + 3, BY + 4, Y)
    L.set(BX + 1, BY + 1, K)
    L.set(BX, BY, K); L.set(BX + 2, BY, K)
    L.set(BX, BY + 3, K); L.set(BX + 2, BY + 3, K)
    L.set(BX + 1, BY + 3, K)


@badge('Radiation', 3)
def _rad(L):
    Y, K = (246, 226, 60), (26, 24, 20)
    L.rect(BX - 1, BY - 1, BX + 3, BY + 4, Y)
    L.set(BX + 1, BY + 1, K)
    L.rect(BX, BY, BX + 1, BY, K)
    L.set(BX + 2, BY + 2, K); L.set(BX, BY + 3, K)


@badge('Serial Tag', 5)
def _tag(L):
    W, K = (238, 238, 232), (40, 40, 46)
    L.rect(BX - 2, BY, BX + 4, BY + 3, W)
    L.hline(BX - 2, BX + 4, BY + 3, (176, 176, 172))
    for i in range(3):
        L.vline(BX - 1 + i * 2, BY + 1, BY + 2, K)


@badge('Heart', 3)
def _hrt(L):
    R, D = (232, 52, 84), (168, 22, 48)
    L.rect(BX - 1, BY, BX, BY + 1, R); L.rect(BX + 2, BY, BX + 3, BY + 1, R)
    L.rect(BX - 1, BY + 2, BX + 3, BY + 2, R)
    L.rect(BX, BY + 3, BX + 2, BY + 3, D)
    L.set(BX + 1, BY + 4, D)


@badge('OG Patch', 2)
def _og(L):
    G, K = (240, 202, 62), (48, 38, 8)
    L.rect(BX - 2, BY, BX + 4, BY + 4, G)
    L.rect(BX - 1, BY + 1, BX, BY + 3, K)
    L.rect(BX + 2, BY + 1, BX + 3, BY + 3, K)
    L.set(BX + 1, BY + 3, K)


@badge('Cracked Panel', 4)
def _crk(L):
    D, K = (58, 62, 70), (16, 16, 20)
    L.rect(BX - 1, BY, BX + 3, BY + 4, D)
    for i, (dx, dy) in enumerate(((0, 0), (1, 1), (1, 2), (2, 3), (3, 4))):
        L.set(BX + dx, BY + dy, K)


@badge('Circuit Plate', 4)
def _cir(L):
    G, C = (34, 62, 54), (86, 232, 200)
    L.rect(BX - 2, BY, BX + 4, BY + 4, G)
    L.hline(BX - 2, BX + 4, BY + 1, C)
    L.vline(BX + 1, BY, BY + 4, C)
    L.set(BX - 1, BY + 3, C); L.set(BX + 3, BY + 3, C)
