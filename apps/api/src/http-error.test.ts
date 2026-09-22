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

  it("falls back when the code says nothing", () => {
    expect(rpcFailure({ message: "boom" }).statusCode).toBe(400);
    expect(rpcFailure({ message: "boom" }, 409).statusCode).toBe(409);
  });

  it("does not depend on the wording of the message", () => {
    const english = rpcFailure({ message: "workspace not found", code: "P0002" });
    const translated = rpcFailure({ message: "çalışma alanı bulunamadı", code: "P0002" });

    expect(translated.statusCode).toBe(english.statusCode);
  });
});
