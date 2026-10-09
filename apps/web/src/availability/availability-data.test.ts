import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWeeklyPreferences } from "./availability-data";

vi.mock("../lib/supabase", () => ({
  getApiAccessToken: vi.fn(async () => "token"),
  getTabWorkspaceId: vi.fn(() => null),
  newforkApiUrl: "http://api.test",
  supabaseClient: {},
}));

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const employeeId = "7ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

describe("availability request paths", () => {
  afterEach(() => vi.unstubAllGlobals());

  // The response is rejected on purpose: only the requested URL matters here.
  async function requestedUrl(onboarding: boolean): Promise<string> {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "stop" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      loadWeeklyPreferences(workspaceId, employeeId, onboarding),
    ).rejects.toThrow("stop");
    return String(fetchMock.mock.calls[0]?.[0]);
  }

  it("names the workspace on onboarding availability calls", async () => {
    expect(await requestedUrl(true)).toBe(
      `http://api.test/v1/me/onboarding/availability/weekly?workspaceId=${workspaceId}`,
    );
  });

  it("leaves workspace availability calls unchanged", async () => {
    expect(await requestedUrl(false)).toBe(
      `http://api.test/v1/workspaces/${workspaceId}/availability/weekly?employee_id=${employeeId}`,
    );
  });
});
