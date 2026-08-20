# -*- coding: utf-8 -*-
"""
Scoate personajul lui Vlad din planşa cu fundal plat, cu fundal transparent.
Nu il redesenez: il decupez, deci ramane exact arta lui.

Cum: culoarea dominanta din interior e fundalul si devine transparenta. Apoi,
in loc sa tai cu un dreptunghi (care ori taie din personaj, ori lasa textul),
pastrez doar petele legate intre ele care apartin personajului: cea care
contine trunchiul, plus orice pata destul de mare care nu sta lipita de
marginea de sus (acolo e scrisul) sau de margini (acolo e rama).
"""
import collections
from PIL import Image

def dist(a, b):
    return ((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2) ** 0.5

def components(mask, w, h):
    """Pete legate, cu vecinatate de 8."""
    seen = [False] * (w*h)
    out = []
    for start in range(w*h):
        if not mask[start] or seen[start]:
            continue
        stack, cells = [start], []
        seen[start] = True
        while stack:
            i = stack.pop()
            cells.append(i)
            x, y = i % w, i // w
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny*w + nx
                        if mask[j] and not seen[j]:
                            seen[j] = True
                            stack.append(j)
        out.append(cells)
    return out

def cutout(tile, tol=44):
    w, h = tile.size
    inner = tile.crop((int(w*0.12), int(h*0.35), int(w*0.88), int(h*0.92)))
    bg = collections.Counter(inner.getdata()).most_common(1)[0][0]

    src = tile.convert('RGB').load()

    def is_label(c):
        """Scrisul de pe carton e aproape alb si fara culoare. Personajul nu
        are asa ceva: cel mai deschis al lui sunt manusile gri, mai inchise.
        Il scot inainte de analiza, altfel se lipeste de cablu si nu mai iese."""
        return (sum(c)/3.0) > 205 and (max(c) - min(c)) < 28

    mask = [dist(src[i % w, i // w], bg) >= tol and not is_label(src[i % w, i // w])
            for i in range(w*h)]

    comps = components(mask, w, h)
    seed = (int(h*0.62))*w + int(w*0.50)          # trunchiul, sigur pe personaj
    keep = set()

    body = next((c for c in comps if seed in c), [])
    bxs = [c % w for c in body]; bys = [c // w for c in body]
    bbox = (min(bxs), min(bys), max(bxs), max(bys)) if body else (0, 0, w, h)
    near = w * 0.12                                # cat de aproape de corp

    for cells in comps:
        if seed in cells:                          # personajul, cu tot cu tuburi
            keep.update(cells)
            continue
        if len(cells) < 120:
            continue
        xs0 = [c % w for c in cells]; ys0 = [c // w for c in cells]
        # ce nu e lipit de personaj nu e al lui: scris, sclipici, resturi de rama
        gap_x = max(bbox[0] - max(xs0), min(xs0) - bbox[2], 0)
        gap_y = max(bbox[1] - max(ys0), min(ys0) - bbox[3], 0)
        if gap_x > near or gap_y > near:
            continue
        xs = [c % w for c in cells]; ys = [c // w for c in cells]
        bw, bh = max(xs)-min(xs)+1, max(ys)-min(ys)+1
        if min(xs) < w*0.03 or max(xs) > w*0.97:   # rama
            continue
        if bw > bh * 6:                            # linie subtire de rama
            continue
        # scrisul e deschis si nesaturat; obiectele personajului sunt colorate
        cols = [src[c % w, c // w] for c in cells]
        n = float(len(cols))
        mr = sum(c[0] for c in cols)/n; mg = sum(c[1] for c in cols)/n
        mb = sum(c[2] for c in cols)/n
        bright = (mr+mg+mb)/3.0
        sat = max(mr, mg, mb) - min(mr, mg, mb)
        if bright > 150 and sat < 46:
            continue
        keep.update(cells)

    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    dst = out.load()
    for i in keep:
        x, y = i % w, i // w
        r, g, b = src[x, y]
        dst[x, y] = (r, g, b, 255)
    return out

def despeckle(img, min_area=260, glue=6):
    """Trecere finala: arunca petele mici care nu ating corpul principal.
    Aici cad scrisul ramas, sclipiciul si punctele razlete."""
    w, h = img.size
    px = img.load()
    mask = [px[i % w, i // w][3] > 0 for i in range(w*h)]
    comps = components(mask, w, h)
    if not comps:
        return img
    main = max(comps, key=len)
    mset = set(main)
    keep = set(main)
    for cells in comps:
        if cells is main:
            continue
        # scrisul ramas e deschis si fara culoare, indiferent cat de mare e
        cols = [px[c % w, c // w] for c in cells]
        n = float(len(cols))
        mr = sum(c[0] for c in cols)/n; mg = sum(c[1] for c in cols)/n
        mb = sum(c[2] for c in cols)/n
        if (mr+mg+mb)/3.0 > 170 and (max(mr,mg,mb) - min(mr,mg,mb)) < 40:
            continue
        if len(cells) >= min_area:
            keep.update(cells); continue
        touching = False
        for c in cells:
            x, y = c % w, c // w
            for dy in range(-glue, glue+1):
                for dx in range(-glue, glue+1):
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < w and 0 <= ny < h and (ny*w+nx) in mset:
                        touching = True; break
                if touching: break
            if touching: break
        if touching:
            keep.update(cells)
    for i in range(w*h):
        if not mask[i] or i in keep:
            continue
        px[i % w, i // w] = (0, 0, 0, 0)
    return img

def trim(img):
    bb = img.getbbox()
    return img.crop(bb) if bb else img

if __name__ == '__main__':
    sheet = Image.open('ref/sheet9.jpg').convert('RGB')
    t = sheet.size[0] // 3
    names = ['BASE','ADVANCED BOOTS','COMM-UNIT','MECHANIC','SENSOR',
             'CROWNED','COLLECTOR','DUAL-EYE','ARCADE']
    for i, name in enumerate(names):
        r, c = divmod(i, 3)
        cut = trim(despeckle(cutout(sheet.crop((c*t, r*t, (c+1)*t, (r+1)*t)))))
        cut.save('ref/char_%d.png' % (i+1))
        print('#%03d %-15s %s' % (i+1, name, cut.size))
