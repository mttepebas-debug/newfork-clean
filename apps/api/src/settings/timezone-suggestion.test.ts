import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerTimezoneSuggestionRoutes, suggestLocationTimezone } from "./timezone-suggestion";

const response = (places: { latitude: string; longitude: string }[]) => new Response(JSON.stringify({ places }));
describe("postal timezone suggestion", () => {
  it("uses only country/postal and resolves coordinates against geographic data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([{ latitude: "34.0522", longitude: "-118.2437" }]));
    expect(await suggestLocationTimezone("US", "90012", fetcher)).toMatchObject({ timezone: "America/Los_Angeles", status: "suggested" });
    expect(fetcher).toHaveBeenCalledWith("https://api.zippopotam.us/us/90012", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it("does not guess between multiple timezone results", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([{ latitude: "34.0522", longitude: "-118.2437" }, { latitude: "40.7128", longitude: "-74.0060" }]));
    expect(await suggestLocationTimezone("US", "99999", fetcher)).toMatchObject({ timezone: null, status: "ambiguous" });
  });
  it("leaves manual selection available for failure, missing postal code, and invalid data", async () => {
    for (const fetcher of [vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout")), vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 404 })), vi.fn<typeof fetch>().mockResolvedValue(response([{ latitude: "not a latitude", longitude: "-118" }]))]) {
      expect(await suggestLocationTimezone("US", "99999", fetcher)).toMatchObject({ timezone: null, status: "unavailable" });
    }
  });
  it("requires a verified session and rejects invalid query before external lookup", async () => {
    const app = Fastify();
    const resolve = vi.fn().mockResolvedValue(null);
    registerTimezoneSuggestionRoutes(app, { resolve });
    expect((await app.inject("/v1/location-timezone-suggestion?country=US&postal=90012")).statusCode).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
    expect((await app.inject({ url: "/v1/location-timezone-suggestion?country=US&postal=90012", headers: { authorization: "Bearer invalid" } })).statusCode).toBe(401);
    resolve.mockResolvedValue({});
    expect((await app.inject({ url: "/v1/location-timezone-suggestion?country=US&postal=../../", headers: { authorization: "Bearer valid" } })).statusCode).toBe(400);
    await app.close();
  });
});
