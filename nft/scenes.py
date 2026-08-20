# -*- coding: utf-8 -*-
"""
Fundaluri-scena, desenate din cod pe grila de 40x40 pixeli logici.

Agentul ocupa aproximativ coloanele 9-31 si randurile 4-35, deci scenele isi
tin elementele mari pe margini si in spate, iar linia solului trece pe la
randul 31, ca personajul sa para ca sta pe ceva.
"""

class Painter:
    """Unelte de desen in pixeli logici, nu in pixeli reali."""
    def __init__(self, img, canvas, scale):
        self.px = img.load()
        self.n = canvas
        self.s = scale

    def dot(self, x, y, c):
        """Pune un pixel logic. Daca are transparenta, se amesteca cu ce e
        dedesubt: altfel ar gauri imaginea in loc sa o umbreasca."""
        if not (0 <= x < self.n and 0 <= y < self.n):
            return
        X0, Y0 = x*self.s, y*self.s
        if len(c) == 4 and c[3] < 255:
            a = c[3] / 255.0
            b = self.px[X0, Y0]
            c = (int(b[0] + (c[0]-b[0])*a), int(b[1] + (c[1]-b[1])*a),
                 int(b[2] + (c[2]-b[2])*a), 255)
        for yy in range(Y0, Y0 + self.s):
            for xx in range(X0, X0 + self.s):
                self.px[xx, yy] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(max(0,y0), min(self.n, y1+1)):
            for x in range(max(0,x0), min(self.n, x1+1)):
                self.dot(x, y, c)

    def hline(self, y, x0, x1, c): self.rect(x0, y, x1, y, c)
    def vline(self, x, y0, y1, c): self.rect(x, y0, x, y1, c)

    def fill(self, c): self.rect(0, 0, self.n-1, self.n-1, c)

    def vgrad(self, c1, c2, y0=0, y1=None):
        y1 = self.n-1 if y1 is None else y1
        span = max(1, y1 - y0)
        for y in range(y0, y1+1):
            t = (y - y0) / float(span)
            c = tuple(int(c1[i] + (c2[i]-c1[i])*t) for i in range(4))
            self.hline(y, 0, self.n-1, c)


def C(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16), a)


# ---------------------------------------------------------------- scenele --
def neon_alley(p, rng):
    """Alee de oras, noaptea: cladiri, ferestre aprinse, reclame, asfalt ud."""
    p.vgrad(C('#241a3a'), C('#0e0a1c'))
    for x0, w, h in [(0,6,12),(6,4,17),(30,5,14),(35,5,19),(26,4,10)]:
        p.rect(x0, h, x0+w-1, 31, C('#150f26'))
        for y in range(h+2, 30, 3):                      # ferestre
            for x in range(x0+1, x0+w-1, 2):
                if rng.random() < .55:
                    p.dot(x, y, C(rng.choice(['#ffd45e','#ff6bd0','#57e8ff'])))
    p.rect(1, 14, 4, 19, C('#ff2d7a'))                   # reclama
    p.rect(2, 15, 3, 18, C('#1a0f26'))
    p.rect(35, 8, 38, 11, C('#2de0ff'))
    p.rect(36, 9, 37, 10, C('#1a0f26'))
    p.hline(31, 0, 39, C('#3a2a55'))                     # asfalt
    p.rect(0, 32, 39, 39, C('#191129'))
    for x in range(0, 40, 3):                            # reflexii
        if rng.random() < .5:
            p.vline(x, 33, 35, C('#2a1c42'))

def deep_sea(p, rng):
    """Adanc: coloana de lumina, bule, corali pe fund."""
    p.vgrad(C('#0d5570'), C('#031524'))
    p.rect(14, 0, 24, 22, C('#146a88', 90))              # raza de lumina
    p.rect(17, 0, 21, 30, C('#1b7d9c', 70))
    for _ in range(26):                                  # bule
        p.dot(rng.randrange(40), rng.randrange(4, 32), C('#8fdcf0', 150))
    p.rect(0, 31, 39, 39, C('#0a3346'))                  # nisip
    for x0, h, c in [(0,5,'#c94f8a'),(4,3,'#e07f4a'),(34,4,'#c94f8a'),(37,6,'#5fd6a8')]:
        p.vline(x0, 31-h, 31, C(c))
        p.dot(x0-1, 31-h+1, C(c)); p.dot(x0+1, 31-h+2, C(c))

