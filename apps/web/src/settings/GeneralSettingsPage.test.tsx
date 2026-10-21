import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { usLettersMessage } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GeneralSettingsPage from "./GeneralSettingsPage";
import { saveScheduleLogo, updateOrganizationName } from "./organization-data";
import { loadOnboardingApproval, saveOnboardingApproval } from "./onboarding-approval-data";

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

// The actions the core lists for the person: the owner's settings.organization.write unless a test says otherwise.
const auth = vi.hoisted(() => ({ actions: ["settings.organization.write"] as string[] }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: { ...context, actions: auth.actions }, refresh: vi.fn() }),
}));

const toast = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("@newfork/ui", async (original) => ({
  ...(await original<object>()),
  useToast: () => toast,
}));

vi.mock("./onboarding-approval-data", () => ({
  onboardingApprovalKey: (workspaceId: string) => ["onboarding-approval", workspaceId],
  loadOnboardingApproval: vi.fn(),
  saveOnboardingApproval: vi.fn(),
}));

vi.mock("./organization-data", () => ({
  saveScheduleLogo: vi.fn(),
  updateOrganizationName: vi.fn(),
}));

describe("GeneralSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.actions = ["settings.organization.write"];
    vi.mocked(loadOnboardingApproval).mockResolvedValue({ final_approval_required: true });
    vi.mocked(saveScheduleLogo).mockResolvedValue(context.workspace);
    vi.mocked(updateOrganizationName).mockResolvedValue(undefined);
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

  // KATILIM-ONAY (KARARLAR S-231, Mert 2026-10-21): one switch, on by default; the owner and admins change it.
  describe("New people wait for approval", () => {
    const onText =
      "New people finish their required details and documents first. A manager then approves them, and their schedule opens.";
    const offText = "New people start as soon as they finish their required details and documents.";

    it("shows the switch on, with what on means", async () => {
      renderPage();
      const toggle = await screen.findByRole("switch", { name: "New people wait for approval" });
      await waitFor(() => expect(toggle).toHaveProperty("checked", true));
      expect(document.getElementById(toggle.getAttribute("aria-describedby") ?? "")?.textContent).toBe(onText);
      expect(toggle).toHaveProperty("disabled", false);
    });

    it("shows it off, with what off means", async () => {
      vi.mocked(loadOnboardingApproval).mockResolvedValue({ final_approval_required: false });
      renderPage();
      expect(await screen.findByText(offText)).toBeTruthy();
      expect(screen.getByRole("switch", { name: "New people wait for approval" })).toHaveProperty("checked", false);
    });

    it("turns it off and says what changed", async () => {
      vi.mocked(saveOnboardingApproval).mockResolvedValue({ final_approval_required: false });
      renderPage();
      const toggle = await screen.findByRole("switch", { name: "New people wait for approval" });
      await waitFor(() => expect(toggle).toHaveProperty("checked", true));
      fireEvent.click(toggle);
      await waitFor(() => expect(saveOnboardingApproval).toHaveBeenCalledWith(workspaceId, false));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("New people now start when they finish onboarding."));
      expect(await screen.findByText(offText)).toBeTruthy();
      expect(toggle).toHaveProperty("checked", false);
    });

    it("turns it on and says what changed", async () => {
      vi.mocked(loadOnboardingApproval).mockResolvedValue({ final_approval_required: false });
      vi.mocked(saveOnboardingApproval).mockResolvedValue({ final_approval_required: true });
      renderPage();
      const toggle = await screen.findByRole("switch", { name: "New people wait for approval" });
      await waitFor(() => expect(toggle).toHaveProperty("checked", false));
      fireEvent.click(toggle);
      await waitFor(() => expect(saveOnboardingApproval).toHaveBeenCalledWith(workspaceId, true));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("New people now wait for approval."));
      expect(await screen.findByText(onText)).toBeTruthy();
    });

    it("keeps the setting and says so when the change fails", async () => {
      vi.mocked(saveOnboardingApproval).mockRejectedValue(new Error("database down"));
      renderPage();
      const toggle = await screen.findByRole("switch", { name: "New people wait for approval" });
      await waitFor(() => expect(toggle).toHaveProperty("checked", true));
      fireEvent.click(toggle);
      expect(await screen.findByText("The approval setting could not be saved.")).toBeTruthy();
      expect(toggle).toHaveProperty("checked", true);
      expect(screen.getByText(onText)).toBeTruthy();
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.queryByText(/database down/)).toBeNull();
    });

    it("shows it to somebody who may not change it, without letting them", async () => {
      auth.actions = [];
      renderPage();
      const toggle = await screen.findByRole("switch", { name: "New people wait for approval" });
      await waitFor(() => expect(toggle).toHaveProperty("checked", true));
      expect(toggle).toHaveProperty("disabled", true);
      fireEvent.click(toggle);
      expect(saveOnboardingApproval).not.toHaveBeenCalled();
    });

    it("says the setting didn't load and holds the switch", async () => {
      vi.mocked(loadOnboardingApproval).mockRejectedValue(new Error("approval service down"));
      renderPage();
      expect(await screen.findByText("This setting didn't load. Nothing was changed.")).toBeTruthy();
      expect(screen.getByRole("switch", { name: "New people wait for approval" })).toHaveProperty("disabled", true);
      expect(screen.queryByText(/service down/)).toBeNull();
    });
  });
});
