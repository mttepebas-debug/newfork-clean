// The test page's own controls: the corner "Test page" menu (which version of
// each item to show, a long-names scenario, reset), short explanations in
// Turkish for Mert, and a notice when something would leave Schedule.
import { resetWorld, world } from "./mock/world";
import { getChoice, items, setChoice, type ItemKey } from "./variants/store";

const allowedLink = /^\/app\/schedule(\/(templates|export))?\/?$/;

let noticeTimer = 0;
export function notice(text: string): void {
  let box = document.getElementById("schedule-test-notice");
  if (!box) {
    box = document.createElement("div");
    box.id = "schedule-test-notice";
    box.setAttribute("role", "status");
    document.body.append(box);
  }
  box.textContent = text;
  box.dataset.open = "true";
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { box!.dataset.open = "false"; }, 2600);
}

/** Links and buttons that would leave Schedule stay where they are. */
export function guardNavigation(): void {
  window.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("#schedule-test-panel, #st-explain")) return;
    const link = target.closest("a[href]");
    if (link) {
      const href = link.getAttribute("href")!;
      const url = new URL(href, window.location.origin);
      if (url.origin === window.location.origin && !allowedLink.test(url.pathname)) {
        event.preventDefault();
        event.stopPropagation();
        const name = (link.getAttribute("aria-label") || link.textContent || "This page").trim().split("\n").pop();
        notice(`${name} is not part of this test page. Only Schedule works here.`);
      }
      return;
    }
    const button = target.closest("button");
    if (button && /^sign out$/i.test(button.textContent?.trim() ?? "")) {
      event.preventDefault();
      event.stopPropagation();
      notice("Sign out is turned off on this test page.");
    }
  }, true);
}

// Where each item lives on the page, in Mert's words.
const where: Record<ItemKey, string> = {
  newSchedule: "Sağ üstte New Schedule düğmesi. Düzenleme hâli için listeden kalem simgesi.",
  export: "Sağ üstte Export düğmesi (yalnız düzenleme dışında).",
  topBar: "En üstteki çubuk. Önce aşağıdaki “Uzun adlarla doldur”a bas.",
  unpublish: "Sağ üstte yeşil Published → Unpublish schedule.",
  defaultHours: "Düzenleme modunda, ızgaranın üstündeki şerit.",
};

