# -*- coding: utf-8 -*-
"""
Silueta "scafandru": rotunjita, adusa de spate, cu o lentila mare rotunda.
E forma din referintele lui Vlad, nu robotul cu colturi.

Se construieste din profil (marginea stanga a fiecarui rand) si se oglindeste,
deci simetria e garantata si formele rotunde ies curate.
"""
W = H = 32

# marginea stanga pentru fiecare rand al corpului; dreapta iese prin oglindire
PROFILE = {
    4: 13, 5: 12, 6: 11, 7: 10, 8: 10, 9: 9, 10: 9, 11: 9, 12: 9,
    13: 8, 14: 8, 15: 8, 16: 7, 17: 7, 18: 7, 19: 6, 20: 6, 21: 6,
    22: 6, 23: 6, 24: 6, 25: 7, 26: 8,
}

LENS = {9: (13, 18), 10: (12, 19), 11: (12, 19), 12: (12, 19), 13: (13, 18)}

def _build():
    g = [['.'] * W for _ in range(H)]

    for y, left in PROFILE.items():
        right = W - 1 - left
        for x in range(left, right + 1):
            g[y][x] = 's'
        g[y][left] = g[y][right] = 'k'
        if right - left > 3:                      # volum: lumina stanga, umbra dreapta
            g[y][left + 1] = 'h'
            g[y][right - 1] = 'd'

    for y in (4, 26):                             # inchide sus si jos
        left = PROFILE[y]; right = W - 1 - left
        for x in range(left, right + 1):
            g[y][x] = 'k'

    for y, (l, r) in LENS.items():                # lentila rotunda
        for x in range(l, r + 1):
            g[y][x] = 'v'
        g[y][l] = g[y][r] = 'k'
    for x in range(13, 19):
        g[8][x] = 'k'; g[14][x] = 'k'
    g[10][14] = g[10][15] = 'w'                   # reflex
    g[12][17] = g[12][18] = 'y'                   # partea umbrita

    for y in range(17, 25):                       # brate
        left = PROFILE[y]; right = W - 1 - left
        for dx in (1, 2):
            g[y][left + dx] = 'd'
            g[y][right - dx] = 'e'
    for y in (23, 24):                            # manusi
        left = PROFILE[y]; right = W - 1 - left
        for dx in (1, 2):
            g[y][left + dx] = g[y][right - dx] = 'g'

    for y in range(21, 23):                       # centura
        for x in range(11, 21):
            g[y][x] = 'd' if y == 21 else 's'

    for y in range(27, 30):                       # picioare
        for x in list(range(11, 15)) + list(range(17, 21)):
            g[y][x] = 's'
        for x in (11, 14, 17, 20):
            g[y][x] = 'k'
        g[y][12] = 'h'; g[y][18] = 'h'
    for y in (30, 31):                            # cizme
        for x in list(range(10, 16)) + list(range(16, 22)):
            g[y][x] = 'b'
        for x in (10, 15, 16, 21):
            g[y][x] = 'k'
        if y == 30:
            g[y][11] = g[y][17] = 'c'

    return [''.join(r) for r in g]

BASE = _build()
