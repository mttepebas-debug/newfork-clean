// Mark drafts (Mert, 2026-10-13 21:58Z, 22:00Z): ten looks each for the
// orange availability "!", the green LIVE label, the NEW label and the
// manager note's corner, next to today's ("original"). A look applies under
// an element carrying data-rk-unavail / data-rk-live / data-rk-new /
// data-rk-note: #root for the grid (vk/store.ts), a tile in the drafts board.
// Only the mark's CSS changes; the card's words keep the room each mark
// needs (vk/side.ts; widths below).

export interface MarkDraft {
  /** Short name, Turkish, shown on the tile and in the Test page panel. */
  readonly name: string;
  /** One line on the idea behind it. */
  readonly idea: string;
  /** Drawn width in px, for the room beside the card's words (checked in the browser).
   * A note mark: how far from the card's outer left edge it reaches (0: in the very corner, above the words). */
  readonly width: number;
}

type Family = Record<string, MarkDraft>;

export const UNAVAIL: Family = {
  original: { name: "Bugünkü", idea: "Dolu turuncu daire, içinde beyaz \"!\" yazı karakteri.", width: 18 },
  u1: { name: "Halka", idea: "Beyaz daire, ince turuncu halka, çizilmiş turuncu \"!\". Daha hafif, uyarı ama alarm değil.", width: 16 },
  u2: { name: "Yumuşak daire", idea: "Açık turuncu zemin, koyu turuncu \"!\". Kartın üstünde bağırmaz.", width: 18 },
  u3: { name: "Çizilmiş !", idea: "Bugünkünün aynısı ama \"!\" yazı karakteri değil, çizgi + nokta; daire 2 px küçük, turuncu bir ton koyu.", width: 16 },
  u4: { name: "Rozet kare", idea: "Köşeleri yuvarlak turuncu kare, beyaz çizilmiş \"!\"; kartın köşe diliyle aynı.", width: 16 },
  u5: { name: "Nokta", idea: "Yalnız küçük turuncu nokta. En sessizi; ne olduğunu üzerine gelince söyler.", width: 10 },
  u6: { name: "Köşe", idea: "Kartın sağ üst köşesinde turuncu üçgen; not üçgeninin (sol üst, lacivert) eşi.", width: 8 },
  u7: { name: "Saat", idea: "Turuncu saat simgesi: \"bu saatlerde müsait değil\" der, \"!\" yok.", width: 14 },
  u8: { name: "Saat rozeti", idea: "Açık turuncu daire içinde koyu turuncu saat.", width: 18 },
  u9: { name: "Kişi", idea: "Çarpılı kişi simgesi: \"kişi müsait değil\".", width: 15 },
  u10: { name: "Uyarı üçgeni", idea: "İnce çizgili uyarı üçgeni; tanıdık \"dikkat\" işareti.", width: 15 },
};

export const LIVE: Family = {
  original: { name: "Bugünkü", idea: "Açık yeşil kutu, yeşil çerçeve, LIVE (yalnız test sayfasında; main'de işaret yok).", width: 30 },
  l1: { name: "Nokta + Live", idea: "Yeşil nokta ve yanında LIVE; kutu yok. \"Canlı yayın\" dili.", width: 30 },
  l2: { name: "Dolu yeşil", idea: "Koyu yeşil kutu, beyaz LIVE. NEW'den kesin ayrılır.", width: 31 },
  l3: { name: "Yalnız nokta", idea: "Küçük yeşil nokta, yazı yok. Kartı en az kalabalıklaştıran.", width: 8 },
  l4: { name: "Yalın yazı", idea: "Kutu yok, yalnız yeşil LIVE.", width: 21 },
  l5: { name: "Çerçeve", idea: "Beyaz kutu, yeşil çerçeve, yeşil LIVE.", width: 31 },
  l6: { name: "Tik", idea: "Daire içinde yeşil tik: \"yayınlandı\".", width: 13 },
  l7: { name: "Onay rozeti", idea: "Tırtıllı rozet içinde tik: \"onaylı, çalışanlarda\".", width: 14 },
  l8: { name: "Göz", idea: "Göz simgesi: \"çalışanlar bunu görüyor\".", width: 14 },
  l9: { name: "Yayın", idea: "Yayın dalgası simgesi: canlı.", width: 14 },
  l10: { name: "Yumuşak hap", idea: "Çerçevesiz açık yeşil hap, küçük harfle \"Live\".", width: 32 },
};

