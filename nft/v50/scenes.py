"""Scenele, desenate pe grila de 100 cu obiecte din `props`: mai multe tonuri,
lumina, plan indepartat si plan apropiat. Linia solului e la randul 88."""
import math
import numpy as np
from .hires import H, lerp, mul
from . import props as P

GROUND = P.GROUND
SCENES = []


def scene(name, weight):
    def deco(fn):
        SCENES.append((name, weight, fn))
        return fn
    return deco


def R(seed):
    return np.random.default_rng(seed)


@scene('Neon Alley', 6)
def _alley(L):
    P.sky(L, 0, GROUND, (16, 11, 34), (44, 20, 62))
    P.stars(L, 26, 30, 21, (200, 210, 240))
    P.building(L, -4, 14, 20, 74, (24, 17, 44), (250, 214, 130), 31, .45)
    P.building(L, 16, 30, 14, 58, (32, 22, 56), (120, 224, 240), 32, .35)
    P.building(L, 72, 8, 24, 80, (22, 15, 40), (250, 200, 120), 33, .5)
    P.building(L, 60, 34, 13, 54, (30, 21, 52), (240, 120, 180), 34, .4)
    P.neon(L, 4, 24, 7, 14, (250, 62, 128))
    P.neon(L, 88, 40, 6, 16, (62, 224, 240))
    P.neon(L, 12, 52, 9, 6, (140, 96, 250))
    P.pipes(L, 0, 34, 70, (48, 40, 66), 35)
    P.ground(L, (30, 22, 46), GROUND, True, 36)
    for x in range(2, H, 13):                       # reflexii pe asfalt ud
        P.box(L, x, GROUND + 3, x + 5, GROUND + 4, (66, 44, 92))
        P.box(L, x + 2, GROUND + 7, x + 4, GROUND + 7, (96, 62, 128))
    P.rubble(L, GROUND + 2, (58, 44, 82), 14, 37)


@scene('Deep Sea', 5)
def _sea(L):
    P.sky(L, 0, GROUND + 6, (10, 52, 96), (4, 16, 44), .06)
    r = R(41)
    for _ in range(30):
        x, y = int(r.random() * H), int(r.random() * 82)
        P.px(L, x, y, (150, 210, 240), 120)
    for x, h, s in ((6, 46, 42), (18, 32, 43), (78, 50, 44), (92, 30, 45)):
        rr = R(s)
        for i in range(h):
            y = GROUND - 2 - i
            dx = int(2.4 * math.sin(i * .34 + s))
            P.box(L, x + dx, y, x + dx + 2, y, (30, 122, 96) if i % 7 else (56, 168, 128))
        for k in range(3):
            yy = GROUND - 8 - int(rr.random() * h)
            P.box(L, x - 3, yy, x + 5, yy + 1, (44, 148, 112))
    P.rock(L, 30, GROUND + 2, 9, 14, (36, 58, 78), (44, 138, 108), 46)
    P.rock(L, 68, GROUND + 1, 7, 10, (34, 54, 74), (44, 138, 108), 47)
    for cx, cy, c in ((60, 44, (232, 96, 150)), (66, 50, (250, 168, 96)), (54, 52, (140, 210, 240))):
        P.box(L, cx, cy, cx + 3, cy + 8, c)
        P.box(L, cx + 1, cy - 2, cx + 2, cy, mul(c, 1.2))
    P.ground(L, (36, 56, 82), GROUND, True, 48)
    P.tuft(L, 14, H - 1, 7, (44, 138, 108), 49)
    P.tuft(L, 84, H - 1, 6, (44, 138, 108), 50)


