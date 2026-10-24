import type { DocumentObligationStatus } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import {
  documentWaits,
  neighbours,
  nextWaiting,
  queueLabel,
  snapshotQueue,
} from "./review-queue";

const row = (
  id: string,
  employee_id: string,
  employee_name: string,
  title: string,
  status: DocumentObligationStatus = "pending_review",
) => ({ id, employee_id, employee_name, title, status });
const byName = (a: { employee_name: string }, b: { employee_name: string }) =>
  a.employee_name.localeCompare(b.employee_name);

// K1 decision 6: the drawer walks the open tab's rows as they were shown when it opened.
describe("snapshotQueue", () => {
  const ana = row("ana", "p-ana", "Ana Ruiz", "Food Handler Card");
  const daniel = row("daniel", "p-daniel", "Daniel Kim", "I-9");
  const maria = row("maria", "p-maria", "Maria Lopez", "Food Handler Card");
  it("keeps the shown rows in their shown order", () => {
    expect(snapshotQueue([ana, daniel, maria], daniel, byName).map((r) => r.id)).toEqual([
      "ana",
      "daniel",
      "maria",
    ]);
  });
  it("puts an opened row the tab does not show at its place in the order", () => {
    expect(snapshotQueue([ana, maria], daniel, byName).map((r) => r.id)).toEqual([
      "ana",
      "daniel",
      "maria",
    ]);
    expect(snapshotQueue([ana, daniel], maria, byName).map((r) => r.id)).toEqual([
      "ana",
      "daniel",
      "maria",
    ]);
    expect(snapshotQueue([], maria, byName).map((r) => r.id)).toEqual(["maria"]);
  });
  it("is the shown rows alone when nothing is opened", () => {
    expect(snapshotQueue([ana], undefined, byName).map((r) => r.id)).toEqual(["ana"]);
  });
});

describe("neighbours", () => {
  const queue = [row("a", "1", "A", "T"), row("b", "2", "B", "T"), row("c", "3", "C", "T")];
  it("names the row before and after, and nothing past either end", () => {
    expect(neighbours(queue, "b")).toEqual({ previous: queue[0], next: queue[2] });
    expect(neighbours(queue, "a")).toEqual({ previous: null, next: queue[1] });
    expect(neighbours(queue, "c")).toEqual({ previous: queue[1], next: null });
  });
  it("has no neighbours for a document outside the queue", () => {
    expect(neighbours(queue, "z")).toEqual({ previous: null, next: null });
  });
});

// K1 decision 7: a neighbour is named by its person, or by its document when it is the same person's.
describe("queueLabel", () => {
  const current = row("card", "p-maria", "Maria Lopez", "Food Handler Card");
  it("names another person's document by the person", () => {
    expect(queueLabel(row("i9", "p-ana", "Ana Ruiz", "I-9"), current)).toBe("Ana Ruiz");
  });
  it("names the same person's other document by its title", () => {
    expect(queueLabel(row("i9", "p-maria", "Maria Lopez", "I-9"), current)).toBe("I-9");
  });
});

describe("documentWaits", () => {
  it("waits while someone still owes something, the time zone included", () => {
    for (const status of ["pending_review", "timezone_required", "missing", "grace", "rejected", "expired"] as const)
      expect(documentWaits(status)).toBe(true);
  });
  it("does not wait once it is done, excused, paused or removed", () => {
    for (const status of ["completed", "exempt", "paused", "removed"] as const)
      expect(documentWaits(status)).toBe(false);
  });
});

// K1 decision 6: "Next: <label>" after a decision skips what was answered in this sitting and what no longer waits.
describe("nextWaiting", () => {
  const queue = [
    row("a", "1", "A", "T"),
    row("b", "2", "B", "T", "completed"),
    row("c", "3", "C", "T"),
    row("d", "4", "D", "T", "missing"),
  ];
  const none = () => false;
  it("is the next one still waiting after the open one", () => {
    expect(nextWaiting(queue, "a", none)?.id).toBe("c");
  });
  it("skips what was answered in this sitting", () => {
    expect(nextWaiting(queue, "a", (id) => id === "c")?.id).toBe("d");
  });
  it("goes back to the first one still waiting before it when none waits after it", () => {
    expect(nextWaiting(queue, "d", none)?.id).toBe("a");
  });
  it("is nobody when nothing else waits", () => {
    expect(nextWaiting(queue, "a", (id) => id !== "a")).toBeNull();
    expect(nextWaiting([queue[0]!], "a", none)).toBeNull();
  });
  it("starts from the front for a document outside the queue", () => {
    expect(nextWaiting(queue, "z", none)?.id).toBe("a");
  });
});
