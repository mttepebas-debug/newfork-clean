import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A page's own tabs on a phone (S-152; Mert 2026-10-17, variant D "sola dayalı,
// çizgi sekme kadar"): only the employee's Schedule · Lineup, My Availability's
// Availability · Time Off Requests and Shift hub's three tabs; tabs inside a
// page's content keep their own look. jsdom lays nothing out, so this reads the
// sheet; the sizes on a real phone are e2e/flows/phone-page-tabs.spec.ts.
const sheet = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (css: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, head, body]) => ({
    head: head!.replace(/\s+/g, " ").trim(),
    body: body!,
  }));
const PAGE_TABS = [".employee-schedule-tabs", ".employee-weekly-workspace > .weekly-preferences-tabs", ".sx-root .sx-tabs"];

describe("phone page tabs", () => {
  const css = sheet("src/shell/phone-page-tabs.css");
  const phone = css.match(/@media \(max-width: 720px\) \{([\s\S]*)\}\s*$/)?.[1] ?? "";
  const all = rules(phone);
  const body = (test: (head: string) => boolean) =>
    all.filter(({ head }) => test(head)).map(({ body }) => body).join(";");
  const strip = (head: string) => PAGE_TABS.every((tab) => head.includes(tab));
  const list = body((head) => strip(head) && head.endsWith(".sx-tabs)"));
  const tab = body((head) => strip(head) && /> :is\(a, button\)$/.test(head));
  const chosen = body((head) => strip(head) && /\) > :is\(\[aria-current="page"\], \[aria-selected="true"\]\)$/.test(head));
  const line = body((head) => strip(head) && head.endsWith("[data-tab-line]::after"));

  it("is loaded on every page and holds only phone rules", () => {
    expect(readFileSync("src/shell/useFrozenTop.ts", "utf8")).toMatch(/import "\.\/phone-page-tabs\.css";/);
    expect(css.trim()).toMatch(/^@media \(max-width: 720px\) \{/);
  });

  it("touches only the three page tab strips, never a page's content tabs", () => {
    for (const tab of PAGE_TABS) expect(phone).toContain(tab);
    for (const content of ["employee-lineup-tabs", "lineup-phone-segs", "requests-tabs", "catalog-status-tabs", "ni-tabs"])
      expect(phone).not.toContain(content);
  });

  it("runs the strip edge to edge on one 1 px line, the first label in line with the page", () => {
    expect(list).toMatch(/margin-inline\s*:\s*calc\(50% - 50vw\)/);
    expect(list).toMatch(/padding-inline\s*:\s*calc\(50vw - 50% - 12px\)/);
    // drawn inside the strip: a strip that scrolls sideways cuts what hangs over its edge
    expect(list).toMatch(/border-bottom\s*:\s*0/);
    expect(list).toMatch(/box-shadow\s*:\s*inset 0 -1px 0 var\(--theme-border-subtle\)/);
    expect(list).toMatch(/overflow-x\s*:\s*auto/);
    expect(list).toMatch(/gap\s*:\s*0/);
  });

  it("sizes every tab to its label with 12 px on each side, inside the strip", () => {
    expect(tab).toMatch(/flex\s*:\s*none/);
    expect(tab).toMatch(/height\s*:\s*44px/);
    expect(tab).toMatch(/padding\s*:\s*0 12px/);
    expect(tab).toMatch(/margin\s*:\s*0(;|$)/);
    expect(tab).toMatch(/font-size\s*:\s*14px/);
    expect(tab).toMatch(/border-bottom\s*:\s*2px solid transparent/);
  });

  it("marks the open tab with one 2 px green line as wide as the tab, the same on all three", () => {
    expect(chosen).toMatch(/border-bottom-color\s*:\s*var\(--theme-accent\)/);
    expect(chosen).toMatch(/font-weight\s*:\s*600/);
    const widths = phone.match(/(?:border-bottom|height)\s*:\s*\d+px/g)?.map((m) => m.replace(/\s/g, "")) ?? [];
    expect(widths.filter((w) => w.startsWith("border-bottom"))).toEqual(["border-bottom:2px"]);
  });

  it("slides that line to the tab opened (useTabSwipe says where), still at 2 px", () => {
    expect(line).toMatch(/content\s*:\s*""/);
    expect(line).toMatch(/bottom\s*:\s*0/);
    expect(line).toMatch(/height\s*:\s*2px/);
    expect(line).toMatch(/width\s*:\s*var\(--tab-line-w\)/);
    expect(line).toMatch(/transform\s*:\s*translateX\(var\(--tab-line-x\)\)/);
    expect(line).toMatch(/transition\s*:\s*transform 0\.22s/);
    // the tab's own line steps aside while the sliding one is there
    expect(body((head) => strip(head) && head.includes("[data-tab-line] >"))).toMatch(/border-bottom-color\s*:\s*transparent/);
    expect(phone).toMatch(/prefers-reduced-motion: reduce/);
  });
});
