// The test page's own controls: a small corner button with "reset demo data",
// and a notice when something would leave the Schedule page.
import { resetWorld } from "./mock/world";
import { getPick, items, setPick, type ItemKey } from "./vk/store";

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

function pillLabel(_item: ItemKey, key: string): string {
  return key === "original" ? "Original" : key.toUpperCase();
}

function pillGroups(item: ItemKey): [string, string[]][] {
  return [["", Object.keys(items[item].options)]];
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
    #schedule-test-panel .st-menu { position: absolute; right: 0; bottom: calc(100% + 8px); width: 260px; background: #fff; color: #111827;
      border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; box-shadow: 0 12px 32px rgb(0 0 0 / 0.14); display: grid; gap: 10px; }
    #schedule-test-panel .st-menu[hidden] { display: none; }
    #schedule-test-panel .st-menu p { margin: 0; color: #4b5563; font-weight: 500; }
    #schedule-test-panel .st-menu strong { font-size: 13px; }
    #schedule-test-panel .st-menu button { border: 1px solid #b91c1c; background: #fff; color: #b91c1c; border-radius: 6px; padding: 7px 10px;
      font: inherit; font-weight: 600; cursor: pointer; }
    #schedule-test-panel .st-menu button[data-armed="true"] { background: #b91c1c; color: #fff; }
    #schedule-test-panel .st-variants { display: grid; gap: 4px; margin: 0; padding: 8px 0; border: 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
    #schedule-test-panel .st-variants legend { padding: 0 0 4px; font-size: 11px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: .03em; }
    #schedule-test-panel .st-variants label { display: flex; align-items: center; gap: 8px; min-height: 28px; cursor: pointer; font-weight: 600; }
    #schedule-test-panel .st-menu { width: 330px; max-height: calc(100vh - 80px); overflow: auto; }
    #schedule-test-panel .st-variants .st-hint { font-size: 11.5px; margin: 0 0 6px; }
    #schedule-test-panel .st-pills { display: flex; flex-wrap: wrap; gap: 4px; }
    #schedule-test-panel .st-group { margin: 6px 0 3px !important; font-size: 11px; font-weight: 700 !important; color: #4b5563; }
    #schedule-test-panel .st-menu button.st-pill { border: 1px solid #d1d5db; color: #111827; background: #fff; min-width: 30px; padding: 5px 8px; border-radius: 6px; }
    #schedule-test-panel .st-menu button.st-pill[aria-pressed="true"] { background: #176b4e; border-color: #176b4e; color: #fff; }
    #schedule-test-panel .st-current { margin: 6px 0 0 !important; color: #111827 !important; font-weight: 600 !important; }
    #schedule-test-panel .st-motion { font-size: 11.5px; color: #8a5a00 !important; }
  `;
  document.head.append(style);
  const panel = document.createElement("div");
  panel.id = "schedule-test-panel";
  panel.innerHTML = `
    <div class="st-menu" hidden role="dialog" aria-label="Test page">
      <strong>Test page</strong>
      <p>Real Schedule code with demo data. Changes stay in this browser only.</p>
      ${(Object.keys(items) as ItemKey[]).map((item) => `
      <fieldset class="st-variants" data-item="${item}">
        <legend>${items[item].title}</legend>
        <p class="st-hint">${items[item].hint}</p>
        ${pillGroups(item).map(([heading, keys]) => `
        ${heading ? `<p class="st-group">${heading}</p>` : ""}
        <div class="st-pills">
          ${keys.map((key) => `
          <button type="button" class="st-pill" data-item="${item}" data-key="${key}" aria-pressed="${getPick(item) === key}"
            title="${(items[item].options as Record<string, string>)[key]}">${pillLabel(item, key)}</button>`).join("")}
        </div>`).join("")}
        <p class="st-current" data-current="${item}">${(items[item].options as Record<string, string>)[getPick(item)]}</p>
      </fieldset>`).join("")}
            <button type="button" data-action="reset">Reset demo data</button>
    </div>
    <button type="button" aria-expanded="false">Test page</button>`;
  document.body.append(panel);
  const toggle = panel.querySelector<HTMLButtonElement>(":scope > button")!;
  const menu = panel.querySelector<HTMLElement>(".st-menu")!;
  const reset = panel.querySelector<HTMLButtonElement>("[data-action=reset]")!;
  panel.querySelectorAll<HTMLButtonElement>(".st-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const item = pill.dataset.item as ItemKey;
      setPick(item, pill.dataset.key as never);
      panel.querySelectorAll<HTMLButtonElement>(`.st-pill[data-item="${item}"]`).forEach((other) =>
        other.setAttribute("aria-pressed", String(other === pill)));
      panel.querySelector(`[data-current="${item}"]`)!.textContent = pill.title;
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
