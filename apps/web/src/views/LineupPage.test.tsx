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
  getLineupOperations,
  getLineupDestinations,
  getLineupCandidates,
  previewLineupOperation,
  applyLineupOperation,
  remindLineupRecipients,
  saveLineupEntry,
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
  settings: { time_format: "12h" },
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
  saveLineupEntry: vi.fn().mockResolvedValue({
    status: "saved",
    lineup_id: "97000000-0000-4000-8000-000000000002",
    lineup_revision: 2,
    entry_id: "99000000-0000-4000-8000-000000000002",
    entry_revision: 1,
  }),
  getLineupOperations: vi.fn().mockResolvedValue({
    notes: [],
    receipts: [],
    events: [],
    unpublished_changes: false,
  }),
  getLineupProposals: vi.fn().mockResolvedValue([]),
  getLineupDestinations: vi.fn().mockResolvedValue([]),
  submitLineupProposal: vi.fn(),
  getLineupCandidates: vi.fn().mockResolvedValue([]),
  previewLineupOperation: vi.fn(),
  applyLineupOperation: vi.fn(),
  remindLineupRecipients: vi.fn().mockResolvedValue({ sent: 1 }),
  saveLineupNote: vi.fn(),
  saveLineupSection: vi.fn(),
  shareLineup: vi.fn(),
}));

function renderPage(
  model: ScheduleLineupReadModel = fixture,
  initialLocation?: string,
) {
  vi.mocked(getLineup).mockResolvedValue(model);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[
          `/app/schedule/lineup?date=2026-08-17${initialLocation ? `&location=${initialLocation}` : ""}`,
        ]}
      >
        <LineupPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value: function () {
    this.setAttribute("open", "");
  },
});
Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value: function () {
    this.removeAttribute("open");
  },
});

