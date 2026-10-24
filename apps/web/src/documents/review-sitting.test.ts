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
  // The document as it reads now: its id, status and the version sent.
  const a = { id: "a", status: "completed" as const, submitted_id: "v1" };
  const b = { id: "b", status: "pending_review" as const, submitted_id: "v1" };
  it("remembers which documents were answered in this sitting", () => {
    const sitting = createReviewSitting();
    const listener = vi.fn();
    sitting.subscribe(listener);
    expect(sitting.answered(a)).toBe(false);
    sitting.answer("a", "v1");
    sitting.answer("a", "v1");
    expect(sitting.answered(a)).toBe(true);
    expect(sitting.answered(b)).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
  });
  // A2 Tur 6: what a Save did stays on its document's dock while the page is open, until a new change there.
  it("keeps what a Save did with its answer, and drops both on a new change", () => {
    const sitting = createReviewSitting();
    const listener = vi.fn();
    sitting.subscribe(listener);
    const result = { kind: "approved" as const, at: "2026-10-23T18:00:00Z", expires: null };
    expect(sitting.result(a)).toBeUndefined();
    sitting.answer("a", "v1", result);
    expect([sitting.answered(a), sitting.result(a)]).toEqual([true, result]);
    expect(sitting.result(b)).toBeUndefined();
    expect(listener).toHaveBeenCalledOnce();
    sitting.reopen("a");
    sitting.reopen("a");
    sitting.reopen("b");
    expect([sitting.answered(a), sitting.result(a)]).toEqual([false, undefined]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
  // K1 fix pass: an answer is the answer to the version it decided. A version sent after it, waiting for review, is
  // new to decide: the answer and its result no longer stand for it (the green saves again, Next stops there).
  it("lets an answer stand only until a newer version waits for review", () => {
    const sitting = createReviewSitting();
    const result = { kind: "approved" as const, at: "2026-10-23T18:00:00Z", expires: null };
    sitting.answer("a", "v1", result);
    expect(sitting.answered({ ...a, status: "expired" })).toBe(true);
    expect(sitting.answered({ ...a, status: "pending_review", submitted_id: "v1" })).toBe(true);
    const sentAgain = { ...a, status: "pending_review" as const, submitted_id: "v2" };
    expect(sitting.answered(sentAgain)).toBe(false);
    expect(sitting.result(sentAgain)).toBeUndefined();
    // Answered while nothing was sent; the first version sent waits for review.
    sitting.answer("m", null, { kind: "extended", at: result.at, days: 3 });
    expect(sitting.answered({ id: "m", status: "missing", submitted_id: null })).toBe(true);
    expect(sitting.answered({ id: "m", status: "pending_review", submitted_id: "v1" })).toBe(false);
  });
});
