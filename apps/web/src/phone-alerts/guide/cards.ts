// One stage per guide step: the right part of iPhone's screen, zoomed by a camera, played once and
// stopped on its last frame: the rest fades back, a ring sits on the target, the fingertip is gone (K8, K9).
// Every player stays under 5 seconds (K8).

import type { SafariRelease } from "../install-state";
import { DECEL, EMPH, OUT, player, pressBg, ringIn, walk, type Player, type Segment } from "./motion";
import {
  REGIONS,
  addSheet,
  callout,
  chromeBar,
  dim,
  dot,
  el,
  homeScreen,
  pageGhost,
  rectOf,
  ring,
  safariBar,
  safariMenu,
  shareSheet,
  type Region,
} from "./replica";
import type { GuideStep, StepSetKey } from "./steps";

export type Stage = {
  readonly root: HTMLElement;
  /** Plays the step once; again from the start on Replay. */
  readonly play: () => void;
  readonly finish: () => void;
  readonly cancel: () => void;
  readonly total: number;
};

type Scene = {
  readonly root: HTMLElement;
  readonly cam: HTMLElement;
  readonly w: number;
  readonly h: number;
  fit(region: Region): { s: number; tx: number; ty: number };
  show(region: Region): void;
  move(from: Region, to: Region, at: number, dur: number): Segment[];
  put<T extends HTMLElement | SVGElement>(node: T, parent?: HTMLElement): T;
  /** The part of the picture a region shows on this stage. */
  seen(region: Region): Region;
};

function scene(w: number, h: number, parts: ReadonlyArray<string | HTMLElement>): Scene {
  const root = el(`<div class="hsg-stage" style="width:${w}px;height:${h}px" aria-hidden="true"><div class="hsg-cam"></div></div>`);
  const cam = root.firstElementChild as HTMLElement;
  for (const part of parts) cam.appendChild(typeof part === "string" ? el(`<div class="hsg-abs">${part}</div>`) : part);
  const fit = (r: Region) => {
    const s = Math.min(w / r.w, h / r.h);
    return { s, tx: (w - r.w * s) / 2 - r.x * s, ty: (h - r.h * s) / 2 - r.y * s };
  };
  return {
    root,
    cam,
    w,
    h,
    fit,
    show(r) {
      const f = fit(r);
      cam.style.translate = `${f.tx}px ${f.ty}px`;
      cam.style.scale = String(f.s);
    },
    move(from, to, at, dur) {
      const a = fit(from);
      const b = fit(to);
      return [
        { el: cam, prop: "translate", from: `${a.tx}px ${a.ty}px`, to: `${b.tx}px ${b.ty}px`, at, dur, ease: DECEL },
        { el: cam, prop: "scale", from: a.s, to: b.s, at, dur, ease: DECEL },
      ];
    },
    put(node, parent) {
      (parent ?? cam).appendChild(node);
      return node;
    },
    seen(r) {
      const f = fit(r);
      return { x: -f.tx / f.s, y: -f.ty / f.s, w: w / f.s, h: h / f.s };
    },
  };
}

const center = (r: Region) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const fade = (node: Element | null | undefined, at: number, dur = 200): Segment[] =>
  node ? [{ el: node as HTMLElement, prop: "opacity", from: 0, to: 1, at, dur, ease: EMPH }] : [];

function bar(set: StepSetKey, ios: SafariRelease): string {
  return safariBar(ios, set === "27-compact" || set === "26-compact" ? "compact" : "bar");
}

function stageOf(sc: Scene, segments: Segment[]): Stage {
  const p: Player = player(segments);
  return { root: sc.root, play: () => p.play(), finish: () => p.finish(), cancel: () => p.cancel(), total: p.total };
}

