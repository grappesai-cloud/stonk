# -*- coding: utf-8 -*-
"""
Trasaturile. Fiecare strat e o grila de 40x40 desenata peste agent, cu '.'
unde se vede ce e dedesubt. Numarul de langa strat e ponderea: cat de des
apare. Ponderi mici = piese rare.

Repere pe panza de 40x40 (corpul de 32 e asezat la offset 4,4):
  casca      randurile 8-18,  coloanele 13-26   (mijloc: 19-20)
  trunchi    randurile 19-30, coloanele 12-27
  piept      randurile 22-25, coloanele 16-24
  mana dreapta          randurile 27-28, coloana 30
"""
CANVAS = 40
OX = OY = 4

def blank():
    return ['.' * CANVAS for _ in range(CANVAS)]

def put(grid, row, col, s):
    r = list(grid[row])
    for i, ch in enumerate(s):
        if ch != '.':
            r[col + i] = ch
    grid[row] = ''.join(r)

def layer(items):
    g = blank()
    for row, col, s in items:
        put(g, row, col, s)
    return g

# ---- MODUL DE SPATE -------------------------------------------------------
# Se deseneaza INAINTEA corpului, deci partea de jos ramane ascunsa in spatele
# castii si al umerilor. Jugul (randurile 17-18) il leaga de umeri, altfel
# modulul pare o palarie pusa pe cap.
YOKE = [(17,10,'kkkkkkkkkkkkkkkkkkkk'), (18,10,'kmmmmmmmmmmmmmmmmmmk')]

def rig(items):
    return layer(YOKE + items)

TOPS = {
    'TWIN TANK':   (rig([(4,10,'kkkk'),(4,26,'kkkk'),
                         (5,10,'kaak'),(5,26,'kaak'),
                         (6,10,'kaak'),(6,26,'kaak'),
                         (7,10,'kaak'),(7,26,'kaak'),
                         (8,10,'kaak'),(8,26,'kaak'),
                         (9,10,'kmmk'),(9,26,'kmmk'),
                         (10,10,'kkkk'),(10,26,'kkkk'),
                         (11,11,'kmk'),(11,27,'kmk'),
                         (12,11,'kmk'),(12,27,'kmk'),
                         (13,11,'kmk'),(13,27,'kmk'),
                         (14,11,'kmk'),(14,27,'kmk'),
                         (15,11,'kmk'),(15,27,'kmk'),
                         (16,11,'kmk'),(16,27,'kmk')]), 30),
    'BELL RIG':    (rig([(2,18,'kaaak'),(3,17,'kaaaaak'),(4,16,'kaaaaaaak'),
                         (5,15,'kaaaaaaaaak'),(6,15,'kaaaaaaaaak'),
                         (7,15,'kkkkkkkkkkk'),(8,19,'kmmk'),(9,19,'kmmk')]), 14),
    'PICK RIG':    (rig([(1,26,'kkk'),(2,24,'kaak'),(3,22,'kaak'),
                         (4,20,'kaak'),(5,18,'kaak'),(6,16,'kaak'),
                         (7,14,'kaak'),(8,12,'kkkk'),(9,13,'kmk')]), 14),
    'CRATE RIG':   (rig([(3,13,'kkkkkkkkkkkkkk'),(4,13,'kaammmmmmmmaak'),
                         (5,13,'kammmmmmmmmmak'),(6,13,'kaammmmmmmmaak'),
                         (7,13,'kkkkkkkkkkkkkk'),(8,17,'kmmmmmk'),
                         (9,17,'kmmmmmk')]), 14),
    'BALLOT RIG':  (rig([(2,15,'kkkkkkkkkkk'),(3,15,'kmmmkkkmmmk'),
                         (4,15,'kmmmmmmmmmk'),(5,15,'kmaaaaaaamk'),
                         (6,15,'kmmmmmmmmmk'),(7,15,'kkkkkkkkkkk'),
                         (8,18,'kmmmmk'),(9,18,'kmmmmk')]), 14),
    'WHEEL RIG':   (rig([(1,18,'kaaak'),(2,16,'kaakkaak'),(3,14,'kaakkkkaak'),
                         (4,13,'kaakkkkkkaak'),(5,14,'kaakkkkaak'),
                         (6,16,'kaakkaak'),(7,18,'kaaak'),(8,19,'kmmk'),
                         (9,19,'kmmk')]), 10),
    'NAKED':       (layer(YOKE), 4),
}

