import { describe, expect, it, vi } from "vitest";
import { createReviewSitting } from "./review-sitting";

// K1 decision 5: what a manager typed stays with its document while the page is open.
describe("createReviewSitting", () => {
  it("keeps one draft per document and hands back the same object until it changes", () => {
    const sitting = createReviewSitting();
    const empty = sitting.draft("a");
    expect(empty).toEqual({});
    expect(sitting.draft("a")).toBe(empty);
    sitting.setDraft("a", (d) => ({ ...d, reason: { for: "v1", value: "Blurry" } }));
    const typed = sitting.draft("a");
    expect(typed).toEqual({ reason: { for: "v1", value: "Blurry" } });
    expect(sitting.draft("a")).toBe(typed);
    expect(sitting.draft("b")).toEqual({});
  });
  it("tells its listeners about a change, and not about none", () => {
    const sitting = createReviewSitting();
    const listener = vi.fn();
    const stop = sitting.subscribe(listener);
    sitting.setDraft("a", (d) => d);
    expect(listener).not.toHaveBeenCalled();
    sitting.setDraft("a", () => ({ reason: { for: "v1", value: "x" } }));
    expect(listener).toHaveBeenCalledOnce();
    stop();
    sitting.setDraft("a", () => ({}));
    expect(listener).toHaveBeenCalledOnce();
    expect(sitting.draft("a")).toEqual({});
  });
  it("remembers which documents were answered in this sitting", () => {
    const sitting = createReviewSitting();
    const listener = vi.fn();
    sitting.subscribe(listener);
    expect(sitting.answered("a")).toBe(false);
    sitting.answer("a");
    sitting.answer("a");
    expect(sitting.answered("a")).toBe(true);
    expect(sitting.answered("b")).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
  });
});
