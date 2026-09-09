import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import NotificationPreferencesPage from "./NotificationPreferencesPage";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "./notification-preferences-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";

const context = {
  userId,
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
    userId,
    workspaceId,
    role: "employee",
    status: "active",
    allLocations: true,
  },
  permissions: ["workspace.read"],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context }),
}));

vi.mock("./notification-preferences-data", () => ({
  getNotificationPreferences: vi.fn(),
  saveNotificationPreferences: vi.fn(),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationPreferencesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function preferencesFixture() {
  return {
    workspace_id: workspaceId,
    can_write: true,
    workspaces: [
      {
        id: workspaceId,
        name: "Meyhouse",
        role: "employee" as const,
        isActive: true,
        onboarding: { status: "complete" as const, currentStep: 2 },
      },
      {
        id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe",
        name: "West Room",
        role: "manager" as const,
        isActive: false,
        onboarding: { status: "complete" as const, currentStep: 2 },
      },
    ],
    catalog: [
      {
        type_key: "schedule.published",
        schema_version: 1,
        category: "schedule" as const,
        severity: "info" as const,
        sensitivity: "confidential" as const,
        supported_channels: ["in_app" as const],
        default_cadence: "immediate" as const,
        mandatory_in_app: false,
        channel_controls: [
          { channel: "in_app" as const, locked: false, reason_code: "available" },
          {
            channel: "email" as const,
            locked: true,
            reason_code: "catalog_channel_unsupported",
          },
          {
            channel: "push" as const,
            locked: true,
            reason_code: "catalog_channel_unsupported",
          },
        ],
      },
    ],
    preferences: [
      {
        id: "a1000000-0000-4000-8000-000000000001",
        preference_scope: "type" as const,
        scope_key: "schedule.published",
        channel_preferences: { in_app: "enabled" as const },
        cadence: "immediate" as const,
        timezone: "America/Los_Angeles",
        quiet_hours: { enabled: true, start: "22:00", end: "07:00" },
        safe_preview_enabled: true,
        version: 1,
        updated_at: "2026-09-02T12:00:00.000Z",
      },
    ],
  };
}

describe("notification preferences page", () => {
  it("renders managed channel reasons and saves the final rapid-toggle intent", async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue(preferencesFixture());
    vi.mocked(saveNotificationPreferences).mockResolvedValue({
      status: "saved",
      preferences: [
        {
          ...preferencesFixture().preferences[0]!,
          channel_preferences: { in_app: "disabled" },
          version: 2,
        },
      ],
    });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Notification Preferences" }),
    ).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Schedule" })).toBeTruthy();
    expect(await screen.findByText("Published schedules")).toBeTruthy();
    expect(screen.queryByText("schedule.published")).toBeNull();
    expect((screen.getByLabelText("Workspace") as HTMLSelectElement).value).toBe(
      workspaceId,
    );
    expect(
      await screen.findAllByText(
        "This delivery channel is not available for this notification yet.",
      ),
    ).toHaveLength(2);

    const inApp = screen.getByRole("checkbox", {
      name: "In-app for Published schedules",
    });
    expect(screen.getByRole("checkbox", {
      name: "Email for Published schedules",
    })).toHaveProperty("disabled", true);
    fireEvent.click(inApp);
    fireEvent.click(inApp);
    fireEvent.click(inApp);
    fireEvent.click(
      screen.getByRole("button", { name: "Save Published schedules" }),
    );

    await waitFor(() =>
      expect(saveNotificationPreferences).toHaveBeenLastCalledWith(
        workspaceId,
        {
          updates: [
            expect.objectContaining({
              preference_scope: "type",
              scope_key: "schedule.published",
              channel_preferences: { in_app: "disabled" },
              expected_version: 1,
            }),
          ],
        },
      ),
    );
  });
});
