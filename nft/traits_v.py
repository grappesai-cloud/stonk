# -*- coding: utf-8 -*-
"""
Trasaturile pentru personajul lui Vlad. Panza e 40x40, corpul de 32 sta la
offset (4,4). Repere pe panza:
  tuburi       randurile 4-11,  coloanele 13-27
  cupola       randurile 12-17, coloanele 16-23
  piept        randurile 19-28, coloanele 13-26
  manusa dreapta  randurile 25-29, coloanele 26-32
"""
from traits import blank, put, layer, CANVAS, OX, OY   # aceleasi unelte

# ---- CE POARTA PE CAP, randurile 0-8 --------------------------------------
HEADGEAR = {
    'NONE':          (blank(), 40),
    'PROPELLER CAP': (layer([(8,15,'kkkkkkkkkk'),(9,14,'kaaaaaaaaaak'),
                             (10,14,'kkkkkkkkkkkk'),
                             (6,18,'kmk'),(7,18,'kmk'),
                             (6,13,'kmmmk'),(6,23,'kmmmk')]), 14),
    'HARD HAT':      (layer([(9,14,'kkkkkkkkkkkk'),(10,13,'kaaaaaaaaaaaak'),
                             (11,13,'kkkkkkkkkkkkkk')]), 12),
    'BANDANA':       (layer([(12,13,'kaaaaaaaaaaaaak'),
                             (13,13,'kaakkaakkaakkak'),
                             (11,26,'kaak'),(12,27,'kaak')]), 10),
    'CROWN':         (layer([(7,15,'ka.a.a.a.ak'),(8,15,'kaaaaaaaaak'),
                             (9,15,'kkkkkkkkkkk')]), 6),
    'TIARA':         (layer([(9,16,'kaaaaaaak'),(8,19,'kwk'),
                             (10,16,'kkkkkkkkk')]), 5),
    'HALO':          (layer([(6,15,'kaaaaaaaaak'),(7,15,'k.........k')]), 4),
    'HORNS':         (layer([(10,11,'ka'),(11,11,'kaa'),(12,12,'kk'),
                             (10,28,'ak'),(11,27,'aak'),(12,27,'kk')]), 5),
    'DIVE FINS':     (layer([(12,9,'kaaak'),(13,9,'kaaak'),(14,9,'kkkkk'),
                             (12,26,'kaaak'),(13,26,'kaaak'),(14,26,'kkkkk')]), 4),
}

# ---- CE TINE IN MANA DREAPTA, coloanele 28-37 -----------------------------
HANDS = {
    'NONE':      (blank(), 34),
    'WRENCH':    (layer([(20,29,'kmmk'),(21,29,'km.mk'),(22,29,'kmmk'),
                         (23,30,'kmk'),(24,30,'kmk'),(25,30,'kmk'),
                         (26,30,'kmk'),(27,30,'kmk'),(28,29,'kmmk')]), 12),
    'TRIDENT':   (layer([(14,27,'k.k.k'),(15,27,'kmkmk'),(16,27,'kmmmk'),
                         (17,28,'kmk'),(18,28,'kmk'),(19,28,'kmk'),(20,28,'kmk'),
                         (21,28,'kmk'),(22,28,'kmk'),(23,28,'kmk'),(24,28,'kmk'),
                         (25,28,'kmk'),(26,28,'kmk'),(27,28,'kmk'),(28,28,'kkk')]), 9),
    'ANCHOR':    (layer([(22,29,'kmk'),(23,27,'kmmmmmk'),(24,29,'kmk'),
                         (25,29,'kmk'),(26,29,'kmk'),(27,28,'kmkmk'),
                         (28,27,'kmmkmmk'),(29,27,'kkkkkkk')]), 8),
    'CHEST':     (layer([(25,27,'kkkkkkk'),(26,27,'kaaaaak'),(27,27,'kkkkkkk'),
                         (28,27,'kmmmmmk'),(29,27,'kmmammk'),(30,27,'kkkkkkk')]), 8),
    'FLAG':      (layer([(17,28,'kkkkkkk'),(18,28,'kaaaaak'),(19,28,'kakkkak'),
                         (20,28,'kaaaaak'),(21,28,'kkkkkkk'),
                         (22,29,'km'),(23,29,'km'),(24,29,'km'),(25,29,'km'),
                         (26,29,'km'),(27,29,'km'),(28,29,'km')]), 7),
    'LANTERN':   (layer([(24,29,'kmk'),(25,28,'kkkkk'),(26,28,'kawak'),
                         (27,28,'kaaak'),(28,28,'kawak'),(29,28,'kkkkk')]), 6),
    'BLADE':     (layer([(15,30,'kmk'),(16,30,'kmk'),(17,30,'kmk'),(18,30,'kmk'),
                         (19,30,'kmk'),(20,30,'kmk'),(21,30,'kmk'),(22,30,'kmk'),
                         (23,29,'kmmmk'),(24,29,'kkkkk'),(25,30,'kak'),
                         (26,30,'kak'),(27,30,'kkk')]), 4),
}

