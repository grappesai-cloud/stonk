# -*- coding: utf-8 -*-
import sys; sys.path.insert(0, '/Users/alexandrucojanu/stonk-agents-nft')
from PIL import Image
from sprite import BASE
from render import new_tile, draw_grid, hexc, SCALE

PAL = {
    'k': hexc('#080b08'),
    's': hexc('#c6ff3d'),
    'd': hexc('#8fbf20'),
    'm': hexc('#8b9683'),
    'n': hexc('#4d574a'),
    'v': hexc('#0d1a0a'),
    'w': hexc('#eaffb8'),
    'a': hexc('#ff3d6e'),
    'b': hexc('#2a2f28'),
    'g': hexc('#6f7a68'),
}

img = new_tile(32, hexc('#0a0d0a'))
draw_grid(img, BASE, PAL)
img.save('/Users/alexandrucojanu/stonk-agents-nft/out/base.png')
print('scris out/base.png', img.size)