def lava_field(p, rng):
    """Camp vulcanic: con, cer fierbinte, crapaturi incandescente."""
    p.vgrad(C('#3d1410'), C('#120607'))
    for i in range(9):                                   # vulcan
        p.rect(28-i, 11+i, 39, 11+i, C('#3a201a' if i else '#5c2f22'))
    p.rect(31, 9, 36, 11, C('#ff6a1f'))                  # gura
    p.rect(32, 7, 35, 9, C('#ffb03d'))
    for i in range(5):                                   # lava care curge
        p.vline(33+i%2, 12+i*3, 15+i*3, C('#ff4b12'))
    p.rect(0, 31, 39, 39, C('#1b0c0c'))
    for _ in range(9):                                   # crapaturi
        x = rng.randrange(0, 38); y = rng.randrange(32, 39)
        p.hline(y, x, x+rng.randrange(1,4), C(rng.choice(['#ff4b12','#ffa11f'])))
    for _ in range(16):                                  # scantei
        p.dot(rng.randrange(40), rng.randrange(4, 30), C('#ff8b2e', 190))

def orbit(p, rng):
    """Fereastra de statie: stele, o planeta, cadru metalic."""
    p.fill(C('#04060f'))
    for _ in range(60):
        p.dot(rng.randrange(40), rng.randrange(40), C(rng.choice(['#ffffff','#9fd6ff','#c6ff3d']), 200))
    cx, cy, r = 31, 9, 6                                  # planeta
    for y in range(cy-r, cy+r+1):
        for x in range(cx-r, cx+r+1):
            if (x-cx)**2 + (y-cy)**2 <= r*r:
                p.dot(x, y, C('#c9743f' if (x+y) % 5 else '#8c4b28'))
    p.rect(0, 0, 39, 1, C('#2b3440'))                     # cadru
    p.rect(0, 30, 39, 39, C('#2b3440'))
    p.hline(29, 0, 39, C('#4a5866'))
    for x in range(2, 39, 6):
        p.dot(x, 32, C('#c6ff3d'))

def server_room(p, rng):
    """Camera de servere: dulapuri, leduri, podea in grila."""
    p.vgrad(C('#07160e'), C('#020806'))
    for x0 in (0, 5, 30, 35):                             # dulapuri
        p.rect(x0, 4, x0+3, 30, C('#0d2417'))
        p.rect(x0, 4, x0+3, 4, C('#16351f'))
        for y in range(6, 30, 2):
            p.hline(y, x0+1, x0+2, C('#0a1c12'))
            if rng.random() < .5:
                p.dot(x0+1, y, C(rng.choice(['#3dff8b','#ffd45e','#ff4b6b'])))
    p.hline(31, 0, 39, C('#12301d'))
    for x in range(0, 41, 5):                             # podea
        p.vline(min(x,39), 32, 39, C('#0c2214'))
    for y in range(33, 40, 3):
        p.hline(y, 0, 39, C('#0c2214'))

