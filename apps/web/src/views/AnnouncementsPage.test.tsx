import type {
  ActiveWorkspaceContext,
  AnnouncementDetail,
  AnnouncementList,
  AnnouncementPreview,
  AnnouncementImpactShift,
  AnnouncementProblem,
  AnnouncementRecord,
} from "@newfork/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { record } from "../communications/announcement-fixtures.test-util";
import {
  acknowledgeAnnouncement,
  getAnnouncement,
  getAnnouncements,
  getImportantDates,
  previewAnnouncement,
  saveAnnouncement,
  setAnnouncementState,
} from "../communications/communications-data";
import { RequestError } from "../lib/request-error";
import { AnnouncementsPage } from "./AnnouncementsPage";
import { ImportantDatesPage } from "./ImportantDatesPage";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const downtown = "11000000-0000-4000-8000-000000000001";
const harbor = "11000000-0000-4000-8000-000000000002";
const context = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: { id: workspaceId, name: "Harbor & Vine" },
  membership: { role: "owner", status: "active", allLocations: true },
  permissions: ["workspace.read", "announcements.read", "announcements.manage"],
  actions: [],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: false, locationIds: [downtown] },
} as unknown as ActiveWorkspaceContext;

const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@newfork/ui", async (original) => ({
  ...(await original<typeof import("@newfork/ui")>()),
  useToast: () => toast,
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("../communications/communications-data", () => ({
  getAnnouncements: vi.fn(),
  getAnnouncement: vi.fn(),
  getImportantDates: vi.fn(),
  previewAnnouncement: vi.fn(),
  saveAnnouncement: vi.fn(),
  setAnnouncementState: vi.fn(),
  acknowledgeAnnouncement: vi.fn().mockResolvedValue({ status: "saved" }),
}));

function list(override: Partial<AnnouncementList> = {}): AnnouncementList {
  return {
    workspace_id: workspaceId,
    can_manage: true,
    can_write_dates: true,
    can_read_dates: true,
    time_format: "12h",
    locations: [
      {
        id: downtown,
        name: "Downtown",
        short_name: "Downtown",
        timezone: "America/Los_Angeles",
        can_change_hours: true,
        people_count: 4,
      },
    ],
    people: [],
    departments: [],
    jobs: [],
    announcements: [],
    ...override,
  };
}

function preview(override: Partial<AnnouncementPreview> = {}): AnnouncementPreview {
  return {
    problems: [],
    fingerprint: "fp-1",
    shifts: [],
    hidden_count: 0,
    quiet_count: 0,
    counts: { removed: 0, edited: 0, opened: 0, kept: 0, quiet: 0 },
    bring_back: [],
    time_zone: "America/Los_Angeles",
    starts_at: null,
    ends_at: null,
    recipient_count: 4,
    ...override,
  };
}

const titleMissing: AnnouncementProblem = {
  tab: "details",
  field: "title",
  code: "title_required",
  message: "Add a title.",
  required: true,
};

function detail(override: Partial<AnnouncementDetail> & Pick<AnnouncementRecord, "id">): AnnouncementDetail {
  return { ...record(override), people: [], history: [], changes: [], ...override };
}

