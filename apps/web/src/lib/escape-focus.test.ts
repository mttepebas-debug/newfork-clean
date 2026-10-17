import { afterEach, describe, expect, it } from "vitest";
import { installEscapeFocus } from "./escape-focus";
let dispose: (() => void) | undefined;
// jsdom has no PointerEvent.
const pointer = (pointerType: string) => Object.assign(new Event("pointerdown"), { pointerType });
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});
describe("Escape focus presentation", () => {
  it("suppresses Escape rings without losing the restored focus and restores keyboard cues on Tab", () => {
    dispose = installEscapeFocus(window, document);
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(document.documentElement.dataset.escapeFocus).toBe("true");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    expect(document.documentElement.dataset.escapeFocus).toBe("true");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }),
    );
    expect(document.documentElement.dataset.escapeFocus).toBeUndefined();
  });
  it("resets presentation for the next pointer interaction and cleans up listeners", () => {
    dispose = installEscapeFocus(window, document);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    window.dispatchEvent(new Event("pointerdown"));
    expect(document.documentElement.dataset.escapeFocus).toBeUndefined();
    dispose();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.documentElement.dataset.escapeFocus).toBeUndefined();
  });
  // BL-899: a drawer opened from the keyboard keeps its first focus ring; one
  // opened with the pointer hides it until Tab (jobs-settings.css).
  it("marks the page while the last input came from the keyboard", () => {
    dispose = installEscapeFocus(window, document);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(document.documentElement.dataset.keyboardInput).toBe("true");
    window.dispatchEvent(new Event("pointerdown"));
    expect(document.documentElement.dataset.keyboardInput).toBeUndefined();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    dispose();
    expect(document.documentElement.dataset.keyboardInput).toBeUndefined();
  });
  // Mert's phone notes 2026-10-17 #3: under a finger a sheet's first focus
  // draws no ring; a physical keyboard brings rings back, typing in a field
  // on the screen's keyboard does not.
  it("marks the page while a finger is in use", () => {
    dispose = installEscapeFocus(window, document);
    const field = document.createElement("input");
    document.body.append(field);
    window.dispatchEvent(pointer("touch"));
    expect(document.documentElement.dataset.touchInput).toBe("true");
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(document.documentElement.dataset.touchInput).toBe("true");
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.documentElement.dataset.touchInput).toBeUndefined();
    window.dispatchEvent(pointer("touch"));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(document.documentElement.dataset.touchInput).toBeUndefined();
    window.dispatchEvent(pointer("touch"));
    window.dispatchEvent(pointer("mouse"));
    expect(document.documentElement.dataset.touchInput).toBeUndefined();
    window.dispatchEvent(pointer("touch"));
    dispose();
    expect(document.documentElement.dataset.touchInput).toBeUndefined();
  });
});
