#!/usr/bin/env python3
"""Builds the availability mockups into one self-contained page: ../index.html (Original + five new directions)."""
import pathlib

SRC = pathlib.Path(__file__).resolve().parent
OUT = SRC.parent
ORDER = ["o", "v1", "v2", "v3", "v4", "v5"]


def read(name):
    p = SRC / name
    return p.read_text(encoding="utf-8") if p.exists() else ""


def main():
    css = read("core.css") + "".join(read(f"{v}.css") for v in ORDER)
    js = read("core.js") + "".join(read(f"{v}.js") for v in ORDER)
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Availability Mockups</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..800&display=swap">
<style>
{css}
</style>
</head>
<body>
<div id="app" class="mk"></div>
<script>
{js}
window.NF.mount(document.getElementById("app"));
</script>
</body>
</html>
"""
    (OUT / "index.html").write_text(html, encoding="utf-8")
    print("built index.html", len(html) // 1024, "KB")


if __name__ == "__main__":
    main()
