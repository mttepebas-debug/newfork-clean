// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  emptyWeeklyPreference,
  type WeeklyPreferenceRead,
} from "@newfork/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeeklyPreferencesPanel } from "./WeeklyPreferencesPanel";
import {
  loadWeeklyPreferences,
  previewWeeklyPreferences,
  saveWeeklyPreferences,
} from "./availability-data";
vi.mock("./availability-data", () => ({
  loadWeeklyPreferences: vi.fn(),
  previewWeeklyPreferences: vi.fn(),
  saveWeeklyPreferences: vi.fn(),
}));
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());
const w = "ad410000-0000-4000-8000-000000000001";
function model(): WeeklyPreferenceRead {
  return {
    employee_id: "ad410000-0000-4000-8000-000000000004",
    employee_name: "Test Employee",
    can_edit_employee: true,
    can_manage: false,
    settings: {
      input_mode: "time_range",
      onboarding_required: false,
      revision: 0,
    },
    employee: {
      revision: 0,
      submitted: false,
      updated_at: null,
      preference: emptyWeeklyPreference("time_range"),
    },
    manager: null,
    shift_types: [],
    time_format: "24h",
  };
}
async function setup() {
  vi.mocked(loadWeeklyPreferences).mockResolvedValue(model());
  vi.mocked(previewWeeklyPreferences).mockResolvedValue({ items: [] });
  const next = model();
  next.employee.revision = 1;
  next.employee.submitted = true;
  const result = {
    model: next,
    kept_count: 0,
    cancelled_count: 0,
    resolved_count: 0,
    finalized: [],
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <WeeklyPreferencesPanel workspaceId={w} audience="employee" />
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: "Save" });
  return { result, client };
}
describe("weekly preferences API panel", () => {
  it("refreshes this workspace's Schedule projection after a successful preference save", async () => {
    const { result, client } = await setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(saveWeeklyPreferences).mockResolvedValue(result);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["schedule-read", w] });
  });
  it("replays exactly the same key and payload after a lost save response, without another preview", async () => {
    const { result } = await setup();
    vi.mocked(saveWeeklyPreferences)
      .mockRejectedValueOnce(new TypeError("Connection lost"))
      .mockResolvedValueOnce(result);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Connection lost");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveWeeklyPreferences).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveWeeklyPreferences).mock.calls[1]).toEqual(
      vi.mocked(saveWeeklyPreferences).mock.calls[0],
    );
    expect(previewWeeklyPreferences).toHaveBeenCalledOnce();
    await screen.findByText("Saved");
  });
  it("gets fresh request decisions after a definitive server conflict", async () => {
    const { result } = await setup();
    vi.mocked(saveWeeklyPreferences)
      .mockRejectedValueOnce(
        Object.assign(new Error("Pending requests changed"), { status: 409 }),
      )
      .mockResolvedValueOnce(result);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Pending requests changed");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveWeeklyPreferences).toHaveBeenCalledTimes(2));
    expect(previewWeeklyPreferences).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveWeeklyPreferences).mock.calls[1]![2]).not.toBe(
      vi.mocked(saveWeeklyPreferences).mock.calls[0]![2],
    );
  });
  it("reports finalized request races without suggesting their assignments were cancelled", async () => {
    const { result } = await setup();
    vi.mocked(saveWeeklyPreferences).mockResolvedValue({
      ...result,
      finalized: [
        {
          kind: "exchange_application",
          id: "ad410000-0000-4000-8000-000000000019",
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/assigned shifts remain your responsibility/);
    await screen.findByText("Saved");
  });
  it("keeps the draft through a transient refetch but hides it after access is revoked", async () => {
    const { client } = await setup();
    const monday = screen.getByRole("switch", {
      name: /Monday all day unavailable/i,
    });
    fireEvent.click(monday);
    vi.mocked(loadWeeklyPreferences).mockRejectedValueOnce(
      new TypeError("Refresh unavailable"),
    );
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["weekly-preferences", w] });
    });
    await screen.findByText("Refresh unavailable");
    expect(
      (
        screen.getByRole("switch", {
          name: /Monday all day unavailable/i,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    vi.mocked(loadWeeklyPreferences).mockRejectedValueOnce(
      Object.assign(new Error("Access removed"), { status: 403 }),
    );
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["weekly-preferences", w] });
    });
    await screen.findByText("Access removed");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
