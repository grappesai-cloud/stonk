"""Grila nativa a personajului lui Vlad: 50x50, un pixel logic = 20px in imaginea finala."""
import numpy as np

N = 50
T, OUT, SUIT, SUITD, SUITX, EYE, EYED, MET, METD, SHOE, SHOED, TUBE = range(12)

BASE = np.load(__file__.replace('core.py', 'base_idx.npy'))
# varianta fara tuburi, cu craniul reconstruit ca o cupola plina: se foloseste
# la palariile care acopera complet capul. Scoaterea simpla a tuburilor lasa
# craterele prin care intrau si cioturi de contur plutind deasupra.
BALD = np.load(__file__.replace('core.py', 'base_bald.npy'))

# reperele masurate pe sprite
EYE_BOX   = (20, 12, 25, 15)   # x0,y0,x1,y1
PANEL_BOX = (24, 20, 28, 24)
FIST_L    = (9, 34, 14, 41)
FIST_R    = (33, 35, 39, 41)
HEAD_TOP  = 8
TUBE_ROWS = range(0, 13)
BODY_TOP  = 16

SUIT_SLOTS = (SUIT, SUITD, SUITX)
BODY_MASK  = np.isin(BASE, SUIT_SLOTS)


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


class Layer:
    """Un strat de 50x50 cu RGBA, in pixeli logici."""

    def __init__(self):
        self.px = np.zeros((N, N, 4), dtype=np.int16)

    def set(self, x, y, c, a=255):
        if 0 <= x < N and 0 <= y < N:
            self.px[y, x] = (c[0], c[1], c[2], a)

    def rect(self, x0, y0, x1, y1, c, a=255):
        for y in range(max(0, y0), min(N, y1 + 1)):
            for x in range(max(0, x0), min(N, x1 + 1)):
                self.set(x, y, c, a)

    def hline(self, x0, x1, y, c):
        self.rect(x0, y, x1, y, c)

    def vline(self, x, y0, y1, c):
        self.rect(x, y0, x, y1, c)

    def blit(self, rows, ox, oy, pal):
        """rows = lista de siruri; fiecare caracter e o cheie din pal, spatiul e gol."""
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch == ' ':
                    continue
                c = pal.get(ch)
                if c is None:
                    continue
                self.set(ox + i, oy + j, c)

    def shift(self, dx, dy):
        out = Layer()
        for y in range(N):
            for x in range(N):
                if self.px[y, x, 3] > 0:
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < N and 0 <= nx < N:
                        out.px[ny, nx] = self.px[y, x]
        return out

    def over(self, other):
        m = other.px[:, :, 3] > 0
        self.px[m] = other.px[m]


def compose(layers, w=1000):
    """Aduna straturile in ordine si scoate un PNG marit cu NEAREST."""
    out = np.zeros((N, N, 3), dtype=np.int16)
    for L in layers:
        a = L.px[:, :, 3]
        full = a >= 255
        out[full] = L.px[full][:, :3]
        part = (a > 0) & (a < 255)
        if part.any():
            f = (a[part] / 255.0)[:, None]
            out[part] = (out[part] * (1 - f) + L.px[part][:, :3] * f).astype(np.int16)
    from PIL import Image
    im = Image.fromarray(out.astype('uint8'))
    return im.resize((w, w), Image.NEAREST)


def draw_character(palette, material=None):
    """Deseneaza personajul. palette mapeaza slotul -> culoare; material picteaza in masca corpului."""
    L = Layer()
    for y in range(N):
        for x in range(N):
            s = BASE[y, x]
            if s == T:
                continue
            if material is not None and s in SUIT_SLOTS:
                c = material(x, y, s)
            else:
                c = palette[s]
            L.set(x, y, c)
    return L


def strip_tubes():
    """Scoate tuburile si reface muchia crestetului, ca sa nu ramana capul deschis."""
    import numpy as np
    b = BASE.copy()
    b[b == TUBE] = T
    solid = np.isin(b, (SUIT, SUITD, SUITX, EYE, EYED, MET, METD, SHOE, SHOED))
    # muchiile ramase orfane (nu mai ating nimic plin) dispar
    keep = np.zeros((N, N), dtype=bool)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            ys0, ys1 = max(0, dy), min(N, N + dy)
            xs0, xs1 = max(0, dx), min(N, N + dx)
            keep[ys0:ys1, xs0:xs1] |= solid[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
    b[(b == OUT) & ~keep] = T
    # muchie noua acolo unde corpul a ramas descoperit
    for y in range(N):
        for x in range(N):
            if not solid[y, x]:
                continue
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < N and 0 <= nx < N and b[ny, nx] == T:
                    b[ny, nx] = OUT
    return b


BASE_BALD = None
