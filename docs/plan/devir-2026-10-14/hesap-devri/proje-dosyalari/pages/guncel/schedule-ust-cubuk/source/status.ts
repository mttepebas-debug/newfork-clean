// Page status strip (2026-10-09 gece işi): one short strip above the app that
// says what Mert decided on this page and what is still open. Turkish, because
// it explains the page; the app below stays English. The app is light-only, so
// the strip is too. The app shell is 100dvh tall; it shrinks by the strip's
// height so the Schedule grid still ends at the bottom of the window.

export type StatusKind = "done" | "half" | "open";

export interface StatusConfig {
  readonly kind: StatusKind;
  /** One sentence: what this page is now. */
  readonly heading: string;
  /** Decided items, one line each (HTML allowed: <b>, <code>). */
  readonly decided: readonly string[];
  /** Open questions, one line each. */
  readonly pending: readonly string[];
}

const KIND_LABEL: Record<StatusKind, string> = {
  done: "Karar verildi",
  half: "Yarı karar",
  open: "Karar bekliyor",
};

const KEY = "newfork.pageStatus.collapsed";

export function mountStatus(config: StatusConfig): void {
  const style = document.createElement("style");
  style.textContent = `
    #nf-status { --nf-ink: #17221e; --nf-muted: #4b5a54; --nf-line: #dce3df; --nf-done: #176954; --nf-done-soft: #dbece5;
      --nf-half: #8a5a00; --nf-half-soft: #fff4d6; --nf-open: #9b2c1f; --nf-open-soft: #fdecea;
      position: relative; z-index: 50; box-sizing: border-box; display: grid; gap: 6px; padding: 8px 16px 9px;
      border-bottom: 1px solid var(--nf-line); background: #fbfcfb; color: var(--nf-ink);
      font: 500 12.5px/1.45 Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
    #nf-status * { box-sizing: border-box; }
    #nf-status .nf-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }
    #nf-status .nf-pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border-radius: 999px;
      font-size: 11px; font-weight: 700; letter-spacing: .02em; white-space: nowrap; }
    #nf-status .nf-pill::before { content: ""; width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
    #nf-status[data-kind="done"] .nf-pill { background: var(--nf-done-soft); color: var(--nf-done); }
    #nf-status[data-kind="half"] .nf-pill { background: var(--nf-half-soft); color: var(--nf-half); }
    #nf-status[data-kind="open"] .nf-pill { background: var(--nf-open-soft); color: var(--nf-open); }
    #nf-status .nf-heading { flex: 1 1 260px; min-width: 0; font-weight: 650; font-size: 13px; }
    #nf-status .nf-toggle { border: 1px solid var(--nf-line); background: #fff; color: var(--nf-ink); border-radius: 6px;
      padding: 3px 10px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
    #nf-status .nf-toggle:focus-visible { outline: 2px solid #177a64; outline-offset: 2px; }
    #nf-status .nf-body { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 4px 24px; }
    #nf-status[data-collapsed="true"] .nf-body { display: none; }
    #nf-status h2 { margin: 0 0 2px; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--nf-muted); }
    #nf-status ul { margin: 0; padding-left: 16px; display: grid; gap: 2px; }
    #nf-status li { min-width: 0; overflow-wrap: anywhere; }
    #nf-status li b { font-weight: 700; }
    #nf-status code { font: 500 11.5px/1.3 ui-monospace, Menlo, Consolas, monospace; }
    #nf-status .nf-pending li::marker { color: var(--nf-open); }
    #nf-status .nf-decided li::marker { color: var(--nf-done); }
    html.nf-has-status .app-shell { height: calc(100dvh - var(--nf-status-h, 0px)); }
  `;
  document.head.append(style);

  const strip = document.createElement("section");
  strip.id = "nf-status";
  strip.dataset.kind = config.kind;
  strip.setAttribute("aria-label", "Karar durumu");
  let collapsed = false;
  try {
    collapsed = window.localStorage.getItem(KEY) === "true";
  } catch {
    // Storage blocked: start open.
  }
  strip.dataset.collapsed = String(collapsed);
  const list = (items: readonly string[]) => `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
  strip.innerHTML = `
    <div class="nf-row">
      <span class="nf-pill">${KIND_LABEL[config.kind]}</span>
      <span class="nf-heading">${config.heading}</span>
      <button type="button" class="nf-toggle" aria-expanded="${!collapsed}" aria-controls="nf-status-body">${collapsed ? "Ayrıntı" : "Gizle"}</button>
    </div>
    <div class="nf-body" id="nf-status-body">
      ${config.decided.length ? `<div class="nf-decided"><h2>Karar verilen</h2>${list(config.decided)}</div>` : ""}
      ${config.pending.length ? `<div class="nf-pending"><h2>Bekleyen sorular</h2>${list(config.pending)}</div>` : ""}
    </div>`;
  const root = document.getElementById("root");
  document.body.insertBefore(strip, root);
  document.documentElement.classList.add("nf-has-status");

  const toggle = strip.querySelector<HTMLButtonElement>(".nf-toggle")!;
  toggle.addEventListener("click", () => {
    collapsed = !collapsed;
    strip.dataset.collapsed = String(collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.textContent = collapsed ? "Ayrıntı" : "Gizle";
    try {
      window.localStorage.setItem(KEY, String(collapsed));
    } catch {
      // Storage blocked: the choice lasts for this tab.
    }
  });

  const measure = () => document.documentElement.style.setProperty("--nf-status-h", `${strip.offsetHeight}px`);
  measure();
  if (window.ResizeObserver) new ResizeObserver(measure).observe(strip);
  window.addEventListener("resize", measure);
}
