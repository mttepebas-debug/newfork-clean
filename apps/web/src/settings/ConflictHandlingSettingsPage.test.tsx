import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ConflictHandlingSettingsPage from "./ConflictHandlingSettingsPage";
import { organizationRequest } from "./organization-data";

import { RequestError } from "../lib/request-error";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const owner: ActiveWorkspaceContext = {
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
    access: { employee: false, management: "owner" },
    status: "active",
  },
  permissions: ["schedule.conflict_rules.manage"],
  actions: ["settings.conflict_rules.write"],
  onboarding: { status: "complete", currentStep: 4 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
};
const conflictSettings = {
  conflict_rules: {
    approved_time_off: "block",
    closed_location: "confirm",
    minimum_travel: "confirm",
    minimum_rest: "confirm",
  },
  conflict_rules_revision: 3,
  minimum_travel_minutes: 30,
  minimum_rest_minutes: 0,
} as const;
let context: ActiveWorkspaceContext = owner;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("./organization-data", () => ({ organizationRequest: vi.fn() }));

describe("ConflictHandlingSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    context = owner;
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

  // Loading and error in the "B" look (Mert 2026-10-14).
  it("outlines the rules while they load", () => {
    vi.mocked(organizationRequest).mockReturnValueOnce(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("status").textContent).toContain("Loading conflict rules");
    expect(screen.queryByText("Loading conflict rules...")).toBeNull();
  });

  it("shows the load-error card with Try again, not the server's sentence", async () => {
    vi.mocked(organizationRequest).mockRejectedValueOnce(new Error("rules service down"));
    renderPage();
    expect(await screen.findByRole("heading", { name: "We couldn't load conflict rules" })).toBeTruthy();
    expect(screen.queryByText("rules service down")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Approved time off always keeps someone off the schedule.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "We couldn't load conflict rules" })).toBeNull();
  });

  it("keeps the last rules and says so when a refresh fails", async () => {
    const { client } = renderPage();
    expect(await screen.findByText("Approved time off always keeps someone off the schedule.")).toBeTruthy();
    vi.mocked(organizationRequest).mockRejectedValueOnce(new Error("rules service down"));
    await act(async () => {
      await client.refetchQueries();
    });
    expect(
      await screen.findByText("Conflict rules didn't refresh. These are the last rules that loaded."),
    ).toBeTruthy();
    expect(screen.getByText("Approved time off always keeps someone off the schedule.")).toBeTruthy();
    expect(screen.queryByText("rules service down")).toBeNull();
  });

  it("shows the no-access card, not the raw error, when the API refuses conflict rules (FB-6.1.9)", async () => {
    vi.mocked(organizationRequest).mockRejectedValue(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to Conflict handling" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });

  it("offers Closed location in three degrees, no Warn (FB-6.7 C2-A, K17)", async () => {
    renderPage();
    const select = (await screen.findByRole("combobox", { name: "Closed location handling" })) as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual(["Block", "Ask every time", "Ask once per edit"]);
    expect(select.value).toBe("confirm");
    expect(screen.getByText("Shifts on a closed day.")).toBeTruthy();
  });

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

  it("offers no approved time off choice but still saves it as block", async () => {
    renderPage();
    const input = await screen.findByLabelText(
      "Minimum travel time (minutes)",
    );
    expect(screen.queryByText("Approved time off")).toBeNull();
    expect(screen.queryByLabelText("Approved time off handling")).toBeNull();
    fireEvent.change(input, { target: { value: "45" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save conflict rules" }),
    );
    await waitFor(() =>
      expect(organizationRequest).toHaveBeenCalledTimes(2),
    );
    const body = JSON.parse(
      String(vi.mocked(organizationRequest).mock.calls[1]![2]!.body),
    );
    expect(body.conflict_rules.approved_time_off).toBe("block");
  });

  it("offers no availability rule and never saves one (BL-186)", async () => {
    renderPage();
    const input = await screen.findByLabelText(
      "Minimum travel time (minutes)",
    );
    expect(screen.queryByText("Employee availability")).toBeNull();
    fireEvent.change(input, { target: { value: "45" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save conflict rules" }),
    );
    await waitFor(() =>
      expect(organizationRequest).toHaveBeenCalledTimes(2),
    );
    const body = JSON.parse(
      String(vi.mocked(organizationRequest).mock.calls[1]![2]!.body),
    );
    expect(body.conflict_rules).not.toHaveProperty("availability");
  });

  it("says in plain words what always happens with time off and availability (BL-185, BL-186)", async () => {
    renderPage();
    await screen.findByLabelText("Minimum travel time (minutes)");
    expect(screen.getByText("Approved time off always keeps someone off the schedule.")).toBeTruthy();
    expect(screen.getByText("Availability is a preference: you'll see a warning, never a block.")).toBeTruthy();
  });

  // BL-677 (2): typing a value back to what is saved leaves nothing to save.
  it("is no longer unsaved once a change is undone", async () => {
    renderPage();
    const input = (await screen.findByLabelText(
      "Minimum travel time (minutes)",
    )) as HTMLInputElement;
    const saved = input.value;
    const save = screen.getByRole("button", { name: "Save conflict rules" });
    fireEvent.change(input, { target: { value: "45" } });
    expect(save).toHaveProperty("disabled", false);
    fireEvent.change(input, { target: { value: saved } });
    expect(save).toHaveProperty("disabled", true);
  });

  it("shows a manager the rules read only, with nothing to save (Mert 2026-10-20, K14 S1)", async () => {
    context = {
      ...owner,
      membership: { ...owner.membership, access: { employee: false, management: "manager" } },
      permissions: ["settings.schedule_rules.read"],
      actions: [],
    };
    renderPage();
    const select = (await screen.findByRole("combobox", { name: "Closed location handling" })) as HTMLSelectElement;
    expect(select.value).toBe("confirm");
    // Disabled through its fieldset, as Schedule rules does.
    expect(select.matches(":disabled")).toBe(true);
    expect((screen.getByLabelText("Minimum travel time (minutes)") as HTMLInputElement).value).toBe("30");
    expect(screen.queryByRole("button", { name: "Save conflict rules" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reload rules" })).toBeNull();
    fireEvent.submit(select.closest("form")!);
    expect(organizationRequest).toHaveBeenCalledTimes(1);
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
    // BL-659: Reload throws the edits away; it is white, not a second Save.
    expect(screen.getByRole("button", { name: "Reload rules" }).className).toContain(
      "secondary-button",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload rules" }));
    await waitFor(() => expect(input).toHaveProperty("value", "30"));
  });
});
