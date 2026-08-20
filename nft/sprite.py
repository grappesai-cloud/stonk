# -*- coding: utf-8 -*-
"""
Agentul, pe grila de 32x32 pixeli logici, cu lumina venind din stanga-sus.

Sloturi de culoare:
  .  gol          k  contur         h  costum luminat   s  costum
  d  costum umbrit   e  umbra adanca (sub casca, sub centura)
  m  metal luminat   n  metal umbrit
  v  lentila      w  reflex lentila  y  lentila umbrita
  a  accent       b  cizma          c  cizma luminata   g  manusa
"""
W = H = 32

D = lambda n: '.' * n
K = lambda n: 'k' * n
S = lambda n: 's' * n

def _build():
    out = []
    def r(*seg):
        s = ''.join(seg)
        assert len(s) == W, 'randul %d are %d coloane' % (len(out), len(s))
        out.append(s)

    r(D(32))                                                  # 0  loc pentru modul
    r(D(32))                                                  # 1
    r(D(32))                                                  # 2
    r(D(32))                                                  # 3
    # ---- casca: bombata, cu lumina sus-stanga ------------------------------
    r(D(11), K(10), D(11))                                    # 4
    r(D(10), 'k', 'h'*10, 'k', D(10))                         # 5
    r(D(9),  'k', 'h', 'hhss'  , S(6),  'd', 'k', D(9))       # 6
    r(D(9),  'k', 'h', 'hs'    , S(8),  'd', 'k', D(9))       # 7
    r(D(9),  'k', 'h', 's', 'skkkkkks', 's', 'd', 'k', D(9))  # 8   rama lentila
    r(D(9),  'k', 'h', 's', 'kvwwvvyk', 's', 'd', 'k', D(9))  # 9
    r(D(9),  'k', 'h', 's', 'kvvvvvyk', 's', 'd', 'k', D(9))  # 10
    r(D(9),  'k', 'h', 's', 'kvvvvyyk', 's', 'd', 'k', D(9))  # 11
    r(D(9),  'k', 'h', 's', 'skkkkkks', 's', 'd', 'k', D(9))  # 12
    r(D(9),  'k', 'h', S(9),  'd', 'd', 'k', D(9))            # 13
    r(D(10), 'k', 'h', S(8),  'd', 'k', D(10))                # 14
    r(D(11), K(10), D(11))                                    # 15
    # ---- guler --------------------------------------------------------------
    r(D(11), 'k', 'm', 'mmmmmm', 'n', 'k', D(11))             # 16
    # ---- umeri si trunchi ---------------------------------------------------
    r(D(4),  K(24), D(4))                                     # 17
    r(D(4), 'khhk', 'k', 'h', 'dddddddddddd', 'd', 'k', 'kddk', D(4))  # 18 umbra castii
    r(D(4), 'khhk', 'k', 'h', S(12), 'd', 'k', 'kddk', D(4))  # 19
    r(D(4), 'khhk', 'k', 'h', S(12), 'd', 'k', 'kddk', D(4))  # 20
    r(D(4), 'khhk', 'k', 'h', S(12), 'd', 'k', 'kddk', D(4))  # 21
    r(D(4), 'khhk', 'k', 'h', S(12), 'd', 'k', 'kddk', D(4))  # 22
    r(D(4), 'khhk', 'k', 'h', S(12), 'd', 'k', 'kddk', D(4))  # 23
    r(D(4), 'kggk', 'k', 'h', 'eeeeeeeeeeee', 'd', 'k', 'kggk', D(4))     # 25 centura
    r(D(4), 'kggk', 'k', 'h', S(12), 'd', 'k', 'kggk', D(4))  # 26
    r(D(4), 'kkkk', 'k', 'd', 'dddddddddddd', 'd', 'k', 'kkkk', D(4))     # 27 sold
    r(D(8),  K(16), D(8))                                     # 28
    # ---- picioare si cizme --------------------------------------------------
    r(D(10), 'khssk', '..', 'khssk', D(10))                   # 29
    r(D(10), 'khssk', '..', 'khssk', D(10))                   # 29b
    r(D(10), 'khssk', '..', 'khssk', D(10))                   # 30
    r(D(9), 'kccbbk', '..', 'kccbbk', D(9))                   # 31
    return out

BASE = _build()
