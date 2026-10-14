import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  NotificationSettingsResponse,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationSettingsPage from "./NotificationSettingsPage";
import {
  getNotificationSettings,
  previewNotificationPolicy,
  resetNotificationPolicies,
  saveNotificationPolicy,
} from "./notification-settings-data";

import { MemoryRouter } from "react-router";
import { RequestError } from "../lib/request-error";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
let permissions: ActiveWorkspaceContext["permissions"];

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
    role: "owner",
    status: "active",
    allLocations: true,
  },
  get permissions() {
    return permissions;
  },
  actions: [],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const defaultPolicy = {
  id: null,
  scope: { kind: "global" as const, id: null, name: "Organization" },
  enabled: true,
  allowed_channels: ["in_app" as const],
  cadence: "immediate" as const,
  version: null,
  updated_by: null,
  updated_at: null,
  source: "catalog_default" as const,
};
const fixture = {
  workspace_id: workspaceId,
  can_write: true,
  catalog: [
    {
      type_key: "schedule.published",
      schema_version: 1,
      category: "schedule",
      severity: "info",
      sensitivity: "confidential",
      supported_channels: ["in_app"],
      default_cadence: "immediate",
      action_route: "/app/employee-hub",
      mandatory_in_app: false,
      policy: defaultPolicy,
    },
    {
      type_key: "requests.time_off.submitted",
      schema_version: 1,
      category: "requests",
      severity: "action_required",
      sensitivity: "confidential",
      supported_channels: ["in_app"],
      default_cadence: "immediate",
      action_route: "/app/schedule/requests",
      mandatory_in_app: false,
      policy: defaultPolicy,
    },
  ],
  policies: [
    {
      type_key: "schedule.published",
      schema_version: 1,
      id: "a1000000-0000-4000-8000-000000000001",
      scope: {
        kind: "location",
        id: "a2000000-0000-4000-8000-000000000001",
        name: "Main Dining",
      },
      enabled: false,
      allowed_channels: ["in_app"],
      cadence: "daily_digest",
      version: 2,
      updated_by: userId,
      updated_at: "2026-09-02T12:00:00.000Z",
      source: "organization_policy",
    },
  ],
  roles: [{ id: "a3000000-0000-4000-8000-000000000001", name: "Manager" }],
  locations: [
    { id: "a2000000-0000-4000-8000-000000000001", name: "Main Dining" },
  ],
  audit: [],
} satisfies NotificationSettingsResponse;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("./notification-settings-data", () => ({
  getNotificationSettings: vi.fn(),
  saveNotificationPolicy: vi.fn(),
  resetNotificationPolicies: vi.fn(),
  previewNotificationPolicy: vi.fn(),
}));

