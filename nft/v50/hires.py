"""Grila de randare la 100x100: silueta lui ramane exact aceeasi (fiecare pixel al
lui devine un bloc de 2x2), dar peste ea incap detalii de un pixel, care nu aveau
loc pe grila de 50: umbra interioara, lumina de sus, textura si planul apropiat."""
import numpy as np

H = 100          # grila de randare
S = 2            # un pixel al lui = S x S


class Big:
    """Aceeasi interfata ca Layer, dar scrie blocuri de S x S in grila mare.
    Asa functiile deja scrise pentru grila de 50 merg nemodificate."""

    def __init__(self):
        self.px = np.zeros((H, H, 4), dtype=np.int16)

    def set(self, x, y, c, a=255):
        X, Y = x * S, y * S
        if 0 <= X < H and 0 <= Y < H:
            self.px[Y:Y + S, X:X + S] = (c[0], c[1], c[2], a)

    def rect(self, x0, y0, x1, y1, c, a=255):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c, a)

    def hline(self, x0, x1, y, c):
        self.rect(x0, y, x1, y, c)

    def vline(self, x, y0, y1, c):
        self.rect(x, y0, x, y1, c)

    def blit(self, rows, ox, oy, pal):
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch != ' ' and ch in pal:
                    self.set(ox + i, oy + j, pal[ch])

    # desen la rezolutia mare, pentru detalii
    def fine(self, x, y, c, a=255):
        """Cu alfa sub 255 AMESTECA in ce e deja desenat, nu suprascrie.
        Altfel un halou ajunge un disc plin de culoare."""
        if not (0 <= x < H and 0 <= y < H):
            return
        if a >= 255:
            self.px[y, x] = (c[0], c[1], c[2], 255)
            return
        cur = self.px[y, x]
        if cur[3] == 0:
            self.px[y, x] = (c[0], c[1], c[2], a)
        else:
            f = a / 255.0
            self.px[y, x] = (int(cur[0] * (1 - f) + c[0] * f),
                             int(cur[1] * (1 - f) + c[1] * f),
                             int(cur[2] * (1 - f) + c[2] * f), cur[3])

    def shift(self, dx, dy):
        out = Big()
        out.px[:] = np.roll(np.roll(self.px, dy * S, axis=0), dx * S, axis=1)
        if dy > 0:
            out.px[:dy * S] = 0
        elif dy < 0:
            out.px[dy * S:] = 0
        if dx > 0:
            out.px[:, :dx * S] = 0
        elif dx < 0:
            out.px[:, dx * S:] = 0
        return out


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def mul(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


def emboss(px, up=1.14, dn=0.84, skip_alpha=True):
    """Lumina de sus, umbra de jos, pe fiecare margine de culoare din scena.
    Un singur pas care scoate blocurile plate din platitudine."""
    rgb = px[:, :, :3].astype(np.int16)
    diff_up = np.zeros((H, H), bool)
    diff_dn = np.zeros((H, H), bool)
    diff_up[1:] = (np.abs(rgb[1:] - rgb[:-1]).sum(axis=2) > 26)
    diff_dn[:-1] = (np.abs(rgb[:-1] - rgb[1:]).sum(axis=2) > 26)
    solid = px[:, :, 3] > 0
    a = diff_up & solid
    b = diff_dn & solid & ~a
    px[a, :3] = np.clip(rgb[a] * up, 0, 255)
    px[b, :3] = np.clip(rgb[b] * dn, 0, 255)


BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def dither_sky(px, y0, y1, top, bot, amt=0.10):
    """Cer cu trecere in trepte de ordonare, nu benzi plate."""
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0)
        base = lerp(top, bot, t)
        for x in range(H):
            k = BAYER[y % 4, x % 4]
            f = 1.0 + amt * (k - 0.5) * 2
            px[y, x] = (*mul(base, f), 255)


