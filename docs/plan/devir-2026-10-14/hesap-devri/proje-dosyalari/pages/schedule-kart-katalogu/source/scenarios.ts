// PAGES: what a scenario does to the demo data before the screen opens, and
// the clicks it makes after. Both frames run the same scenario on the same
// fresh data, so the desktop and the phone open in the same state.
import type { Step } from "./pages";
import { notice } from "./harness";

/** Named demo-data changes; each runs on freshly seeded data. */
export const setups: Record<string, () => void> = {
  // Sign in: the server ended the last session.
  "session-expired": () => {
    try { window.sessionStorage.setItem("newfork.sessionExpired", "1"); } catch { /* storage blocked */ }
  },
};

const visible = (el: Element) => {
  // A closed <details> keeps its contents laid out; only its summary shows.
  const closed = el.closest("details:not([open])");
  if (closed && !el.closest("summary")) return false;
  if (el.closest("[inert], [hidden], [aria-hidden=true]")) return false;
  const box = (el as HTMLElement).getBoundingClientRect?.();
  return !!box && box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden";
};

/** "text=Past" (a button, link or tab by its words or aria-label), else a CSS selector. */
function find(target: string, within?: string): HTMLElement | null {
  const scope: ParentNode = (within && document.querySelector(within)) || document;
  if (target.startsWith("text=")) {
    const words = target.slice(5).trim().toLowerCase();
    const candidates = scope.querySelectorAll<HTMLElement>("button, a, [role=tab], [role=menuitem], summary, label");
    for (const el of candidates) {
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      if (name === words && visible(el)) return el;
    }
    for (const el of candidates) {
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      if (name.startsWith(words) && visible(el)) return el;
    }
    return null;
  }
  // The first visible match: a phone layout can hide the desktop twin of the same control.
  return [...scope.querySelectorAll<HTMLElement>(target)].find(visible) ?? null;
}

async function waitFor(target: string, within?: string): Promise<HTMLElement | null> {
  for (let tries = 0; tries < 50; tries += 1) {
    const el = find(target, within);
    if (el) return el;
    await new Promise((done) => setTimeout(done, 100));
  }
  return null;
}

export async function runSteps(steps: readonly Step[]): Promise<void> {
  for (const step of steps) {
    if ("wait" in step) {
      await new Promise((done) => setTimeout(done, step.wait));
    } else if ("click" in step) {
      const el = await waitFor(step.click, step.within);
      if (!el) { notice(`Senaryo adımı bu görünümde bulunamadı: ${step.click.replace(/^text=/, "")}`); return; }
      el.click();
    } else {
      const el = (await waitFor(step.fill)) as HTMLInputElement | null;
      if (!el) { notice(`Senaryo adımı bu görünümde bulunamadı: ${step.fill}`); return; }
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
      setter?.call(el, step.value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await new Promise((done) => setTimeout(done, 150));
  }
}
