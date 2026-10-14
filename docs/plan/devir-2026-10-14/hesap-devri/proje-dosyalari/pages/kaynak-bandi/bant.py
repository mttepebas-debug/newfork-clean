#!/usr/bin/env python3
"""Adds (or refreshes) the source band at the top of an Artifact page.
Usage: python3 bant.py <page.html> <artifact-id>
The band says where the page came from (Code or Project) and which folder of the
Artifact index it sits in; data comes from artifactlar.json next to this file.
Run it on a page file before republishing it, so the band is not lost."""
import json, sys, os, re, html
here = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(here, 'artifactlar.json'), encoding='utf-8'))
path, aid = sys.argv[1], sys.argv[2]
a = next((x for x in d['artifactlar'] if x['id'] == aid), None)
if a is None:
    sys.exit(f'{aid} is not in artifactlar.json; register it first: python3 kayit.py {aid} "<name>" <folder-id> <source> (folders: python3 kayit.py --list)')
k = next(x for x in d['klasorler'] if x['id'] == a['klasor'])
lab = d['etiketler'][a['kaynak']]
LINE = {
    'code-bu': "Project'ten önce, bu hesaptaki bir Claude Code oturumunda yapıldı; 2026-10-09'da bulunup Project'e alındı.",
    'code-diger': "Project'ten önce, Mert'in diğer Claude hesabında yapıldı; 2026-10-09'da bu hesaba taşındı.",
    'belirsiz': "Project'ten önce, diğer hesapta yapıldı; hangi araçla yapıldığı bilinmiyor.",
    'project': "Bu Project'te sıfırdan yazıldı.",
}[a['kaynak']]
if a.get('bant_ek'):
    LINE += ' ' + a['bant_ek']
COL = {'code': ('#fbeedd', '#7a420c'), 'project': ('#dff0e8', '#11513a'), 'belirsiz': ('#e8ebea', '#424b48')}[lab['renk']]
cfg = json.dumps({'chip': lab['etiket'], 'line': LINE, 'folder': k['ad'], 'tip': lab['aciklama'],
                  'index': d['dizin'], 'bg': COL[0], 'fg': COL[1]}, ensure_ascii=False)
block = '''<!-- nf-kaynak-bandi:start -->
<script>
(function () {
  var c = %s;
  function mount() {
    if (!document.body || document.getElementById('nf-kaynak-bandi')) return;
    var host = document.createElement('div');
    host.id = 'nf-kaynak-bandi';
    host.setAttribute('style', 'display:block!important;position:relative!important;z-index:2147483646!important;margin:0!important;padding:0!important;width:auto!important;flex:0 0 auto!important;grid-column:1/-1!important;float:none!important;');
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML = '<style>' +
      '.b{all:initial;box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:6px 40px 6px 14px;min-height:32px;position:relative;' +
      'background:#f7f8f7;border-bottom:1px solid #d6ddda;color:#33403b;font:13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}' +
      '.chip{display:inline-block;padding:1px 9px;border-radius:999px;font-weight:600;font-size:12px;white-space:nowrap;background:' + c.bg + ';color:' + c.fg + ';}' +
      '.t{min-width:0;}.f{color:#5a6762;white-space:nowrap;}' +
      'a{color:#176954;font-weight:600;text-decoration:underline;text-underline-offset:2px;white-space:nowrap;}' +
      'button{all:initial;position:absolute;right:8px;top:50%%;transform:translateY(-50%%);width:24px;height:24px;border-radius:6px;cursor:pointer;color:#5a6762;font:16px/24px sans-serif;text-align:center;}' +
      'button:hover{background:#e6ebe9;}button:focus-visible,a:focus-visible{outline:2px solid #176954;outline-offset:2px;}' +
      '</style><div class="b" role="note" aria-label="Sayfanın kaynağı"><span class="chip"></span><span class="t"></span><span class="f"></span>' +
      (c.index ? '<a target="_blank" rel="noopener">Artifact dizini ↗</a>' : '') +
      '<button type="button" aria-label="Bandı gizle" title="Bandı gizle">×</button></div>';
    root.querySelector('.chip').textContent = c.chip;
    root.querySelector('.chip').title = c.tip;
    root.querySelector('.t').textContent = c.line;
    root.querySelector('.f').textContent = 'Klasör: ' + c.folder;
    var l = root.querySelector('a'); if (l) l.href = c.index;
    root.querySelector('button').addEventListener('click', function () { host.remove(); });
    document.body.insertBefore(host, document.body.firstChild);
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
</script>
<!-- nf-kaynak-bandi:end -->''' % cfg
s = open(path, encoding='utf-8').read()
s = re.sub(r'<!-- nf-kaynak-bandi:start -->.*?<!-- nf-kaynak-bandi:end -->\n?', '', s, flags=re.S)
# Goes at the end of <body>, so the page's <title> stays within the first 8 KB; the script
# then puts the band first in <body>.
ms = list(re.finditer(r'</body\s*>', s, flags=re.I))
i = ms[-1].start() if ms else -1
s = (s[:i] + block + '\n' + s[i:]) if i != -1 else (s + '\n' + block + '\n')
open(path, 'w', encoding='utf-8').write(s)
print('band:', aid, a['kaynak'], k['ad'])
