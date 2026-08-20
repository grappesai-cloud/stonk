# -*- coding: utf-8 -*-
"""Culorile. Ponderea mica = culoare rara."""

# costum: (deschis, umbra, manusa, cizma)
SUITS = {
    'HAZARD LIME':   (('#c6ff3d','#8fbf20','#6f7a68','#2a2f28'), 22),
    'SIGNAL ORANGE': (('#ff8a1f','#c25f0c','#7a6a58','#2f2822'), 16),
    'COOLANT BLUE':  (('#3fb8ff','#1f7fbd','#5d6f7a','#232b2f'), 14),
    'TOXIC GREEN':   (('#48e07a','#25a34f','#5f7a68','#232f28'), 12),
    'BONE WHITE':    (('#e8e6dc','#a9a79c','#7a7a72','#2c2c28'), 10),
    'VOID BLACK':    (('#2b3230','#1a1f1d','#4a5450','#141817'), 9),
    'HOT MAGENTA':   (('#ff3d9e','#c01f72','#7a5c6c','#2f222a'), 7),
    'RUST RED':      (('#e04a2f','#a8331d','#7a5a50','#2f2320'), 5),
    'GOLD FOIL':     (('#ffd23d','#c9a013','#8a7a44','#332c14'), 3),
    'CHROME':        (('#dfe8ef','#9fb0bd','#8f9aa3','#20262b'), 2),
}

# lentila: (culoare, reflex)
LENSES = {
    'RED':     (('#ff2d3d','#ffd0cc'), 30),
    'AMBER':   (('#ffb02e','#ffe9c2'), 20),
    'LIME':    (('#c6ff3d','#f2ffd6'), 16),
    'CYAN':    (('#2de0ff','#d3f8ff'), 14),
    'VIOLET':  (('#a95dff','#e8d6ff'), 10),
    'WHITE':   (('#f4f7f2','#ffffff'), 6),
    'DEAD':    (('#3a4440','#5c6a64'), 4),
}

# accent, folosit la emblema si la coarne/coroana
ACCENTS = {
    'LIME':   ('#c6ff3d', 30),
    'RED':    ('#ff2d3d', 22),
    'WHITE':  ('#f4f7f2', 18),
    'AMBER':  ('#ffb02e', 14),
    'CYAN':   ('#2de0ff', 10),
    'GOLD':   ('#ffd23d', 6),
}

# fundal: (tip, param1, param2). Cercetarea zice ca fundalurile nu trebuie sa
# domine clasamentul de raritate, deci scenele stau la ponderi medii, nu mici.
BACKGROUNDS = {
    # simple, comune
    'STEEL BLUE':  (('flat','#2b3a5c',None), 14),
    'DEEP MOSS':   (('flat','#2c4032',None), 12),
    'PLUM':        (('flat','#3d2b4a',None), 10),
    'ASH':         (('flat','#33383a',None), 10),
    'CLAY':        (('flat','#5c4433',None), 8),
    'DOT GRID':    (('grid','#0b0f0c','#1d2a16'), 10),
    'SCANLINE':    (('scan','#0d1410','#17301a'), 8),
    'TERMINAL':    (('grid','#04140a','#0d3a18'), 6),
    'SUNSET':      (('vgrad','#7a3b5c','#2a2140'), 5),
    'VOID':        (('stars','#050706','#c6ff3d'), 4),
    'RADIATION':   (('vgrad','#6b7a1a','#1d2208'), 3),
    'GLITCH':      (('glitch','#0b0f0c','#ff3d9e'), 2),
    # scene desenate, aici sta farmecul colectiei
    'NEON ALLEY':  (('scene','NEON ALLEY',None), 12),
    'DEEP SEA':    (('scene','DEEP SEA',None), 10),
    'SERVER ROOM': (('scene','SERVER ROOM',None), 10),
    'WASTELAND':   (('scene','WASTELAND',None), 9),
    'ORBIT':       (('scene','ORBIT',None), 8),
    'LAVA FIELD':  (('scene','LAVA FIELD',None), 8),
    'ICE SHELF':   (('scene','ICE SHELF',None), 7),
    'THE PIT':     (('scene','THE PIT',None), 4),
    'JUNGLE':      (('scene','JUNGLE',None), 9),
}

# efect peste toata piesa, adaugat la final. Aproape toate piesele nu au
# niciunul: cand apare, se vede imediat ca ai ceva iesit din comun.
EFFECTS = {
    'NONE':       ('none', 74),
    'EMBERS':     ('embers', 8),
    'STATIC':     ('static', 7),
    'SCAN SWEEP': ('sweep', 6),
    'HALO':       ('halo', 4),
    'FALLOUT':    ('fallout', 3),
}
