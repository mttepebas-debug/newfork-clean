import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A page's own tabs on a phone, one standard on every page (KARARLAR S-253, Mert 2026-10-23, widening S-152):
// the strip under the title on the employee's Schedule, My Availability, Shift Hub and My documents, the
// manager's person Availability page and every list page's status tabs. Tabs inside a page's content keep
// their own look. jsdom lays nothing out, so this reads the sheet; the sizes on a real phone are
// e2e/flows/phone-page-tabs.spec.ts.
const sheet = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (css: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, head, body]) => ({
    head: head!.replace(/\s+/g, " ").trim(),
    body: body!,
  }));
const PAGE_TABS = [
  ".employee-schedule-tabs",
  ".employee-weekly-workspace > .weekly-preferences-tabs",
  ".sx-root .sx-tabs",
  ".my-documents-page .requests-tabs",
  ".avm-panel .avm-tabs",
  ".list-page:not(.lineup-page) .catalog-toolbar-status-row > .catalog-status-tabs",
];

/** A head's first `:is(A, B, …)` written out: one head per A, B, …. */
function expandIs(head: string): string[] {
  const at = head.indexOf(":is(");
  if (at < 0) return [head];
  const parts: string[] = [];
  let depth = 0;
  let from = at + 4;
  for (let i = at + 3; i < head.length; i++) {
    if (head[i] === "(") depth++;
    else if (head[i] === ")" && --depth === 0) {
      parts.push(head.slice(from, i));
      return parts.map((part) => `${head.slice(0, at)}${part.trim()}${head.slice(i + 1)}`);
    } else if (head[i] === "," && depth === 1) {
      parts.push(head.slice(from, i));
      from = i + 1;
    }
  }
  return [head];
}

describe("phone page tabs", () => {
  const css = sheet("src/shell/phone-page-tabs.css");
  const phone = css.match(/@media \(max-width: 720px\) \{([\s\S]*)\}\s*$/)?.[1] ?? "";
  const all = rules(phone);
  const body = (test: (head: string) => boolean) =>
    all.filter(({ head }) => test(head)).map(({ body }) => body).join(";");
  const strip = (head: string) => PAGE_TABS.every((tab) => head.includes(tab));
  const list = body((head) => strip(head) && head.endsWith(".catalog-status-tabs)"));
  const tab = body((head) => strip(head) && /> :is\(a, button\)$/.test(head));
  const chosen = body((head) => strip(head) && /\) > :is\(\[aria-current="page"\], \[aria-selected="true"\], \[aria-pressed="true"\], \.active\)$/.test(head));
  const line = body((head) => strip(head) && head.endsWith("[data-tab-line]::after"));

  it("is loaded on every page and holds only phone rules", () => {
    expect(readFileSync("src/shell/useFrozenTop.ts", "utf8")).toMatch(/import "\.\/phone-page-tabs\.css";/);
    expect(css.trim()).toMatch(/^@media \(max-width: 720px\) \{/);
  });

  it("takes every page's own tab strip, never the tabs inside a page's content", () => {
    for (const tab of PAGE_TABS) expect(phone).toContain(tab);
    for (const content of ["employee-lineup-tabs", "lineup-phone-segs", "ni-tabs", "lineup-wheel"]) expect(phone).not.toContain(content);
  });

  it("keeps the strip inside the page's sides on one 1 px line, labels 24 px apart", () => {
    expect(list).toMatch(/margin-inline\s*:\s*0/);
    expect(list).toMatch(/padding\s*:\s*0/);
    expect(list).toMatch(/gap\s*:\s*24px/);
    // drawn inside the strip: a strip that scrolls sideways cuts what hangs over its edge
    expect(list).toMatch(/border\s*:\s*0/);
    expect(list).toMatch(/box-shadow\s*:\s*inset 0 -1px 0 var\(--theme-border\)/);
    expect(list).toMatch(/overflow-x\s*:\s*auto/);
    // A list page's status row lends its line to the strip.
    expect(body((head) => head === ":root:root:root:root .list-page:not(.lineup-page) .catalog-toolbar-status-row")).toMatch(/border-bottom\s*:\s*0/);
  });

  it("sizes every tab to its label, the first one on the title's edge, 14 px and 44 high", () => {
    expect(tab).toMatch(/flex\s*:\s*none/);
    expect(tab).toMatch(/height\s*:\s*44px/);
    expect(tab).toMatch(/padding\s*:\s*0(;|$)/);
    expect(tab).toMatch(/margin\s*:\s*0(;|$)/);
    expect(tab).toMatch(/font-size\s*:\s*14px/);
    expect(tab).toMatch(/font-weight\s*:\s*500/);
    expect(tab).toMatch(/border-bottom\s*:\s*2px solid transparent/);
  });

  it("marks the open tab, however a page names it, with one 2 px green line and 600", () => {
    expect(chosen).toMatch(/border-bottom-color\s*:\s*var\(--theme-accent\)/);
    expect(chosen).toMatch(/font-weight\s*:\s*600/);
    const widths = phone.match(/(?:border-bottom|height)\s*:\s*\d+px/g)?.map((m) => m.replace(/\s/g, "")) ?? [];
    expect(widths.filter((w) => w.startsWith("border-bottom"))).toEqual(["border-bottom:2px"]);
  });

  // The manager's phone Lineup is a list page too, and its shift tabs sit in a status row: they kept the
  // Lineup's own look on the employee's phone only, and the two Lineups lost their one rhythm
  // (lineup-publish.spec.ts, main CI 2026-10-23).
  it("leaves the manager's Lineup shift tabs to the Lineup, while Requests' strip takes the standard", () => {
    document.body.innerHTML = `
      <section class="lineup-page list-page lineup-phone-page"><div class="lineup-card"><div class="catalog-toolbar lineup-shift-tabs">
        <div class="catalog-toolbar-status-row" id="lineup-row"><div class="catalog-status-tabs" id="lineup-tabs"><button class="active" id="lineup-tab">Dinner</button></div></div>
      </div></div></section>
      <section class="requests-page list-page"><div class="requests-toolbar catalog-toolbar">
        <div class="catalog-toolbar-status-row" id="requests-row"><div class="catalog-status-tabs" id="requests-tabs"><button class="active" id="requests-tab">All</button></div></div>
      </div></section>`;
    const element = (id: string) => document.getElementById(id)!;
    // jsdom matches no :is() that holds combinators, so each rule's strip list is written out, one strip a head.
    const heads = all.flatMap(({ head }) => expandIs(head.replace(/(::after|::-webkit-scrollbar|:hover|:focus-visible)$/, "")));
    const matching = (id: string) => heads.filter((head) => element(id).matches(head));
    for (const id of ["lineup-row", "lineup-tabs", "lineup-tab"]) expect(matching(id), id).toEqual([]);
    for (const id of ["requests-row", "requests-tabs", "requests-tab"]) expect(matching(id).length, id).toBeGreaterThan(0);
    document.body.innerHTML = "";
  });

  it("slides that line to the tab opened (useTabLine says where), still at 2 px", () => {
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
