// Drawings of iPhone's own screens for the Home Screen guide (TELEFON-TUR2, V1 · Adım kartları): Safari's
// bar and menu, Chrome's bar, the share sheet, the Add to Home Screen sheet and the Home Screen. Each is a
// 390×844 picture in logical points, built as static markup (no person's data ever goes in), so a stage can
// zoom its camera onto the part a step teaches. Targets carry data-target + data-geo="x,y,w,h,r".
// Colors come from guide.css tokens (--ios-*, --nf-icon-*): nothing here names a raw color.

const G: Record<string, string> = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  forward: '<path d="M9 5l7 7-7 7"/>',
  pagemenu27: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  pagemenu26: '<rect x="5" y="4" width="14" height="7" rx="2"/><path d="M5 15h14M5 19h9"/>',
  reload: '<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4.5v4h-4"/>',
  more: '<circle cx="6" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  tabs: '<rect x="4" y="8" width="11" height="11" rx="2.5"/><path d="M9 8V6.5A2.5 2.5 0 0 1 11.5 4h6A2.5 2.5 0 0 1 20 6.5v6a2.5 2.5 0 0 1-2.5 2.5H15"/>',
  share: '<path d="M12 3.5v11M8 7.5l4-4 4 4M8 10.5H6.5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H16"/>',
  a2hs: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M12 8.5v7M8.5 12h7"/>',
  toggle: '<rect x="2" y="7" width="20" height="10" rx="5" fill="var(--ios-green)" stroke="none"/><circle cx="17" cy="12" r="4" fill="var(--ios-white)" stroke="none"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  viewmore: '<circle cx="12" cy="12" r="9"/><path d="M8 10.5l4 4 4-4"/>',
  bookmarks: '<path d="M12 6.5c-1.8-1.3-4.3-2-7-2v13c2.7 0 5.2.7 7 2 1.8-1.3 4.3-2 7-2v-13c-2.7 0-5.2.7-7 2z"/><path d="M12 6.5v13"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h1"/>',
  reading: '<circle cx="7" cy="14" r="3.5"/><circle cx="17" cy="14" r="3.5"/><path d="M10.5 13.5c1-.7 2-.7 3 0"/>',
  star: '<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
  note: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4"/>',
  find: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  markup: '<path d="M4 20l4-1 10-10-3-3L5 16z"/><path d="M13 7l3 3"/>',
  print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M7 14h10v6H7z"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4.5 7l7.5 6 7.5-6"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  message: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.6 5.6 3.6 9s-1 6.4-3.6 9c-2.6-2.6-3.6-5.6-3.6-9S9.4 5.6 12 3z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21s6.5-6.1 6.5-11A6.5 6.5 0 0 0 5.5 10c0 4.9 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  notes: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
  layers: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5"/>',
  sparkle: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/>',
  record: '<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M14.5 3.5V7.5h4M9 12h6M9 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};

export type GlyphId = keyof typeof G | "nf" | "safari";

export function glyph(id: GlyphId, size = 24): string {
  if (id === "nf") return nfIcon(size);
  if (id === "safari") return safariIcon(size);
  return `<svg class="hsg-svg" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${G[id] ?? ""}</svg>`;
}

export function nfIcon(size = 48, radius?: number): string {
  const r = radius ?? Math.round(size * 0.225);
  const inner = Math.round(size * 0.78);
  return `<span class="hsg-nf" aria-hidden="true" style="width:${size}px;height:${size}px;border-radius:${r}px"><svg viewBox="0 0 64 64" width="${inner}" height="${inner}" focusable="false"><path d="M18 46V18h8.5l11 17.4V18H46v28h-8.5l-11-17.4V46H18Z"/></svg></span>`;
}

function safariIcon(size = 24): string {
  return `<svg class="hsg-safari" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="11" class="hsg-safari-face"/><circle cx="12" cy="12" r="9.2" class="hsg-safari-rim"/><path d="M12 12l5-5-3.2 6.8z" class="hsg-safari-n"/><path d="M12 12l-5 5 3.2-6.8z" class="hsg-safari-s"/></svg>`;
}

const GLYPH_NAME: Partial<Record<GlyphId, string>> = {
  pagemenu27: "Page Menu button",
  pagemenu26: "Page Menu button",
  more: "More button",
  share: "Share button",
  check: "Add button",
  safari: "Safari",
};

