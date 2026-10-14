// What the "Test page" menu has chosen for the Add / Edit shift window.
// "main" is today's window from main, so the new one always sits next to it.
// The new window's layout (Form or Timeline) is switched from inside the
// window and remembered, the way the real app would remember it per manager.
// Choices are remembered per browser.
import { useSyncExternalStore } from "react";

export type WindowChoice = "main" | "new";
export type WindowLayout = "form" | "timeline";
export type ClockFormat = "12h" | "24h";

export const windowChoiceNames: Record<WindowChoice, string> = {
  main: "Original (main)",
  new: "New · Form ⇄ Timeline",
};
export const layoutNames: Record<WindowLayout, string> = {
  form: "Form",
  timeline: "Timeline",
};
export const clockFormatNames: Record<ClockFormat, string> = {
  "12h": "12-hour (9:00 AM)",
  "24h": "24-hour (09:00)",
};

interface Choices {
  window: WindowChoice;
  layout: WindowLayout;
  clock: ClockFormat;
}
export type ChoiceKey = keyof Choices;

const KEY = "newfork.shiftWindowTest.v2";
const defaults: Choices = { window: "new", layout: "form", clock: "12h" };
const listeners = new Set<() => void>();
let current: Choices = (() => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Choices>;
    return {
      window: saved.window === "main" || saved.window === "new" ? saved.window : defaults.window,
      layout: saved.layout === "form" || saved.layout === "timeline" ? saved.layout : defaults.layout,
      clock: saved.clock === "12h" || saved.clock === "24h" ? saved.clock : defaults.clock,
    };
  } catch {
    return { ...defaults };
  }
})();

export function getChoices(): Choices {
  return current;
}

export function setChoice<K extends ChoiceKey>(key: K, value: Choices[K]): void {
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: the choice lasts for this tab.
  }
  listeners.forEach((listener) => listener());
}

export function useChoices(): Choices {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getChoices,
  );
}

/** For the test page menu (outside React). */
export function subscribeChoices(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
