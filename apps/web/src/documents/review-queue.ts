import type { DocumentObligation, DocumentObligationStatus } from "@newfork/shared";

// The manager's review drawer walks one list (K1 decisions 6 and 7, Mert 23 Oct): the rows of the tab that
// was open, in the order they were shown, taken when the drawer opened.

type Named = Pick<DocumentObligation, "employee_id" | "employee_name" | "title">;

/**
 * The rows the drawer walks: the shown rows in their shown order. The opened row is always in it (a link can open
 * a row the tab does not show), at its place in that order.
 */
export function snapshotQueue<Row extends { id: string }>(
  visible: readonly Row[],
  opened: Row | undefined,
  compare: (a: Row, b: Row) => number,
): Row[] {
  if (!opened || visible.some((row) => row.id === opened.id)) return [...visible];
  const at = visible.findIndex((row) => compare(opened, row) < 0);
  return at < 0 ? [...visible, opened] : [...visible.slice(0, at), opened, ...visible.slice(at)];
}

/** The rows just before and after the open one; none past either end, none for a row outside the list. */
export function neighbours<Row extends { id: string }>(
  queue: readonly Row[],
  id: string,
): { previous: Row | null; next: Row | null } {
  const at = queue.findIndex((row) => row.id === id);
  if (at < 0) return { previous: null, next: null };
  return { previous: queue[at - 1] ?? null, next: queue[at + 1] ?? null };
}

/** A neighbour by its person, or by its document when it is the same person's (always so in one person's list). */
export function queueLabel(row: Named, current: Pick<Named, "employee_id">): string {
  return row.employee_id === current.employee_id ? row.title : row.employee_name;
}

const waiting: readonly DocumentObligationStatus[] = [
  "pending_review",
  "timezone_required",
  "missing",
  "grace",
  "rejected",
  "expired",
];

/** Someone still owes something: a review, a time zone, or the document itself. */
export function documentWaits(status: DocumentObligationStatus): boolean {
  return waiting.includes(status);
}

/**
 * Where "Next" goes after a decision: the next row still waiting after the open one, else the first one still
 * waiting before it. Rows answered in this sitting are skipped.
 */
export function nextWaiting<Row extends { id: string; status: DocumentObligationStatus }>(
  queue: readonly Row[],
  currentId: string,
  answered: (id: string) => boolean,
): Row | null {
  const at = queue.findIndex((row) => row.id === currentId);
  const open = queue.filter((row) => row.id !== currentId && documentWaits(row.status) && !answered(row.id));
  return open.find((row) => queue.indexOf(row) > at) ?? open[0] ?? null;
}
