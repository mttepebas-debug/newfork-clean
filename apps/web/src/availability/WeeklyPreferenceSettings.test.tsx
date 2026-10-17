// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequestError } from "../lib/request-error";
import { loadWeeklyPreferenceSettings } from "./availability-data";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WeeklyPreferenceSettingsRead } from "@newfork/shared";
import {
  WeeklyPreferenceSettings,
  WeeklyPreferenceSettingsPanel,
} from "./WeeklyPreferenceSettings";
vi.mock("./availability-data", () => ({
  loadWeeklyPreferenceSettings: vi.fn(),
  saveWeeklyPreferenceSettings: vi.fn(),
}));
afterEach(cleanup);
function model(): WeeklyPreferenceSettingsRead {
  return {
    settings: {
      onboarding_required: false,
      revision: 3,
    },
    can_edit: true,
  };
}
const toggle = () => screen.getByRole("switch") as HTMLInputElement;
describe("weekly preference settings", () => {
  // Mert 2026-10-16 ("yalnız saat"): availability is asked in hours only, so
  // there is no entry mode to choose; the one setting is onboarding.
  it("has no entry mode, only Required during onboarding", () => {
    render(
      <MemoryRouter>
        <WeeklyPreferenceSettings model={model()} onSave={vi.fn()} onReload={async () => model()} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Entry mode")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText(/Shift type|Time range|converted/)).toBeNull();
    expect(screen.getByText("Required during onboarding")).toBeTruthy();
  });
  it("saves the onboarding setting with the loaded revision", async () => {
    const value = model();
    const onSave = vi.fn().mockResolvedValue({
      ...value,
      settings: { onboarding_required: true, revision: 4 },
    });
    render(
      <MemoryRouter>
        <WeeklyPreferenceSettings model={value} onSave={onSave} onReload={async () => value} />
      </MemoryRouter>,
    );
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    expect(onSave).toHaveBeenCalledWith({ onboarding_required: true, expected_revision: 3 });
    expect(toggle().checked).toBe(true);
  });
  it("preserves a dirty choice on a newer revision until explicit reload", async () => {
    const value = model();
    const next = { ...value, settings: { ...value.settings, revision: 4 } };
    const onSave = vi.fn();
    const onReload = vi.fn().mockResolvedValue(next);
    const view = (m: WeeklyPreferenceSettingsRead) => (
      <MemoryRouter>
        <WeeklyPreferenceSettings model={m} onSave={onSave} onReload={onReload} />
      </MemoryRouter>
    );
    const result = render(view(value));
    fireEvent.click(toggle());
    result.rerender(view(next));
    expect(screen.getByText(/Your draft is preserved/)).toBeTruthy();
    expect(toggle().checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard and reload" }));
    await waitFor(() => expect(toggle().checked).toBe(false));
  });
  it("does not offer editing to a manager without organization authority", () => {
    const value = { ...model(), can_edit: false };
    const onSave = vi.fn();
    render(
      <MemoryRouter>
        <WeeklyPreferenceSettings model={value} onSave={onSave} onReload={async () => value} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(toggle().disabled).toBe(true);
  });
  // BL-798 (E4-15): the core's "Not allowed" reads as a sentence.
  it("says the person has no access instead of the core's refusal", async () => {
    vi.mocked(loadWeeklyPreferenceSettings).mockRejectedValue(
      new RequestError("Not allowed", "authz.missing_permission", undefined, 403),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <WeeklyPreferenceSettingsPanel workspaceId="w" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "You don't have access to these availability settings.",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

// Loading and error in the "B" look (Mert 2026-10-14).
describe("WeeklyPreferenceSettingsPanel loading and error", () => {
  const renderPanel = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <WeeklyPreferenceSettingsPanel workspaceId="w" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return client;
  };

  it("outlines the panel while it loads", () => {
    vi.mocked(loadWeeklyPreferenceSettings).mockReturnValueOnce(new Promise(() => {}));
    renderPanel();
    expect(screen.getByRole("status").textContent).toContain("Loading availability settings");
    expect(screen.queryByText("Loading availability settings...")).toBeNull();
  });

  it("shows the load-error card with Try again, not the server's sentence", async () => {
    vi.mocked(loadWeeklyPreferenceSettings)
      .mockRejectedValueOnce(new Error("preferences service down"))
      .mockResolvedValueOnce(model());
    renderPanel();
    expect(await screen.findByRole("heading", { level: 3, name: "We couldn't load availability settings" })).toBeTruthy();
    expect(screen.queryByText("preferences service down")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "We couldn't load availability settings" })).toBeNull(),
    );
    expect(screen.getByRole("switch")).toBeTruthy();
  });

  it("keeps the last settings and says so when a refresh fails", async () => {
    vi.mocked(loadWeeklyPreferenceSettings).mockResolvedValueOnce(model());
    const client = renderPanel();
    expect(await screen.findByRole("switch")).toBeTruthy();
    vi.mocked(loadWeeklyPreferenceSettings).mockRejectedValueOnce(new Error("preferences service down"));
    await act(async () => {
      await client.refetchQueries();
    });
    const line = await screen.findByRole("alert");
    expect(line.textContent).toContain(
      "Availability settings didn't refresh. These are the last settings that loaded.",
    );
    expect(screen.getByRole("switch")).toBeTruthy();
    expect(screen.queryByText("preferences service down")).toBeNull();
  });
});