/** ≡ / ••• / Share in Safari's bar, or Share at the right of Chrome's address bar. */
function barCard(w: number, h: number, set: StepSetKey, ios: SafariRelease, chrome: boolean): Stage {
  const target = chrome ? "chrome.share" : set === "26-compact" ? "bar.more" : set === "27-compact" ? "bar.pagemenu" : "bar.share";
  const from = chrome ? REGIONS.chromeFull : REGIONS.barFull;
  const to = chrome ? REGIONS.chromeTop : set === "26-compact" ? REGIONS.bar26 : set === "27-compact" ? REGIONS.bar27 : REGIONS.barShare;
  const sc = scene(w, h, [pageGhost(), chrome ? chromeBar() : bar(set, ios)]);
  sc.show(from);
  const r = rectOf(sc.cam, target)!;
  const veil = sc.put(dim(r));
  const mark = sc.put(ring(r));
  const tip = sc.put(dot());
  const seen = sc.seen(to);
  const start = chrome ? { x: seen.x + seen.w * 0.35, y: seen.y + seen.h - 20 } : { x: seen.x + seen.w / 2, y: seen.y + 24 };
  const path = walk(tip, start, center(r), 700);
  return stageOf(sc, [
    ...sc.move(from, to, 200, 400),
    { el: veil, prop: "opacity", from: 0, to: 1, at: 600, dur: 200, ease: EMPH },
    ...path.segments,
    ...pressBg(r.el, path.press),
    ...ringIn(mark, path.ringAt),
  ]);
}

/** Share in Safari's menu. */
function menuCard(w: number, h: number, set: StepSetKey, ios: SafariRelease): Stage {
  const menuIos = ios === 26 ? 26 : 27;
  const from = menuIos === 26 ? REGIONS.bar26 : REGIONS.bar27;
  const to = menuIos === 26 ? REGIONS.menu26 : REGIONS.menu27;
  const sc = scene(w, h, [pageGhost(), bar(set, ios), safariMenu(menuIos)]);
  sc.show(from);
  const menu = sc.cam.querySelector<HTMLElement>(".hsg-smenu");
  const r = rectOf(sc.cam, "menu.share")!;
  const source = rectOf(sc.cam, menuIos === 26 ? "bar.more" : "bar.pagemenu")!;
  const veil = sc.put(dim(r));
  const mark = sc.put(ring(r));
  const tip = sc.put(dot());
  const path = walk(tip, center(source), center(r), 600);
  return stageOf(sc, [
    ...sc.move(from, to, 0, 400),
    { el: menu, prop: "scale", from: 0.6, to: 1, at: 100, dur: 400, ease: DECEL },
    { el: menu, prop: "opacity", from: 0, to: 1, at: 100, dur: 400, ease: DECEL },
    { el: veil, prop: "opacity", from: 0, to: 1, at: 450, dur: 200, ease: EMPH },
    ...path.segments,
    ...pressBg(r.el, path.press),
    ...ringIn(mark, path.ringAt),
  ]);
}