/** An inline glyph chip in running text, read by its name. */
export function gchip(id: GlyphId): string {
  return `<span class="hsg-gchip" role="img" aria-label="${GLYPH_NAME[id] ?? id}">${glyph(id, 16)}</span>`;
}

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Text with [≡] [•••] [Share] [✓] marks turned into glyph chips. */
export function chipText(text: string, ios: number | null): string {
  return esc(text)
    .replace(/\[≡\]/g, gchip(ios === 26 ? "pagemenu26" : "pagemenu27"))
    .replace(/\[•••\]/g, gchip("more"))
    .replace(/\[Share\]/g, gchip("share"))
    .replace(/\[✓\]/g, gchip("check"));
}

/** Plain words for a screen reader: the marks by name. */
export function srText(text: string): string {
  return text
    .replace(/\[≡\]/g, "the Page Menu button")
    .replace(/\[•••\]/g, "the More button")
    .replace(/\[Share\]/g, "the Share button")
    .replace(/\[✓\]/g, "the Add button");
}

// ---------- camera regions (in the 390×844 picture)
export type Region = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
export const REGIONS = {
  barFull: { x: 0, y: 506, w: 390, h: 338 },
  bar27: { x: 0, y: 654, w: 220, h: 190 },
  bar26: { x: 170, y: 654, w: 220, h: 190 },
  barShare: { x: 100, y: 680, w: 190, h: 164 },
  menu27: { x: 6, y: 520, w: 280, h: 242 },
  menu26: { x: 104, y: 520, w: 280, h: 242 },
  chromeFull: { x: 0, y: 0, w: 390, h: 338 },
  chromeTop: { x: 170, y: 30, w: 220, h: 190 },
  sheetRow: { x: 90, y: 470, w: 300, h: 260 },
  add: { x: 0, y: 50, w: 390, h: 338 },
} satisfies Record<string, Region>;

export type Rect = Region & { readonly r: number; readonly el: HTMLElement };

/** A target's logical rectangle inside a picture. */
export function rectOf(root: ParentNode, id: string): Rect | null {
  const el = root.querySelector<HTMLElement>(`[data-target="${id}"]`);
  if (!el?.dataset.geo) return null;
  const [x = 0, y = 0, w = 0, h = 0, r = 0] = el.dataset.geo.split(",").map(Number);
  return { x, y, w, h, r, el };
}

