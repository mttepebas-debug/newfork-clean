#!/usr/bin/env python3
"""Adds the "Orijinal" option (today's app on main) to a variant page.

usage: inject.py <page.html> <out.html> <config.json>
config: {"screens": [{"label", "as", "route", "width"}], "personas": {key: label}, "note": str}
The page's own content is left as it is; a bar on top switches between
"Orijinal" (first) and "Varyantlar" (the page as it was).
"""
import json
import re
import sys

src, out, cfg_path = sys.argv[1:4]
page = open(src, encoding="utf-8").read()
cfg = json.load(open(cfg_path, encoding="utf-8"))

# Re-injecting replaces the earlier block.
page = re.sub(r"\n?<!-- nf-orijinal:start -->.*?<!-- nf-orijinal:end -->\n?", "\n", page, flags=re.S)

block = r"""
<!-- nf-orijinal:start -->
<style>
:root { --nfo-ink: #17221e; --nfo-muted: #5b6662; --nfo-line: #dce3df; --nfo-page: #f4f5f3; --nfo-green: #12624f; --nfo-green-soft: #e3efe9; }
#nfo-bar { position: relative; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: none; width: 100%;
  padding: 8px 16px; background: #fff; border-bottom: 1px solid var(--nfo-line); font: 500 13px/1.3 Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif; color: var(--nfo-ink); box-sizing: border-box; }
html.nfo-o #nfo-bar { position: fixed; z-index: 2147483600; top: 0; left: 0; right: 0; }
html.nfo-o, html.nfo-o body { overflow: hidden !important; }
#nfo-bar .nfo-seg { display: inline-flex; border: 1px solid var(--nfo-line); border-radius: 8px; overflow: hidden; }
#nfo-bar .nfo-seg button { border: 0; background: #fff; color: var(--nfo-ink); font: inherit; font-weight: 600; padding: 7px 14px; cursor: pointer; }
#nfo-bar .nfo-seg button + button { border-left: 1px solid var(--nfo-line); }
#nfo-bar .nfo-seg button[aria-pressed="true"] { background: var(--nfo-green); color: #fff; }
#nfo-bar button:focus-visible, #nfo-tools select:focus-visible, #nfo-tools button:focus-visible { outline: 2px solid var(--nfo-green); outline-offset: 2px; }
#nfo-bar .nfo-hint { color: var(--nfo-muted); font-weight: 500; }
@media (max-width: 700px) { #nfo-bar .nfo-hint { display: none; } }
#nfo-view { position: fixed; z-index: 2147483500; top: 52px; left: 0; right: 0; bottom: 0; background: var(--nfo-page); display: flex; flex-direction: column; font: 500 13px/1.35 Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif; color: var(--nfo-ink); }
#nfo-view[hidden] { display: none; }
#nfo-tools { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--nfo-line); background: #fff; }
#nfo-tools label { display: inline-flex; gap: 6px; align-items: center; font-weight: 600; }
#nfo-tools select { font: inherit; font-weight: 500; padding: 6px 8px; border: 1px solid var(--nfo-line); border-radius: 6px; background: #fff; color: var(--nfo-ink); max-width: 72vw; }
#nfo-tools .nfo-seg { display: inline-flex; border: 1px solid var(--nfo-line); border-radius: 6px; overflow: hidden; }
#nfo-tools .nfo-seg button { border: 0; background: #fff; font: inherit; padding: 6px 10px; cursor: pointer; color: var(--nfo-ink); }
#nfo-tools .nfo-seg button + button { border-left: 1px solid var(--nfo-line); }
#nfo-tools .nfo-seg button[aria-pressed="true"] { background: var(--nfo-green-soft); color: var(--nfo-green); font-weight: 700; }
#nfo-note { color: var(--nfo-muted); padding: 6px 16px; font-size: 12px; }
#nfo-stage { flex: 1; overflow: auto; display: flex; justify-content: center; align-items: flex-start; padding: 12px; box-sizing: border-box; }
#nfo-holder { position: relative; flex: none; box-shadow: 0 6px 24px rgb(0 0 0 / 0.08); border: 1px solid var(--nfo-line); border-radius: 8px; overflow: hidden; background: #fff; }
#nfo-frame { border: 0; display: block; transform-origin: 0 0; background: #fff; }
</style>
<div id="nfo-bar" role="group" aria-label="Görünüm">
  <span class="nfo-seg">
    <button type="button" data-nfo="o" aria-pressed="false">Orijinal · bugünkü uygulama</button>
    <button type="button" data-nfo="v" aria-pressed="true">Varyantlar</button>
  </span>
  <span class="nfo-hint" id="nfo-hint"></span>
</div>
<div id="nfo-view" hidden>
  <div id="nfo-tools">
    <label>Ekran <select id="nfo-screen"></select></label>
    <label>Kim bakıyor <select id="nfo-as"></select></label>
    <span class="nfo-seg" role="group" aria-label="Genişlik">
      <button type="button" data-w="1440" aria-pressed="true">Masaüstü 1440</button>
      <button type="button" data-w="390" aria-pressed="false">Telefon 390</button>
    </span>
  </div>
  <div id="nfo-note"></div>
  <div id="nfo-stage"><div id="nfo-holder"><iframe id="nfo-frame" title="Bugünkü uygulama" src="about:blank"></iframe></div></div>
</div>
<script>
(() => {
  const CFG = __CFG__;
  const bar = document.getElementById("nfo-bar");
  const view = document.getElementById("nfo-view");
  const frame = document.getElementById("nfo-frame");
  const holder = document.getElementById("nfo-holder");
  const stage = document.getElementById("nfo-stage");
  const screenSel = document.getElementById("nfo-screen");
  const asSel = document.getElementById("nfo-as");
  const widthBtns = [...document.querySelectorAll("#nfo-tools [data-w]")];
  document.getElementById("nfo-note").textContent = CFG.note;
  document.getElementById("nfo-hint").textContent = CFG.hint || "Orijinal: bugün main'de çalışan ekran, gerçek kodla. Varyantlar: bu sayfanın önerileri.";
  // The bar sits in the page flow at the very top, so the page's own drawers and fixed parts cover it as usual.
  document.body.prepend(bar);
  function place() { view.style.top = bar.offsetHeight + "px"; }
  CFG.screens.forEach((s, i) => screenSel.add(new Option(s.label, String(i))));
  Object.entries(CFG.personas).forEach(([key, label]) => asSel.add(new Option(label, key)));
  let state = { screen: 0, as: CFG.screens[0].as, width: CFG.screens[0].width || 1440, loaded: null, started: false };
  let remember = (key, value) => { try { localStorage.setItem("nfo." + key, value); } catch (e) {} };
  let recall = (key) => { try { return localStorage.getItem("nfo." + key); } catch (e) { return null; } };

  function fit() {
    const w = state.width, h = w < 600 ? 844 : 900;
    frame.style.width = w + "px";
    frame.style.height = (w < 600 ? h : Math.max(h, stage.clientHeight - 24)) + "px";
    const room = stage.clientWidth - 24;
    const scale = w > room ? room / w : 1;
    frame.style.transform = scale < 1 ? `scale(${scale})` : "";
    const fh = parseFloat(frame.style.height);
    if (scale < 1) frame.style.height = (Math.max(h, (stage.clientHeight - 24) / scale)) + "px";
    holder.style.width = (w * scale) + "px";
    holder.style.height = (parseFloat(frame.style.height) * scale) + "px";
  }
  function load(route) {
    const hash = "as=" + encodeURIComponent(state.as) + "&route=" + encodeURIComponent(route);
    state.loaded = state.as;
    frame.src = "today/index.html?" + Date.now().toString(36) + "#" + hash;
  }
  function go() {
    const s = CFG.screens[state.screen];
    if (state.loaded === state.as && frame.contentWindow) {
      frame.contentWindow.postMessage({ type: "nf-go", route: s.route }, "*");
    } else load(s.route);
  }
  function show(which) {
    const o = which === "o";
    if (o) window.scrollTo(0, 0);
    document.documentElement.classList.toggle("nfo-o", o);
    view.hidden = !o;
    place();
    bar.querySelectorAll("[data-nfo]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.nfo === which)));
    remember("tab", which);
    if (o && !state.started) { state.started = true; fit(); load(CFG.screens[state.screen].route); }
    if (o) fit();
  }
  function setWidth(w) {
    state.width = w;
    widthBtns.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.w) === w)));
    fit();
  }
  bar.addEventListener("click", (e) => { const b = e.target.closest("[data-nfo]"); if (b) show(b.dataset.nfo); });
  screenSel.addEventListener("change", () => {
    state.screen = Number(screenSel.value);
    const s = CFG.screens[state.screen];
    const personaChanged = s.as !== state.as;
    state.as = s.as; asSel.value = s.as;
    setWidth(s.width || 1440);
    if (personaChanged) load(s.route); else go();
  });
  asSel.addEventListener("change", () => { state.as = asSel.value; load(CFG.screens[state.screen].route); });
  widthBtns.forEach((b) => b.addEventListener("click", () => setWidth(Number(b.dataset.w))));
  window.addEventListener("resize", () => { place(); if (!view.hidden) fit(); });
  asSel.value = state.as;
  setWidth(state.width);
  if (recall("tab") === "o") show("o");
})();
</script>
<!-- nf-orijinal:end -->
"""
block = block.replace("__CFG__", json.dumps(cfg, ensure_ascii=False))

if re.search(r"</body>", page, flags=re.I):
    idx = [m.start() for m in re.finditer(r"</body>", page, flags=re.I)][-1]
    page = page[:idx] + block + page[idx:]
else:
    page = page.rstrip() + "\n" + block
open(out, "w", encoding="utf-8").write(page)
print(out, len(page))
