import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ConflictHandlingSettingsPage from "./ConflictHandlingSettingsPage";
import { organizationRequest } from "./organization-data";

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
  permissions: ["schedule.conflict_rules.manage"],
  actions: [],
  onboarding: { status: "complete", currentStep: 4 },
  locationScope: { allLocations: true, locationIds: [] },
};
const conflictSettings = {
  conflict_rules: {
    availability: "confirm",
    approved_time_off: "block",
    closed_location: "confirm",
    minimum_travel: "confirm",
    minimum_rest: "confirm",
  },
  conflict_rules_revision: 3,
  minimum_travel_minutes: 30,
  minimum_rest_minutes: 0,
} as const;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("./organization-data", () => ({ organizationRequest: vi.fn() }));

describe("ConflictHandlingSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(organizationRequest).mockImplementation(
      async (_workspace, _path, init) =>
        init?.method === "PUT"
          ? {
              ...JSON.parse(String(init.body)),
              conflict_rules_revision: 4,
            }
          : conflictSettings,
    );
  });

  function renderPage() {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={["/app/settings/scheduling/conflicts"]}
        >
          <ConflictHandlingSettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return { client, ...view };
  }

  it("uses the canonical Settings header and saves through the existing endpoint", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Conflict handling",
      }),
    ).toBeTruthy();
    const input = await screen.findByLabelText(
      "Minimum travel time (minutes)",
    );
    fireEvent.change(input, { target: { value: "60" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save conflict rules" }),
    );
    await waitFor(() =>
      expect(organizationRequest).toHaveBeenCalledWith(
        workspaceId,
        "/scheduling-settings/conflicts",
        {
          method: "PUT",
          body: JSON.stringify({
            ...conflictSettings,
            minimum_travel_minutes: 60,
          }),
        },
      ),
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "Conflict rules saved.",
    );
  });

  it("does not silently turn a cleared minimum into zero", async () => {
    renderPage();
    const input = await screen.findByLabelText(
      "Minimum travel time (minutes)",
    );
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByRole("alert").textContent).toContain("whole minutes");
    expect(organizationRequest).toHaveBeenCalledTimes(1);
  });

  it("preserves a dirty draft on revision change until explicit reload", async () => {
    const { client } = renderPage();
    const input = await screen.findByLabelText(
      "Minimum travel time (minutes)",
    );
    fireEvent.change(input, { target: { value: "60" } });
    await act(async () => {
      client.setQueryData(["schedule-conflict-settings", workspaceId], {
        ...conflictSettings,
        conflict_rules_revision: 4,
      });
    });
    expect(input).toHaveProperty("value", "60");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save conflict rules" }),
      ).toHaveProperty("disabled", true),
    );
    vi.mocked(organizationRequest).mockResolvedValue({
      ...conflictSettings,
      conflict_rules_revision: 4,
    });
    fireEvent.click(screen.getByRole("button", { name: "Reload rules" }));
    await waitFor(() => expect(input).toHaveProperty("value", "30"));
  });
});
