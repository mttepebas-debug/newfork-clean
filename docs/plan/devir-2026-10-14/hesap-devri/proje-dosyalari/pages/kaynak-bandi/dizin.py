#!/usr/bin/env python3
"""Builds the folder index page (Artifact dizini) from artifactlar.json.
Usage: python3 dizin.py <output.html>"""
import json, sys, html, os
here = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(here, 'artifactlar.json'), encoding='utf-8'))
E = lambda s: html.escape(s, quote=True)
lab = d['etiketler']
groups = []
for k in d['klasorler']:
    items = [a for a in d['artifactlar'] if a['klasor'] == k['id']]
    groups.append((k, items))

def chip(kind):
    l = lab[kind]
    return f'<span class="chip chip-{l["renk"]}">{E(l["etiket"])}</span>'

counts = {}
for a in d['artifactlar']:
    counts[lab[a['kaynak']]['renk']] = counts.get(lab[a['kaynak']]['renk'], 0) + 1

# PAGES folder: page → part → scenario. The scenario list comes from the PAGES
# engine (screens.json in /mnt/project-files/PAGES/_kaynak); each scenario links
# straight to itself (page link#scenario-id).
PAGES_GROUPS = {"0": "Kabuk: her ekranda ortak parçalar", "1": "Giriş ve kurulum", "2": "Workspace", "3": "Schedule",
    "4": "Employees", "5": "Availability", "6": "Important Dates", "7": "Çalışan ekranları", "8": "Announcements",
    "9": "Notifications", "10": "Settings", "11": "Account", "12": "Herkese açık sayfalar"}
try:
    SCREENS = {x["no"]: x for x in json.load(open("/mnt/project-files/PAGES/_kaynak/screens.json", encoding="utf-8"))["screens"]}
except Exception:
    SCREENS = {}
def pages_no(a):
    head = a['ad'].split(' ', 1)[0]
    try: return [int(x) for x in head.split('.')]
    except ValueError: return [-1]
def scenario_tree(a):
    screen = SCREENS.get(a['ad'].split(' ', 1)[0])
    if not screen: return ''
    parts = []
    for one in screen['scenarios']:
        name = one.get('part') or 'Genel'
        group = next((g for g in parts if g[0] == name), None)
        if not group: parts.append(group := (name, []))
        group[1].append(one)
    body = ''.join(f'<div class="part"><b>{E(name)}</b><ul>' + ''.join(
        f'<li><a href="https://claude.ai/artifact/{a["id"]}#{E(one["id"])}" target="_blank" rel="noopener">{E(one["label"])}</a></li>' for one in lst) + '</ul></div>' for name, lst in parts)
    return f'<details class="tree"><summary>{len(parts)} parça · {len(screen["scenarios"])} senaryo</summary>{body}</details>'

rows = []
for k, items in groups:
    if k['id'] == 'pages':
        items = sorted(items, key=pages_no)
    c = {}
    for a in items: c[lab[a['kaynak']]['renk']] = c.get(lab[a['kaynak']]['renk'], 0) + 1
    summary = ' · '.join(f'{c[r]} {n}' for r, n in (('code', 'Code'), ('project', 'Project'), ('belirsiz', 'belirsiz')) if c.get(r))
    li = []
    last_group = None
    for a in items:
        if k['id'] == 'pages':
            major = a['ad'].split('.', 1)[0]
            if major != last_group and major in PAGES_GROUPS:
                li.append(f'<li class="group">{E(major)} · {E(PAGES_GROUPS[major])}</li>')
                last_group = major
        r = lab[a['kaynak']]['renk']
        sub = 'bu hesap' if a['kaynak'] == 'code-bu' else ('diğer hesap' if a['kaynak'] in ('code-diger', 'belirsiz') else '')
        li.append(f'''<li class="item" data-k="{r}" data-q="{E((a['ad']+' '+a['not']+' '+k['ad']).lower())}">
  <div class="item-head"><a href="https://claude.ai/artifact/{a['id']}" target="_blank" rel="noopener">{E(a['ad'])}</a>{chip(a['kaynak'])}{f'<span class="sub">{sub}</span>' if sub else ''}</div>
  <p class="note">{E(a['not'])}</p>{scenario_tree(a) if k['id'] == 'pages' else ''}
</li>''')
    rows.append(f'''<details class="folder" id="k-{k['id']}" open>
  <summary><span class="fname">{E(k['ad'])}</span><span class="fcount">{len(items)} sayfa · {summary}</span><span class="fwhat">{E(k['ne'])}</span></summary>
  <ul class="items">{''.join(li)}</ul>
</details>''')

