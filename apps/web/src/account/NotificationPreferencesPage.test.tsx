import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext, NotificationUserPreferencesResponse } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import NotificationPreferencesPage from "./NotificationPreferencesPage";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "./notification-preferences-data";

import { RequestError } from "../lib/request-error";
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
  actions: [],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
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

function expandGroup(label = "Schedule") {
  const disclosure = screen.getByRole("button", { name: `Expand individual notifications for ${label}` });
  fireEvent.click(disclosure);
  return screen.getByRole("button", { name: `Collapse individual notifications for ${label}` });
}

function preferencesFixture(): NotificationUserPreferencesResponse {
  const schedulePublished = {
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
  };
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
    catalog: [schedulePublished, { ...schedulePublished }],
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
  it.each(["email_unverified", "delivery_unavailable"] as const)("hides one-workspace selector and explains %s with Security action", async reason => {
    const fixture = preferencesFixture();
    fixture.workspaces = fixture.workspaces.slice(0, 1);
    fixture.email_channel_reason = reason;
    fixture.account_catalog = [{ type_key: "security.account.password_changed", scope: "account", title: "Password changed", description: "Security update", mandatory_in_app: true, delivery: "transactional_in_app" }];
    vi.mocked(getNotificationPreferences).mockResolvedValue(fixture);
    renderPage();
    await screen.findByRole("checkbox", { name: "Schedule In-app" });
    expect(screen.queryByLabelText("Workspace")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Account security messages" })).toBeNull();
    expect(screen.queryByText("Password changed")).toBeNull();
    expect(screen.queryByRole("link", { name: "Account Security" })).toBeNull();
    expect(screen.queryByText("Notification group")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Schedule Email" })).toHaveProperty("disabled", true);
  });
  it("renders server email defaults and preserves stored push, cadence and quiet hours", async () => {
    const fixture = preferencesFixture();
    fixture.catalog = [{ ...fixture.catalog[0]!, supported_channels: ["in_app", "email"], default_channels: { in_app: "enabled", email: "disabled" } }];
    fixture.preferences[0]!.channel_preferences = { in_app: "enabled", push: "disabled" };
    vi.mocked(getNotificationPreferences).mockResolvedValue(fixture);
    vi.mocked(saveNotificationPreferences).mockResolvedValue({ status: "saved", preferences: [] });
    renderPage();
    const toggle = await screen.findByRole("checkbox", { name: "Schedule In-app" });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Schedule Email" })).toHaveProperty("checked", false));
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveNotificationPreferences).toHaveBeenLastCalledWith(workspaceId, { updates: [expect.objectContaining({
      channel_preferences: { in_app: "disabled", push: "disabled" }, cadence: "immediate", quiet_hours: { enabled: true, start: "22:00", end: "07:00" },
    })] }));
  });

  // BL-1049: the database says the preference moved on with its key; the page
  // loads the latest choices instead of printing "stale ... version".
  it("reloads the latest choices when they changed elsewhere", async () => {
    const before = preferencesFixture();
    before.preferences[0]!.channel_preferences = { in_app: "enabled" };
    const after = preferencesFixture();
    after.preferences[0]!.channel_preferences = { in_app: "disabled" };
    after.preferences[0]!.version = 2;
    vi.mocked(getNotificationPreferences).mockReset();
    vi.mocked(getNotificationPreferences).mockResolvedValueOnce(before).mockResolvedValue(after);
    vi.mocked(saveNotificationPreferences).mockRejectedValueOnce(
      new RequestError("stale notification preference version", "notification.preference_changed", undefined, 409),
    );
    renderPage();
    const toggle = await screen.findByRole("checkbox", { name: "Schedule In-app" });
    await waitFor(() => expect(toggle).toHaveProperty("checked", true));
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Your notification choices changed elsewhere. The latest ones are shown; make your change again.",
    );
    await waitFor(() => expect(getNotificationPreferences).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Schedule In-app" })).toHaveProperty("checked", false));
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  it("inherits category choices but writes only the editable channel at type scope", async () => {
    const fixture = preferencesFixture();
    fixture.preferences = [{ ...fixture.preferences[0]!, preference_scope: "category", scope_key: "schedule",
      channel_preferences: { in_app: "disabled", email: "disabled" }, version: 7 }];
    vi.mocked(getNotificationPreferences).mockResolvedValue(fixture);
    vi.mocked(saveNotificationPreferences).mockResolvedValue({ status: "saved", preferences: fixture.preferences });
    renderPage();
    const master = await screen.findByRole("checkbox", { name: "Schedule In-app" });
    await waitFor(() => expect(master).toHaveProperty("checked", false));
    fireEvent.click(master);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveNotificationPreferences).toHaveBeenLastCalledWith(workspaceId, {
      updates: [expect.objectContaining({ preference_scope: "type", scope_key: "schedule.published",
        channel_preferences: { in_app: "enabled" }, expected_version: null })],
    }));
  });
  it("shows mixed master state and preserves mandatory and unsupported channels", async () => {
    const fixture = preferencesFixture();
    fixture.catalog.push({ ...fixture.catalog[0]!, type_key: "requests.time_off.status_changed", category: "requests" });
    fixture.catalog.push({ ...fixture.catalog[0]!, type_key: "requests.shift_change.status_changed", category: "requests", mandatory_in_app: true });
    fixture.preferences.push({ ...fixture.preferences[0]!, scope_key: "requests.time_off.status_changed", channel_preferences: { in_app: "disabled" } });
    vi.mocked(getNotificationPreferences).mockResolvedValue(fixture);
    vi.mocked(saveNotificationPreferences).mockResolvedValue({ status: "saved", preferences: fixture.preferences });
    renderPage();
    const master = await screen.findByRole("checkbox", { name: "Requests In-app" });
    await waitFor(() => expect(master).toHaveProperty("indeterminate", true));
    expect(screen.getByRole("checkbox", { name: "Requests Email" })).toHaveProperty("disabled", true);
    expandGroup("Requests");
    expect(screen.getByRole("checkbox", { name: "In-app for Shift change request updates" })).toHaveProperty("disabled", true);
    fireEvent.click(master);
    expect(master).toHaveProperty("indeterminate", false);
    expect(screen.getByRole("checkbox", { name: "In-app for Time-off request updates" })).toHaveProperty("checked", true);
    expect(screen.getAllByRole("button", { name: /Save/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveNotificationPreferences).toHaveBeenLastCalledWith(workspaceId, {
      updates: [expect.objectContaining({ scope_key: "requests.time_off.status_changed", channel_preferences: { in_app: "enabled" } })],
    }));
    expect(screen.queryByRole("heading", { name: "Account security messages" })).toBeNull();
  });
  it("toggles from the full row and keeps disclosure separate from channel controls", async () => {
    vi.mocked(getNotificationPreferences).mockResolvedValue(preferencesFixture());
    renderPage();

    await screen.findByRole("checkbox", { name: "Schedule In-app" });
    expect(screen.getAllByText("In app")).toHaveLength(1);
    expect(screen.getAllByText("Email")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Individual notifications" })).toBeNull();

    const disclosure = screen.getByRole("button", { name: "Expand individual notifications for Schedule" });
    expect(disclosure.tagName).toBe("BUTTON");
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    const groupRow = screen.getByRole("heading", { name: "Schedule" }).closest(".notification-preference-group-row");
    expect(groupRow).toBeTruthy();
    fireEvent.click(groupRow!);
    const expandedDisclosure = screen.getByRole("button", { name: "Collapse individual notifications for Schedule" });
    expect(expandedDisclosure.getAttribute("aria-expanded")).toBe("true");
    expect(expandedDisclosure.getAttribute("aria-controls")).toBe("notification-group-schedule");
    expect(screen.getByRole("heading", { name: "Individual notifications" })).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "In-app for Published schedules" }));
    expect(expandedDisclosure.getAttribute("aria-expanded")).toBe("true");
  });
  it("shows plain-language names for availability and unknown notification types", async () => {
    const fixture = preferencesFixture();
    fixture.catalog = [
      { ...fixture.catalog[0]!, type_key: "availability.status_changed" },
      { ...fixture.catalog[0]!, type_key: "availability.weekly_updated" },
      { ...fixture.catalog[0]!, type_key: "future.shift_note.added" },
    ];
    vi.mocked(getNotificationPreferences).mockResolvedValue(fixture);
    renderPage();

    await screen.findByRole("checkbox", { name: "Schedule In-app" });
    expandGroup();
    expect(screen.getByRole("heading", { name: "Your availability updates" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Employee availability changes" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Shift note added" })).toBeTruthy();
    expect(screen.queryByText("availability.status_changed")).toBeNull();
    expect(screen.queryByText("future.shift_note.added")).toBeNull();
  });
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
      await screen.findByRole("heading", { name: "Notifications" }),
    ).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Schedule" })).toBeTruthy();
    expandGroup();
    expect(await screen.findByText("Published schedules")).toBeTruthy();
    expect(screen.getAllByText("Published schedules")).toHaveLength(1);
    expect(screen.queryByText("schedule.published")).toBeNull();
    expect((screen.getByLabelText("Workspace") as HTMLSelectElement).value).toBe(
      workspaceId,
    );
    expect(
      await screen.findAllByText(
        "This delivery channel is not available for this notification yet.",
      ),
    ).toHaveLength(1);

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
      screen.getByRole("button", { name: "Save" }),
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

describe("no access (FB-6.1.9)", () => {
  it("shows the no-access card, not the raw error, when the API refuses this workspace's notifications (FB-6.1.9)", async () => {
    vi.mocked(getNotificationPreferences).mockRejectedValue(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to this workspace's notifications" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});
