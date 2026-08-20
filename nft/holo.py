# -*- coding: utf-8 -*-
"""
Randare "holograma": acelasi personaj, dar desenat din puncte care lumineaza
pe negru, exact cum arata fundalul de pe site. Punctele nu umplu celula, deci
figura se citeste ca o proiectie, nu ca un desen plin.
"""
from PIL import Image, ImageDraw, ImageFilter

# cat de tare lumineaza fiecare slot, si pe ce canal de culoare
BRIGHT = {
    'k': 0.16, 'd': 0.42, 'e': 0.30, 's': 0.66, 'h': 0.92,
    'm': 0.50, 'n': 0.34, 'g': 0.44, 'b': 0.26, 'c': 0.46,
    'v': 1.00, 'w': 1.15, 'y': 0.62, 'a': 0.98,
}

def mix(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)

def render(grid, canvas, scale, channel=(198, 255, 61), rng=None, ox=0, oy=0):
    """Deseneaza grila ca proiectie de puncte si intoarce imaginea."""
    size = canvas * scale
    img = Image.new('RGBA', (size, size), (4, 7, 5, 255))
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    d = ImageDraw.Draw(img)

    dot = max(2, int(scale * 0.58))
    off = (scale - dot) // 2

    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            if ch == '.' or ch not in BRIGHT:
                continue
            f = BRIGHT[ch]
            X = (ox + x) * scale + off
            Y = (oy + y) * scale + off
            col = mix(channel, f) if ch != 'w' else (245, 255, 230)
            gd.rectangle([X - dot, Y - dot, X + dot*2, Y + dot*2],
                         fill=col + (26,))                 # aura
            d.rectangle([X, Y, X + dot - 1, Y + dot - 1], fill=col + (255,))

    glow = glow.filter(ImageFilter.GaussianBlur(radius=scale * 0.6))
    img = Image.alpha_composite(img, glow)

    # baza de proiectie: un disc de lumina sub picioare
    base = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(base)
    u = float(scale)
    bd.ellipse([(ox+7)*u, (oy+31)*u, (ox+25)*u, (oy+34)*u], fill=channel + (90,))
    base = base.filter(ImageFilter.GaussianBlur(radius=scale * 0.9))
    img = Image.alpha_composite(img, base)

    # linii de scanare peste tot
    sc = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sc)
    for yy in range(0, size, max(2, scale // 3)):
        sd.rectangle([0, yy, size, yy + max(1, scale // 8)], fill=(0, 0, 0, 70))
    img = Image.alpha_composite(img, sc)

    # colturi de vizor, ca pe site
    m = int(scale * 1.6)
    L = int(scale * 3.2)
    t = max(2, scale // 6)
    def bar(x0, y0, x1, y1):
        d.rectangle([min(x0,x1), min(y0,y1), max(x0,x1), max(y0,y1)],
                    fill=channel + (150,))
    for (cx, cy, dx, dy) in ((m, m, 1, 1), (size-m, m, -1, 1),
                             (m, size-m, 1, -1), (size-m, size-m, -1, -1)):
        bar(cx, cy, cx + dx*L, cy + t)          # bratul orizontal
        bar(cx, cy, cx + t, cy + dy*L)          # bratul vertical
    return img
