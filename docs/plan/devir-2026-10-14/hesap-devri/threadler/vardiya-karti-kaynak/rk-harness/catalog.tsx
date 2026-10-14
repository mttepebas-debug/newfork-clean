// Card catalog: every shift card and cell the Schedule grid can show, drawn
// with the app's own ShiftCard and CSS, each introduced with 5N1K (what, when,
// where, who sees it, why, how). Turkish for Mert; the cards stay English.
import type { ReactNode } from "react";
import { Fragment } from "react";
import { GhostShiftCard, ShiftCard } from "@web/schedule/components/ShiftCard";
import type { ShiftPublicationState } from "@web/schedule/components/ScheduleContextMenu";
import { ForcedPicks, items, lookMarks, usePick } from "./vk/store";

export const TYPE = {
  breakfast: { id: "t-breakfast", name: "Breakfast", color: "#F59E0B" },
  lunch: { id: "t-lunch", name: "Lunch", color: "#10B981" },
  dinner: { id: "t-dinner", name: "Dinner", color: "#6366F1" },
  close: { id: "t-close", name: "Close", color: "#EC4899" },
} as const;
type TypeKey = keyof typeof TYPE;

let serial = 0;
type Shift = Parameters<typeof ShiftCard>[0]["shift"];
export function shift(over: Partial<Shift> & { type?: TypeKey } = {}): Shift {
  serial += 1;
  const type = over.type ?? "dinner";
  const times: Record<TypeKey, [string, string]> = {
    breakfast: ["07:00", "12:00"], lunch: ["11:00", "16:00"], dinner: ["16:00", "22:00"], close: ["18:00", "23:30"],
  };
  return {
    id: `00000000-0000-4000-8000-${String(serial).padStart(12, "0")}`,
    location_id: "loc", employee_id: "emp", job_id: "job", shift_type_id: TYPE[type].id,
    scheduled_date: "2026-10-12", start_time: times[type][0], end_time: times[type][1],
    crosses_midnight: false, unpaid_break_minutes: 0, hide_time_on_badge: false,
    label_ids: [], label_names: [], note: "", warning_codes: [],
    ...over,
  } as Shift;
}

export function Card({
  s, job = "Busser", type = "dinner", editing = false, state = null, selected = false, focused = false,
  dragging = false, stack = 1, height = 44, name = "Ethan Brooks",
}: {
  s: Shift; job?: string; type?: TypeKey; editing?: boolean; state?: ShiftPublicationState | null;
  selected?: boolean; focused?: boolean; dragging?: boolean; stack?: number; height?: number; name?: string;
}) {
  return (
    <ShiftCard
      shift={s} job={job} type={TYPE[type]} employeeName={name} editing={editing}
      showShiftType showShiftLabels showClockTimes timeFormat="12h" showJobColorDot={false}
      selected={selected} focused={focused} dragging={dragging} stackCount={stack}
      rowKey="catalog" badgeHeight={height} publicationState={state}
      availabilityMark={s.warning_codes.includes("availability") ? { kind: "unavailable", windows: [{ start: "18:00", end: "24:00" }] } as never : null}
    />
  );
}

/** A grid cell around the sample, so cell rules (edit mode, time off, drop) apply. */
export function Cell({ children, editing = false, attrs = {}, unassigned = false, height = 94 }: {
  children?: ReactNode; editing?: boolean; attrs?: Record<string, string>; unassigned?: boolean; height?: number;
}) {
  return (
    <div
      className={`schedule-cell${unassigned ? " schedule-unassigned-row-cell" : ""}`}
      data-editing={editing} data-drop-cell="true" data-catalog-cell="true"
      style={{ width: 196, minHeight: height, display: "flex", flexDirection: "column", gap: 4 }}
      {...attrs}
    >
      {children}
    </div>
  );
}

