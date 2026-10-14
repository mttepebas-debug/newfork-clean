// Two tabs over the app: "Schedule" (the real page) and "All shift cards"
// (the catalog). The catalog lies over the app; the app stays mounted, so a
// "Show on the grid" click lands on the same grid you left.
import { createRoot } from "react-dom/client";
import { Catalog } from "./catalog";
import { MarksBoard } from "./marks-board";
import { marksBuild } from "./vk/store";
import { notice } from "./harness";
import "./catalog.css";

type Tab = "schedule" | "catalog" | "marks";

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

function visible(el: Element): boolean {
  const box = (el as HTMLElement).getBoundingClientRect();
  return box.width > 0 && box.height > 0 && !el.closest("[hidden], .rk-catalog-layer");
}

async function waitFor(selector: string, tries = 30): Promise<HTMLElement | null> {
  for (let i = 0; i < tries; i += 1) {
    const found = [...document.querySelectorAll<HTMLElement>(`#root ${selector}`)].find(visible);
    if (found) return found;
    await wait(100);
  }
  return null;
}

function buttonByName(name: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>("button, [role=menuitem]")]
    .find((el) => visible(el) && (el.getAttribute("aria-label")?.trim() === name || el.textContent?.trim() === name)) ?? null;
}

/** Opens "Edit live schedule" when the grid is not in edit mode yet. */
async function ensureEditing(): Promise<boolean> {
  if (document.querySelector('#root .schedule-cell[data-editing="true"]')) return true;
  buttonByName("New Schedule")?.click();
  await wait(300);
  const edit = buttonByName("Edit live schedule");
  if (!edit) return false;
  edit.click();
  return Boolean(await waitFor('#root .schedule-cell[data-editing="true"]', 40));
}

export function mountShell(): void {
  const bar = document.createElement("nav");
  bar.className = "rk-tabs";
  bar.setAttribute("aria-label", "Page tabs");
  bar.innerHTML = `
    <button type="button" data-tab="schedule" aria-pressed="true">Schedule</button>
    <button type="button" data-tab="catalog" aria-pressed="false">All shift cards</button>${marksBuild ? `
    <button type="button" data-tab="marks" aria-pressed="false">Mark drafts</button>` : ""}`;
  const layer = document.createElement("div");
  layer.className = "rk-catalog-layer";
  layer.hidden = true;
  // The mark drafts (Mert, 2026-10-13): a layer of their own, like the catalog.
  const marksLayer = document.createElement("div");
  marksLayer.className = "rk-catalog-layer";
  marksLayer.hidden = true;
  document.body.append(layer, marksLayer, bar);

  const followBand = () => {
    const band = document.getElementById("nf-kaynak-bandi");
    const bottom = band && band.offsetHeight > 0 ? Math.max(0, band.getBoundingClientRect().bottom) : 0;
    layer.style.top = `${bottom}px`;
    marksLayer.style.top = `${bottom}px`;
  };
  followBand();
  new MutationObserver(followBand).observe(document.body, { childList: true });
  window.addEventListener("resize", followBand);

  const setTab = (tab: Tab) => {
    layer.hidden = tab !== "catalog";
    marksLayer.hidden = tab !== "marks";
    // The app under the catalog is out of reach for keyboard and screen readers.
    document.getElementById("root")?.toggleAttribute("inert", tab !== "schedule");
    bar.querySelectorAll<HTMLButtonElement>("button").forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.tab === tab)));
    try { window.sessionStorage.setItem("newfork.cards.tab", tab); } catch { /* storage blocked */ }
  };
  bar.querySelectorAll<HTMLButtonElement>("button").forEach((button) =>
    button.addEventListener("click", () => setTab(button.dataset.tab as Tab)));

  const show = async (selector: string, edit: boolean) => {
    setTab("schedule");
    if (edit && !(await ensureEditing())) {
      notice("Open New Schedule → Edit live schedule first.");
      return;
    }
    const target = await waitFor(selector);
    const card = target?.closest<HTMLElement>("[data-shift-badge], .schedule-cell") ?? target;
    if (!card) {
      notice(edit ? "Not on this week's grid right now." : "Not on the grid in this mode; try New Schedule → Edit live schedule.");
      return;
    }
    card.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    card.classList.remove("rk-flash");
    void card.offsetWidth;
    card.classList.add("rk-flash");
    window.setTimeout(() => card.classList.remove("rk-flash"), 2600);
  };

  createRoot(layer).render(<Catalog onShow={(selector, edit) => { void show(selector, edit); }} />);
  if (marksBuild) createRoot(marksLayer).render(<MarksBoard onShow={(selector, edit) => { void show(selector, edit); }} />);
  let saved: string | null = null;
  try { saved = window.sessionStorage.getItem("newfork.cards.tab"); } catch { /* storage blocked */ }
  // The drafts page opens on its drafts.
  setTab(saved === "catalog" ? "catalog" : saved === "schedule" ? "schedule" : marksBuild ? "marks" : "schedule");
}
