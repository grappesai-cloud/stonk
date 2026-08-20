# -*- coding: utf-8 -*-
"""Culorile pentru personajul lui Vlad. Galbenul e canonic, deci cel mai des."""

# costum: (baza, umbra, manusa, bocanc)
SUITS = {
    'HAZMAT YELLOW': (('#f2c400','#c99a00','#9aa0a0','#e0417a'), 30),
    'DIVE BLUE':     (('#2f7fd4','#1f5a99','#8d99a6','#e0417a'), 12),
    'REEF GREEN':    (('#3fae5c','#2a7c41','#93a294','#e0417a'), 11),
    'RESCUE ORANGE': (('#f07a1c','#c25a0c','#9aa0a0','#2f3438'), 10),
    'BONE WHITE':    (('#e6e2d6','#b0aca0','#8f9294','#c23a6a'), 8),
    'DEEP BLACK':    (('#2f3438','#1c2023','#6e7476','#e0417a'), 7),
    'MAGENTA':       (('#e0417a','#ad2b59','#9aa0a0','#2f3438'), 6),
    'ARMY DRAB':     (('#6e7a3f','#4e582c','#8a8f7a','#2f3438'), 5),
    'GOLD FOIL':     (('#ffd23d','#c9a013','#b09a4a','#2f3438'), 3),
    'CHROME':        (('#dfe8ef','#9fb0bd','#8f9aa3','#2f3438'), 2),
    # costume folosite doar de arhetipuri, deci pondere zero la rolare libera
    'MOSS GREEN':    (('#6f9a4a','#4d6f33','#8f9a80','#3a3326'), 0),
    'PIRATE BLACK':  (('#33302c','#1f1d1a','#7a6f5e','#8a2b2b'), 0),
    'PAINT WHITE':   (('#f0ece2','#c2bcae','#9a958a','#c23a6a'), 0),
    'SAMURAI RED':   (('#b02a2a','#7d1c1c','#8a7a6a','#2f2422'), 0),
    'LAB WHITE':     (('#eef1f2','#c3c9cc','#9aa3a6','#3a4246'), 0),
    'COPPER':        (('#b07b3f','#7d5528','#9a8a6a','#3a2a18'), 0),
    'GALAXY VIOLET': (('#7a4cc4','#523088','#8f86a6','#2a2038'), 0),
    'HEAT GREY':     (('#8a8f92','#5f6467','#7a7f82','#2f3438'), 0),
    'BEACH YELLOW':  (('#f2c400','#c99a00','#e0a0b8','#f0e2c0'), 0),
    'NIGHT BLACK':   (('#26292b','#161819','#5f6467','#26292b'), 0),
}

# cupola: (culoare, reflex, umbra)
DOMES = {
    'RED':     (('#e01b1b','#ff8a7a','#9c0f0f'), 34),
    'AMBER':   (('#ff9f1c','#ffd9a0','#b56a08'), 16),
    'GREEN':   (('#35c15e','#a8f0bd','#1c7a38'), 14),
    'CYAN':    (('#2ec4e0','#b3f0fa','#136d80'), 12),
    'VIOLET':  (('#9b5cff','#dcc7ff','#5c2fa8'), 9),
    'PINK':    (('#ff4fa3','#ffc4e0','#a8215f'), 7),
    'WHITE':   (('#f2f4f0','#ffffff','#a8aaa6'), 5),
    'DEAD':    (('#4a4f4a','#7a807a','#2a2e2a'), 3),
}

# accentul folosit de coroana, dungi, embleme
ACCENTS = {
    'WHITE':  ('#f2f4f0', 26),
    'RED':    ('#e01b1b', 20),
    'BLACK':  ('#1a1816', 18),
    'CYAN':   ('#2ec4e0', 14),
    'LIME':   ('#c6ff3d', 12),
    'GOLD':   ('#ffd23d', 10),
}
