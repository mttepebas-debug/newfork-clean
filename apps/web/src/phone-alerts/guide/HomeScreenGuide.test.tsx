import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeScreenGuide, type GuideBrowser } from "./HomeScreenGuide";
import { buildStage } from "./cards";
import { stepsFor, type StepSetKey } from "./steps";

// TELEFON-TUR2, V1 · Adım kartları: one card per step, played once; the page's own Share button first where
// the browser has one (Mert's iPhone, iOS 26), Safari's bar as the way back, Chrome's Share for Chrome.

const safari27: GuideBrowser = { browser: "safari", ios: 27 };
const dialog = () => screen.getByRole("dialog", { name: "Add Newfork to your Home Screen" });
const stepTitle = () => dialog().querySelector(".hsg-step")!.textContent!.replace(/\s+/g, " ").trim();
const count = () => dialog().querySelector(".hsg-count")!.textContent;
// The drawn title is hidden from screen readers (the live line reads it); its glyph chips carry names.
const chipIn = (name: string) => dialog().querySelector(`.hsg-step [aria-label="${name}"]`);
const button = (name: string | RegExp) => within(dialog()).getByRole("button", { name });

function open(where: GuideBrowser = safari27) {
  const onClose = vi.fn();
  render(<HomeScreenGuide where={where} onClose={onClose} />);
  return { onClose };
}

function withShare(share: ((data: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(window.navigator, "share", { value: share, configurable: true, writable: true });
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  withShare(undefined);
  vi.restoreAllMocks();
});

describe("Home Screen guide on iPhone Safari", () => {
  it("starts at the share sheet where the page can open it, and Try it now opens it", () => {
    const share = vi.fn().mockResolvedValue(undefined);
    withShare(share);
    const { onClose } = open();
    expect(count()).toBe("Step 1 of 3");
    expect(stepTitle()).toBe("Tap View More, then Add to Home Screen");
    expect(dialog().textContent).toContain("Try it now opens this list for you.");
    fireEvent.click(button("Next"));
    expect(stepTitle()).toBe("Keep Open as Web App on, then tap");
    fireEvent.click(button("Next"));
    expect(stepTitle()).toBe("Open Newfork from your Home Screen");
    fireEvent.click(button("Try it now"));
    expect(share).toHaveBeenCalledWith({ title: "Newfork", url: window.location.href });
    expect(onClose).toHaveBeenCalledWith("shared");
  });

  it("goes back to Safari's own menu when the list does not open, and remembers it", () => {
    withShare(vi.fn().mockResolvedValue(undefined));
    open();
    fireEvent.click(button("Use Safari’s menu instead"));
    expect(count()).toBe("Step 1 of 5");
    expect(stepTitle()).toBe("Tap at the left end of the address bar");
    expect(chipIn("Page Menu button")).toBeTruthy();
    cleanup();
    open();
    expect(count()).toBe("Step 1 of 5");
  });

  it("teaches Safari's bar where the page has no Share button; My bar looks different swaps the set", () => {
    open({ browser: "safari", ios: 26 });
    expect(count()).toBe("Step 1 of 5");
    expect(chipIn("More button")).toBeTruthy();
    fireEvent.click(button("My bar looks different"));
    expect(count()).toBe("Step 1 of 4");
    expect(stepTitle()).toBe("Tap in the bar at the bottom");
    fireEvent.click(button("Show the usual bar"));
    expect(count()).toBe("Step 1 of 5");
  });

  it("Back, Next, arrows and Escape move and close; it never asks for permission", () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { requestPermission, permission: "default" });
    const { onClose } = open({ browser: "safari", ios: 18 });
    expect((button("Back") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(count()).toBe("Step 2 of 4");
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(count()).toBe("Step 1 of 4");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledWith("esc");
    expect(requestPermission).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("names each step for a screen reader", () => {
    open({ browser: "safari", ios: 27 });
    expect(dialog().querySelector("[aria-live]")!.textContent).toBe(
      "Step 1 of 5: Tap the Page Menu button at the left end of the address bar.",
    );
  });
});

describe("Home Screen guide on iPhone Chrome", () => {
  it("starts from Chrome's own Share button, with no Safari words", () => {
    withShare(vi.fn().mockResolvedValue(undefined));
    const { onClose } = open({ browser: "chrome", ios: null });
    expect(count()).toBe("Step 1 of 4");
    expect(stepTitle()).toBe("Tap at the right of the address bar");
    fireEvent.click(button("Next"));
    fireEvent.click(button("Next"));
    fireEvent.click(button("Next"));
    expect(dialog().textContent).toContain("It opens without Chrome’s bar. Sign in there.");
    fireEvent.click(button("Try it now"));
    expect(onClose).toHaveBeenCalledWith("done");
  });
});

describe("Every step's player", () => {
  const sets: StepSetKey[] = ["share", "share-18", "27-compact", "26-compact", "bar", "18", "chrome"];
  it.each(sets)("%s: each step plays under 5 seconds and finds its target", (set) => {
    for (const step of stepsFor(set)) {
      const stage = buildStage(step, set, set === "26-compact" ? 26 : set.includes("18") ? 18 : 27, 358);
      expect(stage.total).toBeGreaterThan(1000);
      expect(stage.total).toBeLessThan(5000);
      expect(stage.root.querySelector(".hsg-ring")).toBeTruthy();
    }
  });
});
