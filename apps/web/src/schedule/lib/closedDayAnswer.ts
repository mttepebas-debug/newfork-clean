import type { ShiftAvailabilityAssessment } from "@newfork/shared";

// K17: editing sessions in which the person already accepted a shift on a
// closed day. Keyed by session id, so a new session (discard, publish, idle
// timeout) asks again. ponytail: never pruned; one id per session is tiny.
const answeredSessions = new Set<string>();

type Reason = ShiftAvailabilityAssessment["reasons"][number];
// BL-685: the server marks a "confirm once" closed day on the reason itself.
const onceForSession = (reason: Reason) => reason.code === "closed_location" && reason.confirm_scope === "edit_session";

/**
 * Whether this assessment asks only because of a "confirm once" closed day that
 * this editing session already accepted. The caller still sends the
 * fingerprint: the server records an acceptance for every shift.
 */
export function closedDayAlreadyAnswered(
  assessment: ShiftAvailabilityAssessment | null | undefined, sessionId: string | undefined,
): boolean {
  if (!assessment || !sessionId || assessment.operation !== "warning_requires_override") return false;
  const asking = assessment.reasons.filter(reason => reason.severity === "confirm" || reason.severity === "block");
  return asking.length > 0 && asking.every(onceForSession) && answeredSessions.has(sessionId);
}

/** Keeps the answer for the rest of the session when the server marked the closed day "confirm once". */
export function rememberClosedDayAnswer(
  assessment: ShiftAvailabilityAssessment | null | undefined, sessionId: string | undefined,
): void {
  if (sessionId && assessment?.reasons.some(onceForSession)) answeredSessions.add(sessionId);
}
