// Mark drafts board (Mert, 2026-10-13 21:58Z, 22:00Z): today's mark
// ("Original") and ten drafts each for the orange "!", LIVE, NEW and the
// manager note's corner, on the app's own cards, all on one page.
// "Seç" puts a draft on the whole grid (the Test page panel has the same
// picks). Turkish for Mert; the cards stay English.
import type { ReactNode } from "react";
import { AvailabilityMarkButton } from "@web/schedule/components/AvailabilityMarkButton";
import { Card, Cell, shift } from "./catalog";
import { LIVE, NEWMARK, NOTE, UNAVAIL, type MarkDraft } from "./vk/marks";
import { CHOSEN, ForcedPicks, setPick, usePick } from "./vk/store";

type DraftItem = "unavail" | "live" | "newmark" | "notemark";
const NOTE_TEXT = "Covers the patio until 6.";
const LINES = ["Mon, Oct 12 · Unavailable 6:00 PM – 12:00 AM"];

function NameCell() {
  return (
    <div className="rk-mk-name">
      <div className="schedule-employee-name-row">
        <button type="button" className="schedule-employee-name-button" data-schedule-employee-card-trigger="true">
          <strong>Aisha Johnson</strong>
        </button>
        <AvailabilityMarkButton className="schedule-availability-mark-name" label="Aisha Johnson: unavailable days this week" lines={LINES} />
      </div>
    </div>
  );
}

function EmptyUnavailableCell() {
  return (
    <Cell editing height={52} attrs={{ "data-availability-kind": "unavailable" }}>
      <AvailabilityMarkButton className="schedule-availability-mark-corner" label="Aisha Johnson: unavailable on Mon, Oct 12" lines={LINES} />
    </Cell>
  );
}

const warn = { warning_codes: ["availability" as const] };

/** A card with "!" and NEW is as tall as the grid makes it: room for both
 * corner marks, 6px apart (useScheduleBadgeMeasurements cornerMarksHeight). */
function bangHeight(key: string): number {
  if (key === "u6") return 44;
  return Math.max(44, 1 + 6 + (UNAVAIL[key] ?? UNAVAIL.original!).width + 6 + 15 + 4 + 1);
}

/** What each family's tile shows. */
const DEMO: Record<DraftItem, (key: string) => ReactNode> = {
  unavail: (key) => (
    <>
      <NameCell />
      <Cell editing height={0}>
        <Card s={shift({ ...warn })} job="Line Cook" name="Aisha Johnson" editing state={null} height={bangHeight(key)} />
        <Card s={shift({ ...warn, type: "breakfast" })} type="breakfast" job="Host" name="Aisha Johnson" editing state={null} height={bangHeight(key)} />
      </Cell>
      <EmptyUnavailableCell />
    </>
  ),
  live: () => (
    <Cell editing height={0}>
      <Card s={shift({ type: "lunch" })} type="lunch" job="Line Cook" editing state="locked" />
      <Card s={shift()} editing state="locked" />
      <Card s={shift({ type: "close" })} type="close" job="Bartender" editing state={null} />
    </Cell>
  ),
  newmark: () => (
    <Cell editing height={0}>
      <Card s={shift({ type: "lunch" })} type="lunch" job="Line Cook" name="Aisha Johnson" editing state={null} />
      <Card s={shift({ start_time: "11:30", end_time: "15:30" })} editing state="unlocked-modified" />
      <Card s={shift({ type: "close" })} type="close" job="Bartender" editing state="locked" />
    </Cell>
  ),
  notemark: () => (
    <Cell editing height={0}>
      <Card s={shift({ note: NOTE_TEXT })} editing state="locked" />
      <Card s={shift({ type: "breakfast", note: NOTE_TEXT })} type="breakfast" job="Host" editing state={null} />
      <Card s={shift({ type: "lunch", note: NOTE_TEXT })} type="lunch" job="Line Cook" />
    </Cell>
  ),
};

const FAMILIES: { item: DraftItem; title: string; lead: ReactNode; drafts: Record<string, MarkDraft>; selector: string }[] = [
  {
    item: "unavail",
    title: "Müsait değil işareti (turuncu)",
    lead: <>Kişinin müsait olmadığını bildirdiği saate denk gelen vardiya. Müsaitlik yalnız tercih: işaret uyarır, engellemez. Her taslak üç yerde: adın yanında, kartta (iki kart: Dinner ve en zor zemin Breakfast) ve boş hücrenin köşesinde. Tıklayınca bugünkü gibi saatleri açar.</>,
    drafts: UNAVAIL,
    selector: ".schedule-availability-mark",
  },
  {
    item: "live",
    title: "LIVE (yeşil): yayındaki vardiya",
    lead: <>Yayındaki haftayı düzenlerken, çalışanlarda olan ve dokunulmamış vardiya. Bugün yalnız bu test sayfasında var (Yeni görünüm); main'de işaret yok. Her taslakta en altta karşılaştırma için bir NEW kart var (seçili NEW taslağıyla).</>,
    drafts: LIVE,
    selector: ".rk-live-label",
  },
  {
    item: "newmark",
    title: "NEW: taslakta eklenen ya da değişen vardiya",
    lead: <>Publish'ten sonra taslağa eklenen ya da değiştirilen, çalışanların henüz görmediği vardiya. Bugün LIVE ile aynı yeşil. Her taslakta: yeni eklenmiş kart, saati değişmiş yayındaki kart ve karşılaştırma için bir LIVE kart (seçili LIVE taslağıyla).</>,
    drafts: NEWMARK,
    selector: ".schedule-shift-new-mark",
  },
  {
    item: "notemark",
    title: "Yönetici notu işareti",
    lead: <>Vardiyada yöneticinin notu var. Bugün sol üst köşede küçük lacivert üçgen. İşaretin üzerine gelince not kartın yanında açılır; çalışan notu görmez. Her taslakta: yayındaki kart (LIVE ile), yeni kart (NEW ile) ve okuma modunda bir kart. Üzerine gelip notu açabilirsin. 11–15: istediğin gibi ataşın beş yeni hâli (9 bugünkü ataş taslağı). 16: senin seçimin, 11'in ince ataşı çapraz, 15'teki gibi solda, biraz daha büyük. Seçilen işaretlerin hepsi kartın ilk satırıyla aynı hizada; kart onlar için büyümez.</>,
    drafts: NOTE,
    selector: '[data-has-note="true"]',
  },
];