/** The share sheet comes up; the fingertip scrolls it (or shows View More) and taps Add to Home Screen. */
function sheetCard(w: number, h: number, set: StepSetKey, ios: SafariRelease): Stage {
  const sheetIos = set === "chrome" ? 27 : ios;
  const sc = scene(w, h, [pageGhost(), set === "chrome" ? chromeBar() : bar(set, ios), shareSheet(sheetIos)]);
  sc.show(REGIONS.sheetRow);
  const sheet = sc.cam.querySelector<HTMLElement>(".hsg-sheet")!;
  const inner = sheet.querySelector<HTMLElement>(".hsg-sheet-in")!;
  if (sheetIos !== 18) sheet.style.top = "120px";
  const a = rectOf(sc.cam, "sheet.a2hs")!;
  const shift = sheetIos === 18 ? 304 : 300;
  const target = { x: 16, y: a.y - shift, w: 358, h: 48, r: 0 };
  // The last frame sits on whole rows, two above and two below the target, and the ring fits inside it.
  const endH = 240;
  const end = { x: -8, y: target.y - 96, w: Math.round((endH * w) / h), h: endH };
  const shown = { ...target, w: Math.min(target.w, end.x + end.w - 12 - target.x), r: 10 };
  const veil = sc.put(dim(shown));
  const mark = sc.put(ring(shown));
  const tip = sc.put(dot());
  const segments: Segment[] = [];
  if (sheetIos === 18) {
    segments.push({ el: sheet, prop: "translate", from: "0 544px", to: "0 0px", at: 0, dur: 400, ease: DECEL });
    segments.push({ el: inner, prop: "translate", from: "0 0px", to: "0 -304px", at: 800, dur: 900, ease: EMPH });
  } else {
    segments.push({ el: sheet, prop: "translate", from: "0 724px", to: "0 180px", at: 0, dur: 400, ease: DECEL });
    segments.push({ el: sheet, prop: "translate", from: "0 180px", to: "0 0px", at: 800, dur: 600, ease: EMPH });
    segments.push({ el: inner, prop: "translate", from: "0 0px", to: "0 -120px", at: 1400, dur: 300, ease: EMPH });
    // View More is in the action row: shown with a dashed ring and a note, it moves with the sheet.
    const more = rectOf(sc.cam, "sheet.viewmore");
    if (more) {
      const local = { x: more.x, y: 284, w: more.w, h: more.h, r: 14 };
      const dashed = sc.put(ring(local, true), inner);
      const note = sc.put(callout(local, "or tap View More", "top"), inner);
      segments.push(...fade(dashed, 450), { el: dashed, prop: "opacity", from: 1, to: 0, at: 1750, dur: 150, ease: OUT });
      segments.push(...fade(note, 450), { el: note, prop: "opacity", from: 1, to: 0, at: 1750, dur: 150, ease: OUT });
    }
  }
  tip.style.left = "0px";
  tip.style.top = "0px";
  const P = (q: { x: number; y: number }) => `${q.x}px ${q.y}px`;
  // A slow drag up the list (the fingertip moves with the list), then a walk to the row.
  const p0 = { x: 195, y: 700 };
  const p1 = { x: 195, y: sheetIos === 18 ? 396 : 400 };
  const p3 = { x: Math.min(250, end.x + end.w - 30), y: Math.min(target.y + 110, end.y + end.h - 20) };
  segments.push(...sc.move(REGIONS.sheetRow, end, 800, 900));
  segments.push({ el: tip, prop: "translate", from: P(p0), to: P(p0), at: 500, dur: 1, ease: OUT });
  segments.push({ el: tip, prop: "opacity", from: 0, to: 1, at: 500, dur: 200, ease: OUT });
  segments.push({ el: tip, prop: "translate", from: P(p0), to: P(p1), at: 800, dur: 900, ease: EMPH });
  segments.push({ el: tip, prop: "opacity", from: 1, to: 0, at: 1750, dur: 150, ease: OUT });
  const path = walk(tip, p3, center(shown), 2000);
  // walk() starts the tip at p3 at 2000; its first translate begins after the drag's last one ends.
  segments.push(...path.segments.filter((s) => !(s.el === tip && s.prop === "translate" && s.at === 2000)));
  segments.push({ el: tip, prop: "translate", from: P(p1), to: P(p3), at: 1950, dur: 50, ease: OUT });
  segments.push(...pressBg(a.el, path.press), ...ringIn(mark, path.ringAt));
  segments.push({ el: veil, prop: "opacity", from: 0, to: 1, at: path.ringAt, dur: 200, ease: EMPH });
  return stageOf(sc, segments);
}

