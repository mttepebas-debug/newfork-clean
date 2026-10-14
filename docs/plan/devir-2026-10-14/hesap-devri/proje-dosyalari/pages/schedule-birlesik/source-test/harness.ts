// The test page's own controls: a small corner button with "reset demo data",
// and a notice when something would leave the Schedule page.
import { resetWorld } from "./mock/world";
import { getVariant, setVariant, variantNames, type TemplatesVariant } from "./templates/store";
import { getTimeOffRule, setTimeOffRule, timeOffRuleNames, type TimeOffRule } from "./time-off-rule";

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

// Oct 6 round (older Code session, archive/var-ekran-12, C-D11 / #87): a
// one-location week at 1440 showed 5 of 7 days. B squeezes the seven days into
// the width; C opens Schedule with the menu folded to its rail.
type WeekVariant = "original" | "b" | "c";
const weekNames: Record<WeekVariant, string> = {
  original: "Original · today's app",
  b: "Oct 6 · B: seven days share the width",
  c: "Oct 6 · C: the menu starts folded",
};
const WEEK_KEY = "newfork.scheduleMerged.oneLocationWeek";
function getWeek(): WeekVariant {
  try {
    const saved = window.localStorage.getItem(WEEK_KEY);
    return saved === "b" || saved === "c" ? saved : "original";
  } catch {
    return "original";
  }
}
function setWeek(next: WeekVariant): void {
  try { window.localStorage.setItem(WEEK_KEY, next); } catch { /* the choice lasts until reload */ }
  applyWeek();
}
function applyWeek(): void {
  const week = getWeek();
  if (week === "b") document.documentElement.dataset.varCd11 = "b";
  else delete document.documentElement.dataset.varCd11;
  if (week !== "c") return;
  // Fold the menu once the shell is there, the way the Oct 6 variant opened.
  let tries = 0;
  const fold = () => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Collapse menu"]');
    if (button) button.click();
    else if (tries++ < 40) window.setTimeout(fold, 150);
  };
  fold();
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
    #schedule-test-panel .st-variants { display: grid; gap: 4px; margin: 0; padding: 8px 0; border: 0; border-top: 1px solid #e5e7eb; }
    #schedule-test-panel .st-variants + button { margin-top: 0; }
    #schedule-test-panel .st-variants legend { padding: 0 0 4px; font-size: 11px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: .03em; }
    #schedule-test-panel .st-variants label { display: flex; align-items: center; gap: 8px; min-height: 28px; cursor: pointer; font-weight: 600; }
    #schedule-test-panel .st-variants input { accent-color: #176954; margin: 0; }
  `;
  style.textContent += `
    :root[data-var-cd11="b"] .schedule-grid-exact[data-schedule-column-count="7"] { width: 100% !important; grid-template-columns: 200px repeat(7, minmax(0, 1fr)) !important; }
    :root[data-var-cd11="b"] .schedule-grid-exact[data-schedule-column-count="7"] .schedule-shift-badge { min-width: 0; }
  `;
  document.head.append(style);
  const panel = document.createElement("div");
  panel.id = "schedule-test-panel";
  panel.innerHTML = `
    <div class="st-menu" hidden role="dialog" aria-label="Test page">
      <strong>Test page</strong>
      <p>Real Schedule code with demo data. Changes stay in this browser only.</p>
      <fieldset class="st-variants">
        <legend>Templates window</legend>
        <p>Today's window. A, B and C were turned down on Oct 9.</p>
      </fieldset>
      <fieldset class="st-variants">
        <legend>Time off rule</legend>
        ${(Object.keys(timeOffRuleNames) as TimeOffRule[]).map((key) => `
        <label><input type="radio" name="st-time-off" value="${key}" ${getTimeOffRule() === key ? "checked" : ""}> ${timeOffRuleNames[key]}</label>`).join("")}
      </fieldset>
      <fieldset class="st-variants">
        <legend>One-location week (Oct 6, #87)</legend>
        ${(Object.keys(weekNames) as WeekVariant[]).map((key) => `
        <label><input type="radio" name="st-week" value="${key}" ${getWeek() === key ? "checked" : ""}> ${weekNames[key]}</label>`).join("")}
      </fieldset>
      <button type="button" data-action="reset">Reset demo data</button>
    </div>
    <button type="button" aria-expanded="false">Test page</button>`;
  document.body.append(panel);
  const toggle = panel.querySelector<HTMLButtonElement>(":scope > button")!;
  const menu = panel.querySelector<HTMLElement>(".st-menu")!;
  const reset = panel.querySelector<HTMLButtonElement>("[data-action=reset]")!;
  panel.querySelectorAll<HTMLInputElement>("input[name=st-variant]").forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      setVariant(input.value as TemplatesVariant);
      notice(`Templates window: ${variantNames[input.value as TemplatesVariant]}. Open Templates to see it.`);
    });
  });
  panel.querySelectorAll<HTMLInputElement>("input[name=st-time-off]").forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      setTimeOffRule(input.value as TimeOffRule);
      notice(input.value === "strict"
        ? "New rule: a day fully covered by approved time off can't get a shift. Try Maria Lopez on Wednesday."
        : "Original: the time off cell still opens the shift window; saving an overlapping shift is refused.");
    });
  });
  panel.querySelectorAll<HTMLInputElement>("input[name=st-week]").forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      setWeek(input.value as WeekVariant);
      notice(input.value === "original" ? "Original: today's grid." : "Pick one location in the locations filter to see the whole week.");
    });
  });
  applyWeek();
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