export const NEWMARK: Family = {
  original: { name: "Bugünkü", idea: "Açık yeşil kutu, yeşil çerçeve, NEW; LIVE ile aynı yeşil.", width: 30 },
  n1: { name: "Mavi", idea: "Açık mavi kutu, mavi NEW: yeşil LIVE'dan ayrılır.", width: 32 },
  n2: { name: "Koyu", idea: "Koyu kutu, beyaz NEW. En belirgini.", width: 32 },
  n3: { name: "Nokta + New", idea: "Mavi nokta ve yanında NEW; kutu yok.", width: 31 },
  n4: { name: "Kesikli", idea: "Beyaz kutu, kesikli gri çerçeve: \"taslak\".", width: 32 },
  n5: { name: "Kıvılcım", idea: "Mavi kıvılcım simgesi: yeni.", width: 13 },
  n6: { name: "Artı", idea: "Daire içinde mavi artı: eklendi.", width: 13 },
  n7: { name: "Yalın yazı", idea: "Kutu yok, yalnız yeşil NEW.", width: 22 },
  n8: { name: "Köşe", idea: "Kartın sağ alt köşesinde mavi üçgen.", width: 8 },
  n9: { name: "Bulut", idea: "Yukarı oklu bulut: Publish'te çalışanlara gidecek.", width: 15 },
  n10: { name: "Kesikli kart", idea: "Etiket yok: kartın çerçevesi kesikli olur, taslak gibi.", width: 0 },
};

export const NOTE: Family = {
  original: { name: "Bugünkü", idea: "Sol üst köşede 11 px lacivert üçgen; üzerine gelince not açılır.", width: 0 },
  o1: { name: "Büyük üçgen", idea: "Aynı lacivert üçgen, 15 px: daha kolay görülür, üzerine gelmesi kolay.", width: 0 },
  o2: { name: "Çeyrek daire", idea: "Köşede yuvarlak lacivert çeyrek daire; üçgenden yumuşak.", width: 0 },
  o3: { name: "Nokta", idea: "Sol üstte küçük lacivert nokta.", width: 13 },
  o4: { name: "Not kâğıdı", idea: "Yapışkan not simgesi; açılan notun başlığındaki simgenin aynısı.", width: 17 },
  o5: { name: "Mesaj balonu", idea: "Yazılı mesaj balonu: \"burada bir yazı var\".", width: 17 },
  o6: { name: "Kıvrık köşe", idea: "Kâğıdın köşesi kıvrılmış gibi: lacivert kıvrım, altında gölge.", width: 0 },
  o7: { name: "Kenar çizgisi", idea: "Sol kenarın üstünde kısa lacivert çizgi.", width: 0 },
  o8: { name: "Yazı satırları", idea: "Üç kısa satır simgesi: \"yazı var\".", width: 16 },
  o9: { name: "Ataş", idea: "Ataş simgesi: karta iliştirilmiş not.", width: 17 },
  o10: { name: "Note etiketi", idea: "LIVE ve NEW gibi küçük etiket: NOTE.", width: 42 },
  // Five more on the paperclip (Mert, 2026-10-14 00:16Z): "Ataş iconuyla ilgili 5 tane daha yeni mockup".
  o11: { name: "Dik ataş", idea: "Ataş dik duruyor, ince: kartı tutan bir ataş gibi.", width: 17 },
  o12: { name: "Ataş rozeti", idea: "Beyaz daire, ince lacivert halka, içinde lacivert ataş.", width: 22 },
  o13: { name: "Dolu ataş rozeti", idea: "Lacivert kare içinde beyaz ataş; en kolay görülen.", width: 22 },
  o14: { name: "Kenara takılı ataş", idea: "Dik ataş kartın üst kenarına takılmış: üst ucu kenarın arkasında kalıyor.", width: 22 },
  o15: { name: "Ataş + Note", idea: "Ataş ve yanında Note yazısı, kutusuz; seçilen LIVE (nokta + Live) ile aynı dil.", width: 44 },
  // Mert, 2026-10-14 00:56Z: 11's thin clip, turned diagonal, where 15's clip sits, a little bigger.
  o16: { name: "Çapraz ince ataş", idea: "11'in ince ataşı çapraz duruyor, 15'teki gibi solda, biraz daha büyük (15 px); ilk satırla aynı hizada.", width: 21 },
};

