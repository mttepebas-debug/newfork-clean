#!/usr/bin/env python3
"""Free-hand theme variants of the Lineup mockups (Mert 2026-10-13: "kendi hür iradenle").

Same engine and behaviour; each theme recolours every literal colour in the CSS through a
palette function, then adds its own component layer (tema-<n>.css) and fonts.
Output: ../tema-1-servis/index.html and ../tema-2-menu/index.html."""
import colorsys
import pathlib
import re

SRC = pathlib.Path(__file__).resolve().parent
OUT = SRC.parent
HEX = re.compile(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")


def read(n):
    p = SRC / n
    return p.read_text(encoding="utf-8") if p.exists() else ""


def to_rgb(h):
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def to_hex(r, g, b):
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(x * 255))) for x in (r, g, b))


def recolor(css, fn):
    def sub(m):
        r, g, b = to_rgb(m.group(1))
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        h2, l2, s2 = fn(h * 360, l, s)
        return to_hex(*colorsys.hls_to_rgb((h2 % 360) / 360, max(0, min(1, l2)), max(0, min(1, s2))))
    return HEX.sub(sub, css)


def is_green(h, s):
    return 120 <= h <= 175 and s > 0.12


# Theme 1 "Service" — the pass at night: warm graphite, amber tickets, mono times.
def servis(h, l, s):
    if s < 0.16 or (l > 0.9 and s < 0.5):  # neutrals and near-white tints -> dark warm greys
        nl = 0.075 + (1 - l) * 0.86 if l > 0.5 else 0.93 - l * 0.55
        return 32, nl, 0.10 if nl < 0.5 else 0.14
    if is_green(h, s):
        h = 38  # accent green -> amber
    if l > 0.8:  # soft tints -> deep tinted surfaces
        return h, 0.16 + (l - 0.8) * 0.3, min(s, 0.45)
    if l < 0.45:  # dark inks -> light inks
        return h, 0.72 - l * 0.25, min(1, s + 0.1)
    return h, max(l, 0.6), s


# Theme 2 "Menu" — the printed menu card: warm paper, black ink, oxblood, serif headings.
def menu(h, l, s):
    if s < 0.16:
        return 38, l * 0.985 if l > 0.5 else l * 0.9, 0.22 if l > 0.85 else 0.08
    if is_green(h, s):
        h, s = 6, min(1, s * 1.15)  # green -> oxblood
    return h, l, s


# Theme 3 "Signal" — Swiss ops board: white, black grid rules, one cobalt signal, condensed grotesk.
def signal(h, l, s):
    if s < 0.16:
        return 0, l, 0
    if is_green(h, s):
        return 232, min(l, 0.5), 0.95 if l < 0.6 else 0.9
    return h, l, s


# Theme 4 "Soft" — friendly floating cards: cool mist, big radii, pine green, pastel shift fields.
def soft(h, l, s):
    if s < 0.16:
        return 228, l, 0.18 if l > 0.8 else 0.1
    return h, l, s


# Theme 5 "Receipt" — kitchen ticket printer: thermal paper, mono everywhere, black ink, red stamp.
def receipt(h, l, s):
    if s < 0.16:
        return 40, l, 0.04
    if is_green(h, s):
        return 0, min(l, 0.18) if l < 0.6 else 0.94, 0
    return h, l, s


# Theme 6 "Porcelain" — cool porcelain plates, cobalt glaze, serif display.
def porcelain(h, l, s):
    if s < 0.16:
        return 220, l, 0.14 if l > 0.85 else 0.1
    if is_green(h, s):
        return 226, l, min(0.65, s + 0.1)
    return h, l, s


# Theme 7 "Travertine" — honed warm stone, sage action, brass detail, arches.
def travertine(h, l, s):
    if s < 0.16:
        return 32, l, 0.16 if l > 0.85 else 0.08
    if is_green(h, s):
        return 145, l, min(s, 0.22)
    return h, l, s


# Studies 8 and 9 stay in today's Newfork language: colours untouched, only a CSS layer on top.
def same(h, l, s):
    return h, l, s


THEMES = {
    "1": dict(folder="tema-1-servis", title="Lineup Service Theme", fn=servis,
              fonts="family=Space+Grotesk:wght@400..700&family=JetBrains+Mono:wght@400..700"),
    "2": dict(folder="tema-2-menu", title="Lineup Menu Theme", fn=menu,
              fonts="family=Fraunces:opsz,wght@9..144,400..800&family=Instrument+Sans:wght@400..700"),
    "3": dict(folder="tema-3-signal", title="Lineup Signal Theme", fn=signal,
              fonts="family=Archivo:wdth,wght@62..125,400..900&family=IBM+Plex+Mono:wght@400;500;600"),
    "4": dict(folder="tema-4-soft", title="Lineup Soft Theme", fn=soft,
              fonts="family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Figtree:wght@400..700"),
    "5": dict(folder="tema-5-fis", title="Lineup Receipt Theme", fn=receipt,
              fonts="family=Space+Mono:wght@400;700&family=IBM+Plex+Mono:wght@400;500;600"),
    "6": dict(folder="tema-6-porselen", title="Lineup Porcelain Theme", fn=porcelain,
              fonts="family=Instrument+Serif:ital@0;1&family=Geist:wght@300..700"),
    "7": dict(folder="tema-7-traverten", title="Lineup Travertine Theme", fn=travertine,
              fonts="family=Marcellus&family=Hanken+Grotesk:wght@400..700"),
    "8": dict(folder="tema-8-catal", title="Lineup Tine Study", fn=same,
              fonts="family=Inter:wght@400..800"),
    "9": dict(folder="tema-9-gosterge", title="Lineup Instrument Study", fn=same,
              fonts="family=Inter:wght@400..800"),
}


def page(n, t):
    base = read("core.css") + read("a.css") + read("b.css") + read("c.css")
    css = (base if t["fn"] is same else recolor(base, t["fn"])) + "\n" + read(f"tema-{n}.css")
    if n == "9":  # the picked look carries the publish window variants (Mert 2026-10-13)
        css += "\n" + read("publish.css")
    js = read("core.js") + read("table.js") + read("a.js") + read("b.js") + read("c.js")
    js = recolor(js, t["fn"]) if n == "1" else js
    tail = read("publish.js") if n == "9" else ""
    return f"""<title>{t['title']}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{t['fonts']}&display=swap">
<style>
{css}
</style>
<div id="app" class="mk"></div>
<script>
{js}
document.body.classList.add("tema-{n}");
window.NF.mount(document.getElementById("app"), {{ variant: "a" }});
{tail}
</script>
"""


if __name__ == "__main__":
    import sys
    only = sys.argv[1:]
    for n, t in THEMES.items():
        if only and n not in only:
            continue
        d = OUT / t["folder"]
        d.mkdir(exist_ok=True)
        (d / "index.html").write_text(page(n, t), encoding="utf-8")
    print("built", ", ".join(t["folder"] for t in THEMES.values()))