const explainers: Record<string, { title: string; body: string }> = {
  defaultHours: {
    title: "“Review default hours” ne işe yarar?",
    body: `
      <p>Her vardiya tipinin bir <b>varsayılan saati</b> var (Settings → Shift types). Bu demoda <b>Close</b> tipi önce <b>18:00–23:30</b>’du; sonra biri onu <b>18:00–23:00</b>’e çekti.</p>
      <svg viewBox="0 0 560 210" role="img" aria-label="Önce ve sonra: tipten saat alan vardiya yeni saate çekilir, elle saat yazılan değişmez">
        <style>.t{font:600 13px Inter,system-ui,sans-serif;fill:#17221e}.s{font:500 12px Inter,system-ui,sans-serif;fill:#66716c}.c{rx:8}</style>
        <text class="s" x="10" y="20">Settings’te Close’un saati değişti</text>
        <rect x="10" y="30" width="230" height="34" class="c" fill="#f0f3f1" stroke="#cbd4d0"/><text class="t" x="24" y="52">Close · <tspan text-decoration="line-through" fill="#8a948f">18:00–23:30</tspan></text>
        <path d="M250 47h46" stroke="#176954" stroke-width="2" marker-end="url(#a)"/>
        <rect x="306" y="30" width="230" height="34" class="c" fill="#e7f1ed" stroke="#176954"/><text class="t" x="320" y="52">Close · 18:00–23:00</text>
        <text class="s" x="10" y="98">Bu haftanın vardiyaları (örnek)</text>
        <rect x="10" y="108" width="230" height="40" class="c" fill="#fff7e2" stroke="#bf872d"/><text class="t" x="24" y="126">Sophie · Close</text><text class="s" x="24" y="141">yalnız tip seçilerek yazıldı · 18:00–23:30</text>
        <path d="M250 128h46" stroke="#176954" stroke-width="2" marker-end="url(#a)"/>
        <rect x="306" y="108" width="230" height="40" class="c" fill="#e7f1ed" stroke="#176954"/><text class="t" x="320" y="126">Sophie · Close</text><text class="s" x="320" y="141">düğmeyle güncellendi · 18:00–23:00</text>
        <rect x="10" y="160" width="230" height="40" class="c" fill="#fff" stroke="#cbd4d0"/><text class="t" x="24" y="178">Grace · Close</text><text class="s" x="24" y="193">saat elle yazıldı · 19:00–23:30</text>
        <path d="M250 180h46" stroke="#cbd4d0" stroke-width="2" stroke-dasharray="4 4"/>
        <rect x="306" y="160" width="230" height="40" class="c" fill="#fff" stroke="#cbd4d0"/><text class="t" x="320" y="178">Grace · Close</text><text class="s" x="320" y="193">dokunulmaz · 19:00–23:30</text>
        <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#176954"/></marker></defs>
      </svg>
      <ol>
        <li>Müdür vardiyayı <b>yalnız tipini seçerek</b> (saat yazmadan) yazınca vardiya o günkü varsayılan saati alır ve “saatimi tipten aldım” diye işaretlenir.</li>
        <li>Varsayılan sonradan değişirse eski vardiyalar <b>kendiliğinden değişmez</b>. Bu bilerek böyle: yayınlanmış program kimse fark etmeden kaymasın.</li>
        <li>Bu düğme, düzenlediğin haftada eski varsayılanla kalmış vardiyaları bulur, önce/sonra saatini ve müsaitlik uyarısını gösterir, seçtiklerini yeni saate çeker.</li>
        <li>Saati elle yazılmış vardiyalara hiç dokunmaz. Değişiklik yalnız açık düzenlemeye girer; çalışanlar sen yayınlayınca görür.</li>
      </ol>
      <p><b>Bugün (Original):</b> düğme düzenleme şeridinde hep duruyor, güncellenecek vardiya olmasa da. Açılan pencere stilsiz (tarayıcının tarih kutuları, ham liste).</p>
      <p><b>1 · Button with a count:</b> düğmenin adı “New default hours”, yanında kaç vardiyanın eski saatte kaldığı yazar; yoksa düğme pasif. Pencere tipe göre gruplu, önce/sonra açık.</p>
      <p><b>2 · Notice above the grid:</b> şeritte düğme yok. Yalnız güncellenecek vardiya varsa ızgaranın üstünde sarı bir uyarı çıkar: “15 shifts still use the old default hours…”. “Not now” ile kapanır.</p>
      <p><b>3 · Per shift type:</b> şeritte “Default hours” düğmesi küçük bir pencere açar: her tip bir satır, eski → yeni saat ve tek tıkla “Update 15”.</p>`,
  },
  export: {
    title: "Export: tartışmak için özellik önerileri",
    body: `
      <p>Bugünkü panelde olanlar: PDF / PNG / Excel, indir ya da yazdır, kâğıt boyu, lokasyonları yan yana, tek uzun sayfa, önizleme. Varyantlar bunları farklı dizer; özellik eklemez. Aşağıdakiler eklenebilecekler:</p>
      <ol>
        <li><b>Her hafta e-postayla gönder</b> (BL-437). Arka taraf hazır, panelde yok. Ama e-posta servisi henüz bağlı değil. <i>Bence: servis bağlanınca.</i></li>
        <li><b>Tek gün</b> çıktısı: günlük duvar listesi. Ucuz. <i>Bence: evet.</i></li>
        <li><b>Görüntüyü panoya kopyala</b>: WhatsApp / grup sohbetine tek tıkla yapıştırmak için. Ucuz. <i>Bence: evet.</i></li>
        <li><b>Neyin dahil olduğunu açıkça yaz</b>: çıktı bugün ızgaradaki süzgeçleri izliyor; panel bunu tek satırla söylemeli (varyantlarda var).</li>
        <li><b>Kişi başı sayfa</b>: her çalışana kendi haftası. Çalışan ekranları gelene kadar işe yarar. <i>Bence: sonra.</i></li>
        <li><b>Siyah-beyaz yazdırma</b>: mürekkep tasarrufu ama bir ayar daha. <i>Bence: hayır.</i></li>
        <li><b>Telefon takvimine ekle (.ics)</b>: çalışan tarafı işi, MVP sonrası.</li>
      </ol>`,
  },
  topBar: {
    title: "Üst çubuk: neden ikinci satıra düşüyor?",
    body: `
      <p>Bugün sol grup (tarih, Settings, Hide Unscheduled, dört süzgeç) satıra sığmayınca <b>alt satıra kayıyor</b>. Uzun lokasyon, çalışan ya da taslak adı seçilince düğmeler büyüyor ve sıçrıyor. 1440 px ekranda, adlar kısayken bile iki satır.</p>
      <p><b>A:</b> sağdaki düğmeler (Export, Templates, New Schedule, Publish) hep ilk satırda, yerinden oynamaz. Yer yetmezse yalnız süzgeçler alt satıra iner. Uzun ad “…” ile biter, tam adı üzerine gelince görünür.</p>
      <p><b>B:</b> hep tek satır. Daralınca önce Settings, Hide Unscheduled, Templates, Export ve hiçbir şey süzmeyen süzgeçler (“All shifts” gibi) yalnız simgeye iner; daha da daralınca bütün süzgeçler (seçili süzgeçte yeşil nokta). Uzun ad “…” ile biter. 2026-10-06’daki “B”nin genişletilmişi.</p>
      <p><b>C:</b> Settings, Hide Unscheduled ve dört süzgeç tek “Filters (1)” düğmesinde. 2026-10-06’daki “C” (o gün önerilen buydu).</p>
      <p><b>D:</b> bilerek iki sabit satır: üstte tarih ve aksiyon düğmeleri, altta süzgeçler. Ad ne kadar uzun olursa olsun düğmeler yer değiştirmez.</p>
      <p>2026-10-06’da “başka bir fikrim var” demiştin; o fikir kayda geçmedi.</p>`,
  },
};

