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

import { RequestError } from "../lib/request-error";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

const context: ActiveWorkspaceContext = {
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
  actions: [],
  onboarding: { status: "complete", currentStep: 4 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
};

const settings = {
  workspace_id: workspaceId,
  week_start_day: "monday",
  schedule_deadline_day: "sunday",
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
    onboarding_required: false,
    revision: 3,
  },
  can_edit: true,
  missing_shift_types: [],
};
describe("SchedulingSettingsPage checklist mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    context.permissions = [
      "workspace.read",
      "settings.schedule_rules.read",
      "settings.schedule_rules.manage",
    ];
    context.actions = ["workspace.read", "settings.scheduling.write"];
    vi.mocked(loadSchedulingSettings).mockResolvedValue(settings);
    vi.mocked(saveSchedulingSettings).mockResolvedValue(undefined);
    vi.mocked(loadWeeklyPreferenceSettings).mockResolvedValue(weeklySettings);
    vi.mocked(saveWeeklyPreferenceSettings).mockImplementation(
      async (_workspace, command) => ({
        ...weeklySettings,
        settings: {
          input_mode: command.input_mode,
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

  it("shows the no-access card, not the raw error, when the API refuses scheduling settings (FB-6.1.9)", async () => {
    vi.mocked(loadSchedulingSettings).mockRejectedValue(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to scheduling settings" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });

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
      screen.getByRole("region", { name: "Schedule basics" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Availability and staffing" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Missing this target does not block publishing/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Saved separately from Schedule basics/),
    ).toBeTruthy();
    expect(
      (screen.getByRole("radio", { name: "Monday" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole("radio", { name: "12-hour" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("keeps the rules read-only for someone the core does not let write them", async () => {
    // The permission key is still there; the core's action is not.
    context.actions = ["workspace.read"];
    renderPage("/app/settings/scheduling");

    const saveButton = await screen.findByRole("button", {
      name: /save rules/i,
    });
    // The whole rules form sits in a disabled fieldset.
    expect(saveButton.closest("fieldset")).toHaveProperty("disabled", true);
    expect(
      screen.queryByRole("region", { name: "Availability and staffing" }),
    ).toBeNull();
  });

  it("saves weekly policy independently", async () => {
    renderPage("/app/settings/scheduling");
    fireEvent.click(await screen.findByRole("radio", { name: "Sunday" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Shift type" }));
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
