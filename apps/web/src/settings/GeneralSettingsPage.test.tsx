import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOwnerSetupChecklistProgress,
  setOwnerSetupChecklistClosed,
} from "../communications/communications-data";
import GeneralSettingsPage from "./GeneralSettingsPage";
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
    return render(
      <QueryClientProvider client={client}>
        <GeneralSettingsPage />
      </QueryClientProvider>,
    );
  }

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
