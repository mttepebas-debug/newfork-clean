import { describe, expect, it } from "vitest";

import { ScheduleRequestError } from "../schedule/schedule-data";
import { isNoAccess } from "./no-access";
import { RequestError } from "./request-error";

describe("isNoAccess", () => {
  it("recognizes the API's no: 403 or 404 with an authz.* reason", () => {
    expect(isNoAccess(new RequestError("Forbidden", "authz.out_of_scope", undefined, 403))).toBe(true);
    expect(isNoAccess(new RequestError("Not found", "authz.not_member", undefined, 404))).toBe(true);
  });

  it("reads the reason from the Schedule client's error body too", () => {
    expect(
      isNoAccess(new ScheduleRequestError("Forbidden", 403, { error: "Forbidden", reason: "authz.missing_permission" })),
    ).toBe(true);
    expect(isNoAccess(new ScheduleRequestError("Forbidden", 403, { error: "Forbidden" }))).toBe(false);
  });

  it("reads the API's shared error handler body (BL-128)", () => {
    // { error, reason, requestId }: what the global handler sends for a no thrown past a route.
    const body = { error: "Not allowed", reason: "authz.out_of_scope", requestId: "req-1" };
    expect(isNoAccess(new ScheduleRequestError("Not allowed", 403, body))).toBe(true);
    expect(isNoAccess(new ScheduleRequestError("Not allowed", 404, { ...body, reason: "authz.not_member" }))).toBe(true);
    expect(isNoAccess(new ScheduleRequestError("Internal server error", 500, { error: "Internal server error", requestId: "req-1" }))).toBe(false);
  });

  it("does not take other refusals for no access", () => {
    // A business rule, not a permission.
    expect(isNoAccess(new RequestError("Conflict", "schedule.past_week", undefined, 409))).toBe(false);
    expect(isNoAccess(new RequestError("Forbidden", "session.password_incorrect", undefined, 403))).toBe(false);
    // An authz key with a status that is not a no.
    expect(isNoAccess(new RequestError("Oops", "authz.out_of_scope", undefined, 500))).toBe(false);
    // Nothing to go on.
    expect(isNoAccess(new RequestError("Not found", undefined, undefined, 404))).toBe(false);
    expect(isNoAccess(new Error("authz.out_of_scope"))).toBe(false);
    expect(isNoAccess(null)).toBe(false);
  });
});
