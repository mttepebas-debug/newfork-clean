import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The web app manifest makes Newfork installable (Add to Home Screen), which
// iPhone needs before it allows phone alerts.

const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as {
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  theme_color?: string;
  background_color?: string;
  icons?: { src: string; sizes: string; type: string; purpose?: string }[];
};
const html = readFileSync("index.html", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

function token(name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i").exec(styles);
  if (!match) throw new Error(`${name} is not in styles.css`);
  return match[1]!.toLowerCase();
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): [number, number] {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe("web app manifest", () => {
  it("names the app and opens it as its own window", () => {
    expect(manifest.name).toBe("Newfork");
    expect(manifest.short_name).toBe("Newfork");
    expect(manifest.display).toBe("standalone");
  });

  it("starts at the app's front door and covers every route", () => {
    // /app sends each person to their home screen, or to sign-in (App.tsx).
    expect(manifest.start_url).toBe("/app");
    expect(manifest.scope).toBe("/");
  });

  it("uses today's light theme colours", () => {
    expect(manifest.theme_color).toBe(token("--theme-surface"));
    expect(manifest.background_color).toBe(token("--theme-page"));
  });

  it("has 192 and 512 icons, and a full-bleed one Android may crop to a shape", () => {
    const icons = manifest.icons ?? [];
    const find = (sizes: string, purpose: string) =>
      icons.find((icon) => icon.sizes === sizes && (icon.purpose ?? "any") === purpose);
    for (const [sizes, purpose] of [
      ["192x192", "any"],
      ["512x512", "any"],
      ["512x512", "maskable"],
    ] as const) {
      const icon = find(sizes, purpose);
      expect(icon, `${sizes} ${purpose}`).toBeDefined();
      expect(icon!.type).toBe("image/png");
      const [width, height] = pngSize(`public${icon!.src}`);
      expect(`${width}x${height}`).toBe(sizes);
    }
  });
});

describe("index.html", () => {
  it("links the manifest and the iPhone Home Screen tags", () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Newfork" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="default" />');
    expect(html).toContain(`<meta name="theme-color" content="${token("--theme-surface")}" />`);
  });

  it("gives iPhone a 180 px icon", () => {
    expect(pngSize("public/apple-touch-icon.png")).toEqual([180, 180]);
  });
});
