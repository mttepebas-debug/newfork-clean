#!/usr/bin/env python3
"""Builds the job icon pack: svg/*.svg, README.md and index.html (gallery).
Run: python3 kaynak/build.py   (from anywhere). Status edits go in kaynak/status.json."""
import json, os, sys, html
K = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(K)
sys.path.insert(0, K)
from icons import ICONS
ATTR = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
sp = os.path.join(K, 'status.json')
status = json.load(open(sp)) if os.path.exists(sp) else {}
for slug, *_ in ICONS: status.setdefault(slug, 'bekliyor')
json.dump(status, open(sp, 'w'), indent=1, ensure_ascii=False)
os.makedirs(os.path.join(ROOT, 'svg'), exist_ok=True)
rows, data = [], []
for i, (slug, name, role, cat, rnd, body) in enumerate(ICONS, 1):
    fn = f'{i:03d}-{slug}.svg'
    open(os.path.join(ROOT, 'svg', fn), 'w').write(f'<svg {ATTR}>{body}</svg>\n')
    st = status[slug]
    rows.append(f'| {i} | `svg/{fn}` | {name} | {role} | {cat} | {rnd} | {st} |')
    data.append(dict(n=i, slug=slug, name=name, role=role, cat=cat, round=rnd, st=st, svg=body))
c = {k: sum(1 for d in data if d['st'] == k) for k in ('keep', 'sil', 'bekliyor')}
open(os.path.join(ROOT, 'README.md'), 'w').write(f"""# Job ikon paketi

Restoran pozisyonları ve genel görevler için SVG ikonlar. Jobs çekmecesinde bir job'a atanacak; Lineup'ta kişinin yanında baş harfler yerine görünecek.

- Stil: 24×24 ızgara, 2 birim çizgi, yuvarlak uç ve köşe, dolgu yok, renk `currentColor` (uygulamadaki lucide-react ikonlarıyla aynı kural).
- Durum: `keep` (kalsın), `sil` (silinecek), `bekliyor` (Mert henüz karar vermedi). Durum `kaynak/status.json`'da tutulur.
- Galeri: `index.html`, yayında https://claude.ai/artifact/XxfpgGwRtUH2P5jJKup5qi (aynı bağlantıya yeni sürüm; yayından önce kopyaya `python3 /mnt/project-files/pages/kaynak-bandi/bant.py <kopya> XxfpgGwRtUH2P5jJKup5qi`). Kaynak: `kaynak/icons.py`, yeniden üretmek için `python3 kaynak/build.py`.
- Sayılar: {len(data)} ikon · keep {c['keep']} · sil {c['sil']} · bekliyor {c['bekliyor']}

| No | Dosya | İkon | Önerilen job | Kategori | Tur | Durum |
|---|---|---|---|---|---|---|
""" + '\n'.join(rows) + '\n')
from insan import C as ILLC, COLORS, ROUND
from kit import render, RK
os.makedirs(os.path.join(ROOT, 'svg', 'insan'), exist_ok=True)
def flat(body, mode, col): return render(body, col, mode)
ill, rows3 = [], []
for j, (slug, name, role, body) in enumerate(ILLC, 1):
    n = len(data) + j; status.setdefault(slug, 'bekliyor'); col = COLORS[slug]
    rnd = ROUND[slug]
    for mode in (('cizgi', 'renkli') if rnd == 3 else ('renkli',)):
        open(os.path.join(ROOT, 'svg', 'insan', f'{n:03d}-{slug}-{mode}.svg'), 'w').write(
            f'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" stroke-linecap="round" stroke-linejoin="round">{flat(body, mode, col)}</svg>\n')
    rows3.append(f'| {n} | `svg/insan/{n:03d}-{slug}-renkli.svg` | {name} | {role} | {rnd} | {status[slug]} |')
    ill.append(dict(n=n, slug=slug, name=name, role=role, st=status[slug], svg=flat(body, 'renkli', col), hr=col['hr'], sk=col.get('sk', RK['sk']), arm=col.get('arm', '#ffffff'), job=col['job'], round=rnd))
json.dump(status, open(sp, 'w'), indent=1, ensure_ascii=False)
with open(os.path.join(ROOT, 'README.md'), 'a') as fh:
    fh.write('\n## İnsan çizimleri (Mert\'in örneklerine göre, renkli stil)\n\nYüzsüz insan, net saç ve kıyafet, önde rolün aleti. 48×48 ızgara, 1.6 çizgi. Mert 2026-10-14 08:04Z (California 01:04) renkli stili seçti (düz renk + koyu çizgi); tur 3 çizimlerinin tek renk `cizgi` dosyaları da duruyor. Mert aynı stilde 100 yeni çizim istedi (08:05Z). Tur 5\'ten (serinin 2. turu) itibaren çizimler `kaynak/kit.py` kalıbıyla: dirsekli kol, gerçek el, belirgin kravat, gölge (Mert 08:24Z daha iyi işçilik istedi); 60 host, 72 sommelier ve 74 pizzacı bu kalıpla yeniden çizildi. Tur 9 (Mert 09:04Z): çizimler Lineup\'ta ismin solunda duracak, o yüzden sadece işi yapan kişi ya da en çok kullandığı alet; sahne ve genel nesneler (kapalı tabelası, el yıkama, soğuk oda kapısı…) çıkarıldı, dosyaları `svg/insan/cikarilan/`, yerlerine aynı numaralarla yenileri geldi; 159–173 yeni.\n\n| No | Dosya | Çizim | Önerilen job | Tur | Durum |\n|---|---|---|---|---|---|\n' + '\n'.join(rows3) + '\n')
tpl = open(os.path.join(K, 'gallery.html')).read()
tpl = tpl.replace('/*ILL*/[]', json.dumps(ill, ensure_ascii=False))
tpl = tpl.replace('/*RKCSS*/', ' '.join(f'.rk .ill .{k} {{ fill: {v}; }}' for k, v in RK.items() if k != 'sk'))
out = tpl.replace('/*DATA*/[]', json.dumps(data, ensure_ascii=False)).replace('{{COUNT}}', str(len(data)))
open(os.path.join(ROOT, 'index.html'), 'w').write(out)
print('built', len(data), c)
