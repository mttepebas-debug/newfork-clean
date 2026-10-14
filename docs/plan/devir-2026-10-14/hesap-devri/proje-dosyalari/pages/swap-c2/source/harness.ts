// The atlas page's own controls: a small corner button that says which page
// this is and what main commit it was built from, switches the viewer's role
// and resets the demo data; plus a notice when something would leave the page.
import { atlasPages, belongs, currentPage, type Role } from "./pages";
import { setViewerRole, viewerRole } from "./mock/viewer";
import { resetWorld } from "./mock/world";

declare const __ATLAS_SHA__: string;
declare const __ATLAS_LABEL__: string;
declare const __ATLAS_BUILT__: string;

const roleNames: Record<Role, string> = {
  owner: "Owner · Mert Tepebas",
  manager: "Manager · Rachel Adams (Downtown)",
  employee: "Employee · Maria Lopez (Server)",
};

let noticeTimer = 0;
export function notice(text: string): void {
  let box = document.getElementById("atlas-notice");
  if (!box) {
    box = document.createElement("div");
    box.id = "atlas-notice";
    box.setAttribute("role", "status");
    document.body.append(box);
  }
  box.textContent = text;
  box.dataset.open = "true";
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { box!.dataset.open = "false"; }, 3200);
}

/** The words for a link that leaves this atlas page: where that page lives. */
export function leaveNotice(path: string): string {
  const home = atlasPages.find((page) => page.id !== currentPage().id && belongs(page, path));
  if (path.startsWith("/app/schedule") && !path.startsWith("/app/schedule/requests")) {
    return "Schedule has its own test page (Schedule test page).";
  }
  return home
    ? `That screen is on its own atlas page: "${home.title}".`
    : "That screen is not on this atlas page.";
}

/** Links and buttons that would leave the page stay where they are. */
export function guardNavigation(): void {
  window.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("#atlas-panel")) return;
    const link = target.closest("a[href]");
    if (link) {
      const href = link.getAttribute("href")!;
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) {
        event.preventDefault();
        notice("Links outside the app are turned off on the atlas.");
        return;
      }
      if (!belongs(currentPage(), url.pathname)) {
        event.preventDefault();
        event.stopPropagation();
        notice(leaveNotice(url.pathname));
      }
      return;
    }
    const button = target.closest("button");
    if (button && /^sign out$/i.test(button.textContent?.trim() ?? "")) {
      event.preventDefault();
      event.stopPropagation();
      notice("Sign out is turned off on the atlas.");
    }
  }, true);
}

export function mountPanel(): void {
  const page = currentPage();
  const style = document.createElement("style");
  style.textContent = `
    #atlas-notice { position: fixed; left: 50%; bottom: 18px; transform: translate(-50%, 8px); z-index: 2147483000;
      background: #111827; color: #fff; font: 600 13px/1.35 Inter, system-ui, sans-serif; padding: 10px 14px; border-radius: 8px;
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.18); opacity: 0; pointer-events: none; transition: opacity .15s, transform .15s; max-width: calc(100vw - 32px); }
    #atlas-notice[data-open="true"] { opacity: 1; transform: translate(-50%, 0); }
    #atlas-panel { position: fixed; left: 50%; top: 0; transform: translateX(-50%); z-index: 2147482999; font: 500 12px/1.3 Inter, system-ui, sans-serif; }
    #atlas-panel > button { border: 1px solid #d1d5db; border-top: 0; background: #fff; color: #111827; border-radius: 0 0 8px 8px; padding: 3px 12px 4px;
      font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgb(0 0 0 / 0.08); opacity: .92; }
    #atlas-panel > button:hover { opacity: 1; }
    #atlas-panel button:focus-visible, #atlas-panel input:focus-visible { outline: 2px solid #047857; outline-offset: 2px; }
    #atlas-panel .at-menu { position: absolute; left: 50%; transform: translateX(-50%); top: calc(100% + 6px); width: 290px; background: #fff; color: #111827;
      border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; box-shadow: 0 12px 32px rgb(0 0 0 / 0.14); display: grid; gap: 10px; }
    #atlas-panel .at-menu[hidden] { display: none; }
    #atlas-panel .at-menu p { margin: 0; color: #4b5563; font-weight: 500; }
    #atlas-panel .at-menu strong { font-size: 13px; }
    #atlas-panel .at-reset { border: 1px solid #b91c1c; background: #fff; color: #b91c1c; border-radius: 6px; padding: 7px 10px;
      font: inherit; font-weight: 600; cursor: pointer; }
    #atlas-panel .at-reset[data-armed="true"] { background: #b91c1c; color: #fff; }
    #atlas-panel fieldset { display: grid; gap: 4px; margin: 0; padding: 8px 0; border: 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
    #atlas-panel legend { padding: 0 0 4px; font-size: 11px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: .03em; }
    #atlas-panel label { display: flex; align-items: center; gap: 8px; min-height: 28px; cursor: pointer; font-weight: 600; }
    #atlas-panel input { accent-color: #176954; margin: 0; }
    #atlas-panel .at-build { font-size: 11px; color: #6b7280; }
  `;
  document.head.append(style);
  const panel = document.createElement("div");
  panel.id = "atlas-panel";
  const roles = page.roles.length > 1 ? `
      <fieldset>
        <legend>Signed in as</legend>
        ${page.roles.map((role) => `
        <label><input type="radio" name="at-role" value="${role}" ${viewerRole === role ? "checked" : ""}> ${roleNames[role]}</label>`).join("")}
      </fieldset>` : "";
  panel.innerHTML = `
    <div class="at-menu" hidden role="dialog" aria-label="Page atlas">
      <strong>Page atlas · ${page.title}</strong>
      <p>Real app code with demo data (Harbor &amp; Vine). Changes stay in this browser only.</p>
      ${roles}
      <button type="button" class="at-reset">Reset demo data</button>
      <span class="at-build">Built from ${__ATLAS_SHA__} · ${__ATLAS_BUILT__}</span>
    </div>
    <button type="button" aria-expanded="false">${__ATLAS_LABEL__} · ${page.title}</button>`;
  document.body.append(panel);
  const toggle = panel.querySelector<HTMLButtonElement>(":scope > button")!;
  const menu = panel.querySelector<HTMLElement>(".at-menu")!;
  const reset = panel.querySelector<HTMLButtonElement>(".at-reset")!;
  panel.querySelectorAll<HTMLInputElement>("input[name=at-role]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) setViewerRole(input.value as Role);
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
