// The test page's own controls: a small corner button with "reset demo data",
// and a notice when something would leave the Schedule page.
import { resetWorld } from "./mock/world";
import { getVariant, items, setVariant, type ItemKey, type VariantKey } from "./variants/store";

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
    if (!target || target.closest("#schedule-test-panel")) return;
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

export function mountPanel(): void {
  const style = document.createElement("style");
  style.textContent = `
    #schedule-test-notice { position: fixed; left: 50%; top: 14px; transform: translate(-50%, -8px); z-index: 2147483000;
      background: #111827; color: #fff; font: 600 13px/1.35 Inter, system-ui, sans-serif; padding: 10px 14px; border-radius: 8px;
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.18); opacity: 0; pointer-events: none; transition: opacity .15s, transform .15s; max-width: calc(100vw - 32px); }
    #schedule-test-notice[data-open="true"] { opacity: 1; transform: translate(-50%, 0); }
    #schedule-test-panel { position: fixed; right: 12px; bottom: 12px; z-index: 2147482999; font: 500 12px/1.3 Inter, system-ui, sans-serif; }
    #schedule-test-panel > button { border: 1px solid #d1d5db; background: #fff; color: #111827; border-radius: 999px; padding: 6px 12px;
      font: inherit; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgb(0 0 0 / 0.08); }
    #schedule-test-panel > button:focus-visible, #schedule-test-panel .st-menu button:focus-visible { outline: 2px solid #047857; outline-offset: 2px; }
    #schedule-test-panel .st-menu { position: absolute; right: 0; bottom: calc(100% + 8px); width: 300px; max-height: calc(100vh - 80px); overflow: auto; background: #fff; color: #111827;
      border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; box-shadow: 0 12px 32px rgb(0 0 0 / 0.14); display: grid; gap: 10px; }
    #schedule-test-panel .st-menu[hidden] { display: none; }
    #schedule-test-panel .st-menu p { margin: 0; color: #4b5563; font-weight: 500; }
    #schedule-test-panel .st-menu strong { font-size: 13px; }
    #schedule-test-panel .st-menu button { border: 1px solid #b91c1c; background: #fff; color: #b91c1c; border-radius: 6px; padding: 7px 10px;
      font: inherit; font-weight: 600; cursor: pointer; }
    #schedule-test-panel .st-menu button[data-armed="true"] { background: #b91c1c; color: #fff; }
    #schedule-test-panel .st-variants { display: grid; gap: 2px; margin: 0; padding: 8px 0 0; border: 0; border-top: 1px solid #e5e7eb; }
    #schedule-test-panel .st-variants legend { padding: 0 0 4px; font-size: 11px; font-weight: 700; color: #4b5563; letter-spacing: .01em; }
    #schedule-test-panel .st-variants label { display: flex; align-items: center; gap: 8px; min-height: 26px; cursor: pointer; font-weight: 600; }
    #schedule-test-panel .st-variants input { accent-color: #176954; margin: 0; }
  `;
  document.head.append(style);
  const panel = document.createElement("div");
  panel.id = "schedule-test-panel";
  panel.innerHTML = `
    <div class="st-menu" hidden role="dialog" aria-label="Test page">
      <strong>Test page</strong>
      <p>Real Schedule code with demo data. Changes stay in this browser only.</p>
      ${(Object.keys(items) as ItemKey[]).map((item) => `
      <fieldset class="st-variants">
        <legend>${items[item].title}</legend>
        ${(Object.keys(items[item].options) as VariantKey[]).map((key) => `
        <label><input type="radio" name="st-${item}" value="${key}" ${getVariant(item) === key ? "checked" : ""}> ${items[item].options[key]}</label>`).join("")}
      </fieldset>`).join("")}
      <button type="button" data-action="reset">Reset demo data</button>
    </div>
    <button type="button" aria-expanded="false">Test page</button>`;
  document.body.append(panel);
  const toggle = panel.querySelector<HTMLButtonElement>(":scope > button")!;
  const menu = panel.querySelector<HTMLElement>(".st-menu")!;
  const reset = panel.querySelector<HTMLButtonElement>("[data-action=reset]")!;
  panel.querySelectorAll<HTMLInputElement>(".st-variants input").forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      const item = input.name.slice(3) as ItemKey;
      setVariant(item, input.value as VariantKey);
      notice(`${items[item].title.split(" · ")[0]}: ${items[item].options[input.value as VariantKey]}`);
    });
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
    if (!menu.hidden && !panel.contains(event.target as Node)) close();
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
