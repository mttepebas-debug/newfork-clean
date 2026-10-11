import { describe, expect, it } from "vitest";
import { requestErrorText, ScreenError } from "../../lib/request-error";
import { ScheduleRequestError } from "../schedule-data";
import {
  asksForReload,
  AUTO_FILL_STALE_TEXT,
  autoFillApplyError,
  EDIT_SESSION_STALE_TEXT,
  scheduleEditErrorText,
  staleEditAsScreenError,
  UNDO_SESSION_STALE_TEXT,
} from "./scheduleEditErrorText";

const conflict = (error: string, code?: string) =>
  new ScheduleRequestError(error, 409, code ? { error, code } : { error });

describe("schedule edit error text (BL-976)", () => {
  it("never shows the server's words for an edit another tab moved on", () => {
    const stale = conflict("session revision stale", "edit_session_stale");
    expect(scheduleEditErrorText(stale)).toBe(EDIT_SESSION_STALE_TEXT);
    expect(requestErrorText(staleEditAsScreenError(stale))).toBe(EDIT_SESSION_STALE_TEXT);
    expect(requestErrorText(autoFillApplyError(stale))).toBe(EDIT_SESSION_STALE_TEXT);
  });

  it("words auto-fill's bare 409 as a review that went out of date", () => {
    const error = autoFillApplyError(conflict("stale auto-fill preview"));
    expect(error).toBeInstanceOf(ScreenError);
    expect(requestErrorText(error)).toBe(AUTO_FILL_STALE_TEXT);
  });

  it("leaves every other refusal as it was", () => {
    const lapsed = conflict("edit lease expired", "edit_lease_expired");
    const otherConflict = conflict("Review changed");
    expect(autoFillApplyError(otherConflict)).toBe(otherConflict);
    const rule = new ScheduleRequestError("Employee is on approved time off", 400, { error: "Employee is on approved time off" });
    expect(autoFillApplyError(lapsed)).toBe(lapsed);
    expect(autoFillApplyError(rule)).toBe(rule);
    expect(staleEditAsScreenError(rule)).toBe(rule);
    expect(scheduleEditErrorText(rule)).toBe("Employee is on approved time off");
  });

  it("offers a reload only after the out-of-date sentences", () => {
    expect(asksForReload(EDIT_SESSION_STALE_TEXT)).toBe(true);
    expect(asksForReload(UNDO_SESSION_STALE_TEXT)).toBe(true);
    expect(asksForReload(AUTO_FILL_STALE_TEXT)).toBe(false);
    expect(asksForReload(null)).toBe(false);
  });
});
