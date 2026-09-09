import { afterEach, describe, expect, it, vi } from "vitest";
import {
  changeExchange,
  ExchangeError,
  getExchangePreview,
} from "./exchange-data";

vi.mock("../../lib/supabase", () => ({
  supabaseClient: {},
  newforkApiUrl: "https://api.example.test",
  getApiAccessToken: vi.fn().mockResolvedValue("test-session"),
}));
afterEach(() => vi.unstubAllGlobals());

describe("Exchange errors preserve decision semantics", () => {
  it("renders the real final-eligibility reason without JSON syntax and preserves 409 for recovery", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error:
            '["The receiving employee is not eligible for the full shift"]',
        }),
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const command = {
      action: "approve" as const,
      case_id: "case",
      application_id: "application",
      expected_revision: 2,
      fingerprint: "previous-preview",
      reason: "",
      private_note: "My draft",
    };
    const error = await changeExchange(
      "workspace",
      command,
      "same-command-key",
    ).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ExchangeError);
    expect(error).toMatchObject({
      status: 409,
      message: "The receiving employee is not eligible for the full shift",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, options] = fetcher.mock.calls[0]!;
    expect(options.headers["Idempotency-Key"]).toBe("same-command-key");
    expect(JSON.parse(options.body)).toEqual(command);
  });

  it.each([
    {
      status: 422,
      wire: '["Position assignment expired","Location assignment ended"]',
      message: "Position assignment expired; Location assignment ended",
    },
    {
      status: 403,
      wire: "Request access denied",
      message: "Request access denied",
    },
    {
      status: 409,
      wire: "[Review required] Check the current shift",
      message: "[Review required] Check the current shift",
    },
    { status: 422, wire: "[]", message: "Unable to load shift changes" },
  ])(
    "keeps status $status and readable validation text",
    async ({ status, wire, message }) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ error: wire }), { status }),
          ),
      );
      await expect(
        getExchangePreview("workspace", "case", "application"),
      ).rejects.toMatchObject({ status, message });
    },
  );
});
