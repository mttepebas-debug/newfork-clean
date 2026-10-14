"""Preview sheet of one round (as onizleme/tur9-onizleme.png), after build.py has written the svg files.
Usage: python3 onizleme.py <round> out.html   then screenshot out.html (window ~1300 wide) and crop."""
import sys, html
import os
HERE = os.path.dirname(os.path.abspath(__file__))
_k = (os.environ.get('JOB_IKON_KAYNAK') or (os.path.dirname(HERE) if os.path.exists(os.path.join(os.path.dirname(HERE), 'kit.py'))
      else '/mnt/project-files/pages/gorsel-kararlar/gelen/job-ikonlari/kaynak'))
K = os.path.dirname(_k)
sys.path.insert(0, K + '/kaynak')
import insan
rnd, out = int(sys.argv[1]), sys.argv[2]
cells = ''
for i, (slug, name, role, body) in enumerate(insan.C):
    n = 53 + i
    if insan.ROUND.get(slug) != rnd: continue
    f = f'{K}/svg/insan/{n:03d}-{slug}-renkli.svg'; job = insan.COLORS[slug]['job']
    av = f'<span style="display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;overflow:hidden;background:color-mix(in srgb,{job} 14%,#fff)"><img src="file://{f}" width="30" height="30"></span>'
    cells += f'<figure><img src="file://{f}" width="132" height="132"><div class="row">{av}<span>Ali Demir</span></div><figcaption><b>{n}</b> {html.escape(name)}<br><i>{html.escape(role)}</i></figcaption></figure>'
open(out, 'w').write(f'''<html><body style="margin:0;padding:16px;background:#f5f7f6;font:12px Arial,sans-serif;color:#1d2528">
<h2 style="margin:0 0 12px;font-size:20px">Job çizimleri · Tur {rnd} önizleme</h2>
<div style="display:grid;grid-template-columns:repeat(8,150px);gap:8px">{cells}</div>
<style>figure{{margin:0;background:#fff;border:1px solid #dde3e0;border-radius:8px;padding:8px}}figcaption{{margin-top:4px;line-height:1.3}}figcaption i{{color:#5f6b66;font-style:normal;font-size:11px}}.row{{display:flex;align-items:center;gap:6px;margin-top:4px}}</style></body></html>''')