const svg = (body: string, stroke = 2) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='${stroke}' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`,
  )}")`;

// Lucide 0.468 shapes (the app's icon set); the "!" is drawn, not typed.
const ICON = {
  bang: svg("<path d='M12 5.5v8'/><path d='M12 18.5h.01'/>", 3.4),
  clock: svg("<circle cx='12' cy='12' r='10'/><polyline points='12 6 12 12 16 14'/>", 2.3),
  triangle: svg("<path d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'/><path d='M12 9v4'/><path d='M12 17h.01'/>", 2.3),
  userX: svg("<path d='M2 21a8 8 0 0 1 11.873-7'/><circle cx='10' cy='8' r='5'/><path d='m17 17 5 5'/><path d='m22 17-5 5'/>", 2.3),
  circleCheck: svg("<circle cx='12' cy='12' r='10'/><path d='m9 12 2 2 4-4'/>", 2.4),
  badgeCheck: svg("<path d='M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z'/><path d='m9 12 2 2 4-4'/>", 2.3),
  eye: svg("<path d='M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'/><circle cx='12' cy='12' r='3'/>", 2.3),
  radio: svg("<path d='M4.9 19.1C1 15.2 1 8.8 4.9 4.9'/><path d='M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5'/><circle cx='12' cy='12' r='2'/><path d='M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5'/><path d='M19.1 4.9C23 8.8 23 15.1 19.1 19'/>", 2.3),
  sparkles: svg("<path d='M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z'/><path d='M20 3v4'/><path d='M22 5h-4'/>", 2.2),
  circlePlus: svg("<circle cx='12' cy='12' r='10'/><path d='M8 12h8'/><path d='M12 8v8'/>", 2.4),
  stickyNote: svg("<path d='M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z'/><path d='M15 3v4a2 2 0 0 0 2 2h4'/>", 2.4),
  message: svg("<path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/><path d='M13 8H7'/><path d='M17 12H7'/>", 2.4),
  lines: svg("<path d='M17 6.1H3'/><path d='M21 12.1H3'/><path d='M15.1 18H3'/>", 2.8),
  paperclip: svg("<path d='M13.234 20.252 21 12.3'/><path d='m16 6-8.414 8.586a2 2 0 0 0 0 2.828 2 2 0 0 0 2.828 0l8.414-8.586a4 4 0 0 0 0-5.656 4 4 0 0 0-5.656 0l-8.415 8.585a6 6 0 1 0 8.486 8.486'/>", 2.4),
  paperclipThin: svg("<path d='M13.234 20.252 21 12.3'/><path d='m16 6-8.414 8.586a2 2 0 0 0 0 2.828 2 2 0 0 0 2.828 0l8.414-8.586a4 4 0 0 0 0-5.656 4 4 0 0 0-5.656 0l-8.415 8.585a6 6 0 1 0 8.486 8.486'/>", 2),
  cloudUp: svg("<path d='M12 13v8'/><path d='M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242'/><path d='m8 17 4-4 4 4'/>", 2.3),
};

// --- The orange availability mark: .schedule-availability-mark on a card
// (-card), in an empty cell's corner (-corner) and by the name (-name).
const A = (key: string) => `[data-rk-unavail="${key}"] .schedule-availability-mark`;
const ANY_A = `:is(${Object.keys(UNAVAIL).filter((key) => key !== "original").map((key) => `[data-rk-unavail="${key}"]`).join(", ")}) .schedule-availability-mark`;

