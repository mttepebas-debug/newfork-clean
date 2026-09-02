import { describe, expect, test } from "vitest";

import { planAutoFill } from "./auto-fill.js";
import type { AutoFillCandidate, AutoFillShift } from "./auto-fill.js";

function cand(over: Partial<AutoFillCandidate> & { employee_id: string }) {
  return {
    state: "available",
    running_week_minutes: 0,
    is_primary_role: false,
    has_adjacent_shift: false,
    ...over,
  } as const;
}
function shift(over: Partial<AutoFillShift> & { shift_id: string }): AutoFillShift {
  return {
    scheduled_date: "2026-07-13",
    duration_minutes: 480,
    candidates: [],
    ...over,
  };
}

describe("planAutoFill", () => {
  test("preferred outranks available for the same shift", () => {
    const r = planAutoFill([
      shift({
        shift_id: "s1",
        candidates: [
          cand({ employee_id: "a", state: "available" }),
          cand({ employee_id: "b", state: "preferred" }),
        ],
      }),
    ]);
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0]).toMatchObject({ shift_id: "s1", employee_id: "b" });
    expect(r.proposals[0]?.reasons).toContain("Preferred for this time");
  });

  test("shift with no candidates is unfilled, never crashes", () => {
    const r = planAutoFill([shift({ shift_id: "s1", candidates: [] })]);
    expect(r.proposals).toEqual([]);
    expect(r.unfilled).toEqual([{ shift_id: "s1" }]);
  });

  test("fairness: within one pass, the second shift avoids the already-loaded employee", () => {
    // Two identical shifts, two identical candidates: each employee gets one, not both to one.
    const cands = () => [cand({ employee_id: "a" }), cand({ employee_id: "b" })];
    const r = planAutoFill([
      shift({ shift_id: "s1", candidates: cands() }),
      shift({ shift_id: "s2", candidates: cands() }),
    ]);
    const assignees = r.proposals.map((p) => p.employee_id).sort();
    expect(assignees).toEqual(["a", "b"]);
  });

  test("hardest-to-fill first: the single-candidate shift is served before the contested one", () => {
    const r = planAutoFill([
      shift({
        shift_id: "contested",
        candidates: [cand({ employee_id: "a" }), cand({ employee_id: "b" })],
      }),
      shift({ shift_id: "only-a", candidates: [cand({ employee_id: "a" })] }),
    ]);
    // "only-a" must get a; contested then falls to b.
    expect(r.proposals.find((p) => p.shift_id === "only-a")?.employee_id).toBe("a");
    expect(r.proposals.find((p) => p.shift_id === "contested")?.employee_id).toBe("b");
    expect(r.unfilled).toEqual([]);
  });

  test("deterministic tie-break by employee_id when all else equal", () => {
    const r = planAutoFill([
      shift({
        shift_id: "s1",
        candidates: [cand({ employee_id: "z" }), cand({ employee_id: "a" })],
      }),
    ]);
    expect(r.proposals[0]!.employee_id).toBe("a");
  });

  test("repair pass undoes a myopic greedy pick", () => {
    // Both shifts have two candidates, so scarcity ordering cannot separate them
    // and s1 is served first. Greedy hands s1 to "a" (tie-break on employee_id),
    // then s2 to "a" again; "a" loaded is still worth more than a limited "c".
    // Re-bidding against the final loads has to move s1 to "b", which frees "a"
    // for s2 and keeps "c" out of the schedule entirely.
    const r = planAutoFill([
      shift({
        shift_id: "s1",
        candidates: [
          cand({ employee_id: "a", state: "preferred" }),
          cand({ employee_id: "b", state: "preferred" }),
        ],
      }),
      shift({
        shift_id: "s2",
        candidates: [
          cand({ employee_id: "a", state: "preferred" }),
          cand({ employee_id: "c", state: "limited" }),
        ],
      }),
    ]);
    expect(r.proposals.find((p) => p.shift_id === "s1")?.employee_id).toBe("b");
    expect(r.proposals.find((p) => p.shift_id === "s2")?.employee_id).toBe("a");
  });

  test("limited is penalized below available", () => {
    const r = planAutoFill([
      shift({
        shift_id: "s1",
        candidates: [
          cand({ employee_id: "lim", state: "limited" }),
          cand({ employee_id: "av", state: "available" }),
        ],
      }),
    ]);
    expect(r.proposals[0]!.employee_id).toBe("av");
  });
});
