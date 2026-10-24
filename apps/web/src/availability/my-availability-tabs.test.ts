import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// My Availability's Availability · Time off tabs on a desktop look like Shift Hub's, which look like the list
// pages' status tabs (Mert 2026-10-23): 13 px labels on one 1 px line, the open one dark at 600 over a 2 px
// green line, the others muted at 500. A phone's strip is phone-page-tabs.css. jsdom lays nothing out, so
// this reads the sheets; the measured tabs are in the session's screenshots.
const sheet = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const desktop = (css: string) => css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
const declarations = (css: string, head: string) => {
  const found = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, rule]) => rule!.split(",").map((part) => part.replace(/\s+/g, " ").trim()).includes(head))
    .flatMap(([, , body]) => body!.split(";"))
    .map((line) => line.split(/:(.*)/s).map((part) => part.trim()))
    .filter(([name, value]) => name && value);
  return Object.fromEntries(found) as Record<string, string>;
};
const pick = (from: Record<string, string>, names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, from[name]]));

describe("My Availability's tabs on a desktop", () => {
  const mine = desktop(sheet("src/availability/weekly-preferences.css"));
  const hub = desktop(sheet("src/employee-hub/shift-exchanges/shift-exchanges.css"));
  const strip = ".employee-weekly-workspace > .weekly-preferences-tabs";

  it("sit on Shift Hub's 1 px line, as far apart", () => {
    const names = ["display", "gap", "border-bottom"];
    expect(pick(declarations(mine, strip), names)).toEqual(pick(declarations(hub, ".sx-tabs"), names));
  });

  it("are Shift Hub's tabs: 40 high, 13 px, muted at 500", () => {
    const names = ["height", "min-height", "margin-bottom", "padding", "border", "border-bottom", "border-radius", "background", "color", "font-size", "font-weight", "white-space"];
    const tab = declarations(mine, `${strip} > button`);
    expect(pick(tab, names)).toEqual(pick(declarations(hub, ".sx-root .sx-tabs button"), names));
    expect(tab["font-size"]).toBe("13px");
  });

  it("mark the open tab as Shift Hub does: dark at 600 over the green line", () => {
    const names = ["border-bottom-color", "color", "font-weight"];
    expect(pick(declarations(mine, `${strip} > button[aria-selected="true"]`), names)).toEqual(
      pick(declarations(hub, '.sx-root .sx-tabs button[aria-current="page"]'), names),
    );
  });

  it("show the focus ring as Shift Hub does", () => {
    const names = ["outline", "outline-offset"];
    expect(pick(declarations(mine, `${strip} > button:focus-visible`), names)).toEqual(
      pick(declarations(hub, ".sx-root .sx-tabs button:focus-visible"), names),
    );
  });
});
