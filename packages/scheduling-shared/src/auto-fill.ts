export type AutoFillState = "preferred" | "available" | "limited";

export interface AutoFillCandidate {
  readonly employee_id: string;
  readonly state: AutoFillState;
  readonly running_week_minutes: number; // seeded with the employee's already-scheduled week load
  readonly is_primary_role: boolean;
  readonly has_adjacent_shift: boolean;
}

export interface AutoFillShift {
  readonly shift_id: string;
  readonly scheduled_date: string;
  readonly duration_minutes: number;
  readonly candidates: readonly AutoFillCandidate[]; // pre-filtered: no unavailable, no hard conflict, eligible only
}

export interface AutoFillWeights {
  readonly preferred: number;
  readonly limited: number;
  readonly fairness: number; // per fully-idle candidate advantage
  readonly primaryRole: number;
  readonly continuity: number;
}

export const DEFAULT_AUTO_FILL_WEIGHTS: AutoFillWeights = {
  preferred: 100,
  limited: -100,
  fairness: 50,
  primaryRole: 30,
  continuity: 20,
};

export interface AutoFillProposal {
  readonly shift_id: string;
  readonly employee_id: string;
  readonly reasons: string[];
}

export interface AutoFillResult {
  readonly proposals: AutoFillProposal[];
  readonly unfilled: { shift_id: string }[];
}

// Fairness: reward the least-loaded candidate in this shift's pool. Normalized to
// [0,1] against the pool's own spread so absolute minute counts don't dominate.
function fairnessFactor(minutes: number, minMinutes: number, maxMinutes: number): number {
  if (maxMinutes === minMinutes) return 1; // all equal; no differentiation
  return 1 - (minutes - minMinutes) / (maxMinutes - minMinutes);
}

export function scoreCandidate(
  c: AutoFillCandidate,
  pool: readonly AutoFillCandidate[],
  weights: AutoFillWeights,
): { score: number; reasons: string[] } {
  const mins = pool.map((p) => p.running_week_minutes);
  const minMinutes = Math.min(...mins);
  const maxMinutes = Math.max(...mins);
  const reasons: string[] = [];
  let score = 0;

  if (c.state === "preferred") {
    score += weights.preferred;
    reasons.push("Preferred for this time");
  } else if (c.state === "limited") {
    score += weights.limited;
    reasons.push("Marked limited");
  }

  const fair = fairnessFactor(c.running_week_minutes, minMinutes, maxMinutes);
  score += weights.fairness * fair;
  if (fair >= 0.999 && maxMinutes !== minMinutes) reasons.push("Fewest hours so far this week");

  if (c.is_primary_role) {
    score += weights.primaryRole;
    reasons.push("Primary role");
  }
  if (c.has_adjacent_shift) {
    score += weights.continuity;
    reasons.push("Continues an existing shift");
  }

  return { score, reasons };
}

// Repair sweeps. Each sweep is the same cost as the greedy pass, and in practice
// the second one already reports no change; the cap only exists so a pathological
// weight set cannot cycle forever.
const MAX_REPAIR_SWEEPS = 4;

// Score comparisons are on floats (fairness is fractional), so a move has to beat
// the incumbent by more than rounding noise to be taken.
const SCORE_EPSILON = 1e-9;

