import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`(^|})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[2] ?? "";
};

// The open sidebar clips what leaves it (overflow: hidden); a 264 px menu in
// the 240 px menu was cut 32 px on its right (Mert 2026-10-19).
describe("the workspace switcher menu stays inside the menu that holds it", () => {
  it("spans the open sidebar's footer instead of a fixed width", () => {
    const open = rule(".workspace-switcher-menu");
    expect(open).toMatch(/left:\s*0;/);
    expect(open).toMatch(/right:\s*0;/);
    expect(open).not.toMatch(/(^|;)\s*width:/);
  });

  it("keeps its own width beside the collapsed rail, where nothing clips it", () => {
    const rail = rule('.app-shell[data-sidebar-collapsed="true"] .workspace-switcher-menu');
    expect(rail).toMatch(/left:\s*calc\(100% \+ 8px\);/);
    expect(rail).toMatch(/right:\s*auto;/);
    expect(rail).toMatch(/width:\s*264px;/);
  });
});