def grain(px, y0, y1, amt=0.07, seed=1):
    """Granulatie fina pe sol, ca sa nu ramana o suprafata moarta."""
    rng = np.random.default_rng(seed)
    n = rng.random((y1 - y0 + 1, H))
    reg = px[y0:y1 + 1, :, :3].astype(np.float32)
    f = 1.0 + (n - 0.5) * 2 * amt
    px[y0:y1 + 1, :, :3] = np.clip(reg * f[:, :, None], 0, 255).astype(np.int16)


def vignette(px, strength=0.22):
    ys, xs = np.mgrid[0:H, 0:H]
    d = np.sqrt(((xs - H / 2) / (H / 2)) ** 2 + ((ys - H / 2) / (H / 2)) ** 2)
    f = np.clip(1.0 - strength * np.clip(d - 0.55, 0, None) / 0.75, 0, 1)
    px[:, :, :3] = np.clip(px[:, :, :3] * f[:, :, None], 0, 255).astype(np.int16)


def upscale(idx):
    return np.repeat(np.repeat(idx, S, axis=0), S, axis=1)


def _shift(m, dy, dx):
    o = np.zeros_like(m)
    ys0, ys1 = max(0, dy), min(H, H + dy)
    xs0, xs1 = max(0, dx), min(H, H + dx)
    o[ys0:ys1, xs0:xs1] = m[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
    return o


def bevel(px, mask, up=1.13, down=0.83, left=1.06, right=0.90):
    """Teseste marginea interioara a unei suprafete: lumina sus-stanga, umbra
    jos-dreapta. Aici se naste volumul; pe grila de 50 nu incapea."""
    rgb = px[:, :, :3].astype(np.float32)
    top = mask & ~_shift(mask, 1, 0)
    bot = mask & ~_shift(mask, -1, 0) & ~top
    lft = mask & ~_shift(mask, 0, 1) & ~top & ~bot
    rgt = mask & ~_shift(mask, 0, -1) & ~top & ~bot & ~lft
    for m, f in ((top, up), (bot, down), (lft, left), (rgt, right)):
        rgb[m] = np.clip(rgb[m] * f, 0, 255)
    px[:, :, :3] = rgb.astype(np.int16)


def soften_shade(px, a_mask, b_mask, blend=0.5):
    """Pune un ton intermediar pe granita dintre culoarea plina si umbra lui,
    ca trecerea sa nu mai fie in trepte de doi pixeli."""
    rgb = px[:, :, :3].astype(np.float32)
    edge = b_mask & (_shift(a_mask, 1, 0) | _shift(a_mask, 0, 1) |
                     _shift(a_mask, -1, 0) | _shift(a_mask, 0, -1))
    if not edge.any():
        return
    src = rgb[a_mask]
    if src.size == 0:
        return
    avg = src.mean(axis=0)
    rgb[edge] = rgb[edge] * (1 - blend) + avg * blend
    px[:, :, :3] = rgb.astype(np.int16)


def body_gradient(px, mask, top_f=1.07, bot_f=0.90):
    """Lumina cade de sus: partea de sus a costumului e mai deschisa."""
    ys = np.nonzero(mask)[0]
    if ys.size == 0:
        return
    y0, y1 = ys.min(), ys.max()
    rgb = px[:, :, :3].astype(np.float32)
    for y in range(y0, y1 + 1):
        row = mask[y]
        if not row.any():
            continue
        t = (y - y0) / max(1, y1 - y0)
        rgb[y, row] = np.clip(rgb[y, row] * (top_f + (bot_f - top_f) * t), 0, 255)
    px[:, :, :3] = rgb.astype(np.int16)


def form_shade(px, mask, depth=4, up=0.17, down=0.22, side=0.10):
    """Umbra de forma: nu o teseala de un pixel, ci un degrade pe `depth` pixeli
    dinspre margine spre interior, cu lumina din stanga sus. Asta da volum."""
    rgb = px[:, :, :3].astype(np.float32)
    cur = mask.copy()
    for r in range(1, depth + 1):
        er = cur & _shift(cur, 1, 0) & _shift(cur, -1, 0) & \
             _shift(cur, 0, 1) & _shift(cur, 0, -1)
        ring = cur & ~er
        if not ring.any():
            break
        fall = 1.0 / r
        top = ring & ~_shift(mask, r, 0)
        bot = ring & ~_shift(mask, -r, 0)
        lft = ring & ~_shift(mask, 0, r)
        rgt = ring & ~_shift(mask, 0, -r)
        f = np.ones((mask.shape[0], mask.shape[1]), np.float32)
        f[top] += up * fall
        f[lft] += side * fall
        f[bot] -= down * fall
        f[rgt] -= side * 1.6 * fall
        sel = ring
        rgb[sel] = np.clip(rgb[sel] * f[sel][:, None], 0, 255)
        cur = er
    px[:, :, :3] = rgb.astype(np.int16)


def contact_shadow(px, mask, drop=3, f=0.78):
    """Umbra proiectata sub gulerul capului si sub brate, in interiorul corpului."""
    rgb = px[:, :, :3].astype(np.float32)
    band = mask & _shift(~mask & (px[:, :, 3] > 0), drop, 0)
    for k in range(drop):
        b = mask & _shift(~mask, drop - k, 0)
        rgb[b] = np.clip(rgb[b] * (f + (1 - f) * k / drop), 0, 255)
    px[:, :, :3] = rgb.astype(np.int16)


def lens(px, mask, hi=(255, 255, 255), rim=0.55):
    """Ochiul devine lentila: rama intunecata jos-dreapta si un reflex sus-stanga.
    Un detaliu mic, dar el face personajul sa para viu."""
    ys, xs = np.nonzero(mask)
    if ys.size == 0:
        return
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    h, w = y1 - y0 + 1, x1 - x0 + 1
    rgb = px[:, :, :3].astype(np.float32)
    edge = mask & ~(_shift(mask, 1, 0) & _shift(mask, -1, 0) &
                    _shift(mask, 0, 1) & _shift(mask, 0, -1))
    bot = edge & ~_shift(mask, -1, 0)
    rgt = edge & ~_shift(mask, 0, -1)
    rgb[bot | rgt] *= rim
    top = edge & ~_shift(mask, 1, 0)
    rgb[top] = np.clip(rgb[top] * 1.35, 0, 255)
    px[:, :, :3] = rgb.astype(np.int16)
    hx, hy = x0 + max(1, w // 5), y0 + max(1, h // 5)
    for dy in range(max(1, h // 5)):
        for dx in range(max(1, w // 5)):
            px[hy + dy, hx + dx, :3] = hi
    px[min(px.shape[0] - 1, y1 - h // 5), max(0, x1 - w // 5), :3] = hi


def tube_light(px, mask, f=1.6):
    """Furtunurile capata o dunga de lumina pe stanga, ca sa nu fie pete negre."""
    rgb = px[:, :, :3].astype(np.float32)
    lit = mask & ~_shift(mask, 0, 1)
    rgb[lit] = np.clip(rgb[lit] * f + 16, 0, 255)
    px[:, :, :3] = rgb.astype(np.int16)


def recede(px, desat=0.26, flat=0.16, dark=0.07):
    """Impinge fundalul in spate: mai putina saturatie, mai putin contrast, un pic
    mai intunecat. Fara asta scena si personajul se bat pe aceeasi atentie."""
    rgb = px[:, :, :3].astype(np.float32)
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    rgb = rgb * (1 - desat) + lum[:, :, None] * desat
    mean = rgb.mean()
    rgb = mean + (rgb - mean) * (1 - flat)
    px[:, :, :3] = np.clip(rgb * (1 - dark), 0, 255).astype(np.int16)


def rim_light(px, mask, inner, colour, strength=0.62):
    """Lumina pe muchie, pusa pe primul pixel DIN INTERIORUL conturului, nu pe el.
    Asa personajul prinde lumina si isi pastreaza si muchia neagra; pusa peste
    contur, silueta dispare pe fundalurile deschise."""
    rgb = px[:, :, :3].astype(np.float32)
    edge = inner & ((~_shift(inner, 1, 0)) | (~_shift(inner, 0, 1)))
    edge &= mask
    c = np.array(colour, np.float32)
    rgb[edge] = rgb[edge] * (1 - strength) + c * strength
    px[:, :, :3] = rgb.astype(np.int16)


def key_colour(px, y0=4, y1=30):
    """Culoarea dominanta din partea de sus a scenei: de acolo pare ca vine lumina."""
    reg = px[y0:y1, :, :3].astype(np.float32)
    c = reg.reshape(-1, 3).mean(axis=0)
    m = c.max()
    if m < 60:
        c = c * (110.0 / max(1.0, m))
    return tuple(int(min(255, v * 1.5 + 60)) for v in c)


def gold_dust(rgb, n=42, seed=5, hot=(255, 236, 168)):
    """Praf de aur care pluteste, pus peste imaginea finala. Doar la unicate."""
    rng = np.random.default_rng(seed)
    hot = np.array(hot, np.float32)
    for _ in range(n):
        x, y = int(rng.random() * H), int(rng.random() * H)
        lum = float(rgb[y, x] @ np.array([.299, .587, .114]))
        if lum > 168:            # pe zone deja deschise praful arata a murdarie
            continue
        a = .35 + rng.random() * .5
        rgb[y, x] = np.clip(rgb[y, x] * (1 - a) + hot * a, 0, 255)


def spotlight(px, cx=50, cy=46, rad=46, lift=0.30):
    """Con de lumina in spatele personajului, ca sa iasa in fata."""
    ys, xs = np.mgrid[0:H, 0:H]
    d = np.sqrt(((xs - cx) / rad) ** 2 + ((ys - cy) / rad) ** 2)
    f = 1.0 + lift * np.clip(1.0 - d, 0, 1) ** 1.6
    px[:, :, :3] = np.clip(px[:, :, :3] * f[:, :, None], 0, 255).astype(np.int16)


def backlight(px, mask, colour, rad=7, peak=0.55):
    """Lumina calda in spatele siluetei: piesa pare luminata din spate, nu lipita."""
    m = mask.astype(np.float32)
    acc = np.zeros_like(m)
    for r in range(1, rad + 1):
        g = np.zeros_like(m, bool)
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if dy * dy + dx * dx > r * r:
                    continue
                ys0, ys1 = max(0, dy), min(H, H + dy)
                xs0, xs1 = max(0, dx), min(H, H + dx)
                g[ys0:ys1, xs0:xs1] |= mask[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
        acc = np.maximum(acc, g.astype(np.float32) * (1.0 - (r - 1) / rad))
    acc[mask] = 0
    c = np.array(colour, np.float32)
    f = (acc * peak)[:, :, None]
    px[:, :, :3] = np.clip(px[:, :, :3] * (1 - f) + c * f, 0, 255).astype(np.int16)


def crest_frame(rgb, colour=(232, 196, 92), inset=2, notch=5, a=0.72):
    """Rama subtire cu colturi taiate, semnul unicatelor. La miniatura se vede
    din prima ca piesa e alta."""
    c = np.array(colour, np.float32)

    def put(y, x):
        if 0 <= y < H and 0 <= x < H:
            rgb[y, x] = np.clip(rgb[y, x] * (1 - a) + c * a, 0, 255)

    lo, hi = inset, H - 1 - inset
    for x in range(lo + notch, hi - notch + 1):
        put(lo, x); put(hi, x)
    for y in range(lo + notch, hi - notch + 1):
        put(y, lo); put(y, hi)
    for i in range(notch + 1):                      # colturi taiate
        put(lo + notch - i, lo + i)
        put(lo + notch - i, hi - i)
        put(hi - notch + i, lo + i)
        put(hi - notch + i, hi - i)
