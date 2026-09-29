export interface ScheduleMutationContext {
  readonly userId: string | undefined;
  readonly workspaceId: string | undefined;
  readonly sessionId: string | undefined;
  readonly revision: number | undefined;
}

// BL-323: a result that comes back after its edit session was discarded (or
// the user or workspace changed) must not bring that session back. Only the
// session's identity counts: a revision that moved because another edit of
// the same session landed first does not make this result stale.
export function isSameEditSession(
  started: ScheduleMutationContext,
  current: ScheduleMutationContext | null,
): boolean {
  return (
    current !== null &&
    started.userId === current.userId &&
    started.workspaceId === current.workspaceId &&
    started.sessionId === current.sessionId
  );
}
