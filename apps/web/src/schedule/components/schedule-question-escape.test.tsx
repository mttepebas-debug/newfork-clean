import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleConflictSheet } from "./ScheduleConflictSheet";

// BL-757: the editor opens these questions from a later update (the availability check answering).
// React draws such an update and runs its effects in a separate, later task, so the box is on screen
// before an effect-attached Escape listener exists. A user, or a test that presses Escape as soon as
// the box is found (findByRole watches the DOM the same way), lost the key; under the full suite
// 1 run in 20 did. Here Escape is pressed in the very moment the box first appears in the DOM.
async function pressEscapeOnFirstSight(question: ReactElement) {
  const previous = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  // A plain render, as in the app: inside act() React would run the effects before the DOM is seen.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('[role="dialog"]')) return;
        observer.disconnect();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        resolve();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      root.render(question);
    });
  } finally {
    root.unmount();
    host.remove();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("a Schedule question hears Escape from the moment it is on screen (BL-757)", () => {
  it("the rule box", async () => {
    const onDismiss = vi.fn();
    await pressEscapeOnFirstSight(
      <ScheduleConflictSheet open messages={["Location is closed all day."]} submitLabel="Place shift" onSubmit={vi.fn()} onDismiss={onDismiss} />,
    );
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