# ---- CASCA, randurile 5-13 ------------------------------------------------
HEADGEAR = {
    'NONE':        (blank(), 34),
    'ANTENNA':     (layer([(5,19,'ka'),(6,19,'km'),(7,19,'km'),(4,18,'kaak')]), 16),
    'CAP':         (layer([(9,13,'kkkkkkkkkkkkkk'),(10,12,'kbbbbbbbbbbbbbbk')]), 14),
    'CROWN':       (layer([(6,15,'ka.a.a.a.ak'),(7,15,'kaaaaaaaaak'),
                           (8,15,'kkkkkkkkkkk')]), 6),
    'HALO':        (layer([(5,15,'kaaaaaaaaak'),(6,15,'k.........k')]), 5),
    'HORNS':       (layer([(7,11,'ka'),(8,11,'kaa'),(9,12,'kk'),
                           (7,27,'ak'),(8,26,'aak'),(9,26,'kk')]), 8),
    'VISOR SHADE': (layer([(14,13,'kkkkkkkkkkkkkk')]), 12),
    'MOHAWK':      (layer([(4,19,'ka'),(5,19,'ka'),(6,19,'ka'),(7,19,'ka')]), 5),
}

# ---- UNEALTA din mana dreapta --------------------------------------------
# Manusa e la randurile 27-28, coloana 30. Fiecare unealta incepe de acolo si
# coboara, ca sa para tinuta in mana, nu lipita alaturi.
TOOLS = {
    'NONE':      (blank(), 30),
    'WRENCH':    (layer([(24,30,'kmmk'),(25,30,'km.mk'),(26,30,'kmmk'),
                         (27,31,'kmk'),(28,31,'kmk'),(29,31,'kmk'),
                         (30,30,'kmmmk'),(31,30,'kkkkk')]), 12),
    'PICKAXE':   (layer([(23,29,'kkkkkkk'),(24,29,'kmmmmmk'),(25,30,'kmmmk'),
                         (26,31,'kmk'),(27,31,'kmk'),(28,31,'kmk'),
                         (29,31,'kmk'),(30,31,'kmk'),(31,31,'kkk')]), 10),
    'CRATE':     (layer([(27,31,'kmk'),(28,29,'kkkkkkk'),(29,29,'kmaaamk'),
                         (30,29,'kmmmmmk'),(31,29,'kkkkkkk')]), 10),
    'SIGN':      (layer([(21,29,'kkkkkkkk'),(22,29,'kaaaaaak'),(23,29,'kakkkkak'),
                         (24,29,'kaaaaaak'),(25,29,'kkkkkkkk'),
                         (26,31,'km'),(27,31,'km'),(28,31,'km'),(29,31,'km')]), 8),
    'BELL':      (layer([(27,31,'kmk'),(28,30,'kaaak'),(29,29,'kaaaaak'),
                         (30,29,'kaaaaak'),(31,29,'kkkkkkk')]), 8),
    'BAG':       (layer([(27,31,'kmk'),(28,29,'kkkkkkk'),(29,29,'kmaaamk'),
                         (30,29,'kmaaamk'),(31,29,'kkkkkkk')]), 8),
    'BLADE':     (layer([(19,31,'kmk'),(20,31,'kmk'),(21,31,'kmk'),(22,31,'kmk'),
                         (23,31,'kmk'),(24,31,'kmk'),(25,31,'kmk'),(26,30,'kmmmk'),
                         (27,31,'kak'),(28,31,'kkk')]), 5),
}

# ---- EMBLEMA de pe piept, randurile 22-25 ---------------------------------
EMBLEMS = {
    'BARCODE':  (layer([(24,17,'a.a.aa.a.a'),(25,17,'a.a.aa.a.a'),
                        (26,17,'a.a.aa.a.a')]), 26),
    'HAZARD':   (layer([(24,18,'kaaaaaak'),(25,18,'kakkkkak'),
                        (26,18,'kaaaaaak')]), 20),
    'HEX':      (layer([(24,18,'.kaaaak.'),(25,18,'kaakkaak'),
                        (26,18,'.kaaaak.')]), 18),
    'DOLLAR':   (layer([(24,19,'kaaak'),(25,19,'kaaak'),(26,19,'kaaak')]), 14),
    'SKULL':    (layer([(24,18,'kaaaaaak'),(25,18,'ka.kk.ak'),
                        (26,19,'kaaaaak')]), 12),
    'BLANK':    (blank(), 10),
}
