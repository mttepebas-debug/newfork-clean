import { describe, expect, it } from "vitest";
import {
  extendDays,
  extendState,
  extendedDeadline,
  optionCards,
  otherDays,
  panelName,
  panelNote,
  reasonState,
} from "./review-options";

// More options of the manager's review drawer (A2 Tur 6, mockup-spec 8-10): Extend deadline, Excuse, and on an
// excused document Ask for it again (K1 decisions 1 and 3). Today's rules decide which cards there are.

describe("the cards", () => {
  it("shows Extend only where today's drawer does, Excuse on any document not excused, Ask again on an excused one", () => {
    expect(optionCards({ extend: true, excuse: true, again: false })).toEqual(["extend", "excuse"]);
    expect(optionCards({ extend: false, excuse: true, again: false })).toEqual(["excuse"]);
    expect(optionCards({ extend: false, excuse: false, again: true })).toEqual(["again"]);
    expect(optionCards({ extend: false, excuse: false, again: false })).toEqual([]);
  });
  it("names each panel as its card does", () => {
    expect(panelName("extend", "Maria")).toBe("Extend deadline");
    expect(panelName("excuse", "Maria")).toBe("Excuse Maria");
    expect(panelName("again", "Maria")).toBe("Ask for it again");
  });
});

describe("Extend deadline", () => {
  it("takes Other's days only as 1 to 3,650 whole days", () => {
    expect(otherDays("5")).toBe(5);
    expect(otherDays(" 12 ")).toBe(12);
    expect(otherDays("3650")).toBe(3650);
    for (const bad of ["", "0", "3651", "1.5", "-2", "12a", "00000"]) expect(otherDays(bad)).toBeNull();
  });
  it("adds the days of the picked choice, or Other's", () => {
    expect(extendDays(null, "")).toBeNull();
    expect(extendDays("3", "")).toBe(3);
    expect(extendDays("7", "40")).toBe(7);
    expect(extendDays("14", "")).toBe(14);
    expect(extendDays("other", "40")).toBe(40);
    expect(extendDays("other", "")).toBeNull();
  });
  it("moves the deadline by whole days, as the server does", () => {
    expect(extendedDeadline("2026-10-30T06:59:00.000Z", 7)).toBe("2026-11-06T06:59:00.000Z");
  });
  it("says what it still needs, in order, and is ready with days and a reason", () => {
    const at = "2026-10-30T06:59:00.000Z";
    expect(extendState({ pick: null, other: "", reason: "Clinic" }, at)).toEqual({
      need: "pick",
      ready: false,
      days: null,
      due: null,
    });
    expect(extendState({ pick: "other", other: "0", reason: "Clinic" }, at)).toEqual({
      need: "days",
      ready: false,
      days: null,
      due: null,
    });
    expect(extendState({ pick: "7", other: "", reason: "  " }, at)).toEqual({
      need: "reason",
      ready: false,
      days: 7,
      due: "2026-11-06T06:59:00.000Z",
    });
    expect(extendState({ pick: "7", other: "", reason: "Clinic closed" }, at)).toEqual({
      need: null,
      ready: true,
      days: 7,
      due: "2026-11-06T06:59:00.000Z",
    });
  });
});

describe("the line over Save while a panel is open", () => {
  it("says what Extend still needs, then where Save moves the date", () => {
    const words = { first: "Daniel", due: "Fri, Nov 6" };
    expect(panelNote("extend", { need: "pick", ready: false }, words)).toBe("Choose how much time to add");
    expect(panelNote("extend", { need: "days", ready: false }, words)).toBe("Enter 1 to 3,650 days");
    expect(panelNote("extend", { need: "reason", ready: false }, words)).toBe("Add a reason Daniel will see");
    expect(panelNote("extend", { need: null, ready: true }, words)).toBe("Save moves the due date to Fri, Nov 6");
  });
  it("says what Excuse and Ask for it again need, then what Save does", () => {
    const words = { first: "Daniel", due: null };
    expect(panelNote("excuse", { need: "reason", ready: false }, words)).toBe("Add a reason to excuse Daniel");
    expect(panelNote("excuse", { need: null, ready: true }, words)).toBe("Save excuses Daniel from this document");
    expect(panelNote("again", { need: "reason", ready: false }, words)).toBe("Add a reason to ask Daniel again");
    expect(panelNote("again", { need: null, ready: true }, words)).toBe("Save asks Daniel for this document again");
  });
  it("needs a reason that is more than spaces", () => {
    expect(reasonState("")).toEqual({ need: "reason", ready: false });
    expect(reasonState("   ")).toEqual({ need: "reason", ready: false });
    expect(reasonState("Role exception")).toEqual({ need: null, ready: true });
  });
});
