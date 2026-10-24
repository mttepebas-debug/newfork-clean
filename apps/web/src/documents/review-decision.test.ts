import { defaultDocumentLifecycleSettings } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import {
  composeReason,
  daysLeftLabel,
  periodChoices,
  reviewCommand,
  reviewProgress,
} from "./review-decision";

// The manager's per-file review (A2 Tur 6, file buttons design a; K1 decisions 9, 10 and 13).
const front = { id: "front", filename: "front.jpg" };
const back = { id: "back", filename: "back.jpg" };

describe("where a review stands", () => {
  it("starts with every file open: a stored keep is no choice (K1 decision 13)", () => {
    expect(reviewProgress([front, back], {}, {})).toEqual({
      total: 2,
      open: 2,
      rejected: 0,
      missingReason: 0,
      ready: false,
    });
  });
  it("is ready once every file is chosen and every rejected one has a reason", () => {
    expect(reviewProgress([front, back], { front: "approve", back: "reject" }, { back: "  " })).toEqual({
      total: 2,
      open: 0,
      rejected: 1,
      missingReason: 1,
      ready: false,
    });
    expect(
      reviewProgress([front, back], { front: "approve", back: "reject" }, { back: "Blurry photo." }).ready,
    ).toBe(true);
    expect(reviewProgress([front, back], { front: "approve", back: "approve" }, {}).ready).toBe(true);
  });
  it("ignores a choice for a file the version does not hold", () => {
    expect(reviewProgress([front], { gone: "reject" }, {}).open).toBe(1);
  });
});

describe("the document's reason (K1 decision 10)", () => {
  it("is the one rejected file's reason, a sentence", () => {
    expect(composeReason([front], { front: "reject" }, { front: " Blurry photo " })).toBe("Blurry photo.");
    expect(composeReason([front], { front: "reject" }, { front: "Is this yours?" })).toBe("Is this yours?");
  });
  it("names each rejected file when the version holds more than one", () => {
    expect(
      composeReason(
        [front, back],
        { front: "reject", back: "reject" },
        { front: "Wrong document", back: "Blurry photo. The number is cut off." },
      ),
    ).toBe("front.jpg: Wrong document. back.jpg: Blurry photo. The number is cut off.");
    expect(composeReason([front, back], { front: "approve", back: "reject" }, { front: "Old", back: "Blurry" })).toBe(
      "back.jpg: Blurry.",
    );
  });
  // K1 fix pass: the cap never drops a rejected file's reason. Long names go first (each file's own reason stands
  // under it as its note); then each reason gets its share, cut with an ellipsis.
  it("drops the file names before any rejected file's reason when the names make it pass 500", () => {
    const long = (name: string) => ({ id: name, filename: `${name}-${"x".repeat(230)}.pdf` });
    const files = [long("a"), long("b"), long("c")];
    expect(
      composeReason(
        files,
        { a: "reject", b: "reject", c: "reject" },
        { a: "Blurry photo", b: "Wrong document", c: "Expired" },
      ),
    ).toBe("Blurry photo. Wrong document. Expired.");
  });
  it("gives each rejected file's reason its share of the 500 characters, cut with an ellipsis", () => {
    const long = (name: string) => ({ id: name, filename: `${name}-${"x".repeat(236)}.pdf` });
    const files = [long("a"), long("b")];
    const first = `First ${"x".repeat(394)}`;
    const second = `Second ${"y".repeat(393)}`;
    const reason = composeReason(files, { a: "reject", b: "reject" }, { a: first, b: second });
    expect(reason).toBe(`${first.slice(0, 248)}… ${second.slice(0, 249)}…`);
    expect(reason).toHaveLength(500);
  });
  it("leaves a short reason whole and shares the rest among the long ones", () => {
    const files = [front, back, { id: "side", filename: "side.jpg" }];
    const long = "z".repeat(400);
    const reason = composeReason(
      files,
      { front: "reject", back: "reject", side: "reject" },
      { front: long, back: "Blurry", side: long },
    );
    expect(reason.length).toBeLessThanOrEqual(500);
    expect(reason).toContain(" Blurry. ");
    expect(reason.startsWith("zzz")).toBe(true);
    expect(reason.endsWith("…")).toBe(true);
    expect(reason.split(" ")).toHaveLength(3);
  });
});