export function planAutoFill(
  shifts: readonly AutoFillShift[],
  weights: AutoFillWeights = DEFAULT_AUTO_FILL_WEIGHTS,
): AutoFillResult {
  const unfilled: { shift_id: string }[] = [];

  // Running load per employee, mutated as assignments are made and moved. Seeded
  // from the candidate rows; every row for a given employee carries the same
  // already-scheduled week total, so the first one seen wins.
  const load = new Map<string, number>();
  for (const s of shifts) {
    for (const c of s.candidates) {
      if (!load.has(c.employee_id)) load.set(c.employee_id, c.running_week_minutes);
    }
  }

  const livePool = (s: AutoFillShift): AutoFillCandidate[] =>
    s.candidates.map((c) => ({ ...c, running_week_minutes: load.get(c.employee_id)! }));

  // Highest-scoring candidate for a shift at the current load. The shift's own
  // duration must already be lifted out of the incumbent's load by the caller so
  // the incumbent is not penalised for the very assignment being re-examined.
  function pickBest(s: AutoFillShift): { employeeId: string; score: number } | null {
    const pool = livePool(s);
    let best: { employeeId: string; score: number; minutes: number } | null = null;
    for (const c of pool) {
      const { score: base } = scoreCandidate(c, pool, weights);
    const score = base;
      // tie-break: higher score, then lower live load, then employee_id asc
      if (
        best === null ||
        score > best.score ||
        (score === best.score && c.running_week_minutes < best.minutes) ||
        (score === best.score &&
          c.running_week_minutes === best.minutes &&
          c.employee_id < best.employeeId)
      ) {
        best = { employeeId: c.employee_id, score, minutes: c.running_week_minutes };
      }
    }
    return best ? { employeeId: best.employeeId, score: best.score } : null;
  }

  // Score one named employee against a shift, with reasons. Null when that
  // employee is not a candidate for the shift.
  function scoreAssignment(
    s: AutoFillShift,
    employeeId: string,
  ): { score: number; reasons: string[] } | null {
    const pool = livePool(s);
    const c = pool.find((p) => p.employee_id === employeeId);
    if (!c) return null;
    const { score, reasons } = scoreCandidate(c, pool, weights);
    return { score, reasons };
  }

  // Hardest-to-fill first, so a shift with one eligible person is served before
  // a contested one can spend that person.
  const order = [...shifts].sort(
    (a, b) =>
      a.candidates.length - b.candidates.length ||
      a.scheduled_date.localeCompare(b.scheduled_date) ||
      a.shift_id.localeCompare(b.shift_id),
  );

  const assigned = new Map<string, string>(); // shift_id -> employee_id
  for (const s of order) {
    const best = s.candidates.length > 0 ? pickBest(s) : null;
    if (!best) {
      unfilled.push({ shift_id: s.shift_id });
      continue;
    }
    assigned.set(s.shift_id, best.employeeId);
    load.set(best.employeeId, load.get(best.employeeId)! + s.duration_minutes);
  }

  // Repair the greedy pass's myopia. Ordering by scarcity still commits each
  // shift before the rest of the week exists, so the first pass can spend the one
  // person who was also the strongest fit for a shift ranked later. The classic
  // symptom is a preferred employee burned on a shift that had an equally good
  // alternative, leaving a later shift to a "limited" body. Re-picking every
  // shift against the FINAL loads unwinds that: the shift is temporarily taken
  // off its assignee's books, re-bid, and moved only if someone strictly beats
  // the incumbent. Strictness is what keeps it from oscillating on ties.
  //
  // limitation: single-shift moves only; it cannot discover a fix that needs two
  // shifts to trade simultaneously. Upgrade to min-cost-flow if real schedules
  // still show bad placements.
  const filled = order.filter((s) => assigned.has(s.shift_id));
  for (let sweep = 0; sweep < MAX_REPAIR_SWEEPS; sweep++) {
    let moved = false;
    for (const s of filled) {
      const incumbent = assigned.get(s.shift_id)!;
      load.set(incumbent, load.get(incumbent)! - s.duration_minutes);
      const current = scoreAssignment(s, incumbent)!;
      const best = pickBest(s)!;
      if (best.employeeId !== incumbent && best.score > current.score + SCORE_EPSILON) {
        assigned.set(s.shift_id, best.employeeId);
        moved = true;
      }
      const winner = assigned.get(s.shift_id)!;
      load.set(winner, load.get(winner)! + s.duration_minutes);
    }
    if (!moved) break;
  }

  // Reasons are derived once at the end so they describe the assignment that
  // actually shipped rather than an intermediate pick that repair moved on from.
  const byShiftId = new Map<string, AutoFillProposal>();
  for (const s of filled) {
    const employeeId = assigned.get(s.shift_id)!;
    load.set(employeeId, load.get(employeeId)! - s.duration_minutes);
    const scored = scoreAssignment(s, employeeId);
    load.set(employeeId, load.get(employeeId)! + s.duration_minutes);
    byShiftId.set(s.shift_id, {
      shift_id: s.shift_id,
      employee_id: employeeId,
      reasons: scored?.reasons ?? [],
    });
  }

  // Emit proposals in the input order for a stable, readable API response.
  return {
    proposals: shifts
      .map((s) => byShiftId.get(s.shift_id))
      .filter((p): p is AutoFillProposal => !!p),
    unfilled,
  };
}
