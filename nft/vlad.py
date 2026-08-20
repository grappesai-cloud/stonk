# -*- coding: utf-8 -*-
"""
Personajul din referintele lui Vlad, pe grila de 32x32.

Trei lucruri ii dau silueta si trebuie respectate:
  - trei tuburi CURBATE care ies din spate si se apleaca, nu bare drepte;
  - corpul in forma de clopot: umeri ingusti, solduri late, fund rotunjit;
  - manusi gri late, evazate, la capatul unor brate groase.
"""
W = H = 32

# marginea stanga a corpului pentru fiecare rand; dreapta iese prin oglindire
BODY = {6:12, 7:11, 8:10, 9:10, 10:9, 11:9, 12:9, 13:8, 14:8, 15:8, 16:8,
        17:8, 18:7, 19:7, 20:7, 21:7, 22:7, 23:7, 24:8, 25:9}

DOME = {9:(14,17), 10:(13,18), 11:(13,18), 12:(13,18), 13:(14,17)}

# tuburile: fiecare e o linie franta care urca si se indoaie in spate
TUBES = [
    [(7,11),(5,11),(3,11),(2,10),(1,9)],
    [(7,15),(5,15),(3,15),(2,15),(1,15)],
    [(7,19),(5,19),(3,19),(2,20),(1,21)],
]

def _build():
    g = [['.'] * W for _ in range(H)]
    put = lambda x, y, c: g[y].__setitem__(x, c) if 0 <= x < W and 0 <= y < H else None

    def stroke(points, fill):
        """Trage o linie groasa de 3 prin punctele date."""
        for i in range(len(points) - 1):
            (y0, x0), (y1, x1) = points[i], points[i+1]
            steps = max(abs(y1-y0), abs(x1-x0)) or 1
            for t in range(steps + 1):
                y = y0 + (y1-y0) * t // steps
                x = x0 + (x1-x0) * t // steps
                for dx in (-1, 0, 1):
                    put(x+dx, y, 'k' if abs(dx) else fill)

    for pts in TUBES:
        stroke(pts, 'n')

    # --- corpul clopot -----------------------------------------------------
    for y, left in BODY.items():
        right = W - 1 - left
        for x in range(left, right + 1):
            put(x, y, 's')
        put(left, y, 'k'); put(right, y, 'k')
        if right - left > 4:
            put(left+1, y, 'h'); put(right-1, y, 'd')
    for x in range(BODY[6], W - BODY[6]):
        put(x, 6, 'k')
    for x in range(BODY[25], W - BODY[25]):
        put(x, 26, 'k')

    # --- cupola ------------------------------------------------------------
    for y, (a, b) in DOME.items():
        for x in range(a, b + 1):
            put(x, y, 'v')
        put(a - 1, y, 'k'); put(b + 1, y, 'k')
    for x in range(13, 19):
        put(x, 8, 'k'); put(x, 14, 'k')
    put(14, 10, 'w'); put(15, 10, 'w')
    put(17, 12, 'y'); put(18, 12, 'y')

    # --- grilaj si petic ---------------------------------------------------
    for x in (13, 15, 17):
        put(x, 16, 'e')
    for y in range(18, 21):
        for x in range(14, 19):
            put(x, y, 'm')
    for x in (14, 18):
        put(x, 18, 'k'); put(x, 20, 'k')

    # --- brate groase, in afara corpului -----------------------------------
    for y in range(11, 22):
        for x, c in ((4,'k'), (5,'h'), (6,'s'), (7,'k')):
            put(x, y, c)
        for x, c in ((24,'k'), (25,'s'), (26,'d'), (27,'k')):
            put(x, y, c)
    for x in range(4, 8):
        put(x, 10, 'k'); put(x + 20, 10, 'k')

    # --- manusi late, evazate ----------------------------------------------
    for y in range(22, 26):
        span = (2, 9) if y > 22 else (3, 8)
        for x in range(span[0], span[1] + 1):
            put(x, y, 'g')
        put(span[0], y, 'k'); put(span[1], y, 'k')
        for x in range(W - 1 - span[1], W - span[0]):
            put(x, y, 'g')
        put(W - 1 - span[1], y, 'k'); put(W - 1 - span[0], y, 'k')
    for x in range(2, 10):
        put(x, 26, 'k'); put(W - 1 - x, 26, 'k')
    for y in (23, 24):
        put(5, y, 'n'); put(W - 6, y, 'n')

    # --- picioare si bocanci ----------------------------------------------
    for y in range(27, 30):
        for x in list(range(11, 15)) + list(range(17, 21)):
            put(x, y, 's')
        for x in (11, 14, 17, 20):
            put(x, y, 'k')
        put(12, y, 'h'); put(18, y, 'h')
    for y in range(30, 32):
        for x in list(range(10, 16)) + list(range(16, 22)):
            put(x, y, 'b')
        for x in (10, 15, 16, 21):
            put(x, y, 'k')
        if y == 30:
            put(11, y, 'c'); put(17, y, 'c')
    for x in list(range(10, 16)) + list(range(16, 22)):
        put(x, 31, 'k')

    return [''.join(r) for r in g]

BASE = _build()
