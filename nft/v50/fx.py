"""Efecte peste toata placa: cateva se vad si in plansele lui (glitch, ninsoare, jar)."""
import math
from .core import N, Layer

FX = []


def fx(name, weight):
    def deco(fn):
        FX.append((name, weight, fn))
        return fn
    return deco


def _n(x, y, k=1.0):
    return (math.sin(x * 12.9898 * k + y * 78.233) * 43758.5453) % 1.0


@fx('Scanlines', 6)
def _scan(L):
    for y in range(0, N, 3):
        for x in range(N):
            L.set(x, y, (200, 220, 240), 40)


@fx('Glitch', 3)
def _gl(L):
    """Felii deplasate, nu dungi peste toata placa: doua randuri alaturate,
    unul colorat si unul intunecat, doar in banda personajului."""
    for i in range(6):
        y = 12 + int(_n(i, 3) * 30)
        c = [(250, 40, 130), (60, 250, 220), (250, 230, 60)][i % 3]
        x0 = 8 + int(_n(i, 9) * 20)
        x1 = min(N - 3, x0 + 5 + int(_n(i, 4) * 11))
        L.rect(x0, y, x1, y, c, 190)
        L.rect(x0 + 1, y + 1, x1 + 1, y + 1, (10, 10, 14), 150)


@fx('Embers', 4)
def _emb(L):
    for i in range(22):
        x, y = int(_n(i, 11) * 49), int(_n(i, 12) * 49)
        L.set(x, y, (250, 168, 48) if i % 3 else (250, 232, 140))


@fx('Snow', 4)
def _snow(L):
    for i in range(30):
        L.set(int(_n(i, 21) * 49), int(_n(i, 22) * 49), (238, 246, 252))


@fx('Sparks', 4)
def _spk(L):
    for i in range(14):
        x, y = int(_n(i, 31) * 46) + 1, int(_n(i, 32) * 46) + 1
        L.set(x, y, (255, 255, 255))
        L.set(x - 1, y, (150, 200, 240)); L.set(x + 1, y, (150, 200, 240))
        L.set(x, y - 1, (150, 200, 240)); L.set(x, y + 1, (150, 200, 240))


@fx('Rain', 4)
def _rain(L):
    for i in range(26):
        x, y = int(_n(i, 41) * 49), int(_n(i, 42) * 44)
        L.rect(x, y, x, min(N - 1, y + 2), (156, 190, 226))


@fx('Bubbles', 3)
def _bub(L):
    for i in range(12):
        x, y = int(_n(i, 51) * 46) + 2, int(_n(i, 52) * 44) + 2
        L.set(x, y, (190, 226, 240)); L.set(x + 1, y, (190, 226, 240))
        L.set(x, y + 1, (190, 226, 240)); L.set(x + 1, y + 1, (232, 246, 250))


@fx('Radiation', 2)
def _rad(L):
    for r in (14, 18, 22):
        for a in range(0, 360, 6):
            x = int(24 + r * math.cos(math.radians(a)))
            y = int(28 + r * 0.7 * math.sin(math.radians(a)))
            if 0 <= x < N and 0 <= y < N:
                L.set(x, y, (140, 250, 120), 90)