export function openExplainer(key: string): void {
  const content = explainers[key];
  if (!content) return;
  document.getElementById("st-explain")?.remove();
  const layer = document.createElement("div");
  layer.id = "st-explain";
  layer.innerHTML = `
    <button type="button" class="st-explain-backdrop" aria-label="Kapat"></button>
    <section role="dialog" aria-modal="true" aria-labelledby="st-explain-title" lang="tr">
      <header><h2 id="st-explain-title">${content.title}</h2><button type="button" class="st-explain-close" aria-label="Kapat">×</button></header>
      <div class="st-explain-body">${content.body}</div>
    </section>`;
  document.body.append(layer);
  const close = () => layer.remove();
  layer.querySelector<HTMLButtonElement>(".st-explain-backdrop")!.addEventListener("click", close);
  const closeButton = layer.querySelector<HTMLButtonElement>(".st-explain-close")!;
  closeButton.addEventListener("click", close);
  layer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
  });
  closeButton.focus();
}

/** Long location, employee and draft names on the top bar at once (item 7). */
function longNames(): void {
  const navigate = (window as unknown as { __stNavigate?: (to: string) => void }).__stNavigate;
  const location = world.locations.find((item) => item.name.includes("Riverside"));
  const employee = world.employees.find((item) => item.display_name.includes("Montgomery"));
  const draft = world.drafts.find((item) => item.name.startsWith("Halloween"));
  if (!navigate || !location || !employee || !draft) return;
  navigate(`/app/schedule?locations=${location.id}&employees=${employee.id}&draft=${draft.id}`);
  notice("Long names on: one location, one employee and a long draft name.");
}

