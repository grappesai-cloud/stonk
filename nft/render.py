# -*- coding: utf-8 -*-
"""Deseneaza o grila de litere intr-un PNG marit, cu fundal si rama HUD."""
from PIL import Image, ImageDraw

SCALE = 24           # cati pixeli reali are un pixel logic
PAD = 4              # margine in pixeli logici in jurul personajului

def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16), a)

def draw_grid(img, grid, palette, ox=0, oy=0, scale=SCALE):
    """Pune grila de litere pe imagine, la offsetul dat (in pixeli logici)."""
    px = img.load()
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            if ch == '.' or ch not in palette:
                continue
            col = palette[ch]
            if col is None:
                continue
            X0, Y0 = (ox + x) * scale, (oy + y) * scale
            for yy in range(Y0, Y0 + scale):
                for xx in range(X0, X0 + scale):
                    px[xx, yy] = col

def new_tile(logical, bg):
    return Image.new('RGBA', (logical * SCALE, logical * SCALE), bg)
