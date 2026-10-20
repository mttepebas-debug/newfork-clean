import { describe, expect, it } from "vitest";

import { HttpError, rpcFailure, statusForPostgresCode } from "./http-error.js";

describe("statusForPostgresCode", () => {
  it("maps the codes the RPCs raise on purpose", () => {
    expect(statusForPostgresCode("42501")).toBe(403);
    expect(statusForPostgresCode("P0002")).toBe(404);
    expect(statusForPostgresCode("23505")).toBe(409);
    expect(statusForPostgresCode("PT409")).toBe(409);
    expect(statusForPostgresCode("22023")).toBe(400);
  });

  it("treats 02000 as not found, like P0002", () => {
    // The workspace lifecycle RPCs raise this one; it used to fall through to
    // the route helper's English matching, which answered 400.
    expect(statusForPostgresCode("02000")).toBe(404);
  });

  it("leaves an unknown code to the caller", () => {
    expect(statusForPostgresCode("XX000")).toBeNull();
    expect(statusForPostgresCode(undefined)).toBeNull();
  });
});

describe("rpcFailure", () => {
  it("carries the status the code implies and keeps the message", () => {
    const failure = rpcFailure({
      message: "role management access required",
      code: "42501",
    });

    expect(failure).toBeInstanceOf(HttpError);
    expect(failure.statusCode).toBe(403);
    expect(failure.message).toBe("role management access required");
    expect(failure.pgCode).toBe("42501");
  });

  it("carries the machine key the RPC raised in its hint", () => {
    const failure = rpcFailure({
      message: "workspace name confirmation does not match",
      code: "23514",
      hint: "workspace.closure.name_mismatch",
    });

    expect(failure.reason).toBe("workspace.closure.name_mismatch");
  });

  it("has no reason when the raise carried no hint", () => {
    expect(rpcFailure({ message: "boom", code: "23514" }).reason).toBeUndefined();
    expect(rpcFailure({ message: "boom", hint: null }).reason).toBeUndefined();
  });

  it("treats a code it does not know as a server failure", () => {
    // BL-131: PGRST*, 42883, 42P01... are bugs, not the caller's mistake.
    expect(rpcFailure({ message: "boom" }).statusCode).toBe(500);
    expect(rpcFailure({ message: "function x does not exist", code: "42883" }).statusCode).toBe(500);
    expect(rpcFailure({ message: "boom" }, 409).statusCode).toBe(409);
  });

  it("says nothing of its own when it is a server failure", () => {
    // Route helpers send an HttpError's message whatever its status.
    const failure = rpcFailure({ message: "function public.x_service(uuid) does not exist", code: "42883", hint: "No function matches.", details: "x" });

    expect(failure.message).toBe("Internal server error");
    expect(failure.reason).toBeUndefined();
    expect(failure.detail).toBeUndefined();
  });

  it("keeps the codes the RPCs raise on purpose outside the map a 400", () => {
    // P0001 is a plain RAISE; 23503 and 55000 are raised on purpose by the
    // roles and onboarding RPCs ("role is assigned to members").
    expect(rpcFailure({ message: "onboarding case unavailable", code: "P0001" }).statusCode).toBe(400);
    expect(rpcFailure({ message: "role is assigned to members", code: "23503" }).statusCode).toBe(400);
    expect(rpcFailure({ message: "sensitive infrastructure readiness required", code: "55000" }).statusCode).toBe(400);
  });

  it("does not depend on the wording of the message", () => {
    const english = rpcFailure({ message: "workspace not found", code: "P0002" });
    const translated = rpcFailure({ message: "çalışma alanı bulunamadı", code: "P0002" });

    expect(translated.statusCode).toBe(english.statusCode);
  });
});

