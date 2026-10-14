// PAGES: what a scenario does to the demo data before the screen opens, and
// the clicks it makes after. Both frames run the same scenario on the same
// fresh data, so the desktop and the phone open in the same state.
import type { Step } from "./pages";
import { notice } from "./harness";
import { girisSetups } from "./mock/giris-setups";
import { runGesture } from "./schedule-steps";
import { scheduleSetups } from "./mock/schedule-setups";
import { settingsSetups } from "./mock/settings-setups";
import { hubSetups } from "./mock/hub-setups";
import { caseReadMode } from "./mock/hub-service";

/** Named demo-data changes; each runs on freshly seeded data. */
export const setups: Record<string, () => void> = {
  // Sign in: the server ended the last session.
  "session-expired": () => {
    try { window.sessionStorage.setItem("newfork.sessionExpired", "1"); } catch { /* storage blocked */ }
  },
  // Requests: the one-case read behind a request link fails, or never answers.
  "case-read-fail": () => { caseReadMode.value = "fail"; },
  "case-read-slow": () => { caseReadMode.value = "slow"; },
  // Sign-in, onboarding, hub and account pages (tools/sc/10-giris-hesap.py).
  ...girisSetups,
  // Settings pages (tools/sc/50-ayarlar.py).
  ...settingsSetups,
  // Schedule, export, templates and Requests (tools/sc/30-schedule.py).
  ...scheduleSetups,
  // Employee Hub, Announcements, Notifications and the shell (tools/sc/70-hub-kabuk.py).
  ...hubSetups,
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
  if (target.startsWith("label=")) {
    // A form field by its visible label (fields with generated ids): exact, then starts-with.
    const words = target.slice(6).trim().toLowerCase();
    const labels = [...scope.querySelectorAll<HTMLLabelElement>("label")]
      .map((label) => ({ label, name: (label.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase() }));
    const hit = labels.find(({ label, name }) => name === words && label.control && visible(label.control))
      ?? labels.find(({ label, name }) => name.startsWith(words) && label.control && visible(label.control));
    return (hit?.label.control as HTMLElement | undefined) ?? null;
  }
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

/** A small real picture (drawn on a canvas), for screens that decode the file. */
function sampleImage(type: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 360;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#2f6f5e"; g.fillRect(0, 0, 480, 360);
  g.fillStyle = "#f4d6a0"; g.beginPath(); g.arc(240, 150, 80, 0, Math.PI * 2); g.fill();
  g.fillRect(130, 250, 220, 110);
  return new Promise((done) => canvas.toBlob((blob) => done(blob ?? new Blob()), type));
}

/**
 * A step the phone cannot take because the screen is desktop-only there
 * ("… is available on a computer"): the phone shows that message instead, so
 * the scenario stops quietly in that frame.
 */
const desktopOnlyHere = () => /is available on a computer/i.test(document.body?.innerText ?? "");
const stepNotice = (text: string) => { if (!desktopOnlyHere()) notice(text); };

export async function runSteps(steps: readonly Step[]): Promise<void> {
  for (const step of steps) {
    if ("wait" in step) {
      await new Promise((done) => setTimeout(done, step.wait));
    } else if ("click" in step) {
      const el = await waitFor(step.click, step.within);
      if (!el) { stepNotice(`Senaryo adımı bu görünümde bulunamadı: ${step.click.replace(/^text=/, "")}`); return; }
      el.click();
    } else if ("act" in step) {
      // Keys, double/right clicks, hover, drags (schedule-steps.ts).
      if (!(await runGesture(step, waitFor))) { stepNotice(`Senaryo adımı bu görünümde bulunamadı: ${(step.target ?? step.to ?? step.act).replace(/^text=/, "")}`); return; }
    } else if ("scroll" in step) {
      // Brings a part below the fold into view (the app scrolls inside main).
      const el = await waitFor(step.scroll);
      if (!el) { stepNotice(`Senaryo adımı bu görünümde bulunamadı: ${step.scroll}`); return; }
      el.scrollIntoView({ block: "center" });
    } else if ("file" in step) {
      // File inputs are usually hidden behind a button, so no visibility check.
      let input: HTMLInputElement | null = null;
      for (let tries = 0; tries < 50 && !input; tries += 1) {
        input = document.querySelector<HTMLInputElement>(step.file);
        if (!input) await new Promise((done) => setTimeout(done, 100));
      }
      if (!input) { stepNotice(`Senaryo adımı bu görünümde bulunamadı: ${step.file}`); return; }
      const type = step.type ?? "application/pdf";
      // A real image when the screen decodes it (avatar crop); bytes otherwise.
      const body = type.startsWith("image/") ? await sampleImage(type) : new Uint8Array(step.size ?? 2048);
      const file = new File([body], step.name, { type });
      if (step.size && file.size !== step.size) Object.defineProperty(file, "size", { value: step.size });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      const el = (await waitFor(step.fill)) as HTMLInputElement | null;
      if (!el) { stepNotice(`Senaryo adımı bu görünümde bulunamadı: ${step.fill}`); return; }
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
      // "{today+3}" in a value: a date from the viewer's today (yyyy-mm-dd).
      const value = step.value.replace(/\{today([+-]\d+)?\}/g, (_, shift) => {
        const day = new Date();
        day.setDate(day.getDate() + Number(shift ?? 0));
        return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      });
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      // A <select> tells React through "change" only.
      if (el.tagName === "SELECT") el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await new Promise((done) => setTimeout(done, 150));
  }
}
