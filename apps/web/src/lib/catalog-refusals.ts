import { RequestError } from "./request-error";

// BL-1045: the database names the kind of refusal in its key. These say a
// catalog item was deleted while the screen still showed it; a fresh list
// shows it gone.
const GONE_MEANWHILE: ReadonlySet<string> = new Set([
  "job.deleted",
  "department.deleted",
  "location.deleted",
  "catalog.deleted",
]);

// These say the job or a person on it moved on first; reloading shows the
// newer state.
const CHANGED_MEANWHILE: ReadonlySet<string> = new Set([
  "job.changed",
  "employee.revision_conflict",
  "employee.archived",
]);

function reasonOf(error: unknown): string | undefined {
  return error instanceof RequestError ? error.reason : undefined;
}

/** A department, job, location, shift type or label was deleted meanwhile. */
export function isGoneMeanwhile(error: unknown): boolean {
  const reason = reasonOf(error);
  return reason !== undefined && GONE_MEANWHILE.has(reason);
}

/**
 * Something newer to load: the job, a person on it, or the catalog it points
 * at changed or went first. Any other refusal is a standing one.
 */
export function isChangedMeanwhile(error: unknown): boolean {
  const reason = reasonOf(error);
  return (
    reason !== undefined &&
    (CHANGED_MEANWHILE.has(reason) || GONE_MEANWHILE.has(reason))
  );
}
