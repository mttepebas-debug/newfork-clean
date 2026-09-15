import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  SchedulingSettings,
  WeeklyPreferenceSettingsRead,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SchedulingSettingsPage from "./SchedulingSettingsPage";
import {
  loadWeeklyPreferenceSettings,
  saveWeeklyPreferenceSettings,
} from "../availability/availability-data";
import {
  loadSchedulingSettings,
  saveSchedulingSettings,
} from "./organization-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

const context = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: {
    id: workspaceId,
    name: "Meyhouse",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
  membership: {
    id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
    userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
    workspaceId,
    role: "owner",
    status: "active",
    allLocations: true,
  },
  permissions: [
    "workspace.read",
    "workspace.manage",
    "settings.schedule_rules.read",
    "settings.schedule_rules.manage",
  ],
  onboarding: { status: "complete", currentStep: 4 },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const settings = {
  workspace_id: workspaceId,
  week_start_day: "monday",
  schedule_deadline_day: "sunday",
  conflict_policy: "warn",
  availability_enforcement: "soft",
  time_format: "12h",
} satisfies SchedulingSettings;

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context }),
}));

vi.mock("./organization-data", () => ({
  loadSchedulingSettings: vi.fn(),
  saveSchedulingSettings: vi.fn(),
}));
vi.mock("../availability/availability-data", () => ({
  loadWeeklyPreferenceSettings: vi.fn(),
  saveWeeklyPreferenceSettings: vi.fn(),
}));
const weeklySettings: WeeklyPreferenceSettingsRead = {
  settings: {
    input_mode: "time_range",
    warning_policy: "warn",
    onboarding_required: false,
    revision: 3,
  },
  can_edit: true,
  missing_shift_types: [],
};

describe("SchedulingSettingsPage checklist mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadSchedulingSettings).mockResolvedValue(settings);
    vi.mocked(saveSchedulingSettings).mockResolvedValue(undefined);
    vi.mocked(loadWeeklyPreferenceSettings).mockResolvedValue(weeklySettings);
    vi.mocked(saveWeeklyPreferenceSettings).mockImplementation(
      async (_workspace, command) => ({
        ...weeklySettings,
        settings: {
          input_mode: command.input_mode,
          warning_policy: command.warning_policy,
          onboarding_required: command.onboarding_required,
          revision: 4,
        },
      }),
    );
  });

  function renderPage(
    initialEntry = "/app/settings/scheduling?checklist=setup",
  ) {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <SchedulingSettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return { client, ...view };
  }

  it("requires explicit week start and time format choices in checklist mode", async () => {
    renderPage();

    const saveButton = await screen.findByRole("button", {
      name: /save rules/i,
    });
    expect(saveButton).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("radio", { name: "Sunday" }));
    expect(saveButton).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("radio", { name: "24-hour" }));
    expect(saveButton).toHaveProperty("disabled", false);
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(saveSchedulingSettings).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          week_start_day: "sunday",
          time_format: "24h",
        }),
      ),
    );
  });

  it("keeps the normal settings route prefilled", async () => {
    renderPage("/app/settings/scheduling");

    const saveButton = await screen.findByRole("button", {
      name: /save rules/i,
    });
    expect(saveButton).toHaveProperty("disabled", false);
    expect(
      (screen.getByRole("radio", { name: "Monday" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole("radio", { name: "12-hour" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("saves weekly policy independently and removes obsolete review controls", async () => {
    renderPage("/app/settings/scheduling");
    fireEvent.click(await screen.findByRole("radio", { name: "Sunday" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Shift type" }));
    fireEvent.click(screen.getByRole("radio", { name: "Warn and confirm" }));
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Availability required during onboarding",
      }),
    );
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.closest("form")).toBeNull();
    fireEvent.click(save);
    await waitFor(() =>
      expect(saveWeeklyPreferenceSettings).toHaveBeenCalledWith(
        workspaceId,
        {
          input_mode: "shift_type",
          warning_policy: "confirm",
          onboarding_required: true,
          expected_revision: 3,
        },
        expect.any(String),
      ),
    );
    expect(saveSchedulingSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Sunday" })).toHaveProperty(
      "checked",
      true,
    );
    expect(screen.queryByLabelText("Availability ownership")).toBeNull();
    expect(screen.queryByLabelText("Availability approval")).toBeNull();
    expect(
      screen.queryByLabelText("Availability advance notice days"),
    ).toBeNull();
    expect(screen.queryByRole("radio", { name: "Hard" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    await waitFor(() => expect(saveSchedulingSettings).toHaveBeenCalledOnce());
    expect(saveWeeklyPreferenceSettings).toHaveBeenCalledOnce();
  });

  it("keeps weekly settings read-only when the server denies editing", async () => {
    vi.mocked(loadWeeklyPreferenceSettings).mockResolvedValue({
      ...weeklySettings,
      can_edit: false,
    });
    renderPage("/app/settings/scheduling");
    const mode = await screen.findByRole("radio", { name: "Shift type" });
    expect(mode.closest("fieldset")).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save rules" })).toBeTruthy();
  });

  it("explains and saves a configured minimum without losing a dirty value on refetch", async () => {
    vi.mocked(loadSchedulingSettings).mockResolvedValue({
      ...settings,
      minimum_travel_minutes: 30,
    });
    const { client } = renderPage("/app/settings/scheduling");
    const input = await screen.findByLabelText("Minimum travel time (minutes)");
    await waitFor(() => expect(input).toHaveProperty("value", "30"));
    expect(screen.getByText(/next location can start at 3:30 PM/)).toBeTruthy();
    fireEvent.change(input, { target: { value: "60" } });
    await client.invalidateQueries({
      queryKey: ["scheduling-settings", workspaceId],
    });
    expect(input).toHaveProperty("value", "60");
    fireEvent.click(screen.getByRole("button", { name: /save rules/i }));
    await waitFor(() =>
      expect(saveSchedulingSettings).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ minimum_travel_minutes: 60 }),
      ),
    );
  });

  it("does not silently turn a cleared minimum into zero", async () => {
    renderPage("/app/settings/scheduling");
    const input = await screen.findByLabelText("Minimum travel time (minutes)");
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveProperty("value", "");
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByRole("alert").textContent).toContain(
      "whole number from 0 to 240",
    );
    expect(saveSchedulingSettings).not.toHaveBeenCalled();
  });

  it("does not overwrite unsaved settings when the query refetches", async () => {
    const { client } = renderPage("/app/settings/scheduling");

    await screen.findByRole("button", {
      name: /save rules/i,
    });
    fireEvent.click(screen.getByRole("radio", { name: "Sunday" }));

    await client.invalidateQueries({
      queryKey: ["scheduling-settings", workspaceId],
    });

    expect(
      (screen.getByRole("radio", { name: "Sunday" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });
});