const P = (x: number, y: number, w: number, h: number) => `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
const TG = (id: string, x: number, y: number, w: number, h: number, r = 0) => `data-target="${id}" data-geo="${x},${y},${w},${h},${r}"`;
const picture = (inner: string) => `<div class="hsg-rep">${inner}</div>`;

/** Our own page, faded, behind every step. */
export function pageGhost(): string {
  const bars = [
    "left:0;top:0;width:390px;height:110px;border-radius:0",
    "left:16px;top:70px;width:180px;height:14px",
    "left:16px;top:96px;width:240px;height:26px",
    "left:16px;top:150px;width:358px;height:120px;border-radius:22px",
    "left:16px;top:290px;width:358px;height:160px;border-radius:22px",
    "left:16px;top:470px;width:120px;height:14px",
    "left:16px;top:500px;width:358px;height:140px;border-radius:22px",
    "left:16px;top:664px;width:150px;height:14px",
    "left:16px;top:694px;width:358px;height:150px;border-radius:22px",
  ];
  return `<div class="hsg-ghost">${bars.map((style, i) => `<i class="${i === 0 ? "is-sky" : i === 3 || i === 4 || i === 6 || i === 8 ? "is-card" : ""}" style="${style}"></i>`).join("")}</div>`;
}

/** Safari's bar: iOS 26/27 Compact (floating), or Share in the bar (iOS 18, and 26/27 Bottom or Top). */
export function safariBar(ios: 27 | 26 | 18, layout: "compact" | "bar"): string {
  let html = "";
  if (layout === "compact" && ios !== 18) {
    html += `<span class="hsg-sbtn hsg-scirc hsg-glass" style="${P(12, 770, 48, 48)}" ${TG("bar.back", 12, 770, 48, 48, 24)}>${glyph("back", 22)}</span>`;
    html +=
      `<span class="hsg-shap hsg-glass" style="${P(68, 770, 254, 48)}">` +
      `<span class="hsg-sbtn" style="left:2px;top:2px;width:44px;height:44px;border-radius:22px" ${TG("bar.pagemenu", 70, 772, 44, 44, 22)}>${glyph(ios === 26 ? "pagemenu26" : "pagemenu27", 20)}</span>` +
      `<span class="hsg-shap-txt" style="left:46px;width:164px">newfork.app</span>` +
      `<span class="hsg-sbtn" style="left:210px;top:2px;width:44px;height:44px;border-radius:22px">${glyph("reload", 18)}</span></span>`;
    html +=
      ios === 26
        ? `<span class="hsg-sbtn hsg-scirc hsg-glass" style="${P(330, 770, 48, 48)}" ${TG("bar.more", 330, 770, 48, 48, 24)}>${glyph("more", 22)}</span>`
        : `<span class="hsg-sbtn hsg-scirc hsg-glass" style="${P(330, 770, 48, 48)}">${glyph("tabs", 22)}</span>`;
    return picture(html);
  }
  const glass = ios !== 18;
  html += `<span class="${glass ? "hsg-glass" : "hsg-sbar18"}" style="${P(0, 742, 390, 102)}"></span>`;
  html +=
    `<span class="hsg-shap ${glass ? "hsg-glass" : "hsg-sfill"}" style="${P(16, 744, 358, 40)};border-radius:${glass ? 22 : 12}px">` +
    `<span class="hsg-shap-txt" style="left:60px;width:238px">newfork.app</span></span>`;
  const buttons: Array<[string, GlyphId]> = [
    ["bar.back", "back"],
    ["bar.forward", "forward"],
    ["bar.share", "share"],
    ["bar.bookmarks", "bookmarks"],
    ["bar.tabs", "tabs"],
  ];
  [39, 117, 195, 273, 351].forEach((cx, i) => {
    const [id, g] = buttons[i]!;
    html += `<span class="hsg-sbtn${ios === 18 ? " is-blue" : ""}" style="${P(cx - 22, 790, 44, 44)};border-radius:22px" ${TG(id, cx - 22, 790, 44, 44, 22)}>${glyph(g, 24)}</span>`;
  });
  return picture(html);
}

/** Chrome on iPhone: the address bar on top with Share at its right, Chrome's toolbar at the bottom. */
export function chromeBar(): string {
  let html = `<span class="hsg-crtop" style="${P(0, 0, 390, 112)}"></span>`;
  html += `<span class="hsg-cromni" style="${P(16, 60, 306, 44)}"><span class="hsg-shap-txt" style="left:16px;width:200px;justify-content:flex-start">newfork.app</span></span>`;
  html += `<span class="hsg-sbtn" style="${P(330, 60, 44, 44)};border-radius:22px" ${TG("chrome.share", 330, 60, 44, 44, 22)}>${glyph("share", 22)}</span>`;
  html += `<span class="hsg-crtop" style="${P(0, 774, 390, 70)}"></span>`;
  const bottom: GlyphId[] = ["back", "forward", "plus", "tabs", "more"];
  [39, 117, 195, 273, 351].forEach((cx, i) => {
    html += `<span class="hsg-sbtn" style="${P(cx - 22, 780, 44, 44)}">${glyph(bottom[i]!, 22)}</span>`;
  });
  return picture(html);
}

/** Page Menu (iOS 27) or the More menu (iOS 26). Only the Share row is real; the others are grey bars. */
export function safariMenu(ios: 27 | 26): string {
  const x = ios === 26 ? 124 : 16;
  const top = 540;
  const origin = ios === 26 ? `${354 - x}px ${770 - top}px` : `${92 - x}px ${770 - top}px`;
  const rows = [120, 96, 140, 84].map((w) => `<span class="hsg-smenu-row"><i style="width:${w}px"></i><em></em></span>`).join("");
  return picture(
    `<span class="hsg-smenu hsg-glass" style="${P(x, top, 250, 222)};transform-origin:${origin}">` +
      `<span class="hsg-smenu-row" ${TG("menu.share", x, top, 250, 44)}><span>Share</span>${glyph("share", 20)}</span>${rows}</span>`,
  );
}

/** The share sheet: header, people, apps, an action row with View More (iOS 26 and 27), then the list. */
export function shareSheet(ios: 27 | 26 | 18): string {
  const top = 300;
  let inner =
    `<span class="hsg-sh-head"><span style="position:absolute;left:20px;top:0">${nfIcon(44, 10)}</span>` +
    `<b>Newfork</b><small>newfork.app</small><span class="hsg-sh-x">${glyph("x", 16)}</span></span>`;
  inner += `<span class="hsg-sh-people">${[20, 92, 164, 236, 308].map((x) => `<span class="hsg-sh-p" style="left:${x}px"></span>`).join("")}</span>`;
  inner += `<span class="hsg-sh-apps">${[20, 92, 164, 236, 308].map((x, i) => `<span class="hsg-sh-a" style="left:${x}px;background:var(--ios-app-${i})"></span>`).join("")}</span>`;
  let listTop: number;
  let rows: string[];
  if (ios === 18) {
    listTop = 284;
    rows = ["Copy", "Add to Reading List", "Add Bookmark", "Add to Favorites", "Add to Quick Note", "Find on Page", "Add to Home Screen", "Markup", "Print"];
  } else {
    const tiles: Array<[string, GlyphId, string]> = [
      ["sheet.copy", "copy", "Copy"],
      ["sheet.bookmarks", "bookmarks", "Add to Bookmarks"],
      ["sheet.reading", "reading", "Add to Reading List"],
      ["sheet.viewmore", "viewmore", "View More"],
    ];
    inner += `<span class="hsg-sh-acts" style="top:284px">${tiles
      .map(([id, g, label], i) => `<span class="hsg-sh-act" ${TG(id, 16 + i * 89.5, top + 284, 89.5, 76, 14)}>${glyph(g, 24)}<span>${label}</span></span>`)
      .join("")}</span>`;
    listTop = 376;
    rows = ["Add Bookmark to…", "Add to Favorites", "Add to Quick Note", "Find on Page", "Add to Home Screen", "Markup", "Print"];
  }
  const icons: Record<string, GlyphId> = {
    "Add to Home Screen": "a2hs",
    "Find on Page": "find",
    Markup: "markup",
    Print: "print",
    "Add to Quick Note": "note",
    "Add to Favorites": "star",
    "Add Bookmark to…": "bookmarks",
    "Add Bookmark": "bookmarks",
    Copy: "copy",
    "Add to Reading List": "reading",
  };
  inner += `<span class="hsg-sh-list" style="top:${listTop}px">${rows
    .map((row, i) => {
      const id = row === "Add to Home Screen" ? "sheet.a2hs" : `sheet.row${i}`;
      return `<span class="hsg-sh-row" ${TG(id, 16, top + listTop + i * 48, 358, 48)}><span>${row}</span>${glyph(icons[row] ?? "note", 22)}</span>`;
    })
    .join("")}</span>`;
  const editTop = listTop + rows.length * 48 + 24;
  inner += `<span class="hsg-sh-list" style="top:${editTop}px"><span class="hsg-sh-row is-blue">Edit Actions…</span></span>`;
  return picture(`<span class="hsg-sheet" style="top:${top}px"><span class="hsg-sheet-grab"></span><span class="hsg-sheet-in" style="height:${editTop + 80}px">${inner}</span></span>`);
}

/**
 * The Add to Home Screen sheet. iOS 26 and 27 have the Open as Web App switch, and Cancel and Add as
 * ✕ and ✓ in the corners (Mert's iPhone, 20 October 2026); iOS 18 writes them out.
 */
export function addSheet(ios: 27 | 26 | 18): string {
  let g =
    `<span class="hsg-add-g" style="top:76px;height:100px"><span style="position:absolute;left:16px;top:16px">${nfIcon(60, 14)}</span>` +
    `<span style="position:absolute;left:92px;top:22px;font-size:17px">Newfork</span>` +
    `<span class="hsg-add-sep"></span>` +
    `<span style="position:absolute;left:92px;top:62px;font-size:15px" class="is-muted">https://newfork.app/app</span></span>`;
  if (ios !== 18) {
    g +=
      `<span class="hsg-add-g" style="top:192px;height:50px"><span style="position:absolute;left:16px;top:14px;font-size:17px">Open as Web App</span>` +
      `<span class="hsg-iosw is-on" style="left:291px;top:10px" ${TG("add.toggle", 307, 262, 51, 31, 16)}></span></span>`;
  }
  g += `<span class="hsg-add-note" style="top:${ios === 18 ? 188 : 254}px">An icon will be added to your Home Screen so you can quickly access this website.</span>`;
  const nav =
    ios === 18
      ? `<span class="hsg-add-nav"><span class="hsg-sbtn is-blue" style="left:20px;width:64px;height:44px">Cancel</span><span>Add to Home Screen</span><span class="hsg-sbtn is-blue" style="right:20px;width:44px;height:44px;font-weight:600" ${TG("add.confirm", 326, 72, 44, 44, 22)}>Add</span></span>`
      : `<span class="hsg-add-nav"><span class="hsg-sbtn hsg-corner" style="left:16px">${glyph("x", 18)}</span><span>Add to Home Screen</span><span class="hsg-sbtn hsg-corner is-confirm" style="right:16px" ${TG("add.confirm", 330, 74, 44, 44, 22)}>${glyph("check", 20)}</span></span>`;
  return picture(`<span class="hsg-scrim"></span><span class="hsg-add">${nav}${g}</span>`);
}