function renderAt(path: string, page: React.ReactNode, routePaths: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          {routePaths.map((routePath) => (
            <Route key={routePath} path={routePath} element={page} />
          ))}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const renderList = (path = "/app/announcements") =>
  renderAt(path, <AnnouncementsPage />, ["/app/announcements", "/app/announcements/:announcementId"]);

const rowTitles = (table: HTMLElement) =>
  within(table)
    .queryAllByRole("row")
    .slice(1)
    .map((row) => row.querySelector(".job-row-name")?.firstChild?.textContent ?? "");

beforeEach(() => {
  vi.mocked(getAnnouncement).mockReset();
  vi.mocked(previewAnnouncement).mockReset();
  vi.mocked(saveAnnouncement).mockReset();
  vi.mocked(setAnnouncementState).mockReset();
  toast.success.mockReset();
});

describe("Announcements list (EKRAN-08)", () => {
  const posts = [
    record({ id: "a8200000-0000-4000-8000-000000000001", title: "Patio menu" }),
    record({
      id: "a8200000-0000-4000-8000-000000000002",
      title: "Wine night",
      status: "scheduled",
      display_status: "scheduled",
      publish_at: "2026-11-01T17:00:00.000Z",
    }),
    record({
      id: "a8200000-0000-4000-8000-000000000003",
      title: "Fire drill",
      status: "published",
      display_status: "published",
      published_at: "2026-10-05T16:00:00.000Z",
    }),
    record({
      id: "a8200000-0000-4000-8000-000000000004",
      title: "Summer hours",
      status: "published",
      display_status: "past",
      published_at: "2026-06-01T16:00:00.000Z",
    }),
    record({
      id: "a8200000-0000-4000-8000-000000000005",
      title: "Old memo",
      display_status: "archived",
      archived_at: "2026-09-01T16:00:00.000Z",
    }),
  ];

  it("shows Status, Announcement and Published on, with Active over Past and Archived on its own tab", async () => {
    vi.mocked(getAnnouncements).mockResolvedValue(list({ announcements: posts }));
    renderList();
    const active = await screen.findByRole("table", { name: "Active announcements" });
    const past = screen.getByRole("table", { name: "Past announcements" });
    expect(within(active).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Status",
      "Announcement",
      "Published on",
    ]);
    // Newest first; a draft's empty date stays at the bottom.
    expect(rowTitles(active)).toEqual(["Wine night", "Fire drill", "Patio menu"]);
    expect(rowTitles(past)).toEqual(["Summer hours"]);
    expect(screen.getByRole("heading", { name: "Past 1" })).toBeTruthy();
    expect(screen.queryByText("Old memo")).toBeNull();
    expect(screen.getByRole("tab", { name: "Draft (1)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Scheduled (1)" })).toBeTruthy();
    const wine = within(active).getAllByRole("row")[1]!;
    expect(within(wine).getByText("Scheduled").getAttribute("data-tone")).toBe("blue");
    expect(wine.querySelector("[data-planned]")?.getAttribute("title")).toBe("Publishes Sun, Nov 1, 9:00 AM");
    expect(within(active).getByLabelText("Not published").textContent).toBe("—");
    expect(screen.queryByText("Upcoming")).toBeNull();
    expect(screen.queryByText("Newest first")).toBeNull();

    fireEvent.click(within(active).getByRole("button", { name: "Announcement" }));
    expect(rowTitles(screen.getByRole("table", { name: "Active announcements" }))).toEqual([
      "Fire drill",
      "Patio menu",
      "Wine night",
    ]);
    fireEvent.click(within(active).getByRole("button", { name: "Announcement" }));
    expect(rowTitles(screen.getByRole("table", { name: "Active announcements" }))).toEqual([
      "Wine night",
      "Patio menu",
      "Fire drill",
    ]);

    fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
    const archived = screen.getByRole("table", { name: "Archived announcements" });
    expect(rowTitles(archived)).toEqual(["Old memo"]);
    expect(screen.queryByRole("table", { name: "Past announcements" })).toBeNull();
  });

  it("filters by location and by words", async () => {
    vi.mocked(getAnnouncements).mockResolvedValue(
      list({
        locations: [
          ...list().locations,
          { id: harbor, name: "Harbor", short_name: "Harbor", timezone: "America/Los_Angeles", can_change_hours: true, people_count: 3 },
        ],
        announcements: [
          record({ id: "a8200000-0000-4000-8000-000000000011", title: "Downtown update", locations: [loc(downtown, "Downtown")] }),
          record({ id: "a8200000-0000-4000-8000-000000000012", title: "Harbor update", locations: [loc(harbor, "Harbor")] }),
        ],
      }),
    );
    renderList();
    expect(await screen.findByText("Downtown update")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter announcements by location"), { target: { value: harbor } });
    expect(screen.queryByText("Downtown update")).toBeNull();
    expect(screen.getByText("Harbor update")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search announcements"), { target: { value: "nothing" } });
    expect(screen.queryByText("Harbor update")).toBeNull();
  });

  it("shows the no-access card when the API refuses", async () => {
    vi.mocked(getAnnouncements).mockRejectedValue(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderList();
    expect(await screen.findByRole("heading", { name: "You don't have access to announcements" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});

describe("Announcement drawer (EKRAN-08)", () => {
  it("walks a new post with Next, shows a missing title at its field, and asks before removing shifts", async () => {
    vi.mocked(getAnnouncements).mockResolvedValue(list());
    vi.mocked(previewAnnouncement).mockImplementation(async (_ws, input) =>
      input.announcement.title.trim()
        ? preview({ counts: { removed: 2, edited: 0, opened: 0, kept: 4, quiet: 0 } })
        : preview({ problems: [titleMissing] }),
    );
    vi.mocked(saveAnnouncement).mockResolvedValue({
      status: "published",
      display_status: "published",
      announcement_id: "a8200000-0000-4000-8000-000000000021",
      revision: 1,
      recipient_count: 4,
      shift_changes: 2,
      brought_back: 0,
    });
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "New" }));
    const drawer = screen.getByRole("dialog", { name: "New announcement" });
    expect(within(drawer).getByRole("tab", { name: "Details" }).getAttribute("aria-selected")).toBe("true");
    // Shifts waits for a shift to reach; History for a publish.
    await waitFor(() =>
      expect(within(drawer).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Details", "Audience 4"]),
    );
    // The locations sit on Details: the one this person writes for starts checked.
    expect((within(drawer).getByRole("checkbox", { name: "Downtown" }) as HTMLInputElement).checked).toBe(true);
    // Nothing is red before a try.
    expect(within(drawer).queryByText("Add a title.")).toBeNull();

    fireEvent.click(within(drawer).getByRole("button", { name: "Next" }));
    expect(await within(drawer).findByText("Add a title.")).toBeTruthy();
    expect(within(drawer).getByRole("tab", { name: /Details/ }).getAttribute("aria-selected")).toBe("true");

    fireEvent.change(within(drawer).getByLabelText("Title"), { target: { value: " Patio closes early " } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(within(drawer).getByRole("tab", { name: /Audience/ }).getAttribute("aria-selected")).toBe("true"),
    );
    // Six shifts reached, two removed: a yellow count and the band over the buttons.
    const shiftsTab = await within(drawer).findByRole("tab", { name: "Shifts 6" });
    expect(shiftsTab.querySelector(".ad-badge")?.getAttribute("data-tone")).toBe("warn");
    const band = drawer.querySelector(".ad-band") as HTMLElement;
    expect(band.getAttribute("data-tone")).toBe("warn");
    expect(band.textContent).toBe("2 shifts will be removed · 4 kept" + "Review shifts");
    fireEvent.click(within(drawer).getByRole("button", { name: "Next" }));
    await waitFor(() => expect(shiftsTab.getAttribute("aria-selected")).toBe("true"));
    expect(within(drawer).queryByRole("button", { name: "Review shifts" })).toBeNull();

    fireEvent.click(within(drawer).getByRole("button", { name: "Publish" }));
    expect(await within(drawer).findByRole("button", { name: "Remove 2 shifts and publish?" })).toBeTruthy();
    expect(saveAnnouncement).not.toHaveBeenCalled();
    fireEvent.click(within(drawer).getByRole("button", { name: "Remove 2 shifts and publish?" }));
    await waitFor(() =>
      expect(saveAnnouncement).toHaveBeenCalledWith(workspaceId, {
        announcement_id: null,
        expected_revision: null,
        intent: "publish",
        announcement: expect.objectContaining({
          title: "Patio closes early",
          locations: [{ location_id: downtown, day: "open", opens: null, closes: null }],
          fingerprint: "fp-1",
        }),
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Published. 4 people told; 2 shifts changed."));
  });

  it("lays Details out like the Important Date drawer: line, three boxes, When with All day, locations, publish time, Message last", async () => {
    vi.mocked(getAnnouncements).mockResolvedValue(list());
    vi.mocked(previewAnnouncement).mockResolvedValue(preview());
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "New" }));
    const drawer = screen.getByRole("dialog", { name: "New announcement" });
    expect(drawer.querySelector(".ad-sub")?.textContent).toBe("General");
    fireEvent.change(within(drawer).getByLabelText("Category"), { target: { value: "holiday" } });
    fireEvent.change(within(drawer).getByLabelText(/^Starts/), { target: { value: "2099-07-04" } });
    fireEvent.change(within(drawer).getByLabelText("Repeats"), { target: { value: "date" } });
    expect(drawer.querySelector(".ad-sub")?.textContent).toBe("Holiday · Sat, Jul 4, 2099 · Every year");

    // All day starts checked; the times are there but closed until it's cleared.
    const allDay = within(drawer).getByRole("checkbox", { name: "All day" }) as HTMLInputElement;
    expect(allDay.checked).toBe(true);
    const from = within(drawer).getByLabelText("Start time") as HTMLInputElement;
    expect(from.disabled).toBe(true);
    fireEvent.click(allDay);
    expect(from.disabled).toBe(false);
    expect(from.value).toBe("3:00 PM");
    expect((within(drawer).getByLabelText("End time") as HTMLInputElement).value).toBe("4:00 PM");

    // Open · Short hours · Closed, in that order, and the shift line at the row's end.
    expect(
      within(within(drawer).getByRole("group", { name: "Downtown that day" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Open", "Short hours", "Closed"]);
    expect(drawer.querySelector(".ad-loc .ad-loc-impact")?.textContent).toBe("Usual hours");

    // Show on the Schedule sits with the other two boxes; Message is the last field.
    const panel = within(drawer).getByRole("tabpanel");
    const boxes = [...panel.querySelectorAll(".ad-flags input")].map((box) => box.closest("label")?.querySelector("b")?.textContent);
    expect(boxes).toEqual(["Add to Important Dates", "Add to Calendar", "Show on the Schedule"]);
    expect(within(drawer).getByRole("checkbox", { name: "Schedule for later" })).toBeTruthy();
    const fields = [...panel.querySelectorAll("input, textarea, select")];
    expect(fields.at(-1)).toBe(within(drawer).getByLabelText("Message"));
    expect(within(drawer).queryByRole("tab", { name: /Locations/ })).toBeNull();
  });

  it("reads every time in the workspace's 24h clock and colours a shift's choice by its outcome", async () => {
    const shift: AnnouncementImpactShift = {
      id: "c1000000-0000-4000-8000-000000000001",
      source_id: "c1000000-0000-4000-8000-000000000002",
      location_id: downtown,
      location_name: "Downtown",
      scheduled_date: "2099-07-04",
      employee_id: "c1000000-0000-4000-8000-000000000003",
      employee_user_id: "c1000000-0000-4000-8000-000000000004",
      employee_name: "Maria Lopez",
      job_id: null,
      job_name: "Server",
      start_time: "16:00",
      end_time: "22:00",
      day: "closed",
      opens: null,
      closes: null,
      reason: "closed",
      started: false,
      tied: false,
      changed_in_schedule: false,
      default: "remove",
      choice: "remove",
      from: null,
      until: null,
      outcome: "removed",
    };
    vi.mocked(getAnnouncements).mockResolvedValue(list({ time_format: "24h" }));
    vi.mocked(previewAnnouncement).mockResolvedValue(
      preview({ shifts: [shift], counts: { removed: 1, edited: 0, opened: 0, kept: 0, quiet: 0 } }),
    );
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "New" }));
    const drawer = screen.getByRole("dialog", { name: "New announcement" });
    fireEvent.click(within(drawer).getByRole("checkbox", { name: "All day" }));
    expect((within(drawer).getByLabelText("Start time") as HTMLInputElement).value).toBe("15:00");
    expect((within(drawer).getByLabelText("End time") as HTMLInputElement).value).toBe("16:00");
    fireEvent.click(within(drawer).getByRole("button", { name: "Short hours" }));
    expect((within(drawer).getByLabelText("Downtown opens") as HTMLInputElement).value).toMatch(/^\d{2}:\d{2}$/);

    fireEvent.click(await within(drawer).findByRole("tab", { name: /^Shifts/ }));
    expect(within(drawer).getByText("16:00–22:00")).toBeTruthy();
    const choice = within(drawer).getByRole("group", { name: "What happens to Maria Lopez's shift" });
    const pressed = () => within(choice).getByRole("button", { pressed: true });
    expect([pressed().textContent, pressed().getAttribute("data-tone")]).toEqual(["Remove", "red"]);
    fireEvent.click(within(choice).getByRole("button", { name: "Open shift" }));
    expect([pressed().textContent, pressed().getAttribute("data-tone")]).toEqual(["Open shift", "amber"]);
    fireEvent.click(within(choice).getByRole("button", { name: "Keep" }));
    expect([pressed().textContent, pressed().getAttribute("data-tone")]).toEqual(["Keep", "green"]);
  });

  it("says a past publish time right under its red box, in the gap above the Message", async () => {
    const pastTime: AnnouncementProblem = {
      tab: "where",
      field: "publish_at",
      code: "publish_time_past",
      message: "Pick a time after now (Mon, Oct 12, 1:13 PM).",
      required: false,
    };
    vi.mocked(getAnnouncements).mockResolvedValue(list());
    vi.mocked(previewAnnouncement).mockImplementation(async (_ws, input) =>
      input.intent === "schedule" ? preview({ problems: [pastTime] }) : preview(),
    );
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "New" }));
    const drawer = screen.getByRole("dialog", { name: "New announcement" });
    fireEvent.change(within(drawer).getByLabelText("Title"), { target: { value: "Patio closes early" } });
    // The box is always there; it opens only with Schedule for later.
    expect((within(drawer).getByLabelText("Publish on") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(drawer).getByRole("checkbox", { name: "Schedule for later" }));
    expect((within(drawer).getByLabelText("Publish on") as HTMLInputElement).disabled).toBe(false);
    // The server still files it under the old Locations & publishing tab: Next stays on Details.
    fireEvent.click(within(drawer).getByRole("button", { name: "Next" }));
    const message = await within(drawer).findByText(pastTime.message);
    expect(within(drawer).getByRole("tab", { name: /^Details/ }).getAttribute("aria-selected")).toBe("true");
    const box = within(drawer).getByLabelText("Publish on");
    const clock = within(drawer).getByLabelText("Publish at");
    for (const field of [box, clock]) {
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(field.getAttribute("aria-describedby")).toBe(message.id);
    }
    // Right under the day and clock boxes, inside the row; the row itself stays its usual colour.
    expect(box.closest(".ad-publish-boxes")?.nextElementSibling).toBe(message);
    expect(message.closest(".ad-publish-row")?.getAttribute("data-bad")).toBeNull();
  });

  it("shows History only once published, and who acknowledged inside Audience", async () => {
    const id = "a8200000-0000-4000-8000-000000000081";
    const asked = {
      user_id: "d1000000-0000-4000-8000-000000000001",
      employee_id: null,
      name: "Ali Kaya",
      job_name: "Server",
      job_ids: [],
      department_ids: [],
      location_ids: [downtown],
      location_name: "Downtown",
    };
    vi.mocked(getAnnouncements).mockResolvedValue(list());
    vi.mocked(previewAnnouncement).mockResolvedValue(preview({ recipient_count: 2 }));
    vi.mocked(getAnnouncement).mockResolvedValue(
      detail({
        id,
        title: "Uniform policy",
        status: "published",
        display_status: "published",
        published_at: "2026-10-10T16:00:00.000Z",
        ask_ack: true,
        recipient_count: 2,
        respondent_count: 2,
        acknowledged_count: 1,
        locations: [
          { location_id: downtown, name: "Downtown", short_name: "Downtown", timezone: "America/Los_Angeles", archived: false, day: "open", opens: null, closes: null },
        ],
        acknowledgements: [
          { ...asked, acknowledged_at: "2026-10-11T17:30:00.000Z" },
          { ...asked, user_id: "d1000000-0000-4000-8000-000000000002", name: "Bea Lane", acknowledged_at: null },
        ],
      }),
    );
    renderList(`/app/announcements/${id}`);
    const drawer = await screen.findByRole("dialog", { name: "Uniform policy" });
    await waitFor(() =>
      expect(within(drawer).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Details", "Audience 2", "History"]),
    );
    fireEvent.click(within(drawer).getByRole("tab", { name: /Audience/ }));
    const who = within(drawer).getByRole("region", { name: "Who gets it" });
    expect(who.textContent).toContain("1 of 2 acknowledged");
    expect(within(who).getByRole("button", { name: "Remind 1 person" })).toBeTruthy();
    expect(within(who).getByText("Not yet · 1")).toBeTruthy();
    expect(within(who).getByText("Acknowledged · 1")).toBeTruthy();
    expect(drawer.querySelector(".ad-band")).toBeNull();
  });

  it("keeps History away from a post that never went out", async () => {
    const id = "a8200000-0000-4000-8000-000000000082";
    vi.mocked(getAnnouncements).mockResolvedValue(list());
    vi.mocked(previewAnnouncement).mockResolvedValue(preview());
    vi.mocked(getAnnouncement).mockResolvedValue(
      detail({ id, title: "Patio menu", status: "scheduled", display_status: "scheduled", publish_at: "2099-01-01T17:00:00.000Z" }),
    );
    renderList(`/app/announcements/${id}`);
    const drawer = await screen.findByRole("dialog", { name: "Patio menu" });
    await waitFor(() => expect(previewAnnouncement).toHaveBeenCalled());
    expect(within(drawer).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Details", "Audience 4"]);
  });

  it("keeps a past post read-only: no date error, no preview, only Archive and Close", async () => {
    const id = "a8200000-0000-4000-8000-000000000031";
    vi.mocked(getAnnouncements).mockResolvedValue(list());
    vi.mocked(getAnnouncement).mockResolvedValue(
      detail({
        id,
        title: "Summer hours",
        status: "published",
        display_status: "past",
        published_at: "2026-06-01T16:00:00.000Z",
        starts_on: "2026-06-01",
        ends_on: "2026-08-31",
        revision: 4,
        // As the server sends a past post: nothing to change, Archive allowed.
        can_edit: false,
        can_archive: true,
      }),
    );
    vi.mocked(setAnnouncementState).mockResolvedValue({
      status: "published",
      display_status: "archived",
      announcement_id: id,
      revision: 5,
      archived_at: "2026-10-12T16:00:00.000Z",
      told: 0,
    });
    renderList(`/app/announcements/${id}`);
    const drawer = await screen.findByRole("dialog", { name: "Summer hours" });
    expect(within(drawer).getByText("This is over. It can't change anymore; you can archive it.")).toBeTruthy();
    expect((within(drawer).getByLabelText("Title") as HTMLInputElement).disabled).toBe(true);
    expect(within(drawer).queryByText(/can't be before today/)).toBeNull();
    expect(previewAnnouncement).not.toHaveBeenCalled();
    const footer = drawer.querySelector(".ad-foot") as HTMLElement;
    expect(within(footer).getAllByRole("button").map((button) => button.textContent)).toEqual(["Archive", "Close"]);

    fireEvent.click(within(footer).getByRole("button", { name: "Archive" }));
    expect(setAnnouncementState).not.toHaveBeenCalled();
    fireEvent.click(within(footer).getByRole("button", { name: "Archive it?" }));
    await waitFor(() => expect(setAnnouncementState).toHaveBeenCalledWith(workspaceId, id, "archive", 4, []));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Archived. Nobody sees it; it stays under Archived."));
  });

  it("unpublishes with a second red click and stays open to say who was told", async () => {
    const id = "a8200000-0000-4000-8000-000000000041";
    const published = detail({
      id,
      title: "Fire drill",
      status: "published",
      display_status: "published",
      published_at: "2026-10-05T16:00:00.000Z",
      can_unpublish: true,
      can_archive: false,
      recipient_count: 12,
      shift_change_count: 0,
      revision: 2,
    });
    vi.mocked(getAnnouncements).mockResolvedValue(list());
    vi.mocked(getAnnouncement)
      .mockResolvedValueOnce(published)
      .mockResolvedValue({ ...published, status: "unpublished", display_status: "unpublished", revision: 3, can_unpublish: false, can_archive: true });
    vi.mocked(previewAnnouncement).mockResolvedValue(preview({ recipient_count: 12 }));
    vi.mocked(setAnnouncementState).mockResolvedValue({
      status: "unpublished",
      display_status: "unpublished",
      announcement_id: id,
      revision: 3,
      archived_at: null,
      told: 12,
    });
    renderList(`/app/announcements/${id}`);
    const drawer = await screen.findByRole("dialog", { name: "Fire drill" });
    expect(within(drawer).getByText("Archive: unpublish first")).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Unpublish" }));
    expect(setAnnouncementState).not.toHaveBeenCalled();
    fireEvent.click(within(drawer).getByRole("button", { name: "Unpublish and tell 12 people?" }));
    await waitFor(() => expect(setAnnouncementState).toHaveBeenCalledWith(workspaceId, id, "unpublish", 2, []));
    const again = await screen.findByRole("dialog", { name: "Fire drill" });
    await waitFor(() => expect(within(again).getByText("Unpublished. 12 people told it's cancelled.")).toBeTruthy());
    expect(within(again).getByRole("button", { name: "Archive" })).toBeTruthy();
  });

  it("says what a refusal means instead of the database's words", async () => {
    const id = "a8200000-0000-4000-8000-000000000051";
    vi.mocked(getAnnouncements).mockResolvedValue(list());
    vi.mocked(getAnnouncement).mockResolvedValue(detail({ id, title: "Patio opens" }));
    vi.mocked(previewAnnouncement).mockResolvedValue(preview());
    vi.mocked(saveAnnouncement).mockRejectedValue(
      new RequestError("stale announcement revision", "announcement.changed", undefined, 409),
    );
    renderList(`/app/announcements/${id}`);
    const drawer = await screen.findByRole("dialog", { name: "Patio opens" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save draft" }));
    expect(
      (await within(drawer).findByRole("alert")).textContent,
    ).toBe("This post changed since you opened it. Close it and open it again to see the current version.");
    expect(drawer.textContent).not.toContain("stale announcement revision");
  });
});

describe("What an employee reads (EKRAN-08)", () => {
  it("lists current posts with Acknowledge only where asked, keeps ended ones under Past, and acknowledges in the reader", async () => {
    const asked = record({
      id: "a8200000-0000-4000-8000-000000000061",
      title: "Uniform policy",
      status: "published",
      display_status: "published",
      published_at: "2026-10-10T16:00:00.000Z",
      asked_to_acknowledge: true,
      can_edit: false,
    });
    const plain = record({
      id: "a8200000-0000-4000-8000-000000000062",
      title: "New coffee",
      status: "published",
      display_status: "published",
      published_at: "2026-10-09T16:00:00.000Z",
      can_edit: false,
    });
    const ended = record({
      id: "a8200000-0000-4000-8000-000000000063",
      title: "Summer hours",
      status: "published",
      display_status: "past",
      published_at: "2026-06-01T16:00:00.000Z",
      can_edit: false,
    });
    vi.mocked(getAnnouncements).mockResolvedValue(list({ can_manage: false, announcements: [asked, plain, ended] }));
    renderList();
    const askedRow = await screen.findByRole("button", { name: /Uniform policy/ });
    expect(within(askedRow).getByText("Acknowledge")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: /New coffee/ })).queryByText("Acknowledge")).toBeNull();
    expect(screen.queryByText("Summer hours")).toBeNull();
    expect(screen.queryByRole("button", { name: "New" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Past" }));
    expect(screen.getByText("Summer hours")).toBeTruthy();
  });

  it("acknowledges from the reader drawer", async () => {
    const id = "a8200000-0000-4000-8000-000000000071";
    vi.mocked(getAnnouncements).mockResolvedValue(
      list({
        can_manage: false,
        announcements: [
          record({
            id,
            title: "Uniform policy",
            body: "Black shirts from Monday.",
            status: "published",
            display_status: "published",
            asked_to_acknowledge: true,
            can_edit: false,
          }),
        ],
      }),
    );
    renderList(`/app/announcements/${id}`);
    const reader = await screen.findByRole("dialog", { name: "Uniform policy" });
    expect(within(reader).getByText("Black shirts from Monday.")).toBeTruthy();
    fireEvent.click(within(reader).getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(acknowledgeAnnouncement).toHaveBeenCalledWith(workspaceId, id));
  });
});

describe("Important Dates (EKRAN-08)", () => {
  it("lists published dates in calendar order under Announcements, past ones on their own tab", async () => {
    const dated = (id: string, title: string, starts_on: string, display_status: "published" | "past", locations = [] as ReturnType<typeof loc>[]) =>
      record({
        id,
        title,
        category: "holiday",
        status: "published",
        display_status,
        starts_on,
        ends_on: starts_on,
        on_important_dates: true,
        locations,
      });
    vi.mocked(getImportantDates).mockResolvedValue({
      workspace_id: workspaceId,
      time_format: "12h",
      can_write: true,
      dates: [
        dated("a8200000-0000-4000-8000-000000000082", "Christmas", "2026-12-25", "published"),
        dated("a8200000-0000-4000-8000-000000000081", "Thanksgiving", "2026-11-26", "published", [
          loc(downtown, "Downtown", "closed"),
        ]),
        dated("a8200000-0000-4000-8000-000000000083", "Labor Day", "2026-09-07", "past"),
      ],
    });
    const path = "/app/announcements/important-dates";
    renderAt(path, <ImportantDatesPage />, [path]);
    const table = await screen.findByRole("table", { name: "Important dates" });
    const titles = () =>
      within(screen.getByRole("table", { name: "Important dates" }))
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.querySelector(".important-date-title")?.firstChild?.textContent);
    expect(titles()).toEqual(["Thanksgiving", "Christmas"]);
    expect(within(table).getByText("Downtown closed")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Announcements" }).getAttribute("href")).toBe("/app/announcements");
    expect(screen.getByRole("button", { name: "New" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Past" }));
    expect(titles()).toEqual(["Labor Day"]);
  });

  it("searches by words like Announcements, with New right after the search bar", async () => {
    const dated = (id: string, title: string, starts_on: string, body = "") =>
      record({ id, title, body, category: "holiday", status: "published", display_status: "published", starts_on, ends_on: starts_on, on_important_dates: true });
    vi.mocked(getImportantDates).mockResolvedValue({
      workspace_id: workspaceId,
      time_format: "12h",
      can_write: true,
      dates: [
        dated("a8200000-0000-4000-8000-000000000091", "Christmas", "2026-12-25"),
        dated("a8200000-0000-4000-8000-000000000092", "Thanksgiving", "2026-11-26", "Turkey dinner for the team"),
      ],
    });
    const path = "/app/announcements/important-dates";
    renderAt(path, <ImportantDatesPage />, [path]);
    await screen.findByRole("table", { name: "Important dates" });
    const titles = () =>
      within(screen.getByRole("table", { name: "Important dates" }))
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.querySelector(".important-date-title")?.firstChild?.textContent);
    const search = screen.getByLabelText("Search important dates");
    const label = search.closest("label");
    expect(label?.className).toContain("toolbar-search");
    expect(label?.nextElementSibling).toBe(screen.getByRole("button", { name: "New" }));
    fireEvent.change(search, { target: { value: "turkey" } });
    expect(titles()).toEqual(["Thanksgiving"]);
    fireEvent.change(search, { target: { value: "christ" } });
    expect(titles()).toEqual(["Christmas"]);
    fireEvent.change(search, { target: { value: "nothing" } });
    expect(screen.getByText("No dates here.")).toBeTruthy();
  });

  it("keeps the search bar for a reader who can't add dates", async () => {
    vi.mocked(getImportantDates).mockResolvedValue({ workspace_id: workspaceId, time_format: "12h", can_write: false, dates: [] });
    const path = "/app/announcements/important-dates";
    renderAt(path, <ImportantDatesPage />, [path]);
    expect(await screen.findByLabelText("Search important dates")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New" })).toBeNull();
  });
});

function loc(location_id: string, name: string, day: "open" | "closed" | "short" = "open") {
  return { location_id, name, short_name: name, timezone: "America/Los_Angeles", archived: false, day, opens: null, closes: null };
}