/** Every sample twice: main today ("Original") and after Mert's comments ("Yeni"). */
function LookPair({ children }: { children: ReactNode }) {
  const current = usePick("look");
  const options = items.look.options as Record<string, string>;
  return (
    <div className="rk-variants">
      {Object.keys(options).map((key) => (
        <figure key={key} data-current={current === key} data-rk-look={key}
          data-rk-unavail={lookMarks(key).unavail} data-rk-live={lookMarks(key).live}
          data-rk-new={lookMarks(key).newmark} data-rk-note={lookMarks(key).notemark}>
          <ForcedPicks.Provider value={{ look: key, ...lookMarks(key) }}>{children}</ForcedPicks.Provider>
          <figcaption>{key === "original" ? "Original · bugünkü main" : "Yeni · 12 Ekim yorumların"}</figcaption>
        </figure>
      ))}
    </div>
  );
}

interface Entry {
  id: string;
  title: string;
  /** Ne · Ne zaman · Nerede · Kim · Neden · Nasıl */
  ne: string; zaman: string; nerede: string; kim: string; neden: string; nasil: string;
  demo: ReactNode;
  /** Where this one is on the grid: a selector, and whether edit mode is needed. */
  show?: { selector: string; edit: boolean };
  note?: ReactNode;
  wide?: boolean;
}

const EDITORS = "Owner, admin ve o lokasyonun manager'ı. Çalışan görmez.";
const VIEWERS = "Owner, admin, manager (Schedule sayfası). Çalışan aynı vardiyayı kendi ekranında (My Schedule, Shift Hub) başka bir kartla görür.";

