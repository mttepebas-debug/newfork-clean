"""Marks Mert's choices by number, then rebuilds the pack.
Usage: python3 durum.py keep 53 59 160   |   python3 durum.py sil 124 129   |   python3 durum.py bekliyor 60
Numbers are the ones on the gallery cards: 1-52 icons (icons.py), 53+ drawings (insan.py).
Writes kaynak/status.json (keyed by slug, so numbers never shift) and runs build.py."""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); K = os.path.dirname(HERE)
sys.path.insert(0, K)
from icons import ICONS
from insan import C
st, nums = sys.argv[1], [int(a) for a in sys.argv[2:]]
assert st in ('keep', 'sil', 'bekliyor'), 'first word: keep, sil or bekliyor'
slugs = [s for s, *_ in ICONS] + [s for s, *_ in C]
sp = os.path.join(K, 'status.json'); status = json.load(open(sp))
for n in nums:
    assert 1 <= n <= len(slugs), f'no item {n} (1-{len(slugs)})'
    status[slugs[n - 1]] = st; print(n, slugs[n - 1], '->', st)
json.dump(status, open(sp, 'w'), indent=1, ensure_ascii=False)
subprocess.run([sys.executable, os.path.join(K, 'build.py')], check=True)