describe("LineupPage", () => {
  it("does not render the old horizontal Schedule section links", async () => {
    renderPage();

    await screen.findByRole("heading", { name: /Line Up/ });

    expect(
      screen.queryByRole("navigation", { name: "Schedule sections" }),
    ).toBeNull();
  });

  it("opens the location specified by a staffing notification", async () => {
    renderPage(fixture, patioLocationId);
    const select = await screen.findByRole("combobox", { name: "Location" });
    expect((select as HTMLSelectElement).value).toBe(patioLocationId);
    expect(screen.queryByText("Alex Kim")).toBeNull();
  });
  it("reminds the pending recipients of the currently reviewed shared version", async () => {
    vi.mocked(getLineupOperations).mockResolvedValueOnce({
      notes: [],
      events: [],
      unpublished_changes: false,
      receipts: [
        {
          employee_id: sourceShiftId,
          employee_name: "Alex Kim",
          snapshot_id: sectionId,
          version: 2,
          viewed_at: null,
          acknowledged_at: null,
        },
      ],
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: /Awaiting read/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remind those awaiting read" }),
    );
    await screen.findByText(
      "1 reminder sent to team members still awaiting acknowledgement.",
    );
    expect(remindLineupRecipients).toHaveBeenCalledWith(
      workspaceId,
      "2026-08-17",
      mainLocationId,
      sectionId,
    );
  });
  it("previews assignment removal and keeps its coverage open before confirming", async () => {
    vi.mocked(previewLineupOperation).mockResolvedValueOnce({
      allowed: true,
      requires_approval: false,
      fingerprint: "c".repeat(64),
      effects: [
        "The same position remains open; earlier and later work stays assigned.",
      ],
      blockers: [],
    });
    vi.mocked(applyLineupOperation).mockResolvedValueOnce({
      status: "applied",
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Manage Alex Kim" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove assignment · keep need open",
      }),
    );
    await screen.findByRole("heading", {
      name: "Remove assignment · keep need open",
    });
    expect(
      (screen.getByLabelText("Position") as HTMLSelectElement).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason for change"), {
      target: { value: "Employee is leaving early" },
    });
    fireEvent.change(screen.getByLabelText("Starts"), {
      target: { value: "19:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review impact" }));
    await screen.findByText(
      "The same position remains open; earlier and later work stays assigned.",
    );
    expect(previewLineupOperation).toHaveBeenLastCalledWith(
      workspaceId,
      expect.objectContaining({
        kind: "release",
        employee_id: null,
        source_entry_id: sourceShiftId,
        target: expect.objectContaining({
          location_id: mainLocationId,
          start_time: "19:00",
        }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    await waitFor(() =>
      expect(applyLineupOperation).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ kind: "release" }),
        "c".repeat(64),
        expect.any(String),
      ),
    );
  });
  it("reviews a movable candidate as an explicit source-to-target replacement", async () => {
    const movingSourceId = "99000000-0000-4000-8000-000000000099";
    const movingEmployeeId = "15000000-0000-4000-8000-000000000099";
    vi.mocked(getLineupCandidates).mockResolvedValueOnce([
      {
        employee_id: movingEmployeeId,
        display_name: "Taylor Mover",
        status: "movable",
        reasons: ["Moving creates one source gap"],
        available_start: null,
        available_end: null,
        move_source: {
          entry_id: movingSourceId,
          location_id: patioLocationId,
          location_name: "Patio",
          date: "2026-08-17",
          timezone: "America/Los_Angeles",
          job_name: "Server",
          start_time: "17:00",
          end_time: "22:00",
        },
      },
    ]);
    vi.mocked(previewLineupOperation).mockResolvedValueOnce({
      fingerprint: "b".repeat(64),
      allowed: true,
      requires_approval: false,
      effects: ["Replaces Alex and opens a Patio need"],
      blockers: [],
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Manage Alex Kim" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Replacement" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Taylor Mover.*Review move impact/,
      }),
    );
    expect(
      screen.getByLabelText("Required travel time (minutes)"),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reason for change"), {
      target: { value: "Cover from Patio" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review impact" }));
    await waitFor(() =>
      expect(previewLineupOperation).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          kind: "move",
          source_entry_id: movingSourceId,
          target_entry_id: sourceShiftId,
          employee_id: movingEmployeeId,
          replace_target: true,
        }),
      ),
    );
    await screen.findByText("Replaces Alex and opens a Patio need");
    expect(
      screen.queryByRole("button", {
        name: "Send offer for employee response",
      }),
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Review the change" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit choices" }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Review impact" }),
    );
  });
  it("previews a transfer using the chosen destination local date", async () => {
    vi.mocked(getLineupDestinations).mockResolvedValueOnce(
      fixture.locations.map(({ id, name, timezone }) => ({
        id,
        name,
        timezone,
      })),
    );
    vi.mocked(previewLineupOperation).mockResolvedValueOnce({
      fingerprint: "a".repeat(64),
      allowed: true,
      requires_approval: false,
      effects: ["Destination local day verified"],
      blockers: [],
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Manage Alex Kim" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Move location" }));
    await waitFor(() =>
      expect(
        screen.getByLabelText("Destination location").querySelectorAll("option")
          .length,
      ).toBe(2),
    );
    fireEvent.change(screen.getByLabelText("Destination location"), {
      target: { value: patioLocationId },
    });
    fireEvent.change(screen.getByLabelText(/Assignment date/), {
      target: { value: "2026-08-18" },
    });
    fireEvent.change(screen.getByLabelText("Reason for change"), {
      target: { value: "Cover the next local day" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review impact" }));
    await waitFor(() =>
      expect(previewLineupOperation).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          source_entry_id: sourceShiftId,
          target: expect.objectContaining({
            date: "2026-08-18",
            location_id: patioLocationId,
          }),
        }),
      ),
    );
    expect(
      await screen.findByText("Destination local day verified"),
    ).toBeTruthy();
  });
  it("preserves the board but removes changes during a location rollout pause", async () => {
    vi.mocked(getLineupOperations).mockResolvedValueOnce({
      notes: [],
      receipts: [],
      events: [],
      unpublished_changes: false,
      read_only: true,
    });
    renderPage();
    await screen.findByText(/Line Up is read-only at this location/);
    expect(screen.getByText("Alex Kim")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add staff" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Share Line Up" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Manage Alex Kim" }),
    ).toBeNull();
  });
  it("uses the schedule 24-hour setting in Line-up rows", async () => {
    renderPage({ ...fixture, settings: { time_format: "24h" } });

    expect(await screen.findByText("17:00–22:00")).toBeTruthy();
    expect(screen.queryByText("5p–10p")).toBeNull();
  });

  it("saves section placement for a source row without an overlay", async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Manage Alex Kim" }),
    );
    fireEvent.change(screen.getByLabelText("Section", { exact: true }), {
      target: { value: sectionId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save assignment" }));
    await waitFor(() =>
      expect(saveLineupEntry).toHaveBeenCalledWith(
        workspaceId,
        mainLocationId,
        "2026-08-17",
        expect.objectContaining({
          source_shift_id: sourceShiftId,
          section_id: sectionId,
          employee_id: fixture.locations[0]!.entries[0]!.employee_id,
        }),
        null,
        null,
      ),
    );
  });

  it("preserves search and position when changing board view", async () => {
    renderPage();
    await screen.findByText("Alex Kim");
    fireEvent.change(screen.getByRole("textbox", { name: "Search team" }), {
      target: { value: "Nobody" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Staff list" }));
    expect(screen.queryByText("Alex Kim")).toBeNull();
    expect(
      screen.getByText("No assignments match these filters."),
    ).toBeTruthy();
  });

  it("starts an extra line without choosing an arbitrary position or service", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Extra line" }));
    expect(
      (screen.getByLabelText("Position", { exact: true }) as HTMLSelectElement)
        .value,
    ).toBe("");
    expect(
      (
        screen.getByRole("combobox", {
          name: "Service",
        }) as HTMLSelectElement
      ).value,
    ).toBe("");
    expect(
      (
        screen.getByRole("button", {
          name: "Create extra line",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Position", { exact: true }), {
      target: { value: fixture.jobs[0]!.id },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Service" }), {
      target: { value: fixture.shift_types[0]!.id },
    });
    fireEvent.change(screen.getByLabelText("Starts"), {
      target: { value: "18:00" },
    });
    fireEvent.change(screen.getByLabelText("Ends"), {
      target: { value: "20:00" },
    });
    fireEvent.change(screen.getByLabelText("Assignment note (optional)"), {
      target: { value: "Cover the private dining entrance" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create extra line" }));
    await waitFor(() =>
      expect(saveLineupEntry).toHaveBeenLastCalledWith(
        workspaceId,
        mainLocationId,
        "2026-08-17",
        expect.objectContaining({
          employee_id: null,
          note: "Cover the private dining entrance",
        }),
        null,
        null,
      ),
    );
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Share Line Up" }),
    );
    const textarea = (await screen.findByLabelText(
      "Share text",
    )) as HTMLTextAreaElement;
    expect(textarea.value).toContain("Main Dining - 08/17/2026 Monday");
    expect(textarea.value).toContain("86: 86 salmon");
    expect(textarea.value).toContain("5:00 PM–10:00 PM Alex Kim");
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
