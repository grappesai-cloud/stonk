"""Genereaza colectia in loturi: imagini, metadate ERC-721, raritate globala."""
import base64, io, json, os, random, shutil, sys, time
from PIL import Image
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from v50 import build, lots

SUPPLY = 2000
SEED = 20260818
NAME = 'Stonk Agents'
DESC = ('Agentul original al lui Vlad, coborat 1:1 pe grila lui nativa de 50 pe 50 '
        'pixeli. Palariile, obiectele, hainele, materialele de costum, insignele si '
        'scenele sunt desenate pe aceeasi grila, cu aceeasi muchie neagra.')

WEIGHT = {'Suit': 1.5, 'Eye': 1.0, 'Headwear': 1.7, 'Held Item': 1.5,
          'Outfit': 1.4, 'Scene': 0.5, 'Effect': 1.1, 'Badge': 1.2,
          'Footwear': 1.1, 'Hands': 1.0, 'Crest': 1.3, 'Neckwear': 1.2}
TIERS = [(0.005, 'Mythic'), (0.02, 'Legendary'), (0.07, 'Epic'),
         (0.20, 'Rare'), (0.45, 'Uncommon'), (1.01, 'Common')]

# arhetipurile numite, repartizate pe lotul lor; scena si efectul raman libere
ARCH_LOT = {
    'The Pirate': 'WAR', 'The Cyber-Samurai': 'WAR', 'The Scientist': 'CLN',
    'The Medic': 'CLN', 'The Shaman': 'FLD', 'The Explorer': 'FLD',
    'The Artist': 'NEON', 'The Steampunk': 'PIT', 'The Cosmic Voyager': 'OFF',
    'The Alchemist': 'CNCL', 'The Chef': 'AFT', 'The Botanist': 'FLD',
}
ARCH_COPIES = 4


def traits(s):
    return {'Suit': s['suit'], 'Eye': s['eye'], 'Headwear': s['hat'],
            'Held Item': s['item'], 'Outfit': s['cloth'], 'Scene': s['scene'],
            'Effect': s['fx'], 'Badge': s['badge'], 'Footwear': s['shoe'],
            'Hands': s['glove'], 'Crest': s['crest'], 'Neckwear': s['neck']}


def plan_lot(rng, lot, n):
    """Lista de specificatii pentru un lot: unicate, piese numite, apoi restul."""
    out = []
    for title, f in lots.UNIQUES.get(lot['code'], []):
        s = build.build_spec(rng, f, lot)
        s.update(title=title, one=True, one_of_one=True, lot=lot['code'])
        out.append(s)

    for name, f in build.ARCHETYPES:
        if ARCH_LOT.get(name) != lot['code']:
            continue
        free = {k: v for k, v in f.items() if k != 'scene'}
        for _ in range(ARCH_COPIES):
            s = build.build_spec(rng, free, lot)
            s.update(title=name, one=False, lot=lot['code'])
            out.append(s)

    seen = {build.dna(s) for s in out}
    while len(out) < n:
        for _ in range(600):
            s = build.build_spec(rng, lot=lot)
            if build.dna(s) not in seen:
                break
        seen.add(build.dna(s))
        s.update(title=None, one=False, lot=lot['code'])
        out.append(s)

    rng.shuffle(out)
    return out[:n]


def main():
    t0 = time.time()
    rng = random.Random(SEED)
    if os.path.isdir('out/v50'):
        shutil.rmtree('out/v50')
    os.makedirs('out/v50/images')

    counts_lot = []
    acc = 0
    for i, lot in enumerate(lots.LOTS):
        k = SUPPLY - acc if i == len(lots.LOTS) - 1 else round(lot['share'] * SUPPLY)
        counts_lot.append(k)
        acc += k

    specs = []
    for lot, k in zip(lots.LOTS, counts_lot):
        specs.extend(plan_lot(rng, lot, k))

    seen, dupes = set(), 0
    for s in specs:
        d = build.dna(s)
        if d in seen:
            dupes += 1
        seen.add(d)

    counts = {k: Counter() for k in WEIGHT}
    for s in specs:
        for k, v in traits(s).items():
            counts[k][v] += 1

    scored = []
    for i, s in enumerate(specs):
        sc = sum(WEIGHT[k] * (SUPPLY / counts[k][v]) for k, v in traits(s).items())
        if s['one']:
            sc *= 4
        scored.append((sc, i))
    rank_of = {i: r for r, (sc, i) in enumerate(sorted(scored, reverse=True))}
    # unicatele au treapta lor, deci nu trebuie sa manance banda de sus a celorlalti
    band = [i for _, i in sorted(scored, reverse=True) if not specs[i]['one']]
    band_of = {i: r / len(band) for r, i in enumerate(band)}

    # treptele de sus primesc rama proprie, ca in plansele lui noi
    FRAME = {'Mythic': (226, 106, 152), 'Legendary': (188, 132, 236), 'Epic': (86, 176, 208)}
    lot_meta = {l['code']: l for l in lots.LOTS}
    meta, thumbs = [], []
    for i, s in enumerate(specs):
        n = i + 1
        rank = rank_of[i]
        tier = '1 of 1' if s['one'] else next(t for p, t in TIERS if band_of[i] <= p)
        s['frame'] = FRAME.get(tier)
        img = build.render(s)
        img.save(f'out/v50/images/{n:05d}.png')
        # grila de randare e 100, deci o miniatura de 100px e identica cu originalul
        th = img.resize((100, 100), Image.NEAREST).quantize(colors=64)
        b = io.BytesIO(); th.save(b, 'PNG', optimize=True)

        L = lot_meta[s['lot']]
        attrs = [{'trait_type': k, 'value': v} for k, v in traits(s).items()]
        attrs += [{'trait_type': 'Lot', 'value': L['name']},
                  {'trait_type': 'Tier', 'value': tier}]
        title = s['title'] or f'Agent #{n:05d}'
        m = {'name': f'{NAME} #{n:05d} - {s["title"]}' if s['title'] else f'{NAME} #{n:05d}',
             'description': DESC, 'image': f'ipfs://REPLACE/{n:05d}.png',
             'attributes': attrs,
             'rarity': {'rank': rank + 1, 'score': round(scored[i][0], 2), 'tier': tier}}
        meta.append(m)
        with open(f'out/v50/{n}.json', 'w') as fh:
            json.dump(m, fh, indent=2)

        a = {x['trait_type']: x['value'] for x in attrs}
        thumbs.append({'n': n, 't': s['title'] or '', 'tier': tier, 'rank': rank + 1,
                       'l': L['code'], 'a': a,
                       'd': base64.b64encode(b.getvalue()).decode()})

    with open('out/v50/_all.json', 'w') as fh:
        json.dump(meta, fh)
    with open('out/v50/_rarity.json', 'w') as fh:
        json.dump({k: dict(v) for k, v in counts.items()}, fh, indent=2)
    with open('out/v50/_thumbs.json', 'w') as fh:
        json.dump(thumbs, fh)

    print(f'{SUPPLY} bucati in {time.time() - t0:.1f}s | duplicate: {dupes}')
    print('loturi:', {l['code']: k for l, k in zip(lots.LOTS, counts_lot)})
    print('trepte:', dict(Counter(m['rarity']['tier'] for m in meta)))
    print('numite:', sum(1 for m in meta if ' - ' in m['name']))
    for k in ('Headwear', 'Held Item', 'Outfit', 'Badge'):
        print(f'  {k}: {len(counts[k])} valori, gol {counts[k].get("None", counts[k].get("Stock Panel", 0))}')


if __name__ == '__main__':
    main()