/** Keep Open as Web App on, then tap ✓ (Add on iOS 18). */
function addCard(w: number, h: number, set: StepSetKey, ios: SafariRelease): Stage {
  const sheetIos = set === "chrome" ? 27 : ios;
  const sheetBg = el(`<div class="hsg-abs">${shareSheet(sheetIos)}</div>`);
  const bgSheet = sheetBg.querySelector<HTMLElement>(".hsg-sheet");
  if (bgSheet && sheetIos !== 18) bgSheet.style.top = "120px";
  const sc = scene(w, h, [pageGhost(), set === "chrome" ? chromeBar() : bar(set, ios), sheetBg, addSheet(sheetIos)]);
  sc.show(REGIONS.add);
  const scrim = sc.cam.querySelector<HTMLElement>(".hsg-scrim");
  const sheet = sc.cam.querySelector<HTMLElement>(".hsg-add");
  const toggle = sheetIos !== 18 ? rectOf(sc.cam, "add.toggle") : null;
  const ok = rectOf(sc.cam, "add.confirm")!;
  const mark = sc.put(ring(ok));
  const tip = sc.put(dot());
  const segments: Segment[] = [
    { el: sheet, prop: "translate", from: "0 784px", to: "0 0px", at: 0, dur: 400, ease: DECEL },
    { el: scrim, prop: "opacity", from: 0, to: 1, at: 0, dur: 400, ease: DECEL },
  ];
  let at = 500;
  let from = { x: 195, y: 230 };
  if (toggle) {
    const pad = 6;
    const halo = sc.put(
      el(`<span class="hsg-halo" aria-hidden="true" style="left:${toggle.x - pad}px;top:${toggle.y - pad}px;width:${toggle.w + pad * 2}px;height:${toggle.h + pad * 2}px"></span>`),
    );
    const note = sc.put(callout(toggle, "Keep this on", "left"));
    segments.push(
      { el: halo, prop: "opacity", from: 0, to: 1, at: 400, dur: 150, ease: OUT },
      { el: halo, prop: "scale", from: 1, to: 1.06, at: 550, dur: 200, ease: EMPH },
      { el: halo, prop: "scale", from: 1.06, to: 1, at: 750, dur: 200, ease: EMPH },
      { el: note, prop: "opacity", from: 0, to: 1, at: 600, dur: 250, ease: DECEL },
      { el: note, prop: "translate", from: "8px 0px", to: "0px 0px", at: 600, dur: 250, ease: DECEL },
    );
    at = 1000;
    from = { x: toggle.x + toggle.w / 2, y: toggle.y + toggle.h + 48 };
  }
  const path = walk(tip, from, center(ok), at);
  // ✓ has its own blue fill: it dims for the press instead of darkening.
  segments.push(
    ...path.segments,
    { el: ok.el, prop: "opacity", from: 1, to: 0.45, at: path.press, dur: 75, ease: EMPH },
    { el: ok.el, prop: "opacity", from: 0.45, to: 1, at: path.press + 75, dur: 75, ease: EMPH },
    ...ringIn(mark, path.ringAt),
  );
  return stageOf(sc, segments);
}

/** The Home Screen: Newfork's icon appears; the fingertip walks to it. */
function openCard(w: number, h: number, set: StepSetKey, ios: SafariRelease): Stage {
  const sheetIos = set === "chrome" ? 27 : ios;
  const before = el('<div class="hsg-abs"></div>');
  before.appendChild(el(`<div class="hsg-abs">${pageGhost()}</div>`));
  before.appendChild(el(`<div class="hsg-abs">${set === "chrome" ? chromeBar() : bar(set, ios)}</div>`));
  before.appendChild(el(`<div class="hsg-abs">${addSheet(sheetIos)}</div>`));
  const after = el(`<div class="hsg-abs">${homeScreen()}</div>`);
  // Whole icon rows, Newfork (row 5, column 2) near the middle.
  const regionH = Math.round((288 * h) / w);
  const home = { x: 5, y: Math.round(508 - regionH / 2), w: 288, h: regionH };
  const sc = scene(w, h, [before, after]);
  sc.show(home);
  const nf = rectOf(sc.cam, "home.nf")!;
  const mark = sc.put(ring(nf));
  const tip = sc.put(dot());
  const path = walk(tip, { x: 236, y: home.y + home.h - 16 }, center(nf), 900);
  return stageOf(sc, [
    { el: before, prop: "opacity", from: 1, to: 0, at: 0, dur: 300, ease: OUT },
    { el: after, prop: "opacity", from: 0, to: 1, at: 0, dur: 300, ease: OUT },
    { el: nf.el, prop: "scale", from: 0.2, to: 1.08, at: 400, dur: 300, ease: DECEL },
    { el: nf.el, prop: "scale", from: 1.08, to: 1, at: 700, dur: 200, ease: DECEL },
    { el: nf.el, prop: "scale", from: 1, to: 0.92, at: path.press, dur: 75, ease: EMPH },
    { el: nf.el, prop: "scale", from: 0.92, to: 1, at: path.press + 75, dur: 75, ease: EMPH },
    ...path.segments,
    ...ringIn(mark, path.ringAt),
  ]);
}

export function buildStage(step: GuideStep, set: StepSetKey, ios: SafariRelease, width: number): Stage {
  const w = Math.round(width);
  const h = Math.round((w * 310) / 358);
  switch (step.kind) {
    case "bar":
      return barCard(w, h, set, ios, false);
    case "chrome":
      return barCard(w, h, set, ios, true);
    case "menu":
      return menuCard(w, h, set, ios);
    case "sheet":
      return sheetCard(w, h, set, ios);
    case "add":
      return addCard(w, h, set, ios);
    case "open":
      return openCard(w, h, set, ios);
  }
}
