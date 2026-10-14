#!/usr/bin/env python3
"""Builds ../index.html (one self-contained file) from this folder.
Order: tokens.css, base.css, v-*.css | icons, core.js, original, v-*.js, start."""
import base64, glob, json, os, re, sys
H = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(H, "..", "index.html")
ICON_DIR = "/mnt/project-files/pages/gorsel-kararlar/gelen/job-ikonlari/svg/insan"
ORIGINAL = "/mnt/project-files/pages/gorsel-kararlar/gelen/lineup-telefon/index.html"
ICONS = {"server": "055", "host": "061", "busser": "059", "bartender": "056", "barback": "062", "linecook": "066", "prep": "067"}
def read(p): return open(p, encoding="utf-8").read()
def icons():
    out = {}
    for job, no in ICONS.items():
        f = sorted(glob.glob(os.path.join(ICON_DIR, no + "-*renkli.svg")))[0]
        s = re.sub(r"<metadata>.*?</metadata>", "", read(f), flags=re.S)
        s = re.sub(r'\s*xmlns:c2pa="[^"]*"', "", s)
        out[job] = "data:image/svg+xml;base64," + base64.b64encode(s.encode()).decode()
    return "window.NF = window.NF || {}; NF.JOB_ICONS = " + json.dumps(out) + ";"
def original():
    s = read(ORIGINAL)
    s = s.replace("Acknowledged. Sarah can see it.", "Acknowledged.")
    s = re.sub(r"<!--\s*(?:nf-)?kaynak-bandi:start\s*-->.*?<!--\s*(?:nf-)?kaynak-bandi:end\s*-->", "", s, flags=re.S)  # the published page's source band
    patch = ('<style>.mk-phonebar{display:none!important}</style><script>(function(){var first=true;'
             'window.addEventListener("message",function(e){var m=e.data&&e.data.nfm;if(!m)return;'
             'if(first){first=false;var b=document.querySelector(\'[data-act="var"][data-v="b"]\');if(b)b.click();'
             'var r=document.querySelector(\'[data-act="rowlay"][data-r="1"]\');if(r)r.click();}'
             'var x=document.querySelector(\'[data-act="moment"][data-m="\'+m+\'"]\');if(x)x.click();});})();</script>')
    s = '<!doctype html><html lang="en"><head><meta charset="utf-8">' + s + patch
    return ("NF.ORIGINAL_HTML = " + json.dumps(s).replace("</", "<\\/") + ";\n"
            'NF.variant({ id: "o", original: true, name: "Original · bugünkü taslak", sub: "Vardiya sekmeleri, satır düzeni 1 (Orta sütun), baş harfler. Kendi verisiyle çalışır; anlar ona da geçer." });')
def main():
    # python3 build.py [--only a,b] [--out path.html]   (default: every v-*.js except x, into ../index.html)
    args = sys.argv[1:]
    only = args[args.index("--only") + 1].split(",") if "--only" in args else None
    out = os.path.abspath(args[args.index("--out") + 1]) if "--out" in args else OUT
    vids = sorted(os.path.basename(p)[2:-3] for p in glob.glob(os.path.join(H, "v-*.js")))
    vids = [v for v in vids if v in only] if only else [v for v in vids if v != "x"]
    css = read(os.path.join(H, "tokens.css")) + "\n" + read(os.path.join(H, "base.css"))
    for v in vids:
        p = os.path.join(H, "v-%s.css" % v)
        if os.path.exists(p): css += "\n/* ===== variant %s ===== */\n" % v + read(p)
    js = icons() + "\n" + read(os.path.join(H, "core.js")) + "\n" + original() + "\n"
    for v in vids: js += "\n/* ===== variant %s ===== */\n" % v + read(os.path.join(H, "v-%s.js" % v))
    js += "\nNF.start();\n"
    html = read(os.path.join(H, "shell.html")).replace("/*@@CSS@@*/", css).replace("/*@@JS@@*/", js.replace("</script", "<\\/script"))
    open(out, "w", encoding="utf-8").write(html)
    print("built", out, len(html) // 1024, "KB, variants:", ", ".join(vids))
main()
