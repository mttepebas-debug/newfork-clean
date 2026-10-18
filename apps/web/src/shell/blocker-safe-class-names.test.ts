import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Ad blockers hide boxes by their name: EasyList, which most of them use on phones and computers alike, has
// `##.ad-head`, `##.ad-body`, `##.ad-title`, `##.ad-tabs` and thousands more. The announcement reader was
// named that way, so on Mert's iPhone it opened with its title and message hidden and only Close left
// (BILDIRIM-15, Mert 2026-10-17). No class or id here may read like an ad slot.
const AD_LIKE = [
  /^(ad|ads|adv|advert|adverts|advertisement|advertising|sponsor|sponsored|sponsors|promo|promoted)(?:[-_]|$)/i,
  /[-_](ad|ads|advert|adverts|advertisement|sponsor|sponsored)(?:[-_]|$)/i,
];

function files(folder: string, extensions: readonly string[]): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return files(path, extensions);
    return extensions.some((extension) => entry.name.endsWith(extension)) && !entry.name.includes(".test.") ? [path] : [];
  });
}

const FOLDERS = ["src", "../../packages/ui/src"];

/** The names a stylesheet or the markup gives a box: CSS classes and ids, className and id strings. */
function names(file: string): string[] {
  const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  if (file.endsWith(".css")) return [...text.matchAll(/[.#](-?[A-Za-z_][A-Za-z0-9_-]*)/g)].map(([, name]) => name!);
  const markup = [...text.matchAll(/\b(?:className|id)=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g)].map((match) => match.slice(1).join(" "));
  return markup.flatMap((value) => [...value.matchAll(/[A-Za-z_][A-Za-z0-9_-]*/g)].map(([name]) => name));
}

describe("names an ad blocker would hide", () => {
  it("are not given to any box, in a stylesheet or in the markup", () => {
    const found = FOLDERS.flatMap((folder) => files(folder, [".css", ".tsx"])).flatMap((file) =>
      names(file)
        .filter((name) => AD_LIKE.some((pattern) => pattern.test(name)))
        .map((name) => `${file}: ${name}`),
    );
    expect([...new Set(found)]).toEqual([]);
  });

  it("would catch the reader's old names", () => {
    for (const name of ["ad", "ad-head", "ad-body", "ads", "banner-ad", "sponsored-row", "promo-box"]) {
      expect(AD_LIKE.some((pattern) => pattern.test(name)), name).toBe(true);
    }
    for (const name of ["add-button", "header", "loading", "shadow", "grad-bar", "admin", "address"]) {
      expect(AD_LIKE.some((pattern) => pattern.test(name)), name).toBe(false);
    }
  });
});
