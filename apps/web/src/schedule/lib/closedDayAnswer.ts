import { closedLocationAsks, type ScheduleConflictRules, type ShiftAvailabilityAssessment } from "@newfork/shared";

type ClosedDayRule = ScheduleConflictRules["closed_location"] | undefined;

// K17: editing sessions in which the person already accepted a shift on a
// closed day. Keyed by session id, so a new session (discard, publish, idle
// timeout) asks again. ponytail: never pruned; one id per session is tiny.
const answeredSessions = new Set<string>();

/**
 * Whether this assessment asks only because of a closed day that this editing
 * session already accepted. The caller still sends the fingerprint: the server
 * records an acceptance for every shift.
 */
export function closedDayAlreadyAnswered(
  assessment: ShiftAvailabilityAssessment | null | undefined, rule: ClosedDayRule, sessionId: string | undefined,
): boolean {
  if (!assessment || !rule || !sessionId || assessment.operation !== "warning_requires_override") return false;
  const asking = assessment.reasons.filter(reason => reason.severity === "confirm" || reason.severity === "block");
  return asking.length > 0 && asking.every(reason => reason.code === "closed_location")
    && !closedLocationAsks(rule, answeredSessions.has(sessionId));
}

/** Keeps the answer for the rest of the session when the rule is "confirm once". */
export function rememberClosedDayAnswer(
  assessment: ShiftAvailabilityAssessment | null | undefined, rule: ClosedDayRule, sessionId: string | undefined,
): void {
  if (sessionId && rule === "confirm_once" && assessment?.reasons.some(reason => reason.code === "closed_location"))
    answeredSessions.add(sessionId);
}
