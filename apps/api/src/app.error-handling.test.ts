import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

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
});
