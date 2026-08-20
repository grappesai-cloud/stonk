"""Materialele de costum.

Regula care lipsea: materialul **modeleaza** tonul de baza, nu il inlocuieste.
Fiecare material are trei tonuri legate intre ele (plin, umbra, umbra adanca),
exact ca sloturile lui, iar tiparul misca luminozitatea cu cel mult un sfert.
Accentele tari apar pe sub o zecime din pixeli. Asa silueta si umbra de forma
raman lizibile; varianta veche picta zgomot peste tot si personajul disparea.
Coordonatele sunt in grila de randare de 100.
"""
import math

MATS = []


def mat(name, weight):
    def deco(fn):
        MATS.append((name, weight, fn))
        return fn
    return deco


def _n(x, y, k=1.0):
    return (math.sin(x * 12.9898 * k + y * 78.233) * 43758.5453) % 1.0


def _mul(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


def ramp(base, s):
    """Tonul cerut de slot: 2 = plin, 3 = umbra, 4 = umbra adanca."""
    return base if s == 2 else (_mul(base, .74) if s == 3 else _mul(base, .48))


def weave(base, s, f, accent=None, hit=False):
    """Tonul de baza miscat cu f, cu un accent rar peste."""
    if hit and accent is not None:
        return accent
    return _mul(ramp(base, s), f)


@mat('Matrix Code', 3)
def _matrix(x, y, s):
    base = (46, 132, 74)
    col = _n(x // 2, 0) > .5
    fall = ((y * 3 + int(_n(x // 2, 1) * 60)) % 34) / 34.0
    if col and fall > .86:
        return (188, 250, 200)
    f = 1.0 + (.22 if col and fall > .55 else -.10)
    return weave(base, s, f)


@mat('Circuit', 3)
def _circ(x, y, s):
    base = (52, 92, 116)
    line = (y % 9 == 3) or (x % 11 == 4)
    node = line and _n(x, y) > .86
    if node:
        return (140, 244, 250)
    return weave(base, s, 1.20 if line else 0.94)


@mat('Cosmic', 2)
def _cos(x, y, s):
    base = (96, 68, 150)
    v = _n(x, y)
    if v > .975:
        return (250, 250, 255)
    f = 1.0 + .22 * math.sin(x * .18 + y * .11) + (.16 if v > .93 else 0)
    return weave(base, s, f)


@mat('Camo', 4)
def _camo(x, y, s):
    base = (96, 116, 68)
    v = math.sin(x * .28 + y * .17) + math.sin(x * .13 - y * .34)
    f = 1.16 if v > .7 else (0.78 if v < -.55 else 1.0)
    return weave(base, s, f)


@mat('Molten', 2)
def _lava(x, y, s):
    """Roca inchisa cu crapaturi incinse: contrastul sta in crapaturi, nu in tot."""
    base = (74, 46, 42)
    v = math.sin(x * .3 + y * .24) + math.sin(y * .46) + .5 * math.sin(x * .11)
    if v > 1.7:
        return (255, 236, 150)
    if v > 1.15:
        return (250, 146, 40)
    if v > .8:
        return (198, 88, 30)
    return weave(base, s, 1.0 + (-.18 if v < -.7 else 0))


@mat('Frozen', 3)
def _ice(x, y, s):
    base = (150, 202, 232)
    v = _n(x, y * 2)
    if v > .95:
        return (250, 253, 255)
    f = 1.0 + .12 * math.sin(y * .4 + x * .12) + (.10 if v > .8 else 0)
    return weave(base, s, f)


@mat('Solid Gold', 2)
def _gold(x, y, s):
    """Aur adevarat: rampa metalica, banda de reflex si o scanteie rara."""
    base = (214, 168, 46)
    band = math.sin((x * .6 + y * 1.05)) 
    if band > .93:
        return (255, 248, 206)
    f = 1.0 + .30 * band ** 3 + .12 * math.sin(y * .22)
    if _n(x, y) > .985:
        return (255, 252, 226)
    return weave(base, s, max(.72, f))


@mat('Overgrown', 3)
def _moss(x, y, s):
    base = (108, 122, 96)
    v = _n(x, y * 1.5)
    if v > .93:
        return (128, 196, 96)
    f = 1.0 + (.18 if v > .72 else (-.14 if v < .28 else 0))
    return weave(base, s, f)


@mat('Glitched', 2)
def _glitch(x, y, s):
    """Glitch citibil: benzi orizontale scurte peste un ton unitar, nu confetti."""
    base = (128, 96, 168)
    band = int(_n(0, y // 3) * 100)
    if band > 88 and (x + band) % 17 < 6:
        return (250, 60, 150) if band % 2 else (60, 240, 230)
    f = 1.0 + (.16 if band > 62 else -.08)
    return weave(base, s, f)


@mat('Chrome', 3)
def _chr(x, y, s):
    base = (168, 178, 192)
    t = abs((x - 50) / 30.0)
    f = 1.22 - .46 * min(1.0, t)
    if t < .12:
        return (246, 250, 255)
    return weave(base, s, f)


@mat('Rusted', 3)
def _rust(x, y, s):
    base = (150, 104, 68)
    v = _n(x * 1.4, y)
    if v > .94:
        return (206, 118, 52)
    f = 1.0 + (.16 if v > .74 else (-.18 if v < .3 else 0))
    return weave(base, s, f)


@mat('Marble', 2)
def _mar(x, y, s):
    base = (226, 224, 218)
    v = math.sin(x * .18 + y * .34) + .6 * math.sin(y * .11)
    if v > 1.25:
        return (146, 150, 166)
    f = 1.0 + (-.12 if v > .85 else .04)
    return weave(base, s, f)


@mat('Neon Wire', 3)
def _nw(x, y, s):
    """Firele raman, dar pe un costum inchis unitar, nu pe confetti."""
    base = (58, 44, 88)
    a = (x + y) % 13 == 0
    b = (x - y) % 17 == 0
    if a:
        return (250, 80, 200)
    if b:
        return (80, 240, 240)
    return weave(base, s, 1.0 + .10 * math.sin(y * .2))


@mat('Denim', 3)
def _den(x, y, s):
    base = (78, 108, 162)
    f = 1.0 + (.10 if (x + y * 2) % 5 == 0 else (-.06 if (x - y) % 7 == 0 else 0))
    return weave(base, s, f)


@mat('Toxic Slime', 2)
def _slime(x, y, s):
    base = (120, 196, 68)
    v = math.sin(x * .3 + y * .42)
    if v > .93:
        return (216, 252, 128)
    f = 1.0 + .18 * v
    return weave(base, s, f)