@scene('Lava Field', 4)
def _lava(L):
    P.sky(L, 0, GROUND, (52, 12, 18), (140, 44, 20))
    for cx, w, h in ((14, 16, 32), (58, 24, 46), (92, 13, 24)):
        P.volcano(L, cx, GROUND - 2, w, h, (40, 24, 26))
    P.ground(L, (44, 24, 22), GROUND, True, 52)
    r = R(53)
    for _ in range(9):                              # crapaturi cu lava
        x = int(r.random() * H)
        y = GROUND + 2 + int(r.random() * 8)
        w = 4 + int(r.random() * 10)
        P.box(L, x, y, x + w, y + 1, (250, 128, 24))
        P.box(L, x + 1, y, x + w - 1, y, (252, 216, 110))
        P.glow(L, x + w // 2, y, 7, (250, 110, 20))
    P.rubble(L, GROUND + 1, (60, 34, 28), 24, 54)


@scene('Orbital Deck', 5)
def _orb(L):
    P.box(L, 0, 0, H - 1, H - 1, (22, 25, 42))
    P.box(L, 10, 8, 88, 62, (5, 6, 16))              # fereastra
    P.stars(L, 60, 60, 61)
    for y in range(20, 34):                          # planeta
        w = int(math.sqrt(max(0, 49 - (y - 27) ** 2)) * 1.25)
        P.box(L, 66 - w, y, 66 + w, y, lerp((176, 132, 236), (92, 62, 152), (y - 20) / 14))
    P.box(L, 8, 6, 90, 8, (72, 82, 104)); P.hl(L, 8, 90, 6, (128, 140, 164))
    P.box(L, 8, 62, 90, 66, (72, 82, 104)); P.hl(L, 8, 90, 62, (128, 140, 164))
    P.vl(L, 9, 6, 66, (128, 140, 164)); P.vl(L, 89, 6, 66, (44, 52, 70))
    for x in range(14, 88, 18):
        P.vl(L, x, 8, 62, (58, 66, 86))
    P.box(L, 0, 66, H - 1, GROUND - 1, (40, 46, 64))
    for x in range(3, 96, 12):                       # consola
        P.box(L, x, 72, x + 8, 78, (28, 34, 48))
        P.box(L, x + 1, 73, x + 6, 75, (86, 208, 232))
        P.px(L, x + 2, 77, (250, 96, 96)); P.px(L, x + 5, 77, (120, 250, 140))
    P.ground(L, (52, 58, 78), GROUND, True, 62)
    for x in range(0, H, 8):
        P.vl(L, x, GROUND + 1, H - 1, (38, 44, 60))


@scene('Server Room', 5)
def _srv(L):
    P.sky(L, 0, GROUND, (16, 24, 30), (10, 16, 20), .05)
    r = R(71)
    for i, x in enumerate(range(-2, 100, 15)):
        P.box(L, x, 10, x + 11, GROUND - 1, (26, 34, 42))
        P.vl(L, x, 10, GROUND - 1, (52, 66, 78))
        P.vl(L, x + 11, 10, GROUND - 1, (14, 20, 26))
        P.hl(L, x, x + 11, 10, (60, 76, 90))
        for y in range(14, GROUND - 4, 6):
            P.box(L, x + 2, y, x + 9, y + 3, (18, 24, 30))
            for k in range(3):
                c = (86, 250, 140) if r.random() > .3 else (250, 96, 96)
                P.px(L, x + 3 + k * 2, y + 1, c)
            P.hl(L, x + 2, x + 9, y, (44, 56, 68))
    P.box(L, 0, 4, H - 1, 9, (20, 28, 34))
    for x in range(4, 96, 9):
        P.box(L, x, 5, x + 4, 6, (150, 200, 220))
    P.ground(L, (32, 40, 48), GROUND, True, 72)
    for x in range(0, H, 10):
        P.vl(L, x, GROUND + 1, H - 1, (24, 30, 38))


@scene('Ice Cave', 4)
def _ice(L):
    P.sky(L, 0, GROUND, (172, 214, 240), (72, 128, 184))
    r = R(81)
    for i in range(9):
        x = 3 + i * 12
        h = 18 + int(r.random() * 26)
        for y in range(h):
            w = max(0, 5 - y * 5 // h)
            P.box(L, x - w, y, x + w, y, lerp((226, 244, 252), (140, 190, 228), y / h))
            P.px(L, x - w, y, (240, 250, 255))
    for i in range(6):
        x = 8 + i * 17
        h = 14 + int(r.random() * 16)
        for y in range(h):
            w = max(0, 4 - y * 4 // h)
            P.box(L, x - w, GROUND - 1 - y, x + w, GROUND - 1 - y,
                  lerp((206, 234, 250), (150, 196, 232), y / h))
    P.ground(L, (206, 230, 246), GROUND, True, 82)
    for _ in range(18):
        x, y = int(r.random() * H), GROUND + int(r.random() * 12)
        P.px(L, x, y, (250, 253, 255))
    P.rock(L, 20, GROUND + 4, 8, 8, (176, 208, 234), None, 83)
    P.rock(L, 80, GROUND + 3, 6, 6, (176, 208, 234), None, 84)


@scene('Wasteland', 5)
def _waste(L):
    P.sky(L, 0, GROUND, (206, 160, 100), (238, 200, 142))
    P.glow(L, 74, 22, 13, (252, 226, 150), 85)
    for cx, w, h in ((8, 12, 30), (26, 8, 18), (78, 14, 36), (94, 7, 22)):
        P.rock(L, cx, GROUND - 2, w, h, (132, 98, 62), None, cx + 5)
    for x in (40, 58):                               # copaci uscati
        P.box(L, x, GROUND - 22, x + 1, GROUND - 2, (74, 54, 36))
        for k in range(4):
            d = 1 if k % 2 else -1
            P.box(L, x + d * (k + 1), GROUND - 20 - k * 3, x + d * (k + 3),
                  GROUND - 20 - k * 3, (74, 54, 36))
    P.ground(L, (170, 130, 84), GROUND, True, 92)
    P.rubble(L, GROUND + 3, (126, 94, 58), 26, 93)
    P.tuft(L, 12, H - 2, 5, (140, 128, 74), 94)
    P.tuft(L, 66, H - 1, 4, (140, 128, 74), 95)


@scene('Jungle Temple', 4)
def _jun(L):
    P.sky(L, 0, GROUND, (14, 44, 30), (24, 68, 42))
    P.box(L, 12, 6, 88, GROUND - 1, (78, 88, 66))
    for y in range(10, GROUND - 1, 11):
        P.hl(L, 12, 88, y, (54, 62, 46)); P.hl(L, 12, 88, y + 1, (96, 108, 82))
    for x in range(16, 88, 15):
        P.vl(L, x, 6, GROUND - 1, (54, 62, 46))
    P.box(L, 40, 34, 60, 62, (58, 66, 50))           # nisa cu simbol
    P.box(L, 45, 40, 55, 56, (96, 108, 82))
    P.px(L, 50, 46, (232, 196, 92)); P.box(L, 47, 49, 53, 50, (232, 196, 92))
    r = R(101)
    for _ in range(40):                              # liane
        x = int(r.random() * H)
        y = int(r.random() * 40)
        h = 6 + int(r.random() * 22)
        for i in range(h):
            P.px(L, x + int(math.sin(i * .5) * 1.5), y + i,
                 (52, 140, 62) if i % 5 else (86, 178, 84))
    for x in (2, 94):
        P.bamboo(L, x, 0, GROUND - 4, (58, 130, 56), x)
    P.ground(L, (56, 88, 50), GROUND, True, 102)
    for x in range(4, H, 13):
        P.tuft(L, x, H - 1, 7, (74, 148, 66), x)


@scene('Cyber Grid', 4)
def _grid(L):
    P.sky(L, 0, 64, (26, 8, 48), (108, 22, 108))
    for y in range(40, 60):                          # soare cu benzi
        w = int(math.sqrt(max(0, 100 - (y - 50) ** 2)) * 1.7)
        if (y // 3) % 2 == 0:
            P.box(L, 50 - w, y, 50 + w, y, lerp((252, 196, 72), (246, 74, 128), (y - 40) / 20))
    for x, h in ((4, 18), (16, 26), (84, 22), (94, 14)):
        P.rock(L, x, 64, 9, h, (44, 16, 66), None, x)
    P.box(L, 0, 64, H - 1, H - 1, (12, 5, 26))
    for i, y in enumerate(range(65, H, 3)):
        P.hl(L, 0, H - 1, y, mul((208, 46, 186), 1 - i * .05))
    for x in range(-90, 190, 14):
        for y in range(65, H):
            p = 50 + (x - 50) * (y - 62) // 8
            if 0 <= p < H:
                P.px(L, p, y, (96, 240, 240))


@scene('Toxic Lab', 4)
def _lab(L):
    P.sky(L, 0, GROUND, (30, 50, 46), (20, 34, 32), .05)
    for x in range(3, 96, 22):                       # rezervoare
        P.box(L, x, 12, x + 14, 46, (34, 58, 54))
        P.vl(L, x, 12, 46, (62, 96, 88)); P.vl(L, x + 14, 12, 46, (18, 34, 32))
        P.box(L, x + 2, 16, x + 12, 44, (44, 176, 108))
        for k in range(4):
            P.hl(L, x + 2, x + 12, 20 + k * 6, (108, 232, 158))
        P.box(L, x + 1, 12, x + 13, 14, (78, 88, 96))
        P.box(L, x + 5, 8, x + 9, 12, (60, 70, 78))
    P.pipes(L, 0, H - 1, 52, (58, 74, 70), 111)
    P.box(L, 0, 58, H - 1, 62, (40, 60, 56))
    for x in range(0, H, 8):                         # dungi de avertizare
        P.box(L, x, 58, x + 3, 62, (226, 190, 40))
    P.ground(L, (44, 66, 62), GROUND, True, 112)
    for x in range(0, H, 12):
        P.vl(L, x, GROUND + 1, H - 1, (34, 52, 50))


@scene('Mine Shaft', 4)
def _mine(L):
    P.sky(L, 0, GROUND, (44, 32, 24), (26, 18, 14), .06)
    r = R(121)
    for _ in range(70):
        x, y = int(r.random() * H), int(r.random() * GROUND)
        P.px(L, x, y, (56, 42, 30) if r.random() > .4 else (18, 12, 8))
    for x in (8, 78):                                # sustineri de lemn
        P.box(L, x, 6, x + 7, GROUND - 1, (104, 72, 40))
        P.vl(L, x, 6, GROUND - 1, (146, 104, 58)); P.vl(L, x + 7, 6, GROUND - 1, (62, 42, 22))
        for y in range(14, GROUND, 16):
            P.hl(L, x, x + 7, y, (70, 48, 26))
    P.box(L, 6, 4, 92, 11, (104, 72, 40)); P.hl(L, 6, 92, 4, (146, 104, 58))
    P.box(L, 47, 12, 53, 19, (250, 224, 130))        # felinar
    P.box(L, 48, 13, 52, 17, (255, 246, 198))
    P.glow(L, 50, 16, 12, (250, 200, 90), 90)
    P.box(L, 62, GROUND - 14, 82, GROUND - 1, (92, 64, 38))   # vagonet
    P.box(L, 64, GROUND - 12, 80, GROUND - 5, (46, 32, 20))
    P.px(L, 68, GROUND - 8, (206, 166, 62)); P.px(L, 74, GROUND - 9, (150, 200, 226))
    for x in (24, 60):                               # grinzi transversale
        P.box(L, x, 6, x + 5, GROUND - 1, (86, 60, 34))
        P.vl(L, x, 6, GROUND - 1, (122, 86, 48))
    for cx, cy, w, h in ((32, GROUND - 2, 9, 14), (52, GROUND - 1, 7, 10),
                         (88, GROUND - 3, 8, 16)):   # bolovani
        P.rock(L, cx, cy, w, h, (62, 46, 32), None, cx)
    P.ground(L, (60, 44, 30), GROUND, True, 122)
    for x in range(0, H, 6):                         # traverse
        P.box(L, x, GROUND + 4, x + 3, GROUND + 5, (78, 58, 38))
    P.hl(L, 0, H - 1, GROUND + 3, (128, 102, 68)); P.hl(L, 0, H - 1, GROUND + 7, (128, 102, 68))
    P.rubble(L, GROUND + 10, (74, 56, 38), 20, 123)


@scene('Zen Garden', 3)
def _zen(L):
    P.sky(L, 0, 54, (196, 220, 200), (154, 190, 162))
    for x, y0 in ((2, 0), (10, 0), (86, 0), (94, 0), (78, 4)):
        P.bamboo(L, x, y0, 66, (74, 150, 70), x)
    P.rock(L, 16, 62, 14, 22, (108, 122, 112), (96, 168, 88), 131)
    P.rock(L, 34, 58, 8, 12, (100, 114, 104), (96, 168, 88), 132)
    P.box(L, 60, 34, 76, 40, (128, 138, 130))        # felinar de piatra
    P.box(L, 63, 40, 73, 56, (112, 122, 114))
    P.box(L, 65, 44, 71, 50, (48, 44, 40))
    P.px(L, 68, 47, (250, 226, 150)); P.glow(L, 68, 47, 8, (250, 216, 130))
    P.box(L, 62, 56, 74, 60, (128, 138, 130))
    P.ground(L, (150, 178, 148), 62, True, 133)      # gazon
    P.box(L, 0, 72, H - 1, H - 1, (196, 206, 178))   # nisip greblat
    P.hl(L, 0, H - 1, 72, (216, 224, 200))
    for y in range(75, H, 4):
        P.hl(L, 0, H - 1, y, (178, 190, 162))
    P.box(L, 66, 74, H - 1, H - 1, (66, 122, 168))   # iaz
    P.hl(L, 66, H - 1, 74, (108, 168, 208))
    P.vl(L, 66, 74, H - 1, (150, 166, 146))
    r = R(135)
    for _ in range(14):
        x = 68 + int(r.random() * 30); y = 76 + int(r.random() * 22)
        P.box(L, x, y, x + 3, y, (128, 186, 220))
    for cx, cy in ((72, 80), (84, 90)):              # crapi
        P.box(L, cx, cy, cx + 6, cy + 2, (244, 246, 248))
        P.box(L, cx + 2, cy, cx + 3, cy + 1, (226, 68, 48))
        P.box(L, cx + 7, cy - 1, cx + 8, cy + 3, (238, 240, 244))
    for x in range(2, 62, 12):
        P.tuft(L, x, 72, 5, (110, 168, 96), x)


@scene('Arcade', 4)
def _arc(L):
    P.sky(L, 0, GROUND, (22, 16, 40), (14, 10, 26), .05)
    for x in range(0, H, 12):                        # lumini de tavan
        P.box(L, x, 2, x + 6, 5, (250, 62, 128) if (x // 12) % 2 else (86, 216, 232))
        P.glow(L, x + 3, 6, 7, (250, 120, 200) if (x // 12) % 2 else (86, 216, 232), 80)
    r = R(141)
    for x in (2, 20, 62, 80):
        P.box(L, x, 24, x + 16, GROUND - 1, (46, 32, 74))
        P.vl(L, x, 24, GROUND - 1, (78, 56, 118)); P.vl(L, x + 16, 24, GROUND - 1, (28, 18, 46))
        P.box(L, x + 2, 28, x + 14, 44, (16, 40, 58))
        for _ in range(9):
            P.px(L, x + 3 + int(r.random() * 11), 30 + int(r.random() * 12),
                 (250, 220, 96) if r.random() > .5 else (86, 232, 176))
        P.box(L, x + 2, 48, x + 6, 52, (232, 60, 92))
        P.box(L, x + 10, 48, x + 14, 52, (86, 216, 232))
        P.hl(L, x, x + 16, 24, (110, 80, 160))
    P.ground(L, (40, 26, 66), GROUND, True, 142)
    for y in range(GROUND + 2, H, 4):
        for x in range((y // 4) % 8, H, 8):
            P.px(L, x, y, (66, 44, 104))


@scene('Desert Ruins', 3)
def _des(L):
    P.sky(L, 0, GROUND, (250, 208, 140), (250, 160, 96))
    P.glow(L, 78, 20, 15, (252, 236, 176), 95)
    for x in (4, 20, 76):
        P.pillar(L, x, 26, GROUND - 2, (204, 174, 122), x)
    P.box(L, 0, 22, 34, 27, (188, 158, 108)); P.hl(L, 0, 34, 22, (224, 198, 148))
    for cx, w, h in ((44, 14, 10), (60, 9, 7)):      # blocuri cazute
        P.crate(L, cx, GROUND - h * 2, h * 2, (196, 166, 116))
    P.ground(L, (224, 188, 130), GROUND, True, 152)
    r = R(153)
    for _ in range(6):                               # dune
        x = int(r.random() * H)
        for i in range(8):
            P.hl(L, x - i * 2, x + 10 + i * 2, GROUND + 2 + i, (210, 176, 120))
    P.rubble(L, GROUND + 6, (182, 150, 102), 20, 154)


@scene('Matrix Rain', 3)
def _rain(L):
    P.box(L, 0, 0, H - 1, H - 1, (3, 10, 6))
    r = R(161)
    for x in range(0, H, 3):
        top = int(r.random() * 70)
        ln = 12 + int(r.random() * 26)
        for i in range(ln):
            y = top + i
            if y >= H:
                break
            v = 1 - i / ln
            P.px(L, x, y, (int(30 + 150 * v), int(120 + 130 * v), int(50 + 70 * v)))
        P.px(L, x, min(H - 1, top), (222, 255, 232))
        if r.random() > .6:
            P.px(L, x + 1, top + 2, (90, 200, 120))


@scene('Void', 4)
def _void(L):
    P.sky(L, 0, H - 1, (8, 8, 12), (26, 24, 34), .05)
    P.stars(L, 40, H - 1, 171, (110, 110, 132))
    for y in range(GROUND, H):
        P.hl(L, 0, H - 1, y, mul((34, 32, 44), 1 - (y - GROUND) * .03))
    P.hl(L, 0, H - 1, GROUND, (62, 58, 78))


@scene('Rooftop Night', 4)
def _roof(L):
    P.sky(L, 0, 62, (10, 14, 38), (58, 32, 78))
    P.stars(L, 34, 34, 181)
    P.building(L, -4, 24, 18, 40, (16, 18, 42), (250, 224, 140), 182, .4)
    P.building(L, 14, 32, 15, 32, (20, 22, 48), (250, 224, 140), 183, .35)
    P.building(L, 62, 20, 20, 44, (14, 16, 38), (200, 220, 250), 184, .45)
    P.building(L, 84, 30, 16, 34, (20, 22, 48), (250, 224, 140), 185, .3)
    P.box(L, 0, 62, H - 1, 68, (38, 38, 58)); P.hl(L, 0, H - 1, 62, (74, 74, 100))
    P.crate(L, 6, 56, 12, (66, 70, 84))              # unitati de aer
    P.crate(L, 80, 58, 10, (66, 70, 84))
    P.box(L, 92, 20, 93, 58, (86, 90, 104))          # antena
    P.px(L, 92, 20, (250, 60, 60)); P.glow(L, 92, 20, 7, (250, 60, 60))
    for x in range(0, H, 9):                         # balustrada
        P.vl(L, x, 68, 78, (58, 58, 78))
    P.hl(L, 0, H - 1, 68, (96, 96, 120)); P.hl(L, 0, H - 1, 70, (74, 74, 96))
    P.ground(L, (48, 46, 66), GROUND, True, 186)


@scene('Casino Floor', 3)
def _cas(L):
    P.sky(L, 0, GROUND, (72, 12, 28), (116, 20, 42))
    for x in range(10, 92, 26):                      # candelabre
        P.box(L, x, 0, x + 8, 3, (206, 172, 62))
        for k in range(4):
            P.px(L, x + 1 + k * 2, 4, (252, 232, 150))
        P.glow(L, x + 4, 5, 8, (250, 220, 120), 80)
    for x in range(4, 92, 30):                       # mese
        P.box(L, x, 34, x + 22, 52, (26, 66, 38))
        P.hl(L, x, x + 22, 34, (52, 116, 66)); P.hl(L, x, x + 22, 52, (14, 40, 22))
        P.box(L, x + 2, 38, x + 20, 40, (206, 172, 62))
        for k in range(4):
            P.box(L, x + 4 + k * 4, 44, x + 6 + k * 4, 46, (238, 238, 232))
    P.box(L, 0, 56, H - 1, 60, (146, 24, 48))
    P.ground(L, (96, 16, 36), GROUND, True, 192)
    for y in range(GROUND + 2, H, 5):                # covor cu motiv
        for x in range((y // 5) % 10, H, 10):
            P.box(L, x, y, x + 3, y + 1, (132, 28, 56))


@scene('Subway', 4)
def _sub(L):
    P.sky(L, 0, GROUND, (32, 36, 44), (22, 26, 32), .05)
    P.box(L, 0, 8, H - 1, 40, (198, 204, 210))       # perete de faianta
    for y in range(8, 41, 6):
        P.hl(L, 0, H - 1, y, (156, 164, 172))
    for x in range(0, H, 9):
        P.vl(L, x, 8, 40, (172, 180, 188))
    P.box(L, 30, 16, 70, 28, (20, 44, 96))           # panou de statie
    P.hl(L, 30, 70, 16, (48, 82, 150))
    for x in range(34, 68, 6):
        P.box(L, x, 20, x + 3, 24, (232, 238, 246))
    P.box(L, 0, 40, H - 1, 44, (58, 64, 72))
    P.box(L, 8, 44, 92, 74, (14, 16, 20))            # gura de tunel
    for i in range(7):                               # perspectiva in tunel
        P.box(L, 14 + i * 5, 48 + i * 3, 86 - i * 5, 50 + i * 3, mul((40, 46, 58), 1 - i * .11))
    P.glow(L, 50, 62, 11, (120, 160, 200), 70)
    P.ground(L, (54, 58, 66), GROUND, True, 202)
    for x in range(0, H, 5):                         # linia de siguranta
        P.box(L, x, GROUND + 2, x + 2, GROUND + 3, (226, 190, 40))
    P.rubble(L, H - 2, (44, 48, 56), 16, 203)


@scene('Greenhouse', 4)
def _gh(L):
    P.sky(L, 0, GROUND, (220, 238, 228), (176, 208, 194))
    for x in range(0, H, 16):                        # structura de sticla
        P.vl(L, x, 0, GROUND - 1, (128, 156, 148))
        P.vl(L, x + 1, 0, GROUND - 1, (168, 192, 184))
    for y in range(0, GROUND, 18):
        P.hl(L, 0, H - 1, y, (128, 156, 148))
    for x in range(6, 96, 30):                       # raze de lumina
        for y in range(0, 60):
            P.px(L, x + y // 3, y, (250, 250, 220), 26)
    for x in (2, 16, 74, 90):                        # straturi
        P.box(L, x, 62, x + 12, 74, (122, 78, 46))
        P.hl(L, x, x + 12, 62, (158, 106, 64))
        for k in range(4):
            P.tuft(L, x + 2 + k * 3, 62, 12, (72, 156, 68), x + k)
    for x in (34, 60):                               # ghivece
        P.box(L, x, 70, x + 8, 78, (166, 96, 62))
        P.hl(L, x, x + 8, 70, (200, 130, 88))
        P.tuft(L, x + 4, 70, 14, (86, 172, 76), x)
    P.ground(L, (172, 190, 176), GROUND, True, 212)
    for x in range(0, H, 14):
        P.vl(L, x, GROUND + 1, H - 1, (150, 168, 156))


@scene('Sky Islands', 3)
def _sky(L):
    P.sky(L, 0, GROUND + 8, (252, 202, 214), (168, 204, 248))
    r = R(221)
    for _ in range(6):                               # nori
        x, y = int(r.random() * H), int(r.random() * 40)
        w = 8 + int(r.random() * 16)
        P.box(L, x, y, x + w, y + 3, (250, 246, 250))
        P.box(L, x + 3, y - 2, x + w - 3, y, (250, 246, 250))
    for cx, cy, w in ((14, 22, 12), (74, 14, 15), (52, 38, 9), (90, 40, 8)):
        P.box(L, cx - w, cy, cx + w, cy + 3, (112, 184, 94))
        P.hl(L, cx - w, cx + w, cy, (150, 214, 122))
        for i in range(6):
            ww = max(1, w - i * 2)
            P.box(L, cx - ww, cy + 4 + i, cx + ww, cy + 4 + i, mul((146, 112, 74), 1 - i * .07))
        P.tuft(L, cx - w + 3, cy, 6, (98, 172, 84), cx)
        P.tuft(L, cx + w - 4, cy, 5, (98, 172, 84), cx + 3)
    P.box(L, 8, GROUND - 3, 92, GROUND + 2, (112, 184, 94))
    P.hl(L, 8, 92, GROUND - 3, (152, 216, 124))
    P.ground(L, (146, 112, 74), GROUND + 2, True, 222)
    for x in range(10, 92, 12):
        P.tuft(L, x, GROUND + 2, 7, (110, 182, 92), x)


@scene('Bank Vault', 3)
def _vault(L):
    P.sky(L, 0, GROUND, (54, 56, 66), (36, 38, 48), .05)
    for row in range(5):                             # rafturi cu lingouri
        y = 10 + row * 14
        for x in range(2, 96, 13):
            P.box(L, x, y, x + 11, y + 8, (204, 168, 58))
            P.hl(L, x, x + 11, y, (250, 222, 128))
            P.hl(L, x, x + 11, y + 8, (150, 118, 26))
            P.vl(L, x + 11, y, y + 8, (162, 130, 34))
            P.box(L, x + 2, y + 3, x + 9, y + 4, (232, 198, 96))
    P.box(L, 34, 22, 68, 66, (74, 78, 90))           # usa de seif
    for r_ in (16, 11, 6):
        for a in range(0, 360, 8):
            xx = int(51 + r_ * math.cos(math.radians(a)))
            yy = int(44 + r_ * .95 * math.sin(math.radians(a)))
            P.px(L, xx, yy, (128, 134, 148) if r_ != 11 else (44, 48, 58))
    P.box(L, 48, 41, 54, 47, (166, 172, 186))
    P.hl(L, 34, 68, 22, (118, 124, 140))
    P.ground(L, (66, 68, 82), GROUND, True, 232)
    for y in range(GROUND + 2, H, 6):
        P.hl(L, 0, H - 1, y, (84, 86, 102))


@scene('Swamp', 4)
def _swp(L):
    P.sky(L, 0, 60, (58, 74, 54), (86, 102, 66))
    r = R(241)
    for x in (4, 22, 70, 92):                        # copaci cu muschi
        P.box(L, x, 0, x + 5, 74, (58, 46, 32))
        P.vl(L, x, 0, 74, (86, 68, 46)); P.vl(L, x + 5, 0, 74, (36, 28, 18))
        for k in range(5):
            y = 8 + k * 12
            d = 1 if k % 2 else -1
            P.box(L, x + (6 if d > 0 else -6), y, x + d * 12, y + 1, (58, 46, 32))
            for i in range(6):
                P.px(L, x + d * (7 + i), y + 2 + i, (96, 132, 76) if i % 2 else (66, 100, 54))
    for _ in range(26):
        x, y = int(r.random() * H), 20 + int(r.random() * 40)
        P.px(L, x, y, (156, 196, 104), 150)
    P.water(L, 74, H - 1, (52, 72, 52), 242, (128, 160, 96))
    for cx, cy in ((16, 82), (40, 90), (78, 84)):    # nuferi
        P.box(L, cx, cy, cx + 9, cy + 3, (72, 130, 62))
        P.hl(L, cx, cx + 9, cy, (108, 176, 88))
        P.px(L, cx + 4, cy - 1, (236, 156, 200))
    for x in range(0, H, 17):
        P.tuft(L, x, 80, 9, (86, 132, 68), x)


# fundalurile plate din plansele lui: culoare intinsa, cu un plan de podea
_FLATS = [
    ('Studio Teal', 7, (15, 104, 134)),
    ('Studio Magenta', 3, (166, 34, 88)),
    ('Studio Olive', 3, (74, 116, 52)),
    ('Studio Slate', 3, (78, 84, 96)),
    ('Studio Amber', 3, (206, 128, 34)),
    ('Studio Plum', 3, (96, 56, 152)),
    ('Studio Sand', 3, (188, 160, 112)),
    ('Studio Navy', 3, (34, 52, 128)),
    ('Studio Cream', 2, (226, 216, 186)),
]


def _flat(c):
    def fn(L):
        P.sky(L, 0, GROUND + 3, mul(c, 1.10), mul(c, 0.92), .05)
        P.ground(L, mul(c, 0.80), GROUND + 4, True, 251)
    return fn


for _n_, _w_, _c_ in _FLATS:
    SCENES.append((_n_, _w_, _flat(_c_)))
