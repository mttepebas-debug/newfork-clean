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