describe("the command Save sends", () => {
  const base = { revision: 3, submissionId: "submission", files: [front, back] };
  // K1 decision 10: each file's note is 500 characters at most, whatever was typed or put there by a chip.
  it("caps each rejected file's note and the document's reason at 500 characters", () => {
    const command = reviewCommand({
      ...base,
      choices: { front: "reject", back: "approve" },
      reasons: { front: "w".repeat(600) },
      period: "full",
    });
    expect(command.files[0]).toEqual({ id: "front", decision: "discard", note: "w".repeat(500) });
    expect(command.reason).toHaveLength(500);
    expect(command.reason.endsWith("…")).toBe(true);
  });
  // A note stored on a file (today's drawer's "Optional file note", or carried into a correction) is kept: the
  // server writes what is sent.
  it("keeps a kept file's stored note", () => {
    const command = reviewCommand({
      ...base,
      files: [{ ...front, note: "  Copy from the front desk " }, { ...back, note: "x".repeat(520) }],
      choices: { front: "approve", back: "approve" },
      reasons: { front: "Typed, then approved" },
      period: "full",
    });
    expect(command.files).toEqual([
      { id: "front", decision: "keep", note: "Copy from the front desk" },
      { id: "back", decision: "keep", note: "x".repeat(500) },
    ]);
  });
  it("approves when every file is approved, with no reason and no notes", () => {
    expect(
      reviewCommand({
        ...base,
        choices: { front: "approve", back: "approve" },
        reasons: { back: "Typed, then approved" },
        period: "remaining",
      }),
    ).toEqual({
      revision: 3,
      submission_id: "submission",
      decision: "approve",
      reason: "",
      correction_period: "full",
      files: [
        { id: "front", decision: "keep", note: "" },
        { id: "back", decision: "keep", note: "" },
      ],
    });
  });
  it("sends the document back when one file is rejected, each file's own reason its note", () => {
    expect(
      reviewCommand({
        ...base,
        choices: { front: "approve", back: "reject" },
        reasons: { front: "ignored", back: " Blurry photo. " },
        period: "remaining",
      }),
    ).toEqual({
      revision: 3,
      submission_id: "submission",
      decision: "reject",
      reason: "back.jpg: Blurry photo.",
      correction_period: "remaining",
      files: [
        { id: "front", decision: "keep", note: "" },
        { id: "back", decision: "discard", note: "Blurry photo." },
      ],
    });
  });
});

describe("the time to send a new one (K1 decision 9)", () => {
  const obligation = (period_days: number | null, remaining_seconds: number | null) => ({
    settings: { ...defaultDocumentLifecycleSettings, period_days },
    remaining_seconds,
  });
  it("gives a new period of the document's own length, or today's words without one", () => {
    expect(periodChoices(obligation(14, 0)).full).toBe("A new 14 days");
    expect(periodChoices(obligation(1, 0)).full).toBe("A new 1 day");
    expect(periodChoices(obligation(null, 0)).full).toBe("Full correction period");
  });
  it("offers what is left only while some is left", () => {
    expect(periodChoices(obligation(14, 7 * 86_400 + 5)).remaining).toEqual({
      label: "What's left (7 days)",
      open: true,
    });
    expect(periodChoices(obligation(14, 3_600)).remaining).toEqual({
      label: "What's left (less than a day)",
      open: true,
    });
    expect(periodChoices(obligation(14, 0)).remaining).toEqual({ label: "What's left (0 days)", open: false });
    expect(periodChoices(obligation(14, null)).remaining).toEqual({ label: "What's left (0 days)", open: false });
  });
  it("says whole days left, rounded down", () => {
    expect(daysLeftLabel(86_400)).toBe("1 day");
    expect(daysLeftLabel(2 * 86_400 - 1)).toBe("1 day");
    expect(daysLeftLabel(86_399)).toBe("less than a day");
    expect(daysLeftLabel(0)).toBe("0 days");
  });
});