const unavailCss = `
:is([data-rk-unavail], [data-rk-live], [data-rk-new]) {
  /* Orange a shade deeper for marks on a tinted card: 3:1 or more on every
     shift colour (today's --theme-availability is 2.8:1 on a Dinner card). */
  --mk-o: var(--theme-availability);
  --mk-o-ink: color-mix(in srgb, var(--theme-availability) 70%, var(--theme-availability-text));
  --mk-o-soft: var(--theme-availability-soft);
  --mk-o-deep: var(--theme-availability-text);
}
${ANY_A} {
  width: 16px;
  height: 16px;
  background: transparent;
  box-shadow: var(--mk-ring, 0 0 0 0 transparent);
  color: var(--mk-o-ink);
  font-size: 0 !important;
  line-height: 0;
}
${ANY_A}::before {
  width: var(--mk-g, 10px);
  height: var(--mk-g, 10px);
  background: currentColor;
  content: "";
  -webkit-mask: var(--mk-i) center / contain no-repeat;
  mask: var(--mk-i) center / contain no-repeat;
}
${ANY_A}:is(:hover, [aria-expanded="true"]) {
  transform: scale(1.15);
  box-shadow: var(--mk-ring, 0 0 0 0 transparent), 0 0 0 3px color-mix(in srgb, var(--theme-availability) 24%, transparent);
}
${A("u1")} { --mk-ring: inset 0 0 0 1.5px var(--mk-o-ink); --mk-i: ${ICON.bang}; --mk-g: 11px; background: var(--theme-surface); }
${A("u2")} { --mk-ring: inset 0 0 0 1px color-mix(in srgb, var(--mk-o) 55%, transparent); --mk-i: ${ICON.bang}; --mk-g: 11px; width: 18px; height: 18px; background: var(--mk-o-soft); color: var(--mk-o-deep); }
${A("u3")} { --mk-i: ${ICON.bang}; --mk-g: 10px; background: var(--mk-o-ink); color: var(--theme-on-accent); }
${A("u4")} { --mk-i: ${ICON.bang}; --mk-g: 10px; border-radius: 4px; background: var(--mk-o-ink); color: var(--theme-on-accent); }
${A("u5")} { width: 10px; height: 10px; }
/* The dot is small; the place to press is not (18px around it). */
${A("u5")}:not(.schedule-availability-mark-corner) { position: relative; }
${A("u5")}::after { position: absolute; inset: -4px; border-radius: 999px; content: ""; }
${A("u5")}::before { width: 8px; height: 8px; border-radius: 999px; background: var(--mk-o-ink); -webkit-mask: none; mask: none; }
${A("u5")}:is(:hover, [aria-expanded="true"]) { transform: scale(1.3); box-shadow: none; }
${A("u6")} { width: 14px; height: 14px; border-radius: 0; background: var(--mk-o-ink); clip-path: polygon(0 0, 100% 0, 100% 100%); }
${A("u6")}::before { content: none; }
${A("u6")}:is(:hover, [aria-expanded="true"]) { transform: none; box-shadow: none; background: var(--mk-o-deep); }
${A("u6")}.schedule-availability-mark-card { position: absolute; top: -6px; right: -6px; }
${A("u6")}.schedule-availability-mark-corner { top: 0; right: 0; }
${A("u6")}.schedule-availability-mark-name { width: 10px; height: 10px; border-radius: 0 2px 0 0; }
${A("u6")}:focus-visible { outline-offset: 0; }
${A("u7")} { --mk-i: ${ICON.clock}; --mk-g: 14px; width: 14px; height: 14px; }
${A("u8")} { --mk-ring: inset 0 0 0 1px color-mix(in srgb, var(--mk-o) 45%, transparent); --mk-i: ${ICON.clock}; --mk-g: 12px; width: 18px; height: 18px; background: var(--mk-o-soft); color: var(--mk-o-deep); }
${A("u9")} { --mk-i: ${ICON.userX}; --mk-g: 15px; width: 15px; height: 15px; border-radius: 3px; }
${A("u10")} { --mk-i: ${ICON.triangle}; --mk-g: 15px; width: 15px; height: 15px; border-radius: 3px; }
`;

// --- LIVE: .rk-live-label in the card's top-right row (Yeni look only).
const L = (key: string) => `[data-rk-live="${key}"] .schedule-shift-badge .rk-live-label`;
const liveIcon = (key: string, icon: string, size: number) => `
${L(key)} { display: inline-grid; place-items: center; width: ${size}px; height: 13px; padding: 0; border: 0; background: none; color: var(--theme-success); font-size: 0; }
${L(key)}::before { width: ${size}px; height: ${size}px; background: currentColor; content: ""; -webkit-mask: ${icon} center / contain no-repeat; mask: ${icon} center / contain no-repeat; }`;