const label = (family: Record<string, MarkDraft>, key: string) =>
  key === "original" ? "Original" : `${key.slice(1)} ${family[key]?.name ?? ""}`;

/** The paperclip drafts Mert asked for on Oct 14 (11–16), next to the first one (9). */
const PAPERCLIP = new Set(["o9", "o11", "o12", "o13", "o14", "o15", "o16"]);

function usePicks() {
  return { unavail: usePick("unavail"), live: usePick("live"), newmark: usePick("newmark"), notemark: usePick("notemark") } as Record<DraftItem, string>;
}

/** The marks a sample wears: the given draft for one family, the picked ones for the rest. */
function Wear({ picks, children }: { picks: Record<DraftItem, string>; children: ReactNode }) {
  return (
    <div className="rk-mk-wear" data-rk-look="yeni" data-rk-unavail={picks.unavail} data-rk-live={picks.live} data-rk-new={picks.newmark} data-rk-note={picks.notemark}>
      <ForcedPicks.Provider value={{ look: "yeni", ...picks }}>{children}</ForcedPicks.Provider>
    </div>
  );
}

function Tile({ item, draftKey, draft, picks }: { item: DraftItem; draftKey: string; draft: MarkDraft; picks: Record<DraftItem, string> }) {
  const current = picks[item] === draftKey;
  const number = draftKey === "original" ? "O" : draftKey.slice(1);
  return (
    <figure className="rk-mk-tile" data-current={current} data-draft={`${item}:${draftKey}`} data-paperclip={item === "notemark" && PAPERCLIP.has(draftKey) ? "true" : undefined}>
      <Wear picks={{ ...picks, [item]: draftKey }}>{DEMO[item](draftKey)}</Wear>
      <figcaption>
        <strong><span className="rk-mk-no">{number}</span>{draftKey === "original" ? "Original · bugünkü" : draft.name}
          {CHOSEN[item] === draftKey && draftKey !== "original" ? <span className="rk-mk-chosen">Mert'in seçimi</span> : null}</strong>
        <span>{draft.idea}</span>
        <button type="button" className="rk-mk-pick" aria-pressed={current} onClick={() => setPick(item, draftKey as never)}>
          {current ? "Izgarada bu var" : "Izgarada bunu kullan"}
        </button>
      </figcaption>
    </figure>
  );
}

export function MarksBoard({ onShow }: { onShow: (selector: string, edit: boolean) => void }) {
  const picks = usePicks();
  return (
    <div className="rk-catalog rk-marks">
      <header>
        <h1>Kart işaretleri: 45 taslak</h1>
        <p>Turuncu "!", yeşil LIVE, NEW ve yönetici notu işareti için onar taslak, her birinin başında bugünkü hâli (Original). Not işaretinde 11–16 ataş taslakları; 16 senin seçimin. Kartlar uygulamanın kendi kodu ve CSS'iyle çiziliyor; üzerine gelebilir, "!"e tıklayabilirsin.
          "Izgarada bunu kullan" o taslağı Schedule sekmesinde bütün ızgaraya uygular; sağ alttaki "Test page" düğmesinde de aynı seçim var. Seçimin bu tarayıcıda kalır. Hiçbiri gerçek uygulamaya geçmedi.</p>
        <div className="rk-mk-now">
          <div>
            <strong>Şu an ızgarada</strong>
            <span>"!": {label(UNAVAIL, picks.unavail)} · LIVE: {label(LIVE, picks.live)} · NEW: {label(NEWMARK, picks.newmark)} · Not: {label(NOTE, picks.notemark)}</span>
            <button type="button" className="rk-show" onClick={() => onShow("[data-publication-state]", true)}>Izgarada gör</button>
          </div>
          <Wear picks={picks}>
            <div className="rk-mk-now-cards">
              <Cell editing height={0}><Card s={shift({ type: "lunch", note: NOTE_TEXT })} type="lunch" job="Line Cook" editing state="locked" /></Cell>
              <Cell editing height={0}><Card s={shift({ ...warn })} job="Line Cook" name="Aisha Johnson" editing state={null} height={bangHeight(picks.unavail)} /></Cell>
              <EmptyUnavailableCell />
            </div>
          </Wear>
        </div>
      </header>
      {FAMILIES.map((family) => (
        <section key={family.item} data-family={family.item}>
          <h2>{family.title}</h2>
          <p className="rk-lead">{family.lead}</p>
          <div className="rk-mk-grid">
            {Object.entries(family.drafts).map(([key, draft]) => (
              <Tile key={key} item={family.item} draftKey={key} draft={draft} picks={picks} />
            ))}
          </div>
          <button type="button" className="rk-show" onClick={() => onShow(family.selector, true)}>Seçili taslağı ızgarada göster</button>
        </section>
      ))}
    </div>
  );
}