const groups: { title: string; lead: string; entries: Entry[] }[] = [
  {
    title: "Yayın durumu (düzenleme modunda)",
    lead: "Yayındaki bir haftayı düzenlerken (New Schedule → Edit live schedule) kart, çalışanların gördüğü programla arasındaki farkı söyler. Publish'e basınca hepsi normal karta döner.",
    entries: [
      {
        id: "live", title: "Live: yayındaki vardiya",
        ne: "Çalışanlara yayınlanmış ve düzenlemede dokunulmamış vardiya. Yeni hâlde sağ üstte yeşil nokta ve LIVE yazar (13 Ekim seçimin: 1 · Nokta + Live).",
        zaman: "Yayındaki haftayı düzenlerken. Original: işaret yok (9 Ekim kararı). Yeni: sağ üstte yeşil nokta + LIVE, kutusuz.",
        nerede: "Schedule → New Schedule → Edit live schedule. Bu sayfada Harbor & Vine Downtown bölümü (yayında).",
        kim: EDITORS, neden: "Düzenlerken hangi kartın zaten çalışanlarda olduğunu tek bakışta ayırmak.",
        nasil: "Publish'le oluşur. Sağ tık → Unpublish shift ile kaldırılmak üzere işaretlenir (aşağıda Deleted).",
        demo: <Cell editing><Card s={shift()} editing state="locked" /></Cell>,
        show: { selector: '[data-publication-state="locked"]', edit: true },
      },
      {
        id: "new", title: "New: henüz yayınlanmamış vardiya",
        ne: "Düzenlemede eklenmiş ya da taslakta duran, çalışanların henüz görmediği vardiya. Sağ altta yeşil NEW: Original'de kutulu, Yeni'de kutusuz yalın yazı (13 Ekim seçimin: 7 · Yalın yazı). Yeni hâlde düzenlenmiş yayındaki vardiya da NEW yazar (aşağıda).",
        zaman: "Düzenleme modunda, yayında karşılığı olmayan her kart. Yayınlanmamış lokasyonun bütün kartları NEW'dir.",
        nerede: "Bu sayfada Downtown'da Aisha Johnson Pazartesi ve Harbor & Vine Uptown bölümünün tamamı (yayında değil).",
        kim: EDITORS, neden: "Publish'e basınca neyin çalışanlara yeni gideceğini görmek (9 Ekim kararı, 6 numara).",
        nasil: "Boş hücreye çift tık → Add shift, yapıştırma, sürükleyip kopyalama, şablon ya da Auto-fill. Publish'ten sonra NEW kalkar.",
        demo: <Cell editing><Card s={shift({ type: "lunch" })} job="Line Cook" type="lunch" editing state={null} name="Aisha Johnson" /></Cell>,
        show: { selector: ".schedule-shift-new-mark", edit: true },
      },
      {
        id: "edited", title: "Değiştirilmiş yayındaki vardiya",
        ne: "Yayında olan, düzenlemede saati, kişisi, işi ya da tipi değişen vardiya. Çalışanlar Publish'e kadar eski hâlini görür.",
        zaman: "Yayındaki bir vardiyayı düzenleme modunda değiştirince. Original: solda koyu şerit + sağ üstte kalem. Yeni: yeni bir vardiya gibi sağ altta NEW; şerit ve kalem yok.",
        nerede: "Bu sayfada Downtown'da Ethan Brooks Pazartesi (4:00–10:00'dan 11:30–3:30'a çekildi).",
        kim: EDITORS, neden: "Publish'in hangi yayındaki vardiyayı güncelleyeceğini görmek.",
        nasil: "Kartı çift tıkla değiştir ya da sürükle. Publish'le yayındaki vardiya güncellenir, işaret kalkar. Undo geri alır.",
        demo: <Cell editing><Card s={shift({ type: "dinner", start_time: "11:30", end_time: "15:30" })} editing state="unlocked-modified" /></Cell>,
        note: <>Yeni hâlde NEW sağ altta ama yazıya değmiyor: geniş ekranda kartın iki yanında NEW kadar boşluk kalıyor; dar ekranda (ör. sol menü açık) NEW yazının altında kendi satırında duruyor. Yazı hiçbir zaman ikinci satıra inmiyor.</>,
        show: { selector: '[data-publication-state="unlocked-modified"]', edit: true },
      },
      {
        id: "deleted", title: "Deleted: kaldırılacak yayındaki vardiya",
        ne: "Yayında olan ama düzenlemede silinen vardiya. Soluk gri, yazısı üstü çizili. Original'de sağ üstte bulut simgesi var; Yeni'de yok.",
        zaman: "Yayındaki vardiyayı düzenlemede silince (sağ tık → Unpublish shift, ya da kartları seçip silince). Yayında olmayan bir kartı silmek onu doğrudan yok eder, bu hâl çıkmaz.",
        nerede: "Bu sayfada Downtown'da Maria Lopez Pazartesi.",
        kim: EDITORS, neden: "Publish'in neyi çalışanların programından çıkaracağını görmek; yanlışlıkla silineni geri almak.",
        nasil: "Sağ tık → Restore shift ile geri gelir. Publish'te vardiya çalışanların programından kalkar.",
        demo: <Cell editing><Card s={shift({ type: "lunch", start_time: "16:15", end_time: "23:30" })} type="lunch" editing state="staged-removed" /></Cell>,
        show: { selector: '[data-publication-state="staged-removed"]', edit: true },
      },
    ],
  },
  {
    title: "Kartın üstündeki bilgiler",
    lead: "Kartın kendisi her modda aynı: başlık (vardiya tipi-iş), varsa etiketler, saat. Renk vardiya tipinin rengi.",
    entries: [
      {
        id: "normal", title: "Normal kart",
        ne: "Bir kişinin bir günlük vardiyası: Dinner-Busser, 4:00 PM - 10:00 PM.",
        zaman: "Her zaman. Görüntüleme modunda yalnız yayındaki vardiyalar görünür; yayınlanmamış lokasyon boş kalır.",
        nerede: "Schedule ızgarası, kişinin satırı, günün sütunu.", kim: VIEWERS,
        neden: "Kim, ne iş, ne zaman: tek bakışta.", nasil: "Rengi Settings → Shift catalog'daki vardiya tipinden gelir; Settings düğmesinden tip adı, etiket ve saat gizlenebilir.",
        demo: <Cell><Card s={shift()} /></Cell>, show: { selector: "[data-shift-badge]:not([data-ghost])", edit: false },
      },
      {
        id: "labels", title: "Etiketli kart",
        ne: "Başlığın altında küçük yazıyla vardiya etiketleri (Opener, Closer, Training, Private event).",
        zaman: "Vardiyaya etiket verilmişse ve Settings'te etiketler açıksa.", nerede: "Bu sayfada Carlos Rivera (Opener), Sophie Martin (Closer).",
        kim: VIEWERS, neden: "Vardiyanın özel görevini saatle birlikte göstermek.", nasil: "Vardiya penceresinde Labels alanı. Etiketler Settings → Shift labels'tan.",
        demo: <Cell><Card s={shift({ type: "lunch", label_names: ["Opener"] })} job="Line Cook" type="lunch" height={58} /></Cell>,
        show: { selector: ".schedule-shift-labels", edit: false },
      },
      {
        id: "notime", title: "Saati gizli kart",
        ne: "Saat satırı olmayan kart.", zaman: "Vardiya penceresinde \"saati kartta gösterme\" seçildiyse ya da Settings'te saatler kapalıysa.",
        nerede: "Schedule ızgarası.", kim: VIEWERS, neden: "Saati belli olmayan ya da önemsiz vardiyalarda kalabalığı azaltmak.", nasil: "Vardiya penceresi ya da Settings düğmesi.",
        demo: <Cell><Card s={shift({ hide_time_on_badge: true })} height={34} /></Cell>,
      },
      {
        id: "note", title: "Yönetici notlu kart",
        ne: "Vardiyada yöneticinin notu var. Original'de sol üst köşede küçük lacivert üçgen; Yeni'de solda ince, çapraz lacivert ataş, kartın ilk satırıyla aynı hizada (14 Ekim seçimin: 16 · Çapraz ince ataş).",
        zaman: "Vardiyaya not yazılmışsa.", nerede: "Bu sayfada Carlos Rivera Pazartesi ve Jake Thompson Çarşamba.",
        kim: "Owner, admin, manager. Çalışan notu görmez.", neden: "Vardiyaya dair yöneticiler arası hatırlatma.", nasil: "Köşenin üzerine gelince not açılır; vardiya penceresinde Note alanından yazılır.",
        demo: <Cell><Card s={shift({ note: "Covers the patio until 6." })} /></Cell>,
        show: { selector: '[data-has-note="true"]', edit: false },
      },
      {
        id: "availability", title: "Müsait değil \"!\"",
        ne: "Turuncu işaret: kişi bu vardiyanın saatlerinde müsait olmadığını bildirmiş. Original'de turuncu daire içinde \"!\"; Yeni'de küçük turuncu nokta (13 Ekim seçimin: 5 · Nokta), basılacak alanı noktadan büyük. Original'de kartın sağ üstünde. Yeni'de kart yayındaysa (LIVE) \"!\" satırın başına, çalışanın adının yanına taşınır; yayında olmayan kartta yerinde kalır.",
        zaman: "Düzenleme modunda, vardiya kişinin müsait olmadığı saatlere denk gelirse. Üstteki \"Availability on\" düğmesiyle kapatılır.",
        nerede: "Bu sayfada Aisha Johnson Cuma (6:00 PM sonrası müsait değil). Yeni'de \"!\" Downtown'daki Aisha Johnson satırının ad hücresinde.",
        kim: "Owner, admin, manager.", neden: "Yanlış kişiye vardiya yazmayı önlemek; engel değil, uyarı.", nasil: "\"!\"e tıklayınca hangi saatlerde müsait olmadığı açılır. Kişinin Availability kaydı değişince kalkar.",
        demo: <Cell editing><Card s={shift({ warning_codes: ["availability"] })} job="Line Cook" name="Aisha Johnson" editing state="locked" /><Card s={shift({ warning_codes: ["availability"] })} job="Line Cook" name="Aisha Johnson" editing state={null} /></Cell>,
        show: { selector: '[data-availability-warning="true"]', edit: true },
      },
      {
        id: "unassigned", title: "Açık vardiya (Unassigned) ve yığın",
        ne: "Kimseye verilmemiş vardiya; sarı Unassigned satırında. Aynı vardiyadan birden çoksa tek kart ve sayısı: Original'de sağ üstte, Yeni'de sol üstte \"x3\". Yeni'de yazı kartın iki kenarına göre ortalı; \"x3\" yazıya değmez.",
        zaman: "Vardiya kişisiz yazıldıysa ya da kişi çıkarılınca boşta kaldıysa.", nerede: "Her lokasyonun en üstündeki Unassigned satırı. Bu sayfada Downtown Cuma (iki Dinner-Server, \"x2\").",
        kim: VIEWERS, neden: "Doldurulması gereken yeri göstermek.", nasil: "Kartı bir kişinin satırına sürükle ya da Auto-fill. Çalışanlar Shift Hub'dan isteyebilir.",
        demo: <Cell unassigned><Card s={shift({ employee_id: null })} job="Server" stack={3} /></Cell>,
        show: { selector: "[data-stack-count]", edit: true },
      },
      {
        id: "ghost", title: "Ghost: kişinin başka lokasyondaki vardiyası",
        ne: "Kişinin öteki lokasyondaki vardiyasının yansıması; sağ üstte konum iğnesi. Tıklanmaz, sürüklenmez. Yeni'de iğne daha büyük, yazı ortalı ve iğneyle arasında boşluk var.",
        zaman: "Düzenleme modunda, lokasyonlar ayrı gösterilirken (All locations - Separate).",
        nerede: "Bu sayfada Downtown'da Emma Wilson, Grace Murphy, Marcus Reed (vardiyaları Uptown'da).",
        kim: "Owner, admin, manager.", neden: "Aynı kişiye aynı saatte ikinci vardiya yazmamak.", nasil: "Kendisi değişmez; öteki lokasyondaki asıl vardiya değişince değişir.",
        note: <>Bugünkü hâli gri taramalı. Kendi renginde, ölü tonda olması ayrı bir görsel karar maddesi: <a href="https://claude.ai/artifact/SKVYPZu4hnDupzU7Jn1xWo" target="_blank" rel="noopener">Ghost kart kendi renginde</a>.</>,
        demo: <Cell editing><GhostShiftCard shift={shift({ type: "lunch", ghost: true, ghost_location_name: "Harbor & Vine Uptown" } as never)} job="Server" type={TYPE.lunch} showShiftType showShiftLabels showClockTimes showJobColorDot={false} rowKey="catalog" badgeHeight={44} /></Cell>,
        show: { selector: '[data-ghost="true"]', edit: true },
      },
    ],
  },
  {
    title: "Düzenlerken etkileşim",
    lead: "Bunlar yalnız düzenleme modunda: kart tıklanır, seçilir, sürüklenir.",
    entries: [
      {
        id: "hover", title: "Üzerine gelince", ne: "Çerçeve ve zemin bir ton koyulaşır.", zaman: "Düzenleme modunda fare kartın üzerindeyken.",
        nerede: "Her kart (ghost hariç).", kim: EDITORS, neden: "Tıklanabilir olduğunu göstermek.", nasil: "Aşağıdaki kartın üzerine gel.",
        demo: <Cell editing><Card s={shift()} editing state="locked" /></Cell>,
      },
      {
        id: "focus", title: "Seçili kart (tek tık)", ne: "Kartın çevresinde kalın, kartın renginde koyu bir seçim çerçevesi.",
        zaman: "Karta tek tıklayınca. Görüntüleme modunda da tek tık kartı seçer ve ızgarayı o karta göre süzer; yeniden tıklayınca ya da boş yere tıklayınca kalkar.",
        nerede: "Her kart.", kim: VIEWERS, neden: "Klavyeyle (Enter: düzenle, Ctrl+C: kopyala) çalışmak.", nasil: "Tek tık; çift tık vardiya penceresini açar.",
        demo: <Cell editing><Card s={shift()} editing focused state="locked" /></Cell>,
      },
      {
        id: "multi", title: "Çoklu seçim", ne: "Birden çok kart aynı anda seçili: her birinde kalın çerçeve ve sol üstte tik.",
        zaman: "Düzenleme modunda Shift ya da Ctrl ile kartlara tıklayınca.", nerede: "Her kart.", kim: EDITORS,
        neden: "Birden çok vardiyayı birlikte silmek, taşımak ya da kopyalamak.", nasil: "Shift/Ctrl + tık; Esc ya da boş yere tık kaldırır.",
        demo: <Cell editing><Card s={shift({ type: "lunch" })} type="lunch" editing selected state="locked" /><Card s={shift()} editing selected state="locked" /></Cell>,
      },
      {
        id: "drag", title: "Sürüklenen kart ve önizlemesi",
        ne: "Sürüklerken kart yerinde soluklaşır; farenin yanında kartın bir kopyası gider. Ctrl ile sürüklenirse kopyada \"+ Paste\".",
        zaman: "Düzenleme modunda kartı tutup çekince. Bu sırada vardiyayı kendi lokasyonunda alamayacak kişiler listeden gizlenir (9 Ekim kararı, 4-B).",
        nerede: "Izgaranın her yeri.", kim: EDITORS, neden: "Vardiyayı başka kişiye ya da güne taşımak.", nasil: "Bırakınca taşınır; Esc vazgeçer.",
        demo: (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <Cell editing><Card s={shift()} editing dragging state="locked" /></Cell>
            <div className="schedule-shift-drag-preview" data-copy="true" style={{ position: "relative", left: 0, top: 0, width: 168 }}>
              <Card s={shift()} />
              <span className="schedule-drag-copy-badge">+ Paste</span>
            </div>
          </div>
        ),
      },
      {
        id: "drop", title: "Bırakma hedefi",
        ne: "Sürüklerken altındaki hücre renklenir: yeşil = bırakılabilir, turuncu = uyarıyla (ör. müsait değil), kırmızı = bırakılamaz (ör. onaylı izin, yanlış iş).",
        zaman: "Sürükleme sırasında.", nerede: "Fare altındaki hücre.", kim: EDITORS, neden: "Bırakmadan önce sonucu görmek.", nasil: "Kırmızıda bırakırsan kart yerine döner ve nedeni yazar. Yeni'de izinli hücrenin içindeki \"Can't place a shift here\" yazısı yok; kırmızı çerçeve kalır.",
        demo: (
          <div style={{ display: "flex", gap: 8 }}>
            <Cell editing attrs={{ "data-drop-target": "true", "data-drop-status": "allowed" }} height={70} />
            <Cell editing attrs={{ "data-drop-target": "true", "data-drop-status": "warning" }} height={70} />
            <Cell editing attrs={{ "data-drop-target": "true", "data-drop-status": "blocked", "data-availability-kind": "time_off" }} height={70} />
          </div>
        ),
        wide: true,
      },
      {
        id: "saving", title: "Kaydediliyor", ne: "Original: kartın altında \"Saving\" şeridi; uzarsa sarı \"Still saving — please wait\". Yeni: sağ üstte, kartın içinde dönen yükleniyor işareti; uzarsa sarı. Bu sırada kart tıklanmaz.",
        zaman: "Değişiklik sunucuya giderken (genelde bir an).", nerede: "Değişen kart.", kim: EDITORS, neden: "Kaydolmadan ikinci kez denememek.", nasil: "Sunucu cevap verince kendiliğinden kalkar.",
        demo: <Cell editing><Card s={{ ...shift(), saving_state: "saving" }} editing state="unlocked-modified" height={44} /><Card s={{ ...shift(), saving_state: "delayed" }} editing state="unlocked-modified" height={44} /></Cell>,
      },
    ],
  },
  {
    title: "Hücreler",
    lead: "Kart değil, kartın oturduğu hücrenin hâlleri.",
    entries: [
      {
        id: "timeoff", title: "Onaylı izin (Time off)", ne: "Kırmızımsı düz hücre, ortasında TIME OFF.",
        zaman: "Kişinin o gün onaylanmış izni varsa. Kısmi gün izninde hücrenin kalan kısmına vardiya yazılabilir.",
        nerede: "Bu sayfada Maria Lopez Çarşamba–Perşembe, Noah Garcia Perşembe.", kim: "Owner, admin, manager.",
        neden: "Onaylı izin, çakışan vardiyayı engeller (ürün kuralı).", nasil: "Requests'te izin onaylanınca oluşur; izin iptal edilince kalkar. Üzerine vardiya sürüklenirse hücre kırmızı çerçeveyle bırakılamayacağını gösterir (Original'de bir de \"Can't place a shift here\" yazar).",
        demo: <Cell editing attrs={{ "data-availability-kind": "time_off" }} />,
        show: { selector: '[data-availability-kind="time_off"]', edit: false },
      },
      {
        id: "add", title: "Boş hücre: Add shift", ne: "Düzenlerken boş hücrenin üzerine gelince kesikli \"+ Add shift\".",
        zaman: "Düzenleme modunda.", nerede: "Her boş hücre (izinli ve kişinin atanmadığı lokasyon hariç).", kim: EDITORS,
        neden: "Yeni vardiya eklemek.", nasil: "Tıkla ya da çift tıkla: vardiya penceresi açılır.",
        demo: <Cell editing><button type="button" className="schedule-cell-add-action schedule-cell-add" style={{ opacity: 1, pointerEvents: "auto" }}>+ <span>Add shift</span></button></Cell>,
      },
      {
        id: "closed", title: "Kapalı gün", ne: "Original: açık kahverengi taramalı hücre. Yeni: izinli hücreyle aynı düz kırmızımsı hücre; CLOSED yazısı yalnız üzerine gelince.", zaman: "Lokasyon o gün kapalıysa (Important Dates'te kapalı gün).",
        nerede: "O lokasyonun o günkü bütün hücreleri.", kim: "Owner, admin, manager.", neden: "Kapalı güne vardiya yazmamak.", nasil: "Important Dates'te kapalı gün yayınlanınca oluşur.",
        demo: <Cell attrs={{ "data-closed": "true" }} />,
      },
      {
        id: "overlap", title: "Çakışan iki vardiya", ne: "Hücrenin solunda ince kırmızı çizgi: aynı kişinin aynı gün saatleri çakışan iki vardiyası var.",
        zaman: "Saatler örtüşünce.", nerede: "O kişinin o günkü hücresi.", kim: EDITORS, neden: "Çift yazımı fark etmek.", nasil: "Vardiyalardan birini taşı ya da saatini değiştir.",
        demo: <Cell editing attrs={{ "data-overlap": "true" }}><Card s={shift({ type: "lunch", start_time: "11:00", end_time: "17:00", warning_codes: ["overlap"] })} type="lunch" editing state="locked" /><Card s={shift({ warning_codes: ["overlap"] })} editing state="locked" /></Cell>,
      },
    ],
  },
];

