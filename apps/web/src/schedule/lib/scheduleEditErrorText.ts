import { requestErrorText, ScreenError } from "../../lib/request-error";
import { isEditLeaseExpired, isEditSessionClosed, isEditSessionStale, ScheduleRequestError } from "../schedule-data";

/** BL-976: another tab or window moved the edit on; the change itself may be fine. */
export const EDIT_SESSION_STALE_TEXT =
  "This schedule changed in another tab or window. Reload the page, then make the change again.";

/** BL-1000: the same, for Undo. */
export const UNDO_SESSION_STALE_TEXT = "This page is out of date. Reload it, then press Undo again.";

/** BL-976: the schedule moved on after auto-fill was reviewed. */
export const AUTO_FILL_STALE_TEXT =
  "The schedule changed after this review opened. Close it and run Auto-fill again.";

/** Sentences after which reloading the page is the way on; the error banner offers it. */
export function asksForReload(text: string | null): boolean {
  return text === EDIT_SESSION_STALE_TEXT || text === UNDO_SESSION_STALE_TEXT;
}

/** BL-976: the sentence for a failed schedule edit; a stale edit never shows the server's words. */
export function scheduleEditErrorText(error: unknown): string {
  return isEditSessionStale(error) ? EDIT_SESSION_STALE_TEXT : requestErrorText(error);
}

/** For a dialog that words the error itself: a stale edit reaches it as the plain sentence. */
export function staleEditAsScreenError(error: unknown): unknown {
  return isEditSessionStale(error) ? new ScreenError(EDIT_SESSION_STALE_TEXT) : error;
}

/**
 * BL-976: auto-fill's apply refuses with a bare 409 when the preview no longer
 * matches the edit ("stale auto-fill preview"); the person reads why and what to do.
 */
export function autoFillApplyError(error: unknown): unknown {
  if (isEditSessionStale(error)) return new ScreenError(EDIT_SESSION_STALE_TEXT);
  if (isEditLeaseExpired(error) || isEditSessionClosed(error)) return error;
  return error instanceof ScheduleRequestError && error.status === 409
    ? new ScreenError(AUTO_FILL_STALE_TEXT)
    : error;
}
