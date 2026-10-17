import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { usLettersMessage } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOwnerSetupChecklistProgress,
  setOwnerSetupChecklistClosed,
} from "../communications/communications-data";
import GeneralSettingsPage from "./GeneralSettingsPage";
import { RequestError } from "../lib/request-error";
import { saveScheduleLogo, updateOrganizationName } from "./organization-data";

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
    role: "owner",
    status: "active",
    allLocations: true,
  },
  permissions: [
    "workspace.read",
    "workspace.manage",
    "settings.general.read",
    "settings.general.manage",
  ],
  actions: [],
  onboarding: { status: "complete", currentStep: 4 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context, refresh: vi.fn() }),
}));

vi.mock("../communications/communications-data", () => ({
  getOwnerSetupChecklistProgress: vi.fn(),
  setOwnerSetupChecklistClosed: vi.fn(),
}));

vi.mock("./organization-data", () => ({
  saveScheduleLogo: vi.fn(),
  updateOrganizationName: vi.fn(),
}));

describe("GeneralSettingsPage setup checklist controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveScheduleLogo).mockResolvedValue(context.workspace);
    vi.mocked(updateOrganizationName).mockResolvedValue(undefined);
    vi.mocked(getOwnerSetupChecklistProgress).mockResolvedValue({
      workspace_id: workspaceId,
      user_id: userId,
      completed_item_ids: [],
      closed_at: null,
    });
    vi.mocked(setOwnerSetupChecklistClosed).mockImplementation(
      async (_workspaceId, closed) => ({
        workspace_id: workspaceId,
        user_id: userId,
        completed_item_ids: [],
        closed_at: closed ? "2026-09-05T12:00:00.000Z" : null,
      }),
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
        <GeneralSettingsPage />
      </QueryClientProvider>,
    );
    return { ...view, client };
  }

  // KARARLAR S-131 (Mert, 2026-10-17): every preferred name waits for who may decide it, so General has no
  // setting that lets one through.
  it("has no preferred-name setting: every preferred name waits for who may decide it", async () => {
    renderPage();
    expect(await screen.findByText("Visible on Workspace")).toBeTruthy();
    expect(screen.queryByText("Preferred names")).toBeNull();
    expect(screen.queryByRole("button", { name: /answer them here|let them through/i })).toBeNull();
  });

  it("keeps the last value and says so when the checklist setting fails to refresh", async () => {
    const { client } = renderPage();
    expect(await screen.findByText("Visible on Workspace")).toBeTruthy();
    vi.mocked(getOwnerSetupChecklistProgress).mockRejectedValueOnce(new Error("checklist service down"));
    await act(async () => {
      await client.refetchQueries();
    });
    await waitFor(() =>
      expect(screen.getAllByText("This setting didn't refresh. This is the last value that loaded.").length).toBe(1),
    );
    expect(screen.getByText("Visible on Workspace")).toBeTruthy();
    expect(screen.getByRole("button", { name: /hide checklist/i })).toHaveProperty("disabled", false);
    expect(screen.queryByText(/service down/)).toBeNull();
    expect(screen.queryByText(/could not be saved/)).toBeNull();
  });

  it("says plainly when the person may not read a setting, with no Try again", async () => {
    vi.mocked(getOwnerSetupChecklistProgress).mockRejectedValueOnce(
      new RequestError("Forbidden", "authz.missing_permission", undefined, 403),
    );
    renderPage();
    expect(await screen.findByText("You don't have access to this setting.")).toBeTruthy();
    expect(screen.queryByText("This setting didn't load. Nothing was changed.")).toBeNull();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });

  it("closes the checklist button when access is lost after it loaded", async () => {
    const { client } = renderPage();
    expect(await screen.findByText("Visible on Workspace")).toBeTruthy();
    vi.mocked(getOwnerSetupChecklistProgress).mockRejectedValueOnce(
      new RequestError("Forbidden", "authz.missing_permission", undefined, 403),
    );
    await act(async () => {
      await client.refetchQueries();
    });
    expect(await screen.findByText("You don't have access to this setting.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /hide checklist/i })).toHaveProperty("disabled", true);
  });

  // BL-503: KARARLAR "Form ve girdi kuralları (ABD)".
  it("says under Workspace name that Turkish-only letters are not taken, and holds Save", async () => {
    renderPage();
    const name = screen.getByLabelText("Workspace name");
    fireEvent.change(name, { target: { value: "Beşiktaş Grill" } });
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(name.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      usLettersMessage,
    );
    expect(screen.getByRole("button", { name: /save changes/i })).toHaveProperty("disabled", true);
    fireEvent.change(name, { target: { value: "Besiktas Grill" } });
    expect(screen.getByRole("button", { name: /save changes/i })).toHaveProperty("disabled", false);
  });

  // BL-851: screen text says workspace, never the code's "organization".
  it("words the page in workspace terms", async () => {
    const { container } = renderPage();
    fireEvent.change(screen.getByLabelText("Workspace name"), {
      target: { value: "Besiktas Grill" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("Workspace settings saved.")).toBeTruthy();
    expect(container.textContent).not.toMatch(/organization/i);
  });

  // Loading and error in the "B" look (Mert 2026-10-14): a failed read is not a failed save.
  it("outlines the checklist setting while it loads", () => {
    vi.mocked(getOwnerSetupChecklistProgress).mockReturnValueOnce(new Promise(() => {}));
    renderPage();
    expect(screen.getAllByRole("status").some((s) => s.textContent === "Loading setup checklist setting")).toBe(true);
    expect(screen.getByRole("button", { name: /hide checklist/i })).toHaveProperty("disabled", true);
  });

  it("says the checklist setting didn't load, with Try again, and holds the button", async () => {
    vi.mocked(getOwnerSetupChecklistProgress).mockRejectedValueOnce(new Error("checklist service down"));
    renderPage();
    const line = await screen.findByText("This setting didn't load. Nothing was changed.");
    expect(screen.queryByText("Setup checklist visibility could not be saved.")).toBeNull();
    expect(screen.queryByText("Visible on Workspace")).toBeNull();
    expect(screen.queryByText("checklist service down")).toBeNull();
    expect(screen.getByRole("button", { name: /hide checklist/i })).toHaveProperty("disabled", true);
    fireEvent.click(within(line.closest(".load-refresh") as HTMLElement).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Visible on Workspace")).toBeTruthy();
  });

  it("hides the Workspace setup checklist from General settings", async () => {
    renderPage();

    expect(await screen.findByText("Visible on Workspace")).toBeTruthy();
    const hideButton = screen.getByRole("button", { name: /hide checklist/i });
    await waitFor(() => expect(hideButton).toHaveProperty("disabled", false));
    fireEvent.click(hideButton);

    await waitFor(() =>
      expect(setOwnerSetupChecklistClosed).toHaveBeenCalledWith(
        workspaceId,
        true,
      ),
    );
  });

  it("reopens a hidden Workspace setup checklist from General settings", async () => {
    vi.mocked(getOwnerSetupChecklistProgress).mockResolvedValue({
      workspace_id: workspaceId,
      user_id: userId,
      completed_item_ids: ["app_tour"],
      closed_at: "2026-09-05T12:00:00.000Z",
    });
    renderPage();

    expect(await screen.findByText("Hidden from Workspace")).toBeTruthy();
    const showButton = screen.getByRole("button", { name: /show checklist/i });
    await waitFor(() => expect(showButton).toHaveProperty("disabled", false));
    fireEvent.click(showButton);

    await waitFor(() =>
      expect(setOwnerSetupChecklistClosed).toHaveBeenCalledWith(
        workspaceId,
        false,
      ),
    );
  });
});
