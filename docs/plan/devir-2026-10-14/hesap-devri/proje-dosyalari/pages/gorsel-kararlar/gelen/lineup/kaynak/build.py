#!/usr/bin/env python3
"""Builds the Lineup mockup pages from kaynak/: one self-contained index.html per mockup folder plus the combined page."""
import pathlib

SRC = pathlib.Path(__file__).resolve().parent
OUT = SRC.parent
VARIANTS = {"a": "a-liste", "b": "b-kokpit", "c": "c-pano"}
NAMES = {"a": "A · List", "b": "B · Cockpit", "c": "C · Board"}


def read(name):
    p = SRC / name
    return p.read_text(encoding="utf-8") if p.exists() else ""


def page(variants, title):
    css = read("core.css") + "".join(read(f"{v}.css") for v in variants)
    js = read("core.js") + read("table.js") + "".join(read(f"{v}.js") for v in variants)
    first = variants[0]
    return f"""<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..800&display=swap">
<style>
{css}
</style>
<div id="app" class="mk"></div>
<script>
{js}
window.NF.mount(document.getElementById("app"), {{ variant: "{first}" }});
</script>
"""


def main():
    for v, folder in VARIANTS.items():
        d = OUT / folder
        d.mkdir(exist_ok=True)
        (d / "index.html").write_text(page([v], f"Lineup Mockup {NAMES[v].split(' · ')[0]}"), encoding="utf-8")
    (OUT / "index.html").write_text(page(list(VARIANTS), "Lineup Mockups"), encoding="utf-8")
    print("built", ", ".join(VARIANTS.values()), "+ index.html")


if __name__ == "__main__":
    main()
