import { describe, expect, it, vi } from "vitest";
import { createReviewSitting } from "./review-sitting";

// K1 decision 5: what a manager typed stays with its document while the page is open.
describe("createReviewSitting", () => {
  it("keeps one draft per document and hands back the same object until it changes", () => {
    const sitting = createReviewSitting();
    const empty = sitting.draft("a");
    expect(empty).toEqual({});
    expect(sitting.draft("a")).toBe(empty);
    sitting.setDraft("a", (d) => ({ ...d, reasons: { for: "v1", value: { file: "Blurry" } } }));
    const typed = sitting.draft("a");
    expect(typed).toEqual({ reasons: { for: "v1", value: { file: "Blurry" } } });
    expect(sitting.draft("a")).toBe(typed);
    expect(sitting.draft("b")).toEqual({});
  });
  it("tells its listeners about a change, and not about none", () => {
    const sitting = createReviewSitting();
    const listener = vi.fn();
    const stop = sitting.subscribe(listener);
    sitting.setDraft("a", (d) => d);
    expect(listener).not.toHaveBeenCalled();
    sitting.setDraft("a", () => ({ choices: { for: "v1", value: { file: "reject" } } }));
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
  // A2 Tur 6: what a Save did stays on its document's dock while the page is open, until a new change there.
  it("keeps what a Save did with its answer, and drops both on a new change", () => {
    const sitting = createReviewSitting();
    const listener = vi.fn();
    sitting.subscribe(listener);
    const result = { kind: "approved" as const, at: "2026-10-23T18:00:00Z", expires: null };
    expect(sitting.result("a")).toBeUndefined();
    sitting.answer("a", result);
    expect([sitting.answered("a"), sitting.result("a")]).toEqual([true, result]);
    expect(sitting.result("b")).toBeUndefined();
    expect(listener).toHaveBeenCalledOnce();
    sitting.reopen("a");
    sitting.reopen("a");
    sitting.reopen("b");
    expect([sitting.answered("a"), sitting.result("a")]).toEqual([false, undefined]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