function renderPage(response: NotificationSettingsResponse = fixture) {
  vi.mocked(getNotificationSettings).mockResolvedValue(response);
  vi.mocked(saveNotificationPolicy).mockResolvedValue({
    status: "saved",
    policy: {
      ...defaultPolicy,
      id: "a1000000-0000-4000-8000-000000000002",
      enabled: false,
      version: 1,
      updated_by: userId,
      updated_at: "2026-09-02T13:00:00.000Z",
      source: "organization_policy",
    },
  });
  vi.mocked(resetNotificationPolicies).mockResolvedValue({
    status: "reset",
    affected: 1,
  });
  vi.mocked(previewNotificationPolicy).mockResolvedValue({
    status: "previewed",
    delivery_mode: "preview_only",
    redirected_to_user_id: userId,
    decision: "allow",
    reason_code: "allowed",
  });
  return renderWithClient();
}

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("NotificationSettingsPage", () => {
  beforeEach(() => {
    permissions = [
      "notifications.settings.read",
      "notifications.settings.write",
      "notifications.test_send",
    ];
    vi.clearAllMocks();
  });

  it.each([[1, 2], [2, 1]])("renders one rule and saves the latest schema for catalog order %j", async (first, second) => {
    const entry = { ...fixture.catalog[0]!, type_key: "availability.status_changed" };
    renderPage({ ...fixture, catalog: [
      { ...entry, schema_version: first },
      { ...entry, schema_version: second },
    ] });
    const title = "Your availability updates";
    expect(await screen.findAllByRole("heading", { name: title })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(`Reason for ${title}`), {
      target: { value: "Update availability alerts" },
    });
    fireEvent.click(screen.getByRole("button", { name: `Save ${title}` }));
    await waitFor(() => expect(saveNotificationPolicy).toHaveBeenCalledWith(
      workspaceId, expect.objectContaining({ type_key: entry.type_key, schema_version: 2 }),
    ));
  });

  it("calls the whole-workspace scope Workspace, even when the server still says Organization (BL-1027)", async () => {
    renderPage({
      ...fixture,
      catalog: [{
        ...fixture.catalog[0]!,
        policy: { ...defaultPolicy, version: 3, source: "organization_policy" },
      }],
    });
    expect(await screen.findByText("Published schedules")).toBeTruthy();
    const scope = screen.getByLabelText("Policy scope") as HTMLSelectElement;
    expect(scope.selectedOptions[0]?.textContent).toBe("Workspace");
    expect(screen.getByText("Workspace · v3")).toBeTruthy();
    expect(screen.queryByText(/Organization/)).toBeNull();
  });

  it("filters active notification types by category and search", async () => {
    const { container } = renderPage();
    expect(await screen.findByText("Published schedules")).toBeTruthy();
    const page = container.querySelector(".settings-page.notification-settings");
    expect(page?.firstElementChild?.className).toContain(
      "settings-page-header",
    );
    expect(page?.firstElementChild?.nextElementSibling?.className).toContain(
      "notification-settings-toolbar",
    );
    expect(screen.queryByText("schedule.published")).toBeNull();
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "requests" },
    });
    expect(screen.queryByText("Published schedules")).toBeNull();
    expect(screen.getByText("Time-off requests to review")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search notification rules"), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No notification types match these filters.")).toBeTruthy();
  });

  it("exposes loading and request failure states to assistive technology", async () => {
    vi.mocked(getNotificationSettings).mockImplementationOnce(
      () => new Promise<NotificationSettingsResponse>(() => undefined),
    );
    const loading = renderWithClient();
    expect(screen.getByRole("status").textContent).toContain("Loading");
    loading.unmount();

    vi.mocked(getNotificationSettings).mockRejectedValueOnce(
      new Error("Settings are temporarily unavailable"),
    );
    renderWithClient();
    // The "B" card (Mert 2026-10-14): a heading and Try again, never the server's sentence.
    const card = await screen.findByRole("alert");
    expect(card.textContent).toContain("We couldn't load notification settings");
    expect(card.textContent).not.toContain("temporarily unavailable");
  });

  it("keeps every mutation control disabled for a read-only administrator", async () => {
    permissions = ["notifications.settings.read"];
    renderPage({ ...fixture, can_write: false });
    expect(await screen.findByText("Read-only access")).toBeTruthy();
    expect(screen.getByLabelText("Published schedules enabled")).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.queryByRole("button", { name: "Reset all policies" })).toBeNull();
  });

  it("loads a location override and saves with its optimistic version and reason", async () => {
    renderPage();
    await screen.findByText("Published schedules");
    fireEvent.change(screen.getByLabelText("Policy scope"), {
      target: { value: "location:a2000000-0000-4000-8000-000000000001" },
    });
    expect(screen.getByLabelText("Published schedules enabled")).toHaveProperty(
      "checked",
      false,
    );
    fireEvent.click(screen.getByLabelText("Published schedules enabled"));
    fireEvent.change(screen.getByLabelText("Reason for Published schedules"), {
      target: { value: "Resume Main Dining notices" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Published schedules" }));

    await waitFor(() =>
      expect(saveNotificationPolicy).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          type_key: "schedule.published",
          expected_version: 2,
          enabled: true,
          scope: {
            kind: "location",
            id: "a2000000-0000-4000-8000-000000000001",
          },
          reason: "Resume Main Dining notices",
        }),
      ),
    );
    expect(await screen.findByText("Notification policy saved.")).toBeTruthy();
  });

  it("announces a conflict, rolls the optimistic state back and reloads the policies", async () => {
    vi.mocked(saveNotificationPolicy).mockRejectedValueOnce(
      new RequestError(
        "notification policy stale version",
        "notification.policy_changed",
        undefined,
        409,
      ),
    );
    renderPage();
    await screen.findByText("Published schedules");
    const loads = vi.mocked(getNotificationSettings).mock.calls.length;
    fireEvent.click(screen.getByLabelText("Published schedules enabled"));
    fireEvent.change(screen.getByLabelText("Reason for Published schedules"), {
      target: { value: "Pause publication notices" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Published schedules" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "changed elsewhere",
    );
    expect(screen.getByLabelText("Published schedules enabled")).toHaveProperty(
      "checked",
      true,
    );
    // BL-1049: "review the latest version" has the latest version to review.
    await waitFor(() =>
      expect(vi.mocked(getNotificationSettings).mock.calls.length).toBeGreaterThan(loads),
    );
  });

  // BL-1049: the screen reads the database's key, not words in its sentence.
  it("keeps a refusal's own sentence when it carries no changed-elsewhere key", async () => {
    vi.mocked(saveNotificationPolicy).mockRejectedValueOnce(
      new RequestError("This channel conflicts with the stale schedule rule", undefined, undefined, 400),
    );
    renderPage();
    await screen.findByText("Published schedules");
    fireEvent.click(screen.getByLabelText("Published schedules enabled"));
    fireEvent.change(screen.getByLabelText("Reason for Published schedules"), {
      target: { value: "Pause publication notices" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Published schedules" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This channel conflicts with the stale schedule rule");
    expect(alert.textContent).not.toContain("changed elsewhere");
  });

  it("runs a preview-only test and can reset the visible category", async () => {
    renderPage();
    await screen.findByText("Published schedules");
    fireEvent.change(screen.getByLabelText("Reset reason"), {
      target: { value: "Restore visible category defaults" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run safe test for Published schedules" }));
    expect(await screen.findByText("Safe preview allowed; no external message was sent.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset Published schedules" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reset Published schedules" }));
    await waitFor(() =>
      expect(resetNotificationPolicies).toHaveBeenCalledWith(workspaceId, {
        target: { kind: "type", value: "schedule.published" },
        reason: "Restore visible category defaults",
      }),
    );
    // BL-661: one policy is "1 notification policy".
    expect(await screen.findByText("1 notification policy reset.")).toBeTruthy();
    vi.mocked(resetNotificationPolicies).mockClear();
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "schedule" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset current category" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reset category" }));
    await waitFor(() =>
      expect(resetNotificationPolicies).toHaveBeenCalledWith(workspaceId, {
        target: { kind: "category", value: "schedule" },
        reason: "Restore visible category defaults",
      }),
    );
  });

  // BL-1011: a reset wipes saved policies, so it is red and asks once more.
  it("resets all policies only on a second click of a red button", async () => {
    renderPage();
    await screen.findByText("Published schedules");
    fireEvent.change(screen.getByLabelText("Reset reason"), {
      target: { value: "Start over with defaults" },
    });
    const resetAll = screen.getByRole("button", { name: "Reset all policies" });
    expect(resetAll.className).toContain("danger-button");

    fireEvent.click(resetAll);
    expect(resetNotificationPolicies).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm reset all" }));
    await waitFor(() =>
      expect(resetNotificationPolicies).toHaveBeenCalledWith(workspaceId, {
        target: { kind: "all" },
        reason: "Start over with defaults",
      }),
    );
    expect(resetNotificationPolicies).toHaveBeenCalledTimes(1);
  });

  it("backs out of every reset with Escape without calling the API", async () => {
    renderPage();
    await screen.findByText("Published schedules");
    fireEvent.change(screen.getByLabelText("Reset reason"), {
      target: { value: "Start over with defaults" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "schedule" },
    });
    for (const [name, armedName] of [
      ["Reset all policies", "Confirm reset all"],
      ["Reset current category", "Confirm reset category"],
      ["Reset Published schedules", "Confirm reset Published schedules"],
    ] as const) {
      const button = screen.getByRole("button", { name });
      expect(button.className).toContain("danger-button");
      fireEvent.click(button);
      fireEvent.keyDown(screen.getByRole("button", { name: armedName }), {
        key: "Escape",
      });
      expect(screen.getByRole("button", { name }).className).not.toContain(
        "is-armed",
      );
    }
    expect(resetNotificationPolicies).not.toHaveBeenCalled();
  });
});

describe("no access (FB-6.1.9)", () => {
  it("shows the no-access card, not the raw error, when the API refuses notification settings (FB-6.1.9)", async () => {
    permissions = ["notifications.settings.read"];
    vi.mocked(getNotificationSettings).mockRejectedValueOnce(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to notification settings" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});

// Loading and error in the "B" look (Mert 2026-10-14).
describe("NotificationSettingsPage loading and error", () => {
  beforeEach(() => {
    permissions = ["notifications.settings.read", "notifications.settings.write"];
    vi.clearAllMocks();
  });
  const renderQueued = () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotificationSettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return client;
  };
  const catalog = () => document.querySelector(".notification-policy-list");

  it("outlines the settings while they load", () => {
    vi.mocked(getNotificationSettings).mockReturnValueOnce(new Promise(() => {}));
    renderQueued();
    expect(screen.getByRole("status").textContent).toContain("Loading notification settings");
    expect(screen.queryByText("Loading notification settings...")).toBeNull();
  });

  it("shows the load-error card with Try again, not the server's sentence", async () => {
    vi.mocked(getNotificationSettings)
      .mockRejectedValueOnce(new Error("settings service down"))
      .mockResolvedValueOnce(fixture);
    renderQueued();
    expect(await screen.findByRole("heading", { name: "We couldn't load notification settings" })).toBeTruthy();
    expect(screen.queryByText("settings service down")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(catalog()).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "We couldn't load notification settings" })).toBeNull();
  });

  it("keeps the last settings and says so when a refresh fails", async () => {
    vi.mocked(getNotificationSettings).mockResolvedValueOnce(fixture);
    const client = renderQueued();
    await waitFor(() => expect(catalog()).toBeTruthy());
    vi.mocked(getNotificationSettings).mockRejectedValueOnce(new Error("settings service down"));
    await act(async () => {
      await client.refetchQueries();
    });
    expect(
      await screen.findByText("Notification settings didn't refresh. These are the last settings that loaded."),
    ).toBeTruthy();
    expect(catalog()).toBeTruthy();
    expect(screen.queryByText("settings service down")).toBeNull();
  });
});
