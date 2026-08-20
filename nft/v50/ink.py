"""Contur negru automat: orice piesa desenata primeste muchia neagra a sprite-ului."""
import numpy as np
from .core import N, Layer

BLACK = (1, 1, 1)


def outline(layer, occupied, colour=BLACK, diag=True):
    """Pune muchie in jurul pixelilor din `layer`, doar unde `occupied` e liber."""
    src = layer.px[:, :, 3] >= 200   # doar piesele opace primesc muchie
    edge = np.zeros((N, N), dtype=bool)
    offs = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    if diag:
        offs += [(1, 1), (1, -1), (-1, 1), (-1, -1)]
    for dy, dx in offs:
        sh = np.zeros((N, N), dtype=bool)
        ys0, ys1 = max(0, dy), min(N, N + dy)
        xs0, xs1 = max(0, dx), min(N, N + dx)
        sh[ys0:ys1, xs0:xs1] = src[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
        edge |= sh
    edge &= ~src
    edge &= ~occupied
    out = Layer()
    ys, xs = np.nonzero(edge)
    for y, x in zip(ys, xs):
        out.set(int(x), int(y), colour)
    out.over(layer)
    return out


def outline_big(layer, occupied, colour=BLACK, diag=True, w=2):
    """Muchia pentru grila mare: groasa de w pixeli, ca sa fie egala cu a lui."""
    import numpy as np
    G = layer.px.shape[0]
    src = layer.px[:, :, 3] >= 200
    edge = np.zeros((G, G), dtype=bool)
    offs = []
    for dy in range(-w, w + 1):
        for dx in range(-w, w + 1):
            if dy == 0 and dx == 0:
                continue
            if not diag and dy and dx:
                continue
            offs.append((dy, dx))
    for dy, dx in offs:
        sh = np.zeros((G, G), dtype=bool)
        ys0, ys1 = max(0, dy), min(G, G + dy)
        xs0, xs1 = max(0, dx), min(G, G + dx)
        sh[ys0:ys1, xs0:xs1] = src[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
        edge |= sh
    edge &= ~src
    edge &= ~occupied
    out = type(layer)()
    out.px[edge] = (colour[0], colour[1], colour[2], 255)
    m = layer.px[:, :, 3] > 0
    out.px[m] = layer.px[m]
    return out
