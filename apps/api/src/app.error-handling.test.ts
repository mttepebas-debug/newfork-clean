import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { rpcFailure } from "./http-error.js";

describe("api error handling", () => {
  it("answers an unknown route with a json body", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/v1/nope" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Not found" });
  });

  it("keeps internals out of a failed request and returns its id", async () => {
    const app = buildApp();
    app.get("/__boom", async () => {
      throw new Error("service role key rejected by upstream");
    });

    const response = await app.inject({ method: "GET", url: "/__boom" });

    expect(response.statusCode).toBe(500);
    const body = response.json() as { error: string; requestId: string };
    expect(body.error).toBe("Internal server error");
    expect(body.requestId).toBeTruthy();
    expect(response.payload).not.toContain("service role key");
  });

  it("passes a thrown status code and message through", async () => {
    const app = buildApp();
    app.get("/__teapot", async () => {
      throw Object.assign(new Error("Short and safe"), { statusCode: 418 });
    });

    const response = await app.inject({ method: "GET", url: "/__teapot" });

    expect(response.statusCode).toBe(418);
    expect((response.json() as { error: string }).error).toBe("Short and safe");
  });

  // BL-128: a no from the authorization core reaches the screen with its key,
  // in the same shape the route helpers send: { error, reason, detail }.
  it("carries the authz reason of a refusal thrown past the route", async () => {
    const app = buildApp();
    app.get("/__out_of_scope", async () => {
      throw rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.out_of_scope" });
    });

    const response = await app.inject({ method: "GET", url: "/__out_of_scope" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "Not allowed", reason: "authz.out_of_scope" });
  });

  it("answers a non-member with 404 and authz.not_member", async () => {
    const app = buildApp();
    app.get("/__not_member", async () => {
      throw rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.not_member" });
    });

    const response = await app.inject({ method: "GET", url: "/__not_member" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ reason: "authz.not_member" });
  });

  it("gives a server failure no reason and no internals", async () => {
    const app = buildApp();
    app.get("/__db_down", async () => {
      throw rpcFailure(
        { message: "relation app_private.x does not exist", code: "XX000", hint: "check pg_stat", details: "select * from x" },
        500,
      );
    });

    const response = await app.inject({ method: "GET", url: "/__db_down" });

    expect(response.statusCode).toBe(500);
    const body = response.json() as Record<string, unknown>;
    expect(body.error).toBe("Internal server error");
    expect(body).not.toHaveProperty("reason");
    expect(body).not.toHaveProperty("detail");
    expect(response.payload).not.toMatch(/app_private|pg_stat|select \*/);
  });
});
