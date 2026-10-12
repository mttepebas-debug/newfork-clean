import { describe, expect, it } from "vitest";
import { foldedAway } from "./tabStops";

function build(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("foldedAway (BL-960)", () => {
  it("keeps a closed picker's summary and folds away what it hides", () => {
    const root = build(
      '<details><summary id="s">Locations</summary><input id="i" /></details>',
    );
    expect(foldedAway(root.querySelector<HTMLElement>("#s")!)).toBe(false);
    expect(foldedAway(root.querySelector<HTMLElement>("#i")!)).toBe(true);
  });

  it("folds away the summary of a picker that sits inside a closed one", () => {
    const root = build(
      '<details><summary>Outer</summary><details><summary id="inner">Inner</summary></details></details>',
    );
    expect(foldedAway(root.querySelector<HTMLElement>("#inner")!)).toBe(true);
  });

  it("leaves an open picker's content as stops", () => {
    const root = build(
      '<details open><summary>Locations</summary><input id="i" /></details>',
    );
    expect(foldedAway(root.querySelector<HTMLElement>("#i")!)).toBe(false);
  });
});
