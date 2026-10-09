import type { ExchangePreview } from "@newfork/shared";

// EKRAN-02 C2 (KARARLAR "Takas inceleme penceresi H2", uyarı kutuları,
// 2026-10-07): a rule that fails on one shift of a swap gets an orange box on
// that shift's card and a green box on the other card, so neither card has a
// gap; no rule fails, no box. Every value comes from the core's decision
// preview (ILKELER P11): the failing side's approval flag, the holding side's
// measure. Two short lines per box; the window draws them the same size.
// Approved time off is never given up by consent (KARARLAR §1.1, Mert,
// 2026-10-09): its box says the person can't take the shift, and the window
// keeps Approve off until the time off is shortened.

export type ReviewRule = "travel" | "rest" | "availability" | "time_off";
export interface ReviewBox {
  rule: ReviewRule;
  tone: "warn" | "ok";
  top: string;
  bottom: string;
}
export interface ReviewSide {
  /** The shift's date, yyyy-mm-dd. */
  date: string;
  /** The core's check of the person who takes this shift; null if it could not run. */
  check: Pick<ExchangePreview["receiver"], "approval_flags" | "measures" | "shortens_time_off"> | null;
}

const order: ReviewRule[] = ["travel", "rest", "availability", "time_off"];

function flag(side: ReviewSide, code: string) {
  return side.check?.approval_flags?.find((item) => item.code === code);
}

function fails(side: ReviewSide, rule: ReviewRule) {
  if (rule === "travel") return Boolean(flag(side, "minimum_travel"));
  if (rule === "rest") return Boolean(flag(side, "minimum_rest"));
  if (rule === "availability") return Boolean(flag(side, "availability_consent"));
  return Boolean(side.check?.shortens_time_off);
}

function hours(minutes: number) {
  const value = minutes / 60;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} h`;
}

function weekday(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(`${date}T12:00:00`));
}

function warnBox(side: ReviewSide, rule: ReviewRule): ReviewBox {
  if (rule === "travel") {
    const item = flag(side, "minimum_travel")!;
    return { rule, tone: "warn", top: `${item.gap_minutes} min to travel`, bottom: `${item.rule_minutes} min needed` };
  }
  if (rule === "rest") {
    const item = flag(side, "minimum_rest")!;
    return { rule, tone: "warn", top: `${hours(item.gap_minutes ?? 0)} of rest`, bottom: `${hours(item.rule_minutes ?? 0)} needed` };
  }
  if (rule === "availability") return { rule, tone: "warn", top: "Unavailable", bottom: "chose to take it" };
  return { rule, tone: "warn", top: "On time off", bottom: "can't take this shift" };
}

function okBox(side: ReviewSide, other: ReviewSide, rule: ReviewRule): ReviewBox {
  if (rule === "travel") {
    const needed = flag(other, "minimum_travel")?.rule_minutes ?? side.check?.measures?.travel_rule_minutes;
    return { rule, tone: "ok", top: "Travel time OK", bottom: `${needed} min needed` };
  }
  if (rule === "rest") {
    const needed = flag(other, "minimum_rest")?.rule_minutes ?? side.check?.measures?.rest_rule_minutes ?? 0;
    const measured = side.check?.measures?.rest_gap_minutes;
    // ponytail: "No shift nearby" when no shift sits within two days; asked of Mert (EKRAN-02 §3).
    return { rule, tone: "ok", top: measured == null ? "No shift nearby" : `${hours(measured)} of rest`, bottom: `${hours(needed)} needed` };
  }
  if (rule === "availability") return { rule, tone: "ok", top: "Available", bottom: `on ${weekday(side.date)}` };
  return { rule, tone: "ok", top: "No time off", bottom: `on ${weekday(side.date)}` };
}

/** Whether approved time off of either person stops the swap (KARARLAR §1.1). */
export function timeOffStops(sides: readonly ReviewSide[]) {
  return sides.some((side) => fails(side, "time_off"));
}

/** The boxes of the two cards, in one rule order so they line up. */
export function reviewBoxes([first, second]: [ReviewSide, ReviewSide]): [ReviewBox[], ReviewBox[]] {
  const cards: [ReviewBox[], ReviewBox[]] = [[], []];
  for (const rule of order) {
    const failing = [fails(first, rule), fails(second, rule)];
    if (!failing[0] && !failing[1]) continue;
    ([[first, second, cards[0]], [second, first, cards[1]]] as const).forEach(([side, other, card], index) => {
      if (failing[index]) card.push(warnBox(side, rule));
      else if (side.check) card.push(okBox(side, other, rule));
    });
  }
  return cards;
}

// The server's two catch-all sentences for a person the rules stop; the eligibility
// check beside them says which rule it is (EKRAN-02 recovery).
const NOT_ELIGIBLE = {
  receiver: "The receiving employee is not eligible for the full shift",
  giver: "The other employee is not eligible for the exchanged shift",
} as const;

/** One sentence per refusal; a catch-all one names the person, whose shift, and the rule. */
export function blockerLines(
  reasons: readonly string[],
  checks: { readonly receiver: { readonly reasons: readonly string[] } | null; readonly giver: { readonly reasons: readonly string[] } | null },
  names: { readonly owner: string; readonly other: string },
): string[] {
  const why = (list: readonly string[] | undefined) =>
    (list ?? []).map((text) => text.trim().replace(/\.+$/, "")).filter(Boolean).join("; ");
  return reasons.map((reason) => {
    const side = reason === NOT_ELIGIBLE.receiver ? "receiver" : reason === NOT_ELIGIBLE.giver ? "giver" : null;
    const rules = side ? why(checks[side]?.reasons) : "";
    if (!side || !rules) return reason;
    // The receiver takes the owner's shift; in a swap the giver (the owner) takes the other's.
    return side === "receiver"
      ? `${names.other} can't take ${names.owner}'s shift: ${rules}.`
      : `${names.owner} can't take ${names.other}'s shift: ${rules}.`;
  });
}