def ice_shelf(p, rng):
    """Ghetar: turturi, zapada, orizont palid."""
    p.vgrad(C('#9fd8ea'), C('#2d5f7d'))
    for x0, h in ((0,17),(4,11),(34,13),(38,18)):         # tepi de gheata
        for i in range(h):
            w = max(0, (h - i) // 3)
            p.hline(31-i, x0-w, x0+w, C('#dff1f9' if i > h-3 else '#a9d3e6'))
        p.vline(x0, 31-h, 31-h+2, C('#eef8fd'))
    p.rect(0, 31, 39, 39, C('#bcdfee'))
    p.hline(31, 0, 39, C('#7fb4ca'))
    for _ in range(22):
        p.dot(rng.randrange(40), rng.randrange(2, 30), C('#ffffff', 170))
    for _ in range(8):
        x = rng.randrange(40)
        p.hline(rng.randrange(33, 39), x, x+2, C('#9ecbdd'))

def wasteland(p, rng):
    """Pustiu: stanci, praf, semn de avertizare."""
    p.vgrad(C('#a8763f'), C('#4a3320'))
    for x0, h, c in [(0,9,'#3f2a17'),(5,5,'#54381f'),(31,7,'#3f2a17'),(35,11,'#54381f')]:
        for i in range(h):                                # stanci
            p.hline(31-i, x0+i//3, x0+4-i//3, C(c))
        p.hline(31-h, x0+h//3, x0+4-h//3, C('#8a6236'))   # muchie luminata
    p.rect(0, 31, 39, 39, C('#7a5730'))
    p.hline(31, 0, 39, C('#5c3f22'))
    p.vline(4, 22, 31, C('#4a3320'))                      # semn
    p.rect(2, 18, 7, 22, C('#d9b23f'))
    p.rect(3, 19, 6, 21, C('#2a1f10'))
    for _ in range(18):
        p.dot(rng.randrange(40), rng.randrange(24, 39), C('#c99a5c', 130))

def the_pit(p, rng):
    """Holograma de pe site: grila de puncte, hexagon, linii de scanare."""
    p.fill(C('#04070a'))
    for y in range(0, 40, 3):                             # grila
        for x in range(0, 40, 3):
            p.dot(x, y, C('#12351a'))
    import math
    for i in range(6):                                    # hexagon
        a1 = math.radians(60*i - 90); a2 = math.radians(60*(i+1) - 90)
        x1, y1 = 20 + math.cos(a1)*15, 19 + math.sin(a1)*15
        x2, y2 = 20 + math.cos(a2)*15, 19 + math.sin(a2)*15
        for t in range(0, 21):
            p.dot(int(x1 + (x2-x1)*t/20), int(y1 + (y2-y1)*t/20), C('#2f7a2c'))
    for y in range(0, 40, 2):                             # linii de scanare
        p.hline(y, 0, 39, C('#000000', 60))
    p.hline(31, 0, 39, C('#1d4a24'))


def jungle(p, rng):
    """Jungla: frunzis in straturi, liane, lumina care se strecoara."""
    p.vgrad(C('#1d3d24'), C('#0a1a10'))
    for _ in range(9):                                    # trunchiuri
        x = rng.randrange(0, 38)
        p.rect(x, rng.randrange(0, 8), x+1, 31, C('#22351f'))
    for x0, y0 in [(0,2),(6,0),(30,1),(36,4),(14,0),(22,0)]:   # frunze late
        for i in range(5):
            p.hline(y0+i, max(0,x0-i), min(39,x0+4+i), C('#2f5c33' if i%2 else '#3a7040'))
    for _ in range(7):                                    # liane
        x = rng.randrange(0, 40)
        p.vline(x, 0, rng.randrange(6, 20), C('#3f7a45'))
    p.rect(0, 31, 39, 39, C('#1a2e1c'))
    for _ in range(14):                                   # tufe pe sol
        x = rng.randrange(40)
        p.hline(rng.randrange(32, 38), x, x+2, C('#2a4a2c'))
    for _ in range(10):                                   # licurici
        p.dot(rng.randrange(40), rng.randrange(6, 30), C('#c6ff3d', 140))

SCENES = {
    'NEON ALLEY':  neon_alley,
    'DEEP SEA':    deep_sea,
    'LAVA FIELD':  lava_field,
    'ORBIT':       orbit,
    'SERVER ROOM': server_room,
    'ICE SHELF':   ice_shelf,
    'WASTELAND':   wasteland,
    'THE PIT':     the_pit,
    'JUNGLE':      jungle,
}
