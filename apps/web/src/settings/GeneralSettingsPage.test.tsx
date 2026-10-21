import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { usLettersMessage } from "@newfork/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    access: { employee: false, management: "owner" },
    status: "active",
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

vi.mock("./organization-data", () => ({
  saveScheduleLogo: vi.fn(),
  updateOrganizationName: vi.fn(),
}));

describe("GeneralSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveScheduleLogo).mockResolvedValue(context.workspace);
    vi.mocked(updateOrganizationName).mockResolvedValue(undefined);
  });

  function renderPage() {
    return render(<GeneralSettingsPage />);
  }

  // KARARLAR S-131 (Mert, 2026-10-17): every preferred name waits for who may decide it, so General has no
  // setting that lets one through.
  it("has no preferred-name setting: every preferred name waits for who may decide it", async () => {
    renderPage();
    expect(await screen.findByLabelText("Workspace name")).toBeTruthy();
    expect(screen.queryByText("Preferred names")).toBeNull();
    expect(screen.queryByRole("button", { name: /answer them here|let them through/i })).toBeNull();
  });

  // Mert 2026-10-21: the owner setup checklist is gone, and with it its setting.
  it("has no Setup checklist setting and no button to hide or show it", async () => {
    renderPage();
    expect(await screen.findByLabelText("Workspace name")).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("Setup checklist")).toBeNull();
    expect(screen.queryByRole("button", { name: /hide checklist|show checklist/i })).toBeNull();
    expect(screen.queryByText(/Visible on Workspace|Hidden from Workspace/)).toBeNull();
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
});
