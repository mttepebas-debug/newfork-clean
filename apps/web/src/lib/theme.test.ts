import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("theme preference", () => {
  let change: () => void;
  let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    media = { matches: false, addEventListener: vi.fn((_event, listener) => { change = listener; }) };
    vi.stubGlobal("matchMedia", vi.fn(() => media));
  });

  it("persists saved appearance but does not persist a preview", async () => {
    const { applyThemePreference } = await import("./theme");
    applyThemePreference("light", true);
    applyThemePreference("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem("newfork.theme")).toBe("light");
    applyThemePreference("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("follows system changes only when System is selected", async () => {
    const { applyThemePreference } = await import("./theme");
    applyThemePreference("system", true);
    media.matches = true;
    change();
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyThemePreference("light", true);
    change();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("can apply appearance when storage is blocked", async () => {
    const { applyThemePreference } = await import("./theme");
    const blocked = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => applyThemePreference("dark", true)).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
    blocked.mockRestore();
  });
});

describe("pre-paint theme bootstrap", () => {
  const html = readFileSync("index.html", "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  it.each([
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["system", true, "dark"],
    ["invalid", false, "light"],
  ])("resolves %s with OS dark=%s before loading React", (saved, matches, expected) => {
    const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
    expect(script).toBeTruthy();
    runInNewContext(script!, { localStorage: { getItem: () => saved }, matchMedia: () => ({ matches }), document: { documentElement: root } });
    expect(root.dataset.theme).toBe(expected);
    expect(root.style.colorScheme).toBe(expected);
    expect(html.indexOf(script!)).toBeLessThan(html.indexOf('/src/main.tsx'));
  });
});
