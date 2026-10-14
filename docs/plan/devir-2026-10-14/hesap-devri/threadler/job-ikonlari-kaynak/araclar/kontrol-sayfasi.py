"""Contact sheet for one drawing module: big view + Lineup avatar sizes (52, 44, 32 px).
Usage: python3 kontrol-sayfasi.py <module> out.html <size> [slug ...]
  module = seri2..seri7 (a module with S<n>/COL<n>, or seri6 with REPL/COL6)
Then screenshot out.html with headless Chromium and look at it before rebuilding.
Finds the pack itself when it sits in kaynak/araclar/; else set JOB_IKON_KAYNAK to the kaynak folder."""
import sys, importlib
import os
HERE = os.path.dirname(os.path.abspath(__file__))
K = (os.environ.get('JOB_IKON_KAYNAK') or (os.path.dirname(HERE) if os.path.exists(os.path.join(os.path.dirname(HERE), 'kit.py'))
     else '/mnt/project-files/pages/gorsel-kararlar/gelen/job-ikonlari/kaynak')); sys.path.insert(0, K)
import kit
M = importlib.import_module(sys.argv[1]); sys.argv.pop(1)
LST = list(M.REPL.values()) if hasattr(M, "REPL") else [v for k, v in vars(M).items() if k[:1] == "S" and k[1:].isdigit()][0]
COLS = [v for k, v in vars(M).items() if k.startswith("COL") and k[3:].isdigit()][0]
out = sys.argv[1]; size = int(sys.argv[2]); only = sys.argv[3:]
cells = ''
for slug, name, role, body in LST:
    if only and slug not in only: continue
    col = COLS[slug]; s = kit.render(body, col)
    svg = lambda px: f'<svg xmlns="http://www.w3.org/2000/svg" width="{px}" height="{px}" viewBox="0 0 48 48" stroke-linecap="round" stroke-linejoin="round">{s}</svg>'
    soft = f"color-mix(in srgb,{col['job']} 14%,#fff)"
    av = lambda px: f'<span style="display:inline-grid;place-items:center;width:{px}px;height:{px}px;border-radius:50%;overflow:hidden;background:{soft};margin-left:6px">{svg(round(px*.92))}</span>'
    cells += f'<figure>{svg(size)}<div>{av(52)}{av(44)}{av(32)}</div><figcaption>{slug}</figcaption></figure>'
open(out, 'w').write(f'<html><body style="margin:8px;font:12px sans-serif;background:#fff;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start">{cells}<style>figure{{margin:0;border:1px solid #ddd;padding:6px;background:#f7f9f8}}</style></body></html>')