const liveCss = `
${L("l1")} { display: inline-flex; align-items: center; gap: 3px; padding: 0; border: 0; background: none; }
${L("l1")}::before { width: 6px; height: 6px; border-radius: 999px; background: currentColor; content: ""; }
${L("l2")} { border-color: var(--theme-success); background: var(--theme-success); color: var(--theme-on-accent); }
${L("l3")} { width: 8px; height: 8px; padding: 0; border: 0; border-radius: 999px; background: var(--theme-success); box-shadow: 0 0 0 2px var(--theme-surface); font-size: 0; }
${L("l4")} { padding: 0; border: 0; background: none; }
${L("l5")} { border-color: var(--theme-success); background: var(--theme-surface); }
${liveIcon("l6", ICON.circleCheck, 13)}
${liveIcon("l7", ICON.badgeCheck, 14)}
${liveIcon("l8", ICON.eye, 14)}
${liveIcon("l9", ICON.radio, 14)}
${L("l10")} { padding: 0 5px; border-color: transparent; border-radius: 999px; font-size: 10px; font-weight: 650; letter-spacing: 0; text-transform: none; }
`;

// --- NEW: .schedule-shift-new-mark, the card's bottom-right corner.
const N = (key: string) => `[data-rk-new="${key}"] .schedule-shift-new-mark`;
const newIcon = (key: string, icon: string, size: number) => `
${N(key)} { display: grid; place-items: center; width: ${size}px; height: ${size}px; padding: 0; border: 0; background: none; color: var(--theme-info-text); font-size: 0; }
${N(key)}::before { width: ${size}px; height: ${size}px; background: currentColor; content: ""; -webkit-mask: ${icon} center / contain no-repeat; mask: ${icon} center / contain no-repeat; }`;

const newCss = `
${N("n1")} { border-color: color-mix(in srgb, var(--theme-info-text) 35%, transparent); background: var(--theme-info-soft); color: var(--theme-info-text); }
${N("n2")} { border-color: var(--theme-text); background: var(--theme-text); color: var(--theme-on-accent); }
${N("n3")} { display: inline-flex; align-items: center; gap: 3px; padding: 0; border: 0; background: none; color: var(--theme-info-text); }
${N("n3")}::before { width: 6px; height: 6px; border-radius: 999px; background: currentColor; content: ""; }
${N("n4")} { border: 1px dashed var(--theme-border-control); background: var(--theme-surface); color: var(--theme-muted-strong); }
${newIcon("n5", ICON.sparkles, 13)}
${newIcon("n6", ICON.circlePlus, 13)}
${N("n7")} { padding: 0; border: 0; background: none; }
${N("n8")} { right: 0; bottom: 0; width: 12px; height: 12px; padding: 0; border: 0; border-radius: 0; background: var(--theme-info-text); clip-path: polygon(100% 0, 100% 100%, 0 100%); font-size: 0; }
${newIcon("n9", ICON.cloudUp, 15)}
${N("n10")} { width: 1px; height: 1px; padding: 0; border: 0; overflow: hidden; clip-path: inset(50%); }
[data-rk-new="n10"] .schedule-shift-badge:has(> .schedule-shift-new-mark) { border-style: dashed; border-color: color-mix(in srgb, var(--shift-color) 70%, #26332e); }
`;

// --- The manager note: .schedule-shift-note-corner, a 16px hover area in the
// card's top-left corner; ::before draws the mark.
const O = (key: string) => `[data-rk-note="${key}"] .schedule-shift-badge .schedule-shift-note-corner`;
const noteIcon = (key: string, icon: string, size: number) => `
${O(key)} { width: ${size + 8}px; height: ${size + 8}px; }
${O(key)}::before { top: 4px; left: 4px; width: ${size}px; height: ${size}px; border: 0; background: var(--theme-note); -webkit-mask: ${icon} center / contain no-repeat; mask: ${icon} center / contain no-repeat; }`;

