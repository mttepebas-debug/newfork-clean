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
import { RequestError } from "../lib/request-error";
import {
  loadWeeklyPreferences,
  saveWeeklyPreferences,
} from "./availability-data";
vi.mock("./availability-data", () => ({
  loadWeeklyPreferences: vi.fn(),
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
  const next = model();
  next.employee.revision = 1;
  next.employee.submitted = true;
  const result = {
    model: next,
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
const conflictSentence =
  "Availability changed. Reload before saving; your draft has not been saved.";
describe("weekly preferences API panel", () => {
  // BL-797 (E4-14): Can saved Ali's week first; Ayşe's Save is refused. One
  // press of Reload shows Can's week and her next Save goes through.
  it("offers Reload after a conflict and saves against the latest week", async () => {
    const { result } = await setup();
    fireEvent.click(screen.getByRole("switch", { name: /Monday all day unavailable/i }));
    const latest = model();
    latest.employee.revision = 3;
    latest.employee.submitted = true;
    vi.mocked(loadWeeklyPreferences).mockResolvedValue(latest);
    vi.mocked(saveWeeklyPreferences)
      .mockRejectedValueOnce(new RequestError(conflictSentence, "availability.changed", undefined, 409))
      .mockResolvedValueOnce(result);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(conflictSentence);

    // Reload waits for Can's week before it resets the form.
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.queryByText(conflictSentence)).toBeNull());
    expect(loadWeeklyPreferences).toHaveBeenCalledTimes(2);
    expect(
      (screen.getByRole("switch", { name: /Monday all day unavailable/i }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    fireEvent.click(screen.getByRole("switch", { name: /Monday all day unavailable/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveWeeklyPreferences).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveWeeklyPreferences).mock.calls[1]![1]).toEqual(
      expect.objectContaining({ expected_revision: 3 }),
    );
  });
  it("refreshes this workspace's Schedule projection after a successful preference save", async () => {
    const { result, client } = await setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(saveWeeklyPreferences).mockResolvedValue(result);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["schedule-read", w] });
  });
  it("replays exactly the same key and payload after a lost save response", async () => {
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
    await screen.findByText("Saved");
  });
  it("keeps the conflict and its Reload when the latest week cannot be fetched", async () => {
    await setup();
    fireEvent.click(screen.getByRole("switch", { name: /Monday all day unavailable/i }));
    vi.mocked(saveWeeklyPreferences).mockRejectedValueOnce(
      new RequestError(conflictSentence, "availability.changed", undefined, 409),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(conflictSentence);
    vi.mocked(loadWeeklyPreferences).mockRejectedValueOnce(new TypeError("Refresh unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(loadWeeklyPreferences).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reload" })).toHaveProperty("disabled", false),
    );
    expect(screen.getByText(conflictSentence)).toBeTruthy();
  });
  it("uses a fresh save key after a definitive server conflict", async () => {
    const { result } = await setup();
    vi.mocked(saveWeeklyPreferences)
      .mockRejectedValueOnce(
        new RequestError(conflictSentence, "availability.changed", undefined, 409),
      )
      .mockResolvedValueOnce(result);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(conflictSentence);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveWeeklyPreferences).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveWeeklyPreferences).mock.calls[1]![2]).not.toBe(
      vi.mocked(saveWeeklyPreferences).mock.calls[0]![2],
    );
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
    await screen.findByText("Availability didn't refresh. This is the last version that loaded.");
    expect(screen.queryByText("Refresh unavailable")).toBeNull();
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
    await screen.findByRole("heading", { level: 3, name: "We couldn't load availability" });
    expect(screen.queryByText("Access removed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
  // BL-798 (E4-15): the core's "Not allowed" reads as a sentence for the
  // person, without a Retry that cannot help.
  it("says the person has no access instead of the core's refusal", async () => {
    vi.mocked(loadWeeklyPreferences).mockRejectedValue(
      new RequestError("Not allowed", "authz.out_of_scope", undefined, 404),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <WeeklyPreferencesPanel workspaceId={w} audience="manager" employeeId="x" />
      </QueryClientProvider>,
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "You don't have access to this availability.",
    );
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
  it("draws the week's outline while availability loads", () => {
    vi.mocked(loadWeeklyPreferences).mockReturnValue(new Promise(() => {}));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <WeeklyPreferencesPanel workspaceId={w} audience="employee" />
      </QueryClientProvider>,
    );
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading availability");
    expect(status.querySelectorAll(".nf-list-outline-row")).toHaveLength(7);
  });
  it("shows the load-error card without the raw error, and tries again", async () => {
    vi.mocked(loadWeeklyPreferences)
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce(model());
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <WeeklyPreferencesPanel workspaceId={w} audience="employee" />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { level: 3, name: "We couldn't load availability" })).toBeTruthy();
    expect(screen.getByText("Availability didn't load. Nothing was changed.")).toBeTruthy();
    expect(screen.queryByText("Failed to fetch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(loadWeeklyPreferences).toHaveBeenCalledTimes(2);
  });
  it("words a refused save for the person when access was removed", async () => {
    await setup();
    vi.mocked(saveWeeklyPreferences).mockRejectedValueOnce(
      new RequestError("Not allowed", "authz.missing_permission", undefined, 403),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("You don't have access to change this availability."),
    ).toBeTruthy();
    expect(screen.queryByText("Not allowed")).toBeNull();
  });
});