# ---- CE ARE PE COSTUM, randurile 19-28 ------------------------------------
OUTFIT = {
    'PLAIN':       (blank(), 26),
    'HAZARD':      (layer([(24,17,'kaaaaaak'),(25,17,'kakkkkak'),
                           (26,17,'kaaaaaak')]), 16),
    'STRIPES':     (layer([(21,13,'aaaaaaaaaaaaaa'),(23,13,'aaaaaaaaaaaaaa'),
                           (25,13,'aaaaaaaaaaaaaa')]), 14),
    'NUMBER 001':  (layer([(24,16,'a.aaa.aaa'),(25,16,'a.a.a.a.a'),
                           (26,16,'a.aaa.aaa')]), 12),
    'X MARK':      (layer([(23,16,'a.......a'),(24,17,'a.....a'),
                           (25,18,'a...a'),(26,17,'a.....a'),
                           (27,16,'a.......a')]), 10),
    'HARNESS':     (layer([(19,15,'aa'),(20,16,'aa'),(21,17,'aa'),(22,18,'aa'),
                           (19,23,'aa'),(20,22,'aa'),(21,21,'aa'),(22,20,'aa'),
                           (23,14,'aaaaaaaaaaaa')]), 12),
    'DOT PANEL':   (layer([(24,16,'a.a.a.a.a'),(25,16,'.a.a.a.a.'),
                           (26,16,'a.a.a.a.a')]), 10),
}

# ---- adaugiri pentru arhetipuri, aceleasi randuri (6-14) ------------------
HEADGEAR.update({
    'PITH HELMET':  (layer([(7,13,'kkkkkkkkkkkkkk'),(8,12,'kaaaaaaaaaaaaaak'),
                            (9,12,'kkkkkkkkkkkkkkkk'),(6,18,'kaak')]), 0),
    'BACKWARDS CAP':(layer([(7,14,'kkkkkkkkkkkk'),(8,13,'kaaaaaaaaaaaak'),
                            (9,13,'kkkkkkkkkkkkkk'),(8,26,'kaaak'),(9,26,'kkkkk')]), 0),
    'VISOR':        (layer([(12,14,'kkkkkkkkkkkk'),(13,14,'kaaaaaaaaaak'),
                            (14,14,'kkkkkkkkkkkk')]), 0),
    'LAB GLASSES':  (layer([(12,14,'kkkk.kkkk'),(13,14,'kwwk.kwwk'),
                            (14,14,'kkkk.kkkk'),(13,18,'kk')]), 0),
    'SPROUT':       (layer([(4,19,'kak'),(5,18,'kaak'),(3,20,'kak'),
                            (6,19,'kmk'),(7,19,'kmk')]), 0),
    # sticla nu se umple: doar rama si doua reflexe, restul lasa costumul sa se vada
    'BUBBLE HELM':  (layer([(6,16,'kkkkkkkk'),(7,14,'kk......kk'),
                            (8,13,'k........k'),(9,12,'k'),(9,27,'k'),
                            (10,12,'k'),(10,27,'k'),(11,12,'k'),(11,27,'k'),
                            (12,13,'k'),(12,26,'k'),(13,14,'kk....kk'),
                            (8,15,'ww'),(9,14,'w')]), 0),
    'TOP HAT':      (layer([(3,15,'kkkkkkkkkk'),(4,15,'kaaaaaaaak'),
                            (5,15,'kaaaaaaaak'),(6,15,'kwwwwwwwwk'),
                            (7,15,'kaaaaaaaak'),(8,12,'kkkkkkkkkkkkkkkk')]), 0),
    'KABUTO':       (layer([(6,14,'kkkkkkkkkkkk'),(7,13,'kaaaaaaaaaaaak'),
                            (8,13,'kkkkkkkkkkkkkk'),
                            (4,12,'kw'),(5,13,'kw'),(4,27,'wk'),(5,26,'wk')]), 0),
    'CRYSTAL CROWN':(layer([(4,15,'w.w.w.w.w.w'),(5,15,'kwwwwwwwwwk'),
                            (6,15,'kkkkkkkkkkk')]), 0),
})

