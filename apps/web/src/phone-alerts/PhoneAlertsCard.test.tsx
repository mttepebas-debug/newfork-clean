import { readdirSync, readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PhoneAlertsCard } from "./PhoneAlertsCard";
import type { PhoneAlertsSupport } from "./install-state";

afterEach(cleanup);

const iphoneSafari: PhoneAlertsSupport = { kind: "needs-install", device: "phone", browser: "safari", ios: 27 };
const homeScreen: PhoneAlertsSupport = { kind: "ready", device: "phone", installed: true };
const androidChrome: PhoneAlertsSupport = { kind: "ready", device: "phone", installed: false };

function setup(support: PhoneAlertsSupport, audience: "employee" | "manager" = "employee") {
  const onTurnOn = vi.fn();
  const onNotNow = vi.fn();
  const view = render(<PhoneAlertsCard support={support} audience={audience} onTurnOn={onTurnOn} onNotNow={onNotNow} />);
  return { onTurnOn, onNotNow, ...view };
}

const card = () => screen.getByRole("complementary", { name: "Get alerts on this phone" });
const turnOn = () => within(card()).getByRole("button", { name: "Turn on" });
const notNow = () => within(card()).getByRole("button", { name: "Not now" });
const sheet = () => screen.queryByRole("dialog", { name: "Add Newfork to your Home Screen" });

describe("PhoneAlertsCard where the browser can ask (Android Chrome, the Home Screen app)", () => {
  for (const [name, support] of [
    ["Android Chrome", androidChrome],
    ["iPhone Home Screen app", homeScreen],
  ] as const) {
    it(`${name}: Turn on hands over to the caller, with no steps in between`, () => {
      const { onTurnOn, onNotNow } = setup(support);
      fireEvent.click(turnOn());
      expect(onTurnOn).toHaveBeenCalledOnce();
      expect(onNotNow).not.toHaveBeenCalled();
      expect(sheet()).toBeNull();
    });
  }

  it("Not now hands over to the caller", () => {
    const { onTurnOn, onNotNow } = setup(androidChrome);
    fireEvent.click(notNow());
    expect(onNotNow).toHaveBeenCalledOnce();
    expect(onTurnOn).not.toHaveBeenCalled();
  });

  it("never asks the browser for permission itself", () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { requestPermission, permission: "default" });
    try {
      setup(androidChrome);
      fireEvent.click(turnOn());
      expect(requestPermission).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("says what the alerts are for, by who is reading", () => {
    setup(androidChrome, "employee");
    expect(card().textContent).toContain("Know right away when your schedule changes or someone asks you to cover.");
    cleanup();
    setup(androidChrome, "manager");
    expect(card().textContent).toContain("Know right away when a request needs your approval.");
  });

  it("calls a computer a computer", () => {
    setup({ kind: "ready", device: "computer", installed: false });
    expect(screen.getByRole("complementary", { name: "Get alerts on this computer" })).toBeTruthy();
  });

  it("keeps the green action first and the white dismiss second", () => {
    setup(androidChrome);
    const buttons = within(card()).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Turn on", "Not now"]);
    expect(buttons[0]!.className).toBe("nf-button");
    expect(buttons[1]!.className).toBe("nf-button secondary-button");
    expect(buttons.every((button) => button.getAttribute("type") === "button")).toBe(true);
  });
});

describe("PhoneAlertsCard on iPhone Safari", () => {
  it("opens the Home Screen guide instead of asking", () => {
    const { onTurnOn } = setup(iphoneSafari);
    fireEvent.click(turnOn());
    expect(onTurnOn).not.toHaveBeenCalled();
    expect(sheet()!.getAttribute("aria-modal")).toBe("true");
  });

  it("Escape closes the guide, keeps the card, and gives focus back to Turn on", () => {
    const { onNotNow } = setup(iphoneSafari);
    turnOn().focus();
    fireEvent.click(turnOn());
    fireEvent.keyDown(sheet()!, { key: "Escape" });
    expect(sheet()).toBeNull();
    expect(onNotNow).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(turnOn());
  });
});

// No screen may promise phone alerts before they are set up (KARARLAR S-124): outside the DEV gallery
// only Home's card and Account → Notifications show it, and both wait for the server's word (BILDIRIM-15).
it("is shown only by Home's card, Account → Notifications and the DEV gallery", () => {
  const importers = (readdirSync("src", { recursive: true }) as string[])
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file))
    .filter((file) => /from\s+["'][^"']*PhoneAlertsCard["']/.test(readFileSync(`src/${file}`, "utf8")));
  expect(importers.length).toBeGreaterThan(0);
  expect(importers.filter((file) => !file.startsWith("dev/")).sort()).toEqual(["phone-alerts/PhoneAlertsHome.tsx"]);
});

it("draws nothing where phone alerts cannot work", () => {
  const { container } = setup({ kind: "unsupported" });
  expect(container.innerHTML).toBe("");
});

/* ---------- WCAG 2.1 AA: colours resolved from the real CSS ---------- */

const tokens = new Map(
  [...readFileSync("src/styles.css", "utf8").matchAll(/(--theme-[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(
    ([, name, hex]) => [name!, hex!.toLowerCase()] as const,
  ),
);
const css = readFileSync("src/phone-alerts/phone-alerts.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const appCss = readFileSync("src/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function declaration(source: string, selector: string, property: string): string {
  const bodies = [...source.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter(([, head]) => head!.trim().split(/\s*,\s*/).includes(selector))
    .map(([, , body]) => body!);
  for (const body of bodies.reverse()) {
    const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(body);
    if (match) return match[1]!.trim();
  }
  throw new Error(`${selector} has no ${property}`);
}

function hex(value: string): string {
  const name = /var\((--theme-[\w-]+)\)/.exec(value)?.[1];
  const resolved = name ? tokens.get(name) : value.toLowerCase().replace(/^#(\w)(\w)(\w)$/, "#$1$1$2$2$3$3");
  if (!resolved || !/^#[0-9a-f]{6}$/.test(resolved)) throw new Error(`cannot resolve ${value}`);
  return resolved;
}

function luminance(colour: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(colour.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

describe("PhoneAlertsCard colours meet WCAG 2.1 AA", () => {
  const surface = hex(declaration(css, ".phone-alerts-card", "background"));

  it.each([
    ["card title", ".phone-alerts-card strong", surface],
    ["card text", ".phone-alerts-card p", surface],
  ])("%s is at least 4.5:1", (_, selector, background) => {
    expect(contrast(hex(declaration(css, selector, "color")), background)).toBeGreaterThanOrEqual(4.5);
  });

  it("the bell is at least 3:1 on its tile (a graphic, WCAG 1.4.11)", () => {
    const tile = ".phone-alerts-tile";
    expect(contrast(hex(declaration(css, tile, "color")), hex(declaration(css, tile, "background")))).toBeGreaterThanOrEqual(3);
  });

  it("the shared buttons are at least 4.5:1 and the focus ring 3:1", () => {
    expect(contrast(hex(declaration(appCss, ".nf-button", "color")), hex(declaration(appCss, ".nf-button", "background")))).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(hex(declaration(appCss, ".secondary-button", "color")), hex(declaration(appCss, ".secondary-button", "background"))),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens.get("--theme-focus")!, surface)).toBeGreaterThanOrEqual(3);
  });
});