const noteCss = `
${O("o1")} { width: 18px; height: 18px; }
${O("o1")}::before { border-top-width: 15px; border-right-width: 15px; }
${O("o2")}::before { width: 12px; height: 12px; border: 0; border-bottom-right-radius: 12px; background: var(--theme-note); }
${O("o3")}::before { top: 5px; left: 5px; width: 7px; height: 7px; border: 0; border-radius: 999px; background: var(--theme-note); }
${noteIcon("o4", ICON.stickyNote, 12)}
${noteIcon("o5", ICON.message, 12)}
${O("o6")}::before { width: 13px; height: 13px; border: 0; border-bottom-right-radius: 2px; background: linear-gradient(135deg, var(--theme-surface) 0 50%, color-mix(in srgb, var(--theme-note) 70%, var(--theme-surface)) 50%); box-shadow: 1px 1px 1.5px rgb(23 33 29 / 0.28); }
${O("o7")} { height: 18px; }
${O("o7")}::before { top: 4px; width: 3px; height: 14px; border: 0; border-radius: 0 2px 2px 0; background: var(--theme-note); }
${noteIcon("o8", ICON.lines, 11)}
${noteIcon("o9", ICON.paperclip, 12)}
${O("o11")} { width: 17px; height: 20px; }
${O("o11")}::before { top: 3px; left: 2px; width: 14px; height: 14px; border: 0; background: var(--theme-note); transform: rotate(-45deg); -webkit-mask: ${ICON.paperclipThin} center / contain no-repeat; mask: ${ICON.paperclipThin} center / contain no-repeat; }
${O("o12")} { top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 999px; background: var(--theme-surface); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-note) 45%, var(--theme-surface)); }
${O("o12")}::before { top: 3px; left: 3px; width: 12px; height: 12px; border: 0; background: var(--theme-note); -webkit-mask: ${ICON.paperclip} center / contain no-repeat; mask: ${ICON.paperclip} center / contain no-repeat; }
${O("o13")} { top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 5px; background: var(--theme-note); }
${O("o13")}::before { top: 3px; left: 3px; width: 12px; height: 12px; border: 0; background: var(--theme-surface); -webkit-mask: ${ICON.paperclip} center / contain no-repeat; mask: ${ICON.paperclip} center / contain no-repeat; }
${O("o14")} { width: 18px; height: 18px; }
${O("o14")}::before { top: -3px; left: 3px; width: 18px; height: 18px; border: 0; background: var(--theme-note); transform: rotate(-45deg); -webkit-mask: ${ICON.paperclip} center / contain no-repeat; mask: ${ICON.paperclip} center / contain no-repeat; }
${O("o15")} { top: 4px; left: 5px; display: inline-flex; align-items: center; gap: 2px; width: auto; height: 14px; color: var(--theme-note); }
${O("o15")}::before { position: static; display: block; flex: none; width: 11px; height: 11px; border: 0; background: currentColor; -webkit-mask: ${ICON.paperclip} center / contain no-repeat; mask: ${ICON.paperclip} center / contain no-repeat; }
/* Level with the first line (Mert, 2026-10-14 01:15Z; vk/line1.ts), 5px in. */
${O("o16")} { top: calc(var(--rk-l1-mid, 11.5px) - 7.5px); left: 5px; width: 15px; height: 15px; }
${O("o16")}::before { top: 0; left: 0; width: 15px; height: 15px; border: 0; background: var(--theme-note); -webkit-mask: ${ICON.paperclipThin} center / contain no-repeat; mask: ${ICON.paperclipThin} center / contain no-repeat; }
${O("o15")}::after { content: "Note"; font-size: 10px; font-weight: 700; letter-spacing: 0.01em; line-height: 14px; }
${O("o10")} { top: 5px; left: 5px; width: auto; height: auto; }
${O("o10")}::before { position: static; display: block; width: auto; height: auto; padding: 0 4px; border: 1px solid color-mix(in srgb, var(--theme-note) 35%, transparent); border-radius: 3px; background: color-mix(in srgb, var(--theme-note) 9%, var(--theme-surface)); color: var(--theme-note); content: "Note"; font-size: 9px; font-weight: 750; letter-spacing: 0.02em; line-height: 13px; text-transform: uppercase; }
`;

const style = document.createElement("style");
style.id = "rk-mark-drafts";
style.textContent = unavailCss + liveCss + newCss + noteCss;
document.head.append(style);

export function markWidth(family: Family, key: string): number {
  return (family[key] ?? family.original!).width;
}