// BL-131: a 4xx body never carries the database's own words.
describe("rpcFailure keeps database internals out", () => {
  it("drops the raw details of a constraint violation", () => {
    const failure = rpcFailure({
      message: 'duplicate key value violates unique constraint "employees_email_key"',
      code: "23505",
      details: "Key (email)=(a@b.test) already exists.",
    });

    expect(failure.statusCode).toBe(409);
    expect(failure.detail).toBeUndefined();
    expect(failure.message).not.toMatch(/employees_email_key|a@b\.test/);
  });

  it("drops a failing row and a permission-denied table name", () => {
    const notNull = rpcFailure({
      message: 'null value in column "name" of relation "jobs" violates not-null constraint',
      code: "23502",
      details: "Failing row contains (1, null).",
    });
    const grant = rpcFailure({ message: "permission denied for table employees", code: "42501" });

    expect(notNull.statusCode).toBe(400);
    expect(notNull.detail).toBeUndefined();
    expect(notNull.message).not.toMatch(/jobs|"name"/);
    expect(grant.statusCode).toBe(403);
    expect(grant.message).not.toMatch(/employees/);
  });

  it("passes a reason only when it is a machine key", () => {
    const reasonOf = (hint: string) => rpcFailure({ message: "x", code: "22023", hint }).reason;

    expect(reasonOf("authz.out_of_scope")).toBe("authz.out_of_scope");
    expect(reasonOf("schedule.locked")).toBe("schedule.locked");
    expect(reasonOf('Perhaps you meant to reference the column "e.id".')).toBeUndefined();
    expect(reasonOf("authz")).toBeUndefined();
    expect(reasonOf("Authz.Out")).toBeUndefined();
  });

  it("passes the action a refusal was about, and nothing that is not a key", () => {
    const refusal = rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.out_of_scope", details: "schedule.publish" });
    const odd = rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.out_of_scope", details: "Key (id)=(1)" });

    expect(refusal.detail).toBe("schedule.publish");
    expect(odd.detail).toBeUndefined();
  });

  it("keeps the id a refusal points at, which the closing screen offers to cancel", () => {
    const failure = rpcFailure({
      message: "pending ownership transfer must be resolved before workspace closure",
      code: "23514",
      hint: "workspace.closure.transfer_pending",
      details: "5b0e6a52-1c2d-4e3f-8a9b-0c1d2e3f4a5b",
    });

    expect(failure.detail).toBe("5b0e6a52-1c2d-4e3f-8a9b-0c1d2e3f4a5b");
    expect(failure.message).toBe("pending ownership transfer must be resolved before workspace closure");
  });

  it("drops details that came without a key", () => {
    const failure = rpcFailure({
      message: "Resolve shift hours or approved time off before saving",
      code: "23514",
      details: '{"employee_id":"5b0e6a52-1c2d-4e3f-8a9b-0c1d2e3f4a5b"}',
    });

    expect(failure.detail).toBeUndefined();
    expect(failure.message).toBe("Resolve shift hours or approved time off before saving");
  });

  // Shift changes raise their eligibility reasons as a JSON list of sentences
  // (PT409); the screen shows them one per line. A list is on purpose.
  it("keeps a list of reasons a Shift change was refused with", () => {
    const reasons = '["Ali is not qualified for Bartender", "Overlaps Tuesday 9:00 AM"]';
    const failure = rpcFailure({ message: reasons, code: "PT409" });

    expect(failure.statusCode).toBe(409);
    expect(failure.message).toBe(reasons);
  });

  it("swaps a quoted sentence that only looks like a list", () => {
    const failure = rpcFailure({ message: '[{"relation": "employees"}]', code: "P0001" });

    expect(failure.message).toBe("Request could not be completed");
  });
});

describe("the Management and Owner refusals (BL-218)", () => {
  // What the database raises, and what the person trying it reads instead.
  const refusals = [
    [
      "catalog.system_record",
      "Management and Owner are kept; rename them instead",
      "Management and the Owner job come with every workspace. You can rename them, but you can't archive or delete them, and the Owner job stays in Management.",
    ],
    [
      "employee.owner_job",
      "The owner keeps the Owner job",
      "The workspace owner always holds the Owner job, so it can't be removed from them.",
    ],
    [
      "employee.management_primary",
      "The Owner job is never marked primary",
      "The Owner job can't be marked primary. Choose another job as primary, or leave it empty if they only hold the Owner job.",
    ],
    [
      "employee.owner_locations",
      "The owner works at every location",
      "The workspace owner works at every location, so a location can't be removed from them.",
    ],
  ] as const;

  // The drawer's save (BL-218 .3b) names what is missing, with 22023.
  const missing = [
    [
      "employee.location_required",
      "employee requires a location and job unless remote or excluded from schedule",
      "Choose at least one location and mark one as primary.",
    ],
    [
      "employee.job_required",
      "employee requires a location and job unless remote or excluded from schedule",
      "Choose at least one job.",
    ],
    [
      "employee.primary_job_required",
      "employee requires a primary job unless remote or excluded from schedule",
      "Mark one of the jobs as primary.",
    ],
  ] as const;

  it.each(missing)("answers %s with 400, its key and a sentence a person can read", (hint, raised, sentence) => {
    const failure = rpcFailure({ message: raised, code: "22023", hint });
    expect(failure.statusCode).toBe(400);
    expect(failure.reason).toBe(hint);
    expect(failure.message).toBe(sentence);
  });

  it.each(refusals)("answers %s with 400, its key and a sentence a person can read", (hint, raised, sentence) => {
    const failure = rpcFailure({ message: raised, code: "23514", hint });
    expect(failure.statusCode).toBe(400);
    expect(failure.reason).toBe(hint);
    expect(failure.message).toBe(sentence);
  });

});
