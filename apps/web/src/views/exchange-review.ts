import type { ExchangeApplication } from "@newfork/shared";

// Mert, 2026-10-11: Requests → a cover or open shift row lists who can take
// the shift. Each person carries chips read from the core's eligibility check
// (ILKELER P11: the screen names, the core decides): green when a rule holds,
// orange when a manager may set it aside, red when it stops them (approved
// time off always does: KARARLAR §1.1).

export type CheckTone = "ok" | "warn" | "red" | "grey";
export type CandidateChecks = { chips: { text: string; tone: CheckTone }[]; blocked: boolean; warned: boolean };

function hours(minutes: number) {
  const value = minutes / 60;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} h`;
}
const sentence = (text: string) => text.trim().replace(/\.+$/, "");

export function candidateChecks(eligibility: ExchangeApplication["eligibility"]): CandidateChecks {
  if (!eligibility) return { chips: [{ text: "Not checked yet", tone: "grey" }], blocked: false, warned: false };
  if (eligibility.blockers?.some((item) => item.code === "approved_time_off"))
    return { chips: [{ text: "On time off", tone: "red" }], blocked: true, warned: false };
  if (eligibility.status === "ineligible")
    return { chips: [{ text: sentence(eligibility.reasons[0] ?? "Can't take this shift"), tone: "red" }], blocked: true, warned: false };
  if (eligibility.status !== "eligible")
    return { chips: [{ text: sentence(eligibility.reasons[0] ?? "Needs a recheck"), tone: "warn" }], blocked: false, warned: true };
  const chips: CandidateChecks["chips"] = [];
  for (const flag of eligibility.approval_flags ?? []) {
    if (flag.code === "minimum_rest") chips.push({ text: `${hours(flag.gap_minutes ?? 0)} of rest · ${hours(flag.rule_minutes ?? 0)} needed`, tone: "warn" });
    else if (flag.code === "minimum_travel") chips.push({ text: `${flag.gap_minutes ?? 0} min to travel · ${flag.rule_minutes ?? 0} min needed`, tone: "warn" });
    else if (flag.code === "availability_consent") chips.push({ text: "Unavailable · chose to take it", tone: "warn" });
  }
  // Availability is a preference (KARARLAR "Müsaitlik tercih" 3): its chip
  // informs, and alone it never makes the manager's button say "anyway".
  const setAside = (eligibility.approval_flags ?? []).some((flag) => flag.code === "minimum_rest" || flag.code === "minimum_travel");
  if (chips.length) return { chips, blocked: false, warned: setAside };
  chips.push({ text: "Available", tone: "ok" });
  const measures = eligibility.measures;
  if (measures) chips.push({ text: measures.rest_gap_minutes == null ? "No shift nearby" : `${hours(measures.rest_gap_minutes)} of rest`, tone: "ok" });
  return { chips, blocked: false, warned: false };
}

