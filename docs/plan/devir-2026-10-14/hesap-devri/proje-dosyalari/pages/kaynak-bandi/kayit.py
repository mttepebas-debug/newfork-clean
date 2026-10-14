#!/usr/bin/env python3
"""Registers (or updates) one page in artifactlar.json and rebuilds dizin.html.
Usage: python3 kayit.py <artifact-id> "<name>" <folder-id> <source> ["<note>"]
  folder-id: one of the ids in artifactlar.json "klasorler" (run with --list to see them)
  source:    project | code-bu | code-diger | belirsiz
After this, run bant.py on the page and publish it; then publish dizin.html to the index URL."""
import json, sys, os, subprocess
here = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(here, 'artifactlar.json')
d = json.load(open(p, encoding='utf-8'))
if len(sys.argv) == 2 and sys.argv[1] == '--list':
    for k in d['klasorler']: print(k['id'], '-', k['ad'])
    sys.exit(0)
if len(sys.argv) < 5:
    sys.exit(__doc__)
aid, ad, kl, kay = sys.argv[1:5]
note = sys.argv[5] if len(sys.argv) > 5 else ''
if kl not in {k['id'] for k in d['klasorler']}:
    sys.exit(f'unknown folder {kl!r}; see: python3 kayit.py --list')
if kay not in d['etiketler']:
    sys.exit(f'unknown source {kay!r}; one of {sorted(d["etiketler"])}')
e = next((x for x in d['artifactlar'] if x['id'] == aid), None)
if e is None:
    e = {'id': aid}; d['artifactlar'].append(e)
e.update({'ad': ad, 'klasor': kl, 'kaynak': kay, 'not': note})
json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
subprocess.run([sys.executable, os.path.join(here, 'dizin.py'), os.path.join(here, 'dizin.html')], check=True)
print('registered:', aid, kl, kay)
