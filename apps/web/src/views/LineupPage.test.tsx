import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  ScheduleLineupReadModel,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { LineupPage } from "./LineupPage";
import {
  getLineup,
  moveLineupEntry,
  previewLineupShare,
} from "../schedule/lineup-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const mainLocationId = "11000000-0000-4000-8000-000000000001";
const patioLocationId = "11000000-0000-4000-8000-000000000002";
const sectionId = "96000000-0000-4000-8000-000000000001";
const sourceShiftId = "98000000-0000-4000-8000-000000000001";

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
    "schedule.read",
    "schedule.lineup.read",
    "schedule.lineup.manage",
    "schedule.lineup.share",
  ],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const fixture = {
  workspace_id: workspaceId,
  date: "2026-08-17",
  source: "published",
  locations: [
    {
      id: mainLocationId,
      name: "Main Dining",
      timezone: "America/Los_Angeles",
      lineup_id: null,
      revision: null,
      shared_at: null,
      share_version: 0,
      entries: [
        {
          id: sourceShiftId,
          overlay_id: null,
          source_shift_id: sourceShiftId,
          is_manual: false,
          orphaned: false,
          employee_id: "15000000-0000-4000-8000-000000000001",
          employee_name: "Alex Kim",
          job_id: "33000000-0000-4000-8000-000000000001",
          job_name: "Server",
          shift_type_id: "55000000-0000-4000-8000-000000000001",
          shift_type_name: "Dinner",
          start_time: "17:00",
          end_time: "22:00",
          section_id: null,
          section_name: "",
          station: "",
          call_off: false,
          hidden: false,
          display_order: 0,
          revision: null,
        },
      ],
      briefs: [
        {
          shift_type_id: "55000000-0000-4000-8000-000000000001",
          out_of_stock: "86 salmon",
          specials: "Lamb ragu",
          pre_shift_notes: "Push patio covers.",
          revision: 1,
        },
      ],
      summary: { active_entries: 1, open_rows: 0, called_off: 0 },
    },
    {
      id: patioLocationId,
      name: "Patio",
      timezone: "America/Los_Angeles",
      lineup_id: "97000000-0000-4000-8000-000000000002",
      revision: 1,
      shared_at: null,
      share_version: 0,
      entries: [
        {
          id: "99000000-0000-4000-8000-000000000001",
          overlay_id: "99000000-0000-4000-8000-000000000001",
          source_shift_id: null,
          is_manual: true,
          orphaned: false,
          employee_id: "15000000-0000-4000-8000-000000000002",
          employee_name: "Jordan Lee",
          job_id: "33000000-0000-4000-8000-000000000002",
          job_name: "Bartender",
          shift_type_id: "55000000-0000-4000-8000-000000000001",
          shift_type_name: "Dinner",
          start_time: "18:00",
          end_time: "23:00",
          section_id: sectionId,
          section_name: "Expo",
          station: "P1",
          call_off: false,
          hidden: false,
          display_order: 4,
          revision: 1,
        },
      ],
      briefs: [],
      summary: { active_entries: 1, open_rows: 0, called_off: 0 },
    },
  ],
  sections: [
    {
      id: sectionId,
      workspace_id: workspaceId,
      name: "Expo",
      color: "#336699",
      sort_order: 10,
      revision: 1,
    },
  ],
  jobs: [
    {
      id: "33000000-0000-4000-8000-000000000001",
      name: "Server",
      color: "#4f8f78",
      sort_order: 0,
      department_id: null,
    },
    {
      id: "33000000-0000-4000-8000-000000000002",
      name: "Bartender",
      color: "#8f6a4f",
      sort_order: 1,
      department_id: null,
    },
  ],
  shift_types: [
    {
      id: "55000000-0000-4000-8000-000000000001",
      name: "Dinner",
      color: "#4f8f78",
      sort_order: 0,
      default_start_time: "17:00",
      default_end_time: "22:00",
    },
  ],
  employees: [],
} satisfies ScheduleLineupReadModel;

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context }),
}));

vi.mock("../schedule/lineup-data", () => ({
  archiveLineupSection: vi.fn(),
  deleteLineupEntry: vi.fn(),
  getLineup: vi.fn(),
  moveLineupEntry: vi.fn().mockResolvedValue({
    status: "saved",
    lineup_id: "97000000-0000-4000-8000-000000000002",
    lineup_revision: 2,
    entry_id: "99000000-0000-4000-8000-000000000002",
    entry_revision: 1,
  }),
  previewLineupShare: vi.fn(),
  saveLineupBrief: vi.fn(),
  saveLineupEntry: vi.fn(),
  saveLineupSection: vi.fn(),
  shareLineup: vi.fn(),
}));

function renderPage() {
  vi.mocked(getLineup).mockResolvedValue(fixture);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/schedule/lineup?date=2026-08-17"]}>
        <LineupPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LineupPage", () => {
  it("moves published source rows through the active Line-up move endpoint", async () => {
    const { container } = renderPage();
    const sourceRow = (await screen.findByText("Alex Kim")).closest(
      ".lineup-row",
    );
    const targetRow = screen.getByText("Jordan Lee").closest(".lineup-row");
    expect(sourceRow).toBeTruthy();
    expect(targetRow).toBeTruthy();

    const data = new Map<string, string>();
    const dataTransfer = {
      getData: vi.fn((type: string) => data.get(type) ?? ""),
      setData: vi.fn((type: string, value: string) => data.set(type, value)),
    };

    fireEvent.dragStart(sourceRow!, { dataTransfer });
    fireEvent.dragOver(targetRow!, { dataTransfer });
    fireEvent.drop(targetRow!, { dataTransfer });

    await waitFor(() =>
      expect(moveLineupEntry).toHaveBeenCalledWith(workspaceId, {
        source_entry_id: sourceShiftId,
        target_location_id: patioLocationId,
        target_date: "2026-08-17",
        target_section_id: sectionId,
        display_order: 4,
      }),
    );
    expect(container.querySelector(".lineup-error")).toBeNull();
  });

  it("previews and copies reference-style Line-up share text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(previewLineupShare).mockResolvedValue({
      status: "share_ready",
      workspace_id: workspaceId,
      date: "2026-08-17",
      fingerprint: "b".repeat(64),
      locations: [
        {
          location_id: mainLocationId,
          location_name: "Main Dining",
          current_version: 0,
          entry_count: 1,
          added: 1,
          updated: 0,
          removed: 0,
        },
      ],
    });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    const textarea = (await screen.findByLabelText(
      "Share text",
    )) as HTMLTextAreaElement;
    expect(textarea.value).toContain("Main Dining - 08/17/2026 Monday");
    expect(textarea.value).toContain("86: 86 salmon");
    expect(textarea.value).toContain("5:00 PM Alex Kim");
    expect(
      screen.getByRole("button", { name: "Copy Line-up image" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Share Line-up image" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Download Line-up PNG" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Download Line-up PDF" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy share text" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("Specials: Lamb ragu"),
      ),
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "Share text copied.",
    );
  });
});