const APPS: Array<[string, GlyphId]> = [
  ["Calendar", "calendar"], ["Photos", "sparkle"], ["Camera", "record"], ["Mail", "mail"],
  ["Notes", "notes"], ["Reminders", "check"], ["Clock", "clock"], ["Maps", "pin"],
  ["Weather", "sparkle"], ["Wallet", "layers"], ["Music", "bell"], ["Files", "notes"],
  ["Settings", "settings"], ["Health", "sparkle"], ["Books", "bookmarks"], ["News", "notes"],
  ["Podcasts", "globe"],
];
/** Newfork lands in the first free place: row 5, column 2, near the middle of the stage. */
export const NF_AT = { x: 117, y: 476 };

/** The Home Screen: 17 apps, Newfork once added, Safari in the Dock. */
export function homeScreen(): string {
  let html = `<span class="hsg-spring">`;
  APPS.forEach(([name, g], i) => {
    const x = [27, 117, 207, 297][i % 4]!;
    const y = 76 + Math.floor(i / 4) * 100;
    html += `<span class="hsg-app" style="left:${x}px;top:${y}px"><span style="background:var(--ios-app-${i % 8})">${glyph(g, 30)}</span><small>${name}</small></span>`;
  });
  html += `<span class="hsg-app" style="left:${NF_AT.x}px;top:${NF_AT.y}px" ${TG("home.nf", NF_AT.x, NF_AT.y, 64, 64, 15)}><span class="is-nf">${nfIcon(64, 15)}</span><small>Newfork</small></span>`;
  html += `<span class="hsg-spot">Search</span><span class="hsg-dock">`;
  const dock: GlyphId[] = ["phone", "safari", "message", "bell"];
  [22, 108, 194, 280].forEach((x, i) => {
    const g = dock[i]!;
    html += `<span class="hsg-app" style="left:${x}px;top:12px"><span style="background:${g === "safari" ? "var(--ios-white)" : `var(--ios-app-${i + 3})`}">${g === "safari" ? safariIcon(58) : glyph(g, 30)}</span></span>`;
  });
  html += "</span></span>";
  return picture(html);
}