HANDS.update({
    'MAGNIFIER':  (layer([(22,29,'kkkkk'),(23,29,'kmwmk'),(24,29,'kmwmk'),
                          (25,29,'kkkkk'),(26,30,'km'),(27,30,'km'),(28,30,'km')]), 0),
    'SPRAY CAN':  (layer([(23,30,'kak'),(24,29,'kkkkk'),(25,29,'kaaak'),
                          (26,29,'kawak'),(27,29,'kaaak'),(28,29,'kkkkk')]), 0),
    'FLASK':      (layer([(23,31,'kmk'),(24,31,'kwk'),(25,30,'kwwwk'),
                          (26,29,'kwaaawk'),(27,29,'kwaaawk'),(28,29,'kkkkkkk')]), 0),
    'CUTLASS':    (layer([(14,33,'km'),(15,33,'km'),(16,32,'kmk'),(17,32,'kmk'),
                          (18,32,'kmk'),(19,32,'kmk'),(20,32,'kmk'),(21,32,'kmk'),
                          (22,31,'kmmmk'),(23,31,'kkkkk'),(24,32,'kak'),
                          (25,32,'kak'),(26,32,'kkk')]), 0),
    'ORB STAFF':  (layer([(13,30,'kkkk'),(14,29,'kwaawk'),(15,29,'kwaawk'),
                          (16,30,'kkkk'),(17,31,'km'),(18,31,'km'),(19,31,'km'),
                          (20,31,'km'),(21,31,'km'),(22,31,'km'),(23,31,'km'),
                          (24,31,'km'),(25,31,'km'),(26,31,'km'),(27,31,'km'),
                          (28,31,'km'),(29,31,'kk')]), 0),
    'JOYSTICK':   (layer([(23,31,'kak'),(24,31,'kmk'),(25,31,'kmk'),
                          (26,29,'kkkkkkk'),(27,29,'kmmmmmk'),(28,29,'kkkkkkk')]), 0),
    'RAY GUN':    (layer([(24,29,'kkkkkk'),(25,29,'kmmaak'),(26,29,'kkmkkk'),
                          (27,30,'kmk'),(28,30,'kkk')]), 0),
    'BUCKET':     (layer([(24,31,'k.k'),(25,30,'kkkkk'),(26,30,'kaaak'),
                          (27,30,'kaaak'),(28,30,'kkkkk')]), 0),
})

OUTFIT.update({
    'PAINT SPLAT': (layer([(21,15,'a..a...a'),(23,14,'.a...a..a.'),
                           (25,16,'a...a..a'),(27,15,'..a..a')]), 0),
    'HAWAIIAN':    (layer([(20,14,'a.a.a.a.a.a.a'),(22,14,'.a.a.a.a.a.a.'),
                           (24,14,'a.a.a.a.a.a.a'),(26,14,'.a.a.a.a.a.a.')]), 0),
    'ARMOUR':      (layer([(20,14,'kaaaaaaaaaaak'),(23,14,'kaaaaaaaaaaak'),
                           (26,14,'kaaaaaaaaaaak')]), 0),
    'LAB COAT':    (layer([(19,19,'kak'),(20,19,'kak'),(21,19,'kak'),(22,19,'kak'),
                           (23,19,'kak'),(24,19,'kak'),(25,19,'kak'),(26,19,'kak'),
                           (21,15,'ka'),(21,23,'ak')]), 0),
    'STARFIELD':   (layer([(20,15,'a...a....a..'),(22,14,'..a...a...a'),
                           (24,16,'a....a..a'),(26,15,'.a...a...a')]), 0),
    'GRAFFITI':    (layer([(20,15,'aa..a...aa'),(22,14,'.a.aa..a..a'),
                           (24,16,'aa...aa.'),(26,15,'.a..aa..a')]), 0),
})

