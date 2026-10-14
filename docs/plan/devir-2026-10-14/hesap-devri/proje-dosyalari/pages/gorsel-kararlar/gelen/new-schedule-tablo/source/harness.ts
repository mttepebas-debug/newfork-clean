// The test page's own controls: the corner "Test page" menu (which version of
// each item to show, a long-names scenario, reset), short explanations in
// Turkish for Mert, and a notice when something would leave Schedule.
import { resetWorld } from "./mock/world";
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
  newSchedule: "Sağ üstte New Schedule düğmesi. A ve B'de Export ve Templates düğmeleri üst çubuktan kalkar; ikisi de bu pencerenin içinde.",
};

const explainers: Record<string, { title: string; body: string }> = {
  newSchedule: {
    title: "New Schedule penceresi: ne değişiyor?",
    body: `
      <p><b>Bugün (Original):</b> üst çubukta üç ayrı düğme ve üç ayrı pencere var: New Schedule (taslak listesi), Export (yandan açılan panel) ve Templates (ortada açılan pencere).</p>
      <p><b>A ve B:</b> üçü tek pencerede, geniş bir tabloda toplanır. Tabloda bu haftanın yayındaki programı ve taslakları satır satır durur: vardiya, saat, açık vardiya sayısı ve son değişiklik. Üst çubukta yalnız New Schedule ve Publish kalır.</p>
      <p><b>A · Satır menüsü:</b> her satırın sonunda kalem (düzenle) ve ⋯ menüsü: Export, Save as template, Unpublish ya da Delete. Tablonun altında kayıtlı şablonlar (şablon satırları B ile aynı çalışır, aşağıya bak). Bir akış seçilince pencere o adıma geçer, “Back” ile tabloya döner.</p>
      <p><b>B · Sekmeler:</b> aynı pencerede üç sekme: Schedules, Templates, Export. Schedules ve Templates sekmeleri aynı boyutta ve aynı kompakt satırlarla (Mert'in 17:00 isteği): Schedules'ta her satırda ad, altında durum ve son değişiklik, sonra vardiya ve saat sayısı; Open sütunu yok. Templates sekmesi şablon kaydetme, uygulama, ad değiştirme ve silmenin hepsini taşır; sağ üstteki “Save template” bir taslağı şablon yapar. Export sekmesinde önce hangi program dışa aktarılacak seçilir.</p>
      <p><b>Şablon satırları (A ve B, Mert'in 15:57 onayı):</b> satıra basınca şablon bu haftanın ızgarasında önizleme olarak açılır; altta “Template preview” şeridi çıkar, hiçbir şey kaydedilmez. Kalem şablonu düzenleme modunda açar; Publish yerine “Save template” gelir, Discard aynı kalır. “Use” düzenleme dışındayken önce “Which schedule should it go into?” diye sorar (yayındaki program, bir taslak ya da yeni boş taslak); seçilen program düzenlemede açılır ve pencere “Add” / “Replace” adımıyla geri gelir.</p>
      <p><b>Bilinmesi gereken:</b></p>
      <ol>
        <li>Bir programı dışa aktarınca ızgara da o programı gösterir. Export her zaman ekranda görüneni çıkarır; bu, yanlış programı göndermeyi önler.</li>
        <li>Şablon yalnız düzenlenen haftaya uygulanır. Add mevcut vardiyaları korur; Replace önce şablonun kapsadığı, başlamamış vardiyaları siler ve kaç tane olduğunu önceden söyler.</li>
        <li>Şablon önizlemesinde açık vardiyalar görünmez (main'de her programda böyle: Unassigned satırı yalnız düzenlemede çıkar); şerit kaç açık vardiya olduğunu söyler.</li>
        <li>Düzenleme sırasında Export bugünkü gibi önce kaydetmeyi ister.</li>
        <li>Tablodaki sayılar (vardiya, saat, açık) için gerçek API'de uç yok; gerçek koda geçerken küçük bir arka uç işi gerekir.</li>
        <li>Şablonu ızgarada açmak ve düzenleyip kaydetmek de gerçek API'de yok (bu sayfada taklit veriyle çalışır); gerçek koda geçerken veritabanı ve API işi gerekir.</li>
      </ol>`,
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
      <p>Gerçek Schedule kodu, demo verisi. “Original (main)” bugünkü hâli; A ve B varyant. Değişiklikler yalnız bu tarayıcıda kalır.</p>
      ${keys.map((key) => `
      <fieldset>
        <legend lang="en">${items[key].title}</legend>
        <small>${where[key]}</small>
        ${Object.entries(items[key].options).map(([value, label]) => `
        <label><input type="radio" name="st-${key}" value="${value}" ${getChoice(key) === value ? "checked" : ""}> ${label}</label>`).join("")}
        ${explainers[key] ? `<button type="button" class="st-info" data-explain="${key}">Ne değişiyor?</button>` : ""}
      </fieldset>`).join("")}
      <div class="st-row">
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
