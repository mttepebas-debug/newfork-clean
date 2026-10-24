import { describe, expect, it } from "vitest";
import type { DocumentObligationStatus } from "@newfork/shared";
import { filesNote, greenFor, greenKey, resultLine, timezoneNote, waitingNote } from "./review-dock";

// The dock of the manager's review drawer: one line and one green button (A2 Tur 6, mockup-spec 15).
const progress = (open: number, rejected: number, missingReason: number, total = 2) => ({
  total,
  open,
  rejected,
  missingReason,
  ready: open === 0 && missingReason === 0,
});

describe("the line over Save", () => {
  it("says what the files still need, then what Save will do", () => {
    const at = { phone: false, first: "Maria", expires: "Mar 31, 2029" };
    expect(filesNote(progress(2, 0, 0), at)).toBe("Approve or reject each file · 2 left");
    expect(filesNote(progress(0, 1, 1), at)).toBe("Add a reason for each rejected file");
    expect(filesNote(progress(0, 0, 0), at)).toBe("Save approves it · On file until Mar 31, 2029");
    expect(filesNote(progress(0, 0, 0), { ...at, expires: null })).toBe("Save approves it");
    expect(filesNote(progress(0, 1, 0), at)).toBe("Save sends it back to Maria · 1 of 2 files rejected");
    expect(filesNote(progress(0, 1, 0, 1), at)).toBe("Save sends it back to Maria · the file is rejected");
    expect(filesNote(progress(0, 2, 0), { ...at, phone: true })).toBe("Save sends it back · 2 of 2 files rejected");
  });
  it("points a document with nothing to review at what can be done below", () => {
    const at = { phone: false, first: "Daniel", label: "Missing" };
    expect(waitingNote({ ...at, extend: true, excuse: true })).toBe(
      "Nothing to review · Extend the deadline or excuse Daniel below",
    );
    expect(waitingNote({ ...at, phone: true, extend: true, excuse: true })).toBe(
      "Nothing to review · Extend or excuse below",
    );
    expect(waitingNote({ ...at, extend: false, excuse: true })).toBe("Nothing to review · Excuse Daniel below");
    expect(waitingNote({ ...at, phone: true, extend: false, excuse: true })).toBe("Nothing to review · Excuse below");
    expect(waitingNote({ ...at, extend: true, excuse: false })).toBe("Nothing to review · Extend the deadline below");
    expect(waitingNote({ ...at, extend: false, excuse: false })).toBe("Missing · Nothing to decide here.");
  });
  it("says what a time zone row needs (K1 decision 12)", () => {
    expect(timezoneNote(true)).toBe("Time zone needed · Choose the document time zone above and save it");
    expect(timezoneNote(false)).toBe("Time zone needed · An administrator needs to set the document time zone");
  });
});