# ---- OBIECTE CARE PLUTESC, legate de meserie ------------------------------
# Se deseneaza peste tot, in colturile libere ale panzei. Astea dau
# personalitatea din planşele lui Vlad: hackerul are panouri, gamerul inimi.
PROPS = {
    'THE HACKER': layer([
        (10,2,'kkkkkkk'),(11,2,'kaaaaak'),(12,2,'kakkkak'),(13,2,'kaaaaak'),(14,2,'kkkkkkk'),
        (18,1,'kkkkk'),(19,1,'kaaak'),(20,1,'kkkkk'),
        (8,32,'kkkkkkk'),(9,32,'kaaaaak'),(10,32,'kakkkak'),(11,32,'kaaaaak'),(12,32,'kkkkkkk'),
        (22,33,'kkkkk'),(23,33,'kaaak'),(24,33,'kkkkk')]),
    'THE GAMER': layer([
        (6,3,'.aa.aa.'),(7,3,'aaaaaaa'),(8,4,'aaaaa'),(9,5,'aaa'),(10,6,'a'),
        (12,33,'.aa.aa.'),(13,33,'aaaaaaa'),(14,34,'aaaaa'),(15,35,'aaa'),
        (20,2,'..a..'),(21,2,'aaaaa'),(22,3,'.a.'),(23,2,'a.a'),
        (7,30,'..a..'),(8,30,'aaaaa'),(9,31,'.a.')]),
    'THE SHAMAN': layer([
        (8,2,'.a.'),(9,2,'aaa'),(10,2,'aaa'),(11,3,'a'),
        (14,34,'.a.'),(15,34,'aaa'),(16,34,'aaa'),(17,35,'a'),
        (24,3,'.a.'),(25,3,'aaa'),(26,4,'a'),
        (6,31,'.a.'),(7,31,'aaa'),(8,32,'a')]),
    'THE VOYAGER': layer([
        (6,2,'.aaa.'),(7,1,'aaaaaaa'),(8,2,'.aaa.'),
        (16,33,'.aa.'),(17,33,'aaaa'),(18,33,'.aa.'),
        (26,2,'a'),(10,35,'a'),(22,1,'a'),(4,30,'a'),(30,33,'a'),(13,4,'a')]),
    'THE INVENTOR': layer([
        (7,2,'.aaa.'),(8,1,'a.a.a'),(9,1,'aaaaa'),(10,1,'a.a.a'),(11,2,'.aaa.'),
        (17,33,'.aa.'),(18,32,'a.a.a'),(19,32,'aaaaa'),(20,33,'.aa.')]),
    'THE KING': layer([
        (5,3,'a'),(4,2,'aaa'),(5,2,'a.a'),
        (9,34,'a'),(8,33,'aaa'),(9,33,'a.a'),
        (24,2,'a'),(23,1,'aaa'),(24,1,'a.a'),
        (18,35,'a'),(17,34,'aaa')]),
    'THE STREET ARTIST': layer([
        (5,1,'aa..aaa'),(6,2,'a..a..a'),(7,1,'aaa..aa'),
        (12,33,'aaa'),(13,33,'a.a'),(14,33,'aaa'),
        (26,1,'aa.aa'),(27,2,'a.a')]),
    'THE SAMURAI': layer([
        (6,2,'aa'),(7,3,'aa'),(12,1,'aa'),(13,2,'aa'),
        (9,34,'aa'),(10,33,'aa'),(20,34,'aa'),(21,33,'aa'),
        (26,3,'aa'),(16,36,'aa')]),
    'THE BOTANIST': layer([
        (6,2,'.a.'),(7,1,'aaa'),(8,2,'.a.'),
        (13,34,'.a.'),(14,33,'aaa'),(15,34,'.a.'),
        (24,1,'.a.'),(25,1,'aaa')]),
}