// ---------- teaching marks
export function el(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

export const dot = () => el('<span class="hsg-dot" aria-hidden="true"><i></i></span>');

export function ring(r: Region & { r?: number }, dashed = false): HTMLElement {
  const pad = 4;
  return el(
    `<span class="hsg-ring${dashed ? " is-dashed" : ""}" aria-hidden="true" style="left:${r.x - pad}px;top:${r.y - pad}px;width:${r.w + pad * 2}px;height:${r.h + pad * 2}px;border-radius:${(r.r || 6) + pad}px"></span>`,
  );
}

/** A teaching note: a speech bubble, never a button (K10). */
export function callout(r: Region, text: string, side: "left" | "top"): HTMLElement {
  const note = el(`<span class="hsg-callout is-${side}" aria-hidden="true">${esc(text)}<i></i></span>`);
  if (side === "top") {
    note.style.left = `${r.x + r.w / 2}px`;
    note.style.top = `${r.y - 36}px`;
    note.style.translate = "-50% 0";
  } else {
    note.style.right = `${390 - r.x + 12}px`;
    note.style.top = `${r.y + r.h / 2 - 12}px`;
  }
  return note;
}

let maskSeq = 0;
/** Everything but the target fades back. */
export function dim(r: (Region & { r?: number }) | null): HTMLElement {
  const id = `hsg-m${++maskSeq}`;
  const hole = r ? `<rect x="${r.x - 6}" y="${r.y - 6}" width="${r.w + 12}" height="${r.h + 12}" rx="${(r.r || 6) + 6}" fill="#000"/>` : "";
  return el(
    `<svg class="hsg-dim" viewBox="0 0 390 844" width="390" height="844" aria-hidden="true"><defs><mask id="${id}"><rect width="390" height="844" fill="#fff"/>${hole}</mask></defs><rect width="390" height="844" class="hsg-dim-veil" mask="url(#${id})"/></svg>`,
  );
}
