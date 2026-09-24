import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext, ShiftLabel } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import ShiftLabelsSettingsPage from "./ShiftLabelsSettingsPage";
import { MemoryRouter } from "react-router";
import {
  listShiftLabels,
  reorderShiftLabels,
  saveShiftLabel,
  setShiftLabelArchived,
} from "./organization-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

const context = {
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
    "settings.shift_catalog.read",
    "settings.shift_catalog.manage",
  ],
  actions: [],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const labels = [
  {
    id: "43000000-0000-4000-8000-000000000001",
    workspace_id: workspaceId,
    name: "Training",
    color: "#54736A",
    sort_order: 0,
    archived_at: null,
  },
  {
    id: "43000000-0000-4000-8000-000000000002",
    workspace_id: workspaceId,
    name: "Close",
    color: "#7B5EA7",
    sort_order: 1,
    archived_at: null,
  },
] satisfies ShiftLabel[];

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("./organization-data", () => ({
  listShiftLabels: vi.fn(),
  reorderShiftLabels: vi.fn(),
  saveShiftLabel: vi.fn(),
  setShiftLabelArchived: vi.fn(),
}));

function renderPage() {
  vi.mocked(listShiftLabels).mockResolvedValue(labels);
  vi.mocked(reorderShiftLabels).mockResolvedValue(undefined);
  vi.mocked(saveShiftLabel).mockResolvedValue(undefined);
  vi.mocked(setShiftLabelArchived).mockResolvedValue(undefined);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ShiftLabelsSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ShiftLabelsSettingsPage", () => {
  it("lists, creates, reorders, and archives shift labels", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Shift labels" }),
    ).toBeTruthy();
    expect(await screen.findByText("Training")).toBeTruthy();
    expect(screen.getByText("Close")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add shift label" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Expo" },
    });
    fireEvent.change(screen.getByLabelText("Color"), {
      target: { value: "#2563eb" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save shift label" }));
    await waitFor(() =>
      expect(saveShiftLabel).toHaveBeenCalledWith(
        workspaceId,
        { name: "Expo", color: "#2563eb" },
        undefined,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Actions for Close" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Move Close up" }),
    );
    await waitFor(() =>
      expect(reorderShiftLabels).toHaveBeenCalledWith(workspaceId, [
        labels[1]!.id,
        labels[0]!.id,
      ]),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Training" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive Training" }));
    await waitFor(() =>
      expect(setShiftLabelArchived).toHaveBeenCalledWith(
        workspaceId,
        labels[0]!.id,
        true,
      ),
    );
  });
});