export function Catalog({ onShow }: { onShow: (selector: string, edit: boolean) => void }) {
  return (
    <div className="rk-catalog">
      <header>
        <h1>Schedule'daki bütün kart hâlleri</h1>
        <p>Her kart uygulamanın kendi kodu ve CSS'iyle çiziliyor. Üzerine gelebilir, tıklayabilirsin. "Izgarada göster" seni Schedule sekmesindeki aynı karta götürür.
          Her kart iki kez: Original (bugünkü main) ve Yeni (bu sayfadaki 12 Ekim yorumların). Yeni hâlde her kartın yazısı iki kenara göre ortalı ve kartın iki yanında köşedeki en geniş işaret kadar boşluk var; işaret yazıya değmez, sütun gerekirse genişler.
          Schedule sekmesinde hangisinin görüneceğini sağ alttaki "Test page" düğmesinden seçersin (başlangıç: Yeni). Yeni hâl yalnız bu sayfada; gerçek uygulamaya geçmedi.</p>
      </header>
      {groups.map((group) => (
        <section key={group.title}>
          <h2>{group.title}</h2>
          <p className="rk-lead">{group.lead}</p>
          {group.entries.map((entry) => (
            <article key={entry.id} className="rk-entry" data-wide={entry.wide || undefined}>
              <div className="rk-demo"><LookPair>{entry.demo}</LookPair></div>
              <div className="rk-text">
                <h3>{entry.title}</h3>
                <dl>
                  {([["Ne", entry.ne], ["Ne zaman", entry.zaman], ["Nerede", entry.nerede], ["Kim görür", entry.kim], ["Neden", entry.neden], ["Nasıl", entry.nasil]] as const).map(([k, v]) => (
                    <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>
                  ))}
                </dl>
                {entry.note ? <p className="rk-note">{entry.note}</p> : null}
                {entry.show ? (
                  <button type="button" className="rk-show" onClick={() => onShow(entry.show!.selector, entry.show!.edit)}>
                    Izgarada göster
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
