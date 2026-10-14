// PAGES (hub area): switches a scenario's setup turns on before the screen
// opens; the hub and communications demo services read them. No imports, so
// any service can read them without an import cycle.
export const hubFlags = {
  /** Reads that answer once and then fail with 500 (the screen keeps its last data): "hub", "exchanges". */
  failAfterFirst: new Set<string>(),
  /** Calls answered so far per read above. */
  calls: {} as Record<string, number>,
  /** The Find cover or swap eligibility check fails. */
  failCandidates: false,
  /** The shell's workspace switcher has more workspaces and an invitation. */
  switcher: false,
  /** The workspace's setup is not finished (members wait on "Almost ready"). */
  setupPending: false,
  /** Documents the person must finish first: the app sends them to their documents. */
  documentsRestricted: false,
};

/** True when this call of `read` should fail (every call after its first). */
export function failsNow(read: string): boolean {
  hubFlags.calls[read] = (hubFlags.calls[read] ?? 0) + 1;
  return hubFlags.failAfterFirst.has(read) && hubFlags.calls[read]! > 1;
}