legend = ''.join(f'<div class="leg">{chip(key)}<p>{E(v["aciklama"])}</p></div>' for key, v in lab.items() if key != 'code-diger')
legend = legend.replace(E(lab['code-bu']['aciklama']), E(lab['code-bu']['aciklama']) + ' Diğer Claude hesabından taşınanlar da bu etiketi taşır; satırda "diğer hesap" yazar (o hesap Claude Code ile kullanılıyordu, Code\'da yapıldığı bu yüzden çıkarım).')

page = f'''<title>Artifact dizini</title>
<style>
/* Layout: one column of collapsible folders, legend and filter bar on top. */
:root {{
  --bg: #f3f5f4; --surface: #ffffff; --ink: #17221e; --muted: #5a6762; --line: #d9e1dd;
  --accent: #176954; --code-bg: #fbeedd; --code-ink: #8a4b0f; --proj-bg: #e1f1ea; --proj-ink: #13573f;
  --unk-bg: #eceeed; --unk-ink: #4b5552; --focus: #1f7a62;
  --font: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "Cascadia Mono", monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg: #111816; --surface: #19221f; --ink: #e6eeeb; --muted: #a0aea8; --line: #2c3934; --accent: #5cc4a3;
  --code-bg: #3a2a16; --code-ink: #f2c28a; --proj-bg: #163328; --proj-ink: #8fdcbf; --unk-bg: #2a312f; --unk-ink: #c3ccc9; --focus: #5cc4a3; color-scheme: dark; }} }}
:root[data-theme="dark"] {{
  --bg: #111816; --surface: #19221f; --ink: #e6eeeb; --muted: #a0aea8; --line: #2c3934; --accent: #5cc4a3;
  --code-bg: #3a2a16; --code-ink: #f2c28a; --proj-bg: #163328; --proj-ink: #8fdcbf; --unk-bg: #2a312f; --unk-ink: #c3ccc9; --focus: #5cc4a3; color-scheme: dark; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 var(--font); }}
.wrap {{ max-width: 920px; margin: 0 auto; padding-inline: 16px; padding-block: 28px 64px; display: grid; gap: 22px; }}
h1 {{ margin: 0; font-size: 26px; letter-spacing: -0.01em; text-wrap: balance; }}
.lead {{ margin: 4px 0 0; color: var(--muted); max-width: 68ch; }}
.totals {{ display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 10px; font-size: 14px; color: var(--muted); font-variant-numeric: tabular-nums; }}
.legend {{ display: grid; gap: 10px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }}
.leg {{ display: grid; grid-template-columns: 170px 1fr; gap: 12px; align-items: start; }}
.leg p {{ margin: 0; font-size: 14px; color: var(--muted); min-width: 0; }}
@media (max-width: 560px) {{ .leg {{ grid-template-columns: 1fr; gap: 4px; }} }}
.chip {{ display: inline-block; justify-self: start; padding: 1px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }}
.chip-code {{ background: var(--code-bg); color: var(--code-ink); }}
.chip-project {{ background: var(--proj-bg); color: var(--proj-ink); }}
.chip-belirsiz {{ background: var(--unk-bg); color: var(--unk-ink); }}
.bar {{ display: flex; flex-wrap: wrap; gap: 8px; align-items: center; position: sticky; top: env(safe-area-inset-top, 0px); z-index: 2; padding-block: 10px; background: var(--bg); }}
.bar button {{ font: inherit; font-size: 14px; padding: 5px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer; }}
.bar button[aria-pressed="true"] {{ border-color: var(--accent); color: var(--accent); font-weight: 600; }}
.bar input {{ font: inherit; font-size: 14px; padding: 5px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); flex: 1 1 180px; min-width: 0; }}
.bar .tog {{ margin-left: auto; }}
:focus-visible {{ outline: 2px solid var(--focus); outline-offset: 2px; }}
.folders {{ display: grid; gap: 10px; }}
.folder {{ border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }}
.folder > summary {{ list-style: none; cursor: pointer; padding: 12px 16px; display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; align-items: baseline; }}
.folder > summary::-webkit-details-marker {{ display: none; }}
.folder > summary::before {{ content: "▸"; grid-row: 1 / span 2; color: var(--muted); transition: transform .15s; display: inline-block; }}
.folder[open] > summary::before {{ transform: rotate(90deg); }}
@media (prefers-reduced-motion: reduce) {{ .folder > summary::before {{ transition: none; }} }}
.fname {{ font-weight: 700; font-size: 17px; }}
.fcount {{ grid-column: 2; font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }}
.fwhat {{ grid-column: 2; font-size: 13px; color: var(--muted); }}
.items {{ list-style: none; margin: 0; padding: 0 16px 8px 40px; display: grid; }}
.item {{ padding-block: 10px; border-top: 1px solid var(--line); display: grid; gap: 2px; }}
.item-head {{ display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; }}
.item-head a {{ color: var(--ink); font-weight: 600; text-decoration-color: var(--line); text-underline-offset: 3px; min-width: 0; }}
.item-head a:hover {{ color: var(--accent); text-decoration-color: currentColor; }}
.sub {{ font-size: 12px; color: var(--muted); }}
.note {{ margin: 0; font-size: 14px; color: var(--muted); max-width: 70ch; }}
.group {{ list-style: none; padding: 14px 0 2px; font-size: 12.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--accent); border-top: 1px solid var(--line); }}
.tree {{ margin-top: 4px; font-size: 13.5px; }} .tree summary {{ cursor: pointer; color: var(--accent); font-weight: 600; }}
.tree .part {{ margin: 6px 0 0 4px; }} .tree .part b {{ font-size: 13px; }}
.tree .part ul {{ margin: 2px 0 0; padding-left: 18px; }} .tree a {{ color: var(--accent); }}
.empty {{ color: var(--muted); font-size: 14px; }}
.foot {{ font-size: 13px; color: var(--muted); max-width: 72ch; }}
.foot code {{ font-family: var(--mono); font-size: 12.5px; overflow-wrap: anywhere; }}
@media (max-width: 560px) {{ .items {{ padding-left: 16px; }} }}
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;600;700&display=swap">
<main class="wrap">
  <header>
    <h1>Artifact dizini</h1>
    <p class="lead">Newfork'un bütün Artifact sayfaları, gösterdikleri uygulama sayfasına göre klasörlerde. Her satırda sayfanın nereden geldiği yazar: Project'ten önceki Claude Code çalışmasından mı kurtarıldı, yoksa bu Project'te mi sıfırdan yazıldı. Aynı bilgi her sayfanın en üstündeki bantta da var.</p>
    <div class="totals"><span>{len(d['artifactlar'])} sayfa</span><span>{counts.get('code',0)} Code'dan kurtarıldı</span><span>{counts.get('project',0)} Project'te sıfırdan</span><span>{counts.get('belirsiz',0)} kaynak belirsiz</span></div>
  </header>
  <section class="legend" aria-label="Etiketler">{legend}</section>
  <div class="bar" role="toolbar" aria-label="Süzgeç">
    <button type="button" data-f="all" aria-pressed="true">Hepsi</button>
    <button type="button" data-f="code" aria-pressed="false">Code'dan kurtarıldı</button>
    <button type="button" data-f="project" aria-pressed="false">Project'te sıfırdan</button>
    <button type="button" data-f="belirsiz" aria-pressed="false">Kaynak belirsiz</button>
    <input id="q" type="search" placeholder="Sayfa ara" aria-label="Sayfa ara">
    <button type="button" class="tog" id="tog">Hepsini kapat</button>
  </div>
  <div class="folders">{''.join(rows)}</div>
  <p class="foot">Kaynak bilgisinin dayanağı: Project'ten önceki sayfa kaydı (<code>backup/tasarim-kaynaklari</code> dalındaki <code>kaynak/newfork-pages/pages.json</code>), diğer hesaptan taşıma listesi (<code>/mnt/project-files/pages/LISTE.md</code>) ve Project thread'lerinin kayıtları. Dizinin verisi <code>/mnt/project-files/pages/kaynak-bandi/artifactlar.json</code>; yeni bir Artifact yayınlanınca oraya eklenir ve bu sayfa yeniden üretilir.</p>
</main>
<script>
(function () {{
  var f = 'all', q = '';
  var btns = document.querySelectorAll('.bar [data-f]');
  var folders = document.querySelectorAll('.folder');
  function apply() {{
    folders.forEach(function (fo) {{
      var shown = 0;
      fo.querySelectorAll('.item').forEach(function (it) {{
        var ok = (f === 'all' || it.dataset.k === f) && (!q || it.dataset.q.indexOf(q) !== -1);
        it.hidden = !ok; if (ok) shown++;
      }});
      fo.hidden = shown === 0;
      if ((f !== 'all' || q) && shown) fo.open = true;
    }});
  }}
  btns.forEach(function (b) {{ b.addEventListener('click', function () {{
    f = b.dataset.f; btns.forEach(function (x) {{ x.setAttribute('aria-pressed', String(x === b)); }}); apply();
  }}); }});
  document.getElementById('q').addEventListener('input', function (e) {{ q = e.target.value.trim().toLocaleLowerCase('tr'); apply(); }});
  var tog = document.getElementById('tog');
  tog.addEventListener('click', function () {{
    var anyOpen = Array.prototype.some.call(folders, function (x) {{ return x.open; }});
    folders.forEach(function (x) {{ x.open = !anyOpen; }});
    tog.textContent = anyOpen ? 'Hepsini aç' : 'Hepsini kapat';
  }});
}})();
</script>
'''
open(sys.argv[1], 'w', encoding='utf-8').write(page)
print('written', sys.argv[1], len(page))