export function mountPanel(): void {
  window.addEventListener("st-explain", (event) => openExplainer(String((event as CustomEvent).detail)));
  const style = document.createElement("style");
  style.textContent = `
    #schedule-test-notice { position: fixed; left: 50%; top: 14px; transform: translate(-50%, -8px); z-index: 2147483000;
      background: #111827; color: #fff; font: 600 13px/1.35 Inter, system-ui, sans-serif; padding: 10px 14px; border-radius: 8px;
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.18); opacity: 0; pointer-events: none; transition: opacity .15s, transform .15s; max-width: calc(100vw - 32px); }
    #schedule-test-notice[data-open="true"] { opacity: 1; transform: translate(-50%, 0); }
    #schedule-test-panel { position: fixed; right: 12px; bottom: 12px; z-index: 2147482999; font: 500 12px/1.3 Inter, system-ui, sans-serif; }
    #schedule-test-panel > button { border: 1px solid #d1d5db; background: #fff; color: #111827; border-radius: 999px; padding: 7px 14px;
      font: inherit; font-weight: 700; cursor: pointer; box-shadow: 0 2px 8px rgb(0 0 0 / 0.12); }
    #schedule-test-panel > button[aria-expanded="true"] { background: #111827; color: #fff; }
    #schedule-test-panel :is(button, input):focus-visible { outline: 2px solid #047857; outline-offset: 2px; }
    #schedule-test-panel .st-menu { position: absolute; right: 0; bottom: calc(100% + 8px); width: 300px; max-height: calc(100vh - 80px); overflow-y: auto;
      background: #fff; color: #111827; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; box-shadow: 0 12px 32px rgb(0 0 0 / 0.16); display: grid; gap: 10px; }
    #schedule-test-panel .st-menu[hidden] { display: none; }
    #schedule-test-panel .st-menu > p { margin: 0; color: #4b5563; font-weight: 500; line-height: 1.4; }
    #schedule-test-panel .st-menu > strong { font-size: 13px; }
    #schedule-test-panel fieldset { display: grid; gap: 1px; margin: 0; padding: 8px 0 6px; border: 0; border-top: 1px solid #e5e7eb; }
    #schedule-test-panel legend { float: left; width: 100%; padding: 0 0 4px; font-size: 11px; font-weight: 750; color: #374151; text-transform: uppercase; letter-spacing: .03em; }
    #schedule-test-panel fieldset small { display: block; margin: 0 0 4px; color: #6b7280; font-size: 11px; line-height: 1.35; }
    #schedule-test-panel label { display: flex; align-items: center; gap: 8px; min-height: 26px; padding: 0 4px; border-radius: 5px; cursor: pointer; font-weight: 600; }
    #schedule-test-panel label:hover { background: #f3f4f6; }
    #schedule-test-panel label:has(input:checked) { background: #ecfdf5; color: #065f46; }
    #schedule-test-panel input { accent-color: #176954; margin: 0; }
    #schedule-test-panel .st-row { display: flex; gap: 6px; flex-wrap: wrap; }
    #schedule-test-panel .st-row button, #schedule-test-panel .st-info { border: 1px solid #d1d5db; background: #fff; color: #111827; border-radius: 6px; padding: 6px 9px; font: inherit; font-weight: 650; cursor: pointer; }
    #schedule-test-panel .st-info { justify-self: start; margin-top: 4px; border-color: #a7d3c2; color: #176954; }
    #schedule-test-panel button[data-action="reset"] { border-color: #b91c1c; color: #b91c1c; }
    #schedule-test-panel button[data-action="reset"][data-armed="true"] { background: #b91c1c; color: #fff; }
    #st-explain { position: fixed; inset: 0; z-index: 2147483001; display: grid; place-items: center; padding: 16px; font: 14px/1.55 Inter, system-ui, sans-serif; color: #17221e; }
    #st-explain .st-explain-backdrop { position: fixed; inset: 0; border: 0; background: rgb(15 23 42 / .45); cursor: default; }
    #st-explain section { position: relative; width: min(640px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; border-radius: 12px; background: #fff; box-shadow: 0 24px 60px -12px rgb(0 0 0 / .4); }
    #st-explain header { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px 10px; background: #fff; border-bottom: 1px solid #e5e7eb; }
    #st-explain h2 { margin: 0; font-size: 17px; }
    #st-explain .st-explain-close { width: 32px; height: 32px; border: 0; border-radius: 6px; background: #f3f4f6; font-size: 20px; cursor: pointer; }
    #st-explain .st-explain-body { padding: 12px 20px 20px; }
    #st-explain .st-explain-body p { margin: 0 0 10px; }
    #st-explain .st-explain-body ol { margin: 0 0 12px; padding-left: 20px; display: grid; gap: 6px; }
    #st-explain svg { display: block; width: 100%; height: auto; margin: 6px 0 14px; }
  `;
  document.head.append(style);
  const keys = Object.keys(items) as ItemKey[];
  const panel = document.createElement("div");
  panel.id = "schedule-test-panel";
  panel.innerHTML = `
    <div class="st-menu" hidden role="dialog" aria-label="Test page" lang="tr">
      <strong>Test page</strong>
      <p>Gerçek Schedule kodu, demo verisi. Her madde için “Original (main)” bugünkü hâli; öbürleri varyant. Değişiklikler yalnız bu tarayıcıda kalır.</p>
      ${keys.map((key) => `
      <fieldset>
        <legend>${items[key].title}</legend>
        <small>${where[key]}</small>
        ${Object.entries(items[key].options).map(([value, label]) => `
        <label><input type="radio" name="st-${key}" value="${value}" ${getChoice(key) === value ? "checked" : ""}> ${label}</label>`).join("")}
        ${explainers[key] ? `<button type="button" class="st-info" data-explain="${key}">${key === "export" ? "Özellik önerileri" : key === "topBar" ? "Ne değişiyor?" : "Ne işe yarar?"}</button>` : ""}
      </fieldset>`).join("")}
      <div class="st-row">
        <button type="button" data-action="long">Uzun adlarla doldur</button>
        <button type="button" data-action="reset">Reset demo data</button>
      </div>
    </div>
    <button type="button" aria-expanded="false">Test page</button>`;
  document.body.append(panel);
  const toggle = panel.querySelector<HTMLButtonElement>(":scope > button")!;
  const menu = panel.querySelector<HTMLElement>(".st-menu")!;
  const reset = panel.querySelector<HTMLButtonElement>("[data-action=reset]")!;
  for (const key of keys) {
    panel.querySelectorAll<HTMLInputElement>(`input[name=st-${key}]`).forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked) return;
        setChoice(key, input.value);
        notice(`${items[key].title}: ${(items[key].options as Record<string, string>)[input.value]}`);
      });
    });
  }
  panel.querySelectorAll<HTMLButtonElement>("[data-explain]").forEach((button) => {
    button.addEventListener("click", () => openExplainer(button.dataset.explain!));
  });
  panel.querySelector<HTMLButtonElement>("[data-action=long]")!.addEventListener("click", longNames);
  const close = () => { menu.hidden = true; toggle.setAttribute("aria-expanded", "false"); reset.dataset.armed = "false"; reset.textContent = "Reset demo data"; };
  toggle.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (!open) close();
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) { event.stopPropagation(); close(); toggle.focus(); }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.hidden && !panel.contains(event.target as Node) && !(event.target as Element).closest?.("#st-explain")) close();
  });
  // Two clicks, like every destructive action in the app.
  reset.addEventListener("click", () => {
    if (reset.dataset.armed !== "true") {
      reset.dataset.armed = "true";
      reset.textContent = "Click again to reset";
      return;
    }
    resetWorld();
    window.location.reload();
  });
}
