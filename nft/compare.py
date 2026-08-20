# -*- coding: utf-8 -*-
"""Plansa de comparatie: aceeasi silueta, doua directii de randare."""
import sys, random
sys.path.insert(0, '/Users/alexandrucojanu/stonk-agents-nft')
from PIL import Image
import diver, sprite
from render import new_tile, draw_grid, hexc
from traits import TOPS
from holo import render as holo_render
from gen import tone

CANVAS, SCALE, OX, OY = 40, 20, 4, 4
TILE = CANVAS * SCALE

SUITS = [('#c6ff3d','#8fbf20'), ('#ff8a1f','#c25f0c'),
         ('#3fb8ff','#1f7fbd'), ('#ff3d9e','#c01f72')]
LENSES = [('#ff2d3d','#ffd0cc'), ('#ffb02e','#ffe9c2'),
          ('#2de0ff','#d3f8ff'), ('#a95dff','#e8d6ff')]
BGS = ['#2b3a5c', '#3d2b4a', '#2c4032', '#5c4433']
RIGS = ['TRIPLE TANK' if 'TRIPLE TANK' in TOPS else 'TWIN TANK',
        'BELL RIG', 'PICK RIG', 'CRATE RIG']
CHANNELS = [(198,255,61), (255,176,46), (45,224,255), (169,93,255)]

def merge(top, base, ox, oy):
    """Pune corpul peste stratul de sus, intr-o singura grila de 40x40."""
    g = [list(r) for r in top]
    for y, row in enumerate(base):
        for x, ch in enumerate(row):
            if ch != '.':
                g[oy + y][ox + x] = ch
    return [''.join(r) for r in g]

def pal_for(i):
    l, dk = SUITS[i]
    lc, lh = LENSES[i]
    return {'k': hexc('#0a0f0c'), 'h': hexc(tone(l,1.22)), 's': hexc(l),
            'd': hexc(dk), 'e': hexc(tone(dk,0.7)), 'm': hexc('#9aa691'),
            'n': hexc('#4d574a'), 'v': hexc(lc), 'w': hexc(lh),
            'y': hexc(tone(lc,0.58)), 'a': hexc('#c6ff3d'),
            'b': hexc('#2a2f28'), 'c': hexc(tone('#2a2f28',1.75)),
            'g': hexc('#6f7a68')}

sheet = Image.new('RGBA', (TILE*4, TILE*3), (10,13,10,255))

for i in range(4):
    # rand 1: robotul de acum
    t = new_tile(CANVAS, hexc(BGS[i]))
    draw_grid(t, TOPS[RIGS[i]][0], pal_for(i), scale=SCALE)
    draw_grid(t, sprite.BASE, pal_for(i), OX, OY, SCALE)
    sheet.paste(t, (i*TILE, 0))

    # rand 2: scafandrul, desen plin
    t = new_tile(CANVAS, hexc(BGS[i]))
    draw_grid(t, TOPS[RIGS[i]][0], pal_for(i), scale=SCALE)
    draw_grid(t, diver.BASE, pal_for(i), OX, OY, SCALE)
    sheet.paste(t, (i*TILE, TILE))

    # rand 3: scafandrul, holograma. Straturile se unesc INAINTE de randare:
    # altfel al doilea strat vine cu fundal opac si il acopera pe primul.
    merged = merge(TOPS[RIGS[i]][0], diver.BASE, OX, OY)
    t = holo_render(merged, CANVAS, SCALE, CHANNELS[i])
    sheet.paste(t, (i*TILE, TILE*2))

sheet.thumbnail((1600, 1600), Image.LANCZOS)
sheet.save('out/compare.png')
print('out/compare.png', sheet.size)