describe("the result of a Save", () => {
  const now = (status: DocumentObligationStatus, extra: { expiry?: string; due?: string } = {}) => ({
    status,
    expiry: extra.expiry ?? null,
    due: extra.due ?? null,
  });
  const at = "2026-10-23T18:00:00Z";
  it("says an approval and that the person is told", () => {
    const approved = { kind: "approved" as const, at, expires: "Mar 31, 2029" };
    expect(resultLine(approved, { first: "Ana", phone: false, end: false, now: now("completed") })).toEqual({
      tone: "ok",
      word: "Approved",
      text: "On file until Mar 31, 2029. Ana is told.",
      title: "Approved · On file until Mar 31, 2029. Ana is told.",
    });
    expect(resultLine(approved, { first: "Ana", phone: false, end: true, now: now("completed") }).text).toBe(
      "On file until Mar 31, 2029. Ana is told. All caught up.",
    );
    expect(resultLine(approved, { first: "Ana", phone: true, end: true, now: now("completed") }).text).toBe(
      "On file until Mar 31, 2029. All caught up.",
    );
    expect(
      resultLine({ ...approved, expires: null }, { first: "Ana", phone: false, end: false, now: now("completed") })
        .text,
    ).toBe("Ana is told.");
  });
  it("says a document sent back and the time the person has, by the first name", () => {
    const back = { kind: "sent_back" as const, at, time: { kind: "new" as const, days: 14 } };
    expect(resultLine(back, { first: "Maria", phone: false, end: false, now: now("rejected") })).toEqual({
      tone: "red",
      word: "Sent back",
      text: "Maria is told why and has a new 14 days.",
      title: "Sent back · Maria is told why and has a new 14 days.",
    });
    expect(resultLine(back, { first: "Maria", phone: true, end: true, now: now("rejected") }).text).toBe(
      "Maria has a new 14 days. All caught up.",
    );
    const left = { ...back, time: { kind: "left" as const, left: "3 days" } };
    expect(resultLine(left, { first: "Maria", phone: false, end: false, now: now("rejected") }).text).toBe(
      "Maria is told why and has 3 days left.",
    );
    expect(
      resultLine({ ...back, time: null }, { first: "Maria", phone: false, end: false, now: now("rejected") }).text,
    ).toBe("Maria is told why.");
  });
  // K1 decision 11: a renewal sent back while the old copy is still valid stays Completed.
  it("says the approved copy stays when the refreshed document is still completed", () => {
    const back = { kind: "sent_back" as const, at, time: { kind: "new" as const, days: 14 } };
    expect(
      resultLine(back, { first: "Maria", phone: false, end: false, now: now("completed", { expiry: "Dec 31, 2026" }) }),
    ).toEqual({
      tone: "red",
      word: "Sent back",
      text: "Maria is told why. The approved copy stays on file until Dec 31, 2026.",
      title: "Sent back · Maria is told why. The approved copy stays on file until Dec 31, 2026.",
    });
    expect(
      resultLine(back, { first: "Maria", phone: true, end: true, now: now("completed") }).text,
    ).toBe("The approved copy stays on file. All caught up.");
    // A phone's line is short enough for 390 px.
    expect(
      resultLine(back, { first: "Maria", phone: true, end: false, now: now("completed", { expiry: "Dec 31, 2026" }) })
        .text,
    ).toBe("Maria is told why. The approved copy stays.");
  });
  // K1 decision 15: an extension sends no notice, so nobody "is told".
  it("says an extension and its new date, and tells nobody", () => {
    const extended = { kind: "extended" as const, at, days: 10 };
    expect(
      resultLine(extended, { first: "Daniel", phone: false, end: false, now: now("missing", { due: "Fri, Nov 6" }) }),
    ).toEqual({
      tone: "warn",
      word: "Deadline extended 10 days",
      text: "New due date Fri, Nov 6.",
      title: "Deadline extended 10 days · New due date Fri, Nov 6.",
    });
    const phone = resultLine(extended, {
      first: "Daniel",
      phone: true,
      end: false,
      now: now("missing", { due: "Fri, Nov 6" }),
    });
    expect([phone.word, phone.text]).toEqual(["Extended 10 days", "Due Fri, Nov 6."]);
  });
  it("says an excuse, and who is no longer asked", () => {
    const excused = { kind: "excused" as const, at };
    expect(resultLine(excused, { first: "Daniel", phone: false, end: false, now: now("missing") })).toEqual({
      tone: "muted",
      word: "Excused",
      text: "Daniel won't be asked for it.",
      title: "Excused · Daniel won't be asked for it.",
    });
    expect(resultLine(excused, { first: "Daniel", phone: true, end: true, now: now("missing") }).text).toBe(
      "Daniel won't be asked for it. All caught up.",
    );
  });
  // K1 decision 3: an excuse taken back asks for the document again, by the refreshed due date.
  it("says a document asked for again, and by when", () => {
    const asked = { kind: "asked" as const, at };
    expect(
      resultLine(asked, { first: "Daniel", phone: false, end: false, now: now("missing", { due: "Fri, Nov 6" }) }),
    ).toEqual({
      tone: "muted",
      word: "Asked again",
      text: "Daniel needs to send it by Fri, Nov 6.",
      title: "Asked again · Daniel needs to send it by Fri, Nov 6.",
    });
    expect(resultLine(asked, { first: "Daniel", phone: false, end: true, now: now("missing") }).text).toBe(
      "Daniel needs to send it again. All caught up.",
    );
  });
  // K1 fix pass: the server asks nothing when a valid approved copy is on file (Completed), and closes the document
  // when the person no longer matches it (Removed); the line follows the refreshed status, as decision 11's does.
  it("says nothing new is asked when the approved copy still counts, or the person no longer needs it", () => {
    const asked = { kind: "asked" as const, at };
    expect(resultLine(asked, { first: "Priya", phone: false, end: true, now: now("completed") })).toEqual({
      tone: "muted",
      word: "Asked again",
      text: "The approved copy still counts. Nothing new is asked. All caught up.",
      title: "Asked again · The approved copy still counts. Nothing new is asked. All caught up.",
    });
    expect(resultLine(asked, { first: "Priya", phone: false, end: false, now: now("removed") }).text).toBe(
      "Priya no longer needs this document.",
    );
    for (const status of ["grace", "rejected", "expired"] as const)
      expect(resultLine(asked, { first: "Priya", phone: false, end: false, now: now(status) }).text).toBe(
        "Priya needs to send it again.",
      );
  });
});

describe("the green button", () => {
  const next = { id: "ana", label: "Ana Ruiz" };
  it("is Save while something can be saved, on only when it is ready", () => {
    expect(greenFor({ saving: true, ready: false, next })).toEqual({ act: "save", off: true });
    expect(greenFor({ saving: true, ready: true, next })).toEqual({ act: "save", off: false });
  });
  it("then goes to the next document still waiting, or closes", () => {
    expect(greenFor({ saving: false, ready: false, next })).toEqual({ act: "next", id: "ana", label: "Next: Ana Ruiz" });
    expect(greenFor({ saving: false, ready: false, next: null })).toEqual({ act: "close" });
  });
  it("keys its meaning by the document, what it does and for whom; turning on is not a new meaning", () => {
    expect(greenKey("maria", { act: "save", off: true })).toBe(greenKey("maria", { act: "save", off: false }));
    expect(greenKey("maria", { act: "save", off: false })).not.toBe(
      greenKey("maria", { act: "next", id: "ana", label: "Next: Ana Ruiz" }),
    );
    expect(greenKey("maria", { act: "close" })).not.toBe(greenKey("ana", { act: "close" }));
  });
  // mockup-spec 17.1: Save that now saves an open panel is a new meaning, so it holds too.
  it("keys an open panel into Save's meaning", () => {
    const save = { act: "save" as const, off: true };
    expect(greenKey("maria", save, "extend")).not.toBe(greenKey("maria", save));
    expect(greenKey("maria", save, "extend")).not.toBe(greenKey("maria", save, "excuse"));
    expect(greenKey("maria", save, null)).toBe(greenKey("maria", save));
  });
});
