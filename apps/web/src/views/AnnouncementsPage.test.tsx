import type {
  ActiveWorkspaceContext,
  AnnouncementDetail,
  AnnouncementList,
  AnnouncementPreview,
  AnnouncementImpactShift,
  AnnouncementProblem,
  AnnouncementRecord,
} from "@newfork/shared";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { stubPhoneWidth } from "../lib/phone-width.test-util";
import { AnnouncementsPage } from "./AnnouncementsPage";
import { ImportantDatesPage } from "./ImportantDatesPage";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const downtown = "11000000-0000-4000-8000-000000000001";
const harbor = "11000000-0000-4000-8000-000000000002";
const context = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: { id: workspaceId, name: "Harbor & Vine" },
  membership: { access: { employee: false, management: "owner" }, status: "active",},
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

function renderAt(
  path: string,
  page: React.ReactNode,
  routePaths: string[],
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
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
      category: "inspection",
      status: "published",
      display_status: "published",
      published_at: "2026-10-05T16:00:00.000Z",
      starts_on: "2026-10-20",
      ends_on: "2026-10-21",
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

  it("shows Status, Announcement, Category, Starts, Ends and Published on, with Active over Past and Archived on its own tab", async () => {
    vi.mocked(getAnnouncements).mockResolvedValue(list({ announcements: posts }));
    renderList();
    const active = await screen.findByRole("table", { name: "Active announcements" });
    const past = screen.getByRole("table", { name: "Past announcements" });
    expect(within(active).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Status",
      "Announcement",
      "Category",
      "Starts",
      "Ends",
      "Published on",
    ]);
    // The same column order as Important Dates (Mert 2026-10-13); a post with no days shows dashes.
    const drill = within(active).getAllByRole("row")[2]!;
    expect(within(drill).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "Published",
      "Fire drill",
      "Inspection",
      "Tue, Oct 20",
      "Wed, Oct 21",
      "Mon, Oct 5",
    ]);
    expect(within(within(active).getAllByRole("row")[3]!).getAllByLabelText("No date")).toHaveLength(2);
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

    fireEvent.click(within(active).getByRole("button", { name: "Starts" }));
    expect(rowTitles(screen.getByRole("table", { name: "Active announcements" }))).toEqual([
      "Fire drill",
      "Wine night",
      "Patio menu",
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
    const table = await screen.findByRole("table", { name: "Active announcements" });
    expect(within(table).getByText("Downtown update")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter announcements by location"), { target: { value: harbor } });
    expect(screen.queryByText("Downtown update")).toBeNull();
    expect(within(table).getByText("Harbor update")).toBeTruthy();
    // The phone's cards follow the same filters.
    expect(within(screen.getByRole("list", { name: "Active announcements" })).getByText("Harbor update")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search announcements"), { target: { value: "nothing" } });
    expect(screen.queryByText("Harbor update")).toBeNull();
    expect(screen.queryByRole("list", { name: "Active announcements" })).toBeNull();
  });

  it("gives the phone a status list in place of the tabs, with the same counts and the same rows", async () => {
    vi.mocked(getAnnouncements).mockResolvedValue(
      list({
        announcements: [
          record({ id: "a8200000-0000-4000-8000-000000000014", title: "Live one", status: "published", display_status: "published", published_at: "2026-10-10T16:00:00.000Z" }),
          record({ id: "a8200000-0000-4000-8000-000000000015", title: "Still a draft" }),
          record({ id: "a8200000-0000-4000-8000-000000000016", title: "Put away", status: "published", display_status: "archived", archived_at: "2026-09-01T16:00:00.000Z" }),
        ],
      }),
    );
    renderList();
    const status = (await screen.findByLabelText("Show announcements")) as HTMLSelectElement;
    expect([...status.options].map((option) => option.textContent)).toEqual([
      "All statuses",
      "Draft (1)",
      "Scheduled",
      "Published",
      "Archived",
    ]);
    fireEvent.change(status, { target: { value: "archived" } });
    expect(screen.getByRole("tab", { name: "Archived" }).getAttribute("aria-selected")).toBe("true");
    expect(within(screen.getByRole("list", { name: "Archived announcements" })).getByText("Put away")).toBeTruthy();
    expect(screen.queryByText("Live one")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Draft (1)" }));
    expect(status.value).toBe("draft");
  });

  it("draws one shared list card per post for the phone: mark, title, status, kind and day, the text's start", async () => {
    vi.mocked(getAnnouncements).mockResolvedValue(
      list({
        announcements: [
          record({
            id: "a8200000-0000-4000-8000-000000000013",
            title: "Thanksgiving",
            body: "Downtown is closed all day.",
            category: "holiday",
            status: "published",
            display_status: "published",
            published_at: "2026-10-10T16:00:00.000Z",
            on_important_dates: true,
            starts_on: "2026-11-26",
            ends_on: "2026-11-26",
          }),
        ],
      }),
    );
    renderList();
    const cards = await screen.findByRole("list", { name: "Active announcements" });
    const card = within(cards).getByRole("button", { name: "Thanksgiving, on Important Dates, Published, Thu, Nov 26" });
    expect(within(card).getByText("Published").className).toBe("list-chip");
    expect(within(card).getByText("Holiday · Thu, Nov 26")).toBeTruthy();
    expect(within(card).getByText("Downtown is closed all day.")).toBeTruthy();
    fireEvent.click(card);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("shows the no-access card when the API refuses", async () => {
    vi.mocked(getAnnouncements).mockRejectedValue(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderList();
    expect(await screen.findByRole("heading", { name: "You don't have access to Announcements" })).toBeTruthy();
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
    expect(shiftsTab.querySelector(".annc-badge")?.getAttribute("data-tone")).toBe("warn");
    const band = drawer.querySelector(".annc-band") as HTMLElement;
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
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Published to 4 people; 2 shifts changed."));
  });

  it("lays Details out like the Important Date drawer: line, three boxes, When with All day, locations, publish time, Message last", async () => {
    vi.mocked(getAnnouncements).mockResolvedValue(list());
    vi.mocked(previewAnnouncement).mockResolvedValue(preview());
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "New" }));
    const drawer = screen.getByRole("dialog", { name: "New announcement" });
    expect(drawer.querySelector(".annc-sub")?.textContent).toBe("General");
    fireEvent.change(within(drawer).getByLabelText("Category"), { target: { value: "holiday" } });
    fireEvent.change(within(drawer).getByLabelText(/^Starts/), { target: { value: "2099-07-04" } });
    fireEvent.change(within(drawer).getByLabelText("Repeats"), { target: { value: "date" } });
    expect(drawer.querySelector(".annc-sub")?.textContent).toBe("Holiday · Sat, Jul 4, 2099 · Every year");

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
    expect(drawer.querySelector(".annc-loc .annc-loc-impact")?.textContent).toBe("Usual hours");

    // Show on the Schedule sits with the other two boxes; Message is the last field.
    const panel = within(drawer).getByRole("tabpanel");
    const boxes = [...panel.querySelectorAll(".annc-flags input")].map((box) => box.closest("label")?.querySelector("b")?.textContent);
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
    // In the note under them, there only while it says this (UI-FIELDMSG-2).
    expect(box.closest(".annc-publish-boxes")?.nextElementSibling).toBe(message.closest(".field-note"));
    expect(message.closest(".annc-publish-row")?.getAttribute("data-bad")).toBeNull();
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
    expect(within(who).getByText("Not yet · 1")).toBeTruthy();
    expect(within(who).getByText("Acknowledged · 1")).toBeTruthy();
    expect(drawer.querySelector(".annc-band")).toBeNull();
  });

  // BILDIRIM-U6 (KARARLAR S-124, S-126): Remind is back for those who haven't acknowledged, twice a day at most; at
  // the limit the button rests and says so. The database keeps the count (reminders_left_today).
  it("reminds who hasn't acknowledged, then rests at two a day and says so", async () => {
    const id = "a8200000-0000-4000-8000-000000000084";
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
    const posted = (left: number, acked: boolean, revision: number) =>
      detail({
        id,
        title: "Uniform policy",
        status: "published",
        display_status: "published",
        published_at: "2026-10-10T16:00:00.000Z",
        ask_ack: true,
        recipient_count: 2,
        respondent_count: 2,
        acknowledged_count: acked ? 2 : 1,
        revision,
        reminders_left_today: left,
        locations: [
          { location_id: downtown, name: "Downtown", short_name: "Downtown", timezone: "America/Los_Angeles", archived: false, day: "open", opens: null, closes: null },
        ],
        acknowledgements: [
          { ...asked, acknowledged_at: "2026-10-11T17:30:00.000Z" },
          { ...asked, user_id: "d1000000-0000-4000-8000-000000000002", name: "Bea Lane", acknowledged_at: acked ? "2026-10-12T17:30:00.000Z" : null },
        ],
      });
    vi.mocked(getAnnouncements).mockResolvedValue(list());
    vi.mocked(previewAnnouncement).mockResolvedValue(preview({ recipient_count: 2 }));
    vi.mocked(getAnnouncement).mockResolvedValue(posted(1, false, 3));
    vi.mocked(setAnnouncementState).mockImplementation(async () => {
      vi.mocked(getAnnouncement).mockResolvedValue(posted(0, false, 4));
      return {
        status: "published",
        display_status: "published",
        announcement_id: id,
        revision: 4,
        archived_at: null,
        told: 1,
        reminders_left_today: 0,
      };
    });
    renderList(`/app/announcements/${id}`);
    const drawer = await screen.findByRole("dialog", { name: "Uniform policy" });
    fireEvent.click(await within(drawer).findByRole("tab", { name: /Audience/ }));
    const remind = within(drawer).getByRole("button", { name: "Remind 1 person" });
    expect(remind.textContent).toBe("Remind 1");
    expect((remind as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(remind);
    await waitFor(() => expect(setAnnouncementState).toHaveBeenCalledWith(workspaceId, id, "remind", 3, []));
    // The drawer stays open on Audience and says so.
    const again = await screen.findByRole("dialog", { name: "Uniform policy" });
    await waitFor(() => expect(within(again).getByText("Reminder sent to 1 person who hasn't acknowledged.")).toBeTruthy());
    const rested = await within(again).findByRole("button", { name: "Reminded twice today" });
    expect((rested as HTMLButtonElement).disabled).toBe(true);
    expect(rested.getAttribute("title")).toBe("You can remind again tomorrow.");
    expect(within(again).queryByRole("button", { name: /^Remind \d/ })).toBeNull();
  });

  // CI 38984890125: the post's new revision can come back before the lists do; the drawer that reopens for it
  // must already know to stay on Audience, so the second Remind is there to press.
  it("stays on Audience when the post's new copy comes back before the lists", async () => {
    const id = "a8200000-0000-4000-8000-000000000086";
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
    const posted = (left: number, revision: number) =>
      detail({
        id,
        title: "Knife rules",
        status: "published",
        display_status: "published",
        published_at: "2026-10-10T16:00:00.000Z",
        ask_ack: true,
        recipient_count: 2,
        respondent_count: 2,
        acknowledged_count: 0,
        revision,
        reminders_left_today: left,
        locations: [
          { location_id: downtown, name: "Downtown", short_name: "Downtown", timezone: "America/Los_Angeles", archived: false, day: "open", opens: null, closes: null },
        ],
        acknowledgements: [
          { ...asked, acknowledged_at: null },
          { ...asked, user_id: "d1000000-0000-4000-8000-000000000002", name: "Bea Lane", acknowledged_at: null },
        ],
      });
    let release: () => void = () => undefined;
    vi.mocked(getAnnouncements).mockResolvedValue(list());
    vi.mocked(previewAnnouncement).mockResolvedValue(preview({ recipient_count: 2 }));
    vi.mocked(getAnnouncement).mockResolvedValue(posted(2, 3));
    vi.mocked(setAnnouncementState).mockImplementation(async () => {
      // The post's new copy answers at once; the lists hang until released.
      vi.mocked(getAnnouncement).mockResolvedValue(posted(1, 4));
      vi.mocked(getAnnouncements).mockImplementation(
        () => new Promise((resolve) => {
          release = () => resolve(list());
        }),
      );
      return {
        status: "published",
        display_status: "published",
        announcement_id: id,
        revision: 4,
        archived_at: null,
        told: 2,
        reminders_left_today: 1,
      };
    });
    renderList(`/app/announcements/${id}`);
    const drawer = await screen.findByRole("dialog", { name: "Knife rules" });
    fireEvent.click(await within(drawer).findByRole("tab", { name: /Audience/ }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Remind 2 people" }));
    await waitFor(() => expect(setAnnouncementState).toHaveBeenCalledTimes(1));
    // The new copy has come back and the drawer reopened for it, before the lists answer.
    await waitFor(() => expect(vi.mocked(getAnnouncement).mock.calls.length).toBeGreaterThanOrEqual(2));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    release();
    const again = await screen.findByRole("dialog", { name: "Knife rules" });
    await waitFor(() => expect(within(again).getByRole("tab", { name: /Audience/ }).getAttribute("aria-selected")).toBe("true"));
    expect(within(again).getByRole("button", { name: "Remind 2 people" })).toBeTruthy();
  });

  it("has nothing to remind once everyone acknowledged", async () => {
    const id = "a8200000-0000-4000-8000-000000000085";
    vi.mocked(getAnnouncements).mockResolvedValue(list());
    vi.mocked(previewAnnouncement).mockResolvedValue(preview({ recipient_count: 1 }));
    vi.mocked(getAnnouncement).mockResolvedValue(
      detail({
        id,
        title: "Knife rules",
        status: "published",
        display_status: "published",
        published_at: "2026-10-10T16:00:00.000Z",
        ask_ack: true,
        recipient_count: 1,
        respondent_count: 1,
        acknowledged_count: 1,
        reminders_left_today: 2,
        acknowledgements: [
          {
            user_id: "d1000000-0000-4000-8000-000000000001",
            employee_id: null,
            name: "Ali Kaya",
            job_name: "Server",
            job_ids: [],
            department_ids: [],
            location_ids: [downtown],
            location_name: "Downtown",
            acknowledged_at: "2026-10-11T17:30:00.000Z",
          },
        ],
      }),
    );
    renderList(`/app/announcements/${id}`);
    const drawer = await screen.findByRole("dialog", { name: "Knife rules" });
    fireEvent.click(await within(drawer).findByRole("tab", { name: /Audience/ }));
    const done = within(drawer).getByRole("button", { name: "Everyone acknowledged" });
    expect((done as HTMLButtonElement).disabled).toBe(true);
    expect(setAnnouncementState).not.toHaveBeenCalled();
  });

  // Audience C (Mert, 2026-10-12): one list; "+ Add people" opens a search in its place, nobody is picked until
  // checked, picks survive a new search, and "Ask people to acknowledge" stays last.
  it("builds the audience in one list: Add people opens a search and adds only who you check", async () => {
    const id = "a8200000-0000-4000-8000-000000000083";
    const person = (n: number, name: string, job: string) => ({
      user_id: `d2000000-0000-4000-8000-00000000000${n}`,
      employee_id: null,
      name,
      job_name: job,
      job_ids: [],
      department_ids: [],
      location_ids: [harbor],
      location_name: "Harbor",
    });
    vi.mocked(getAnnouncements).mockResolvedValue(
      list({ people: [person(1, "Ana Diaz", "Server"), person(2, "Ben Cole", "Cook"), person(3, "Cy Park", "Server")] }),
    );
    vi.mocked(previewAnnouncement).mockResolvedValue(preview());
    vi.mocked(getAnnouncement).mockResolvedValue(
      detail({
        id,
        title: "Patio menu",
        locations: [
          { location_id: downtown, name: "Downtown", short_name: "Downtown", timezone: "America/Los_Angeles", archived: false, day: "open", opens: null, closes: null },
        ],
      }),
    );
    renderList(`/app/announcements/${id}`);
    const drawer = await screen.findByRole("dialog", { name: "Patio menu" });
    await waitFor(() => expect(previewAnnouncement).toHaveBeenCalled());
    fireEvent.click(within(drawer).getByRole("tab", { name: /Audience/ }));
    const who = within(drawer).getByRole("region", { name: "Who gets it" });
    expect(within(drawer).queryByRole("region", { name: "Add people" })).toBeNull();
    expect(within(drawer).queryByRole("combobox")).toBeNull();
    expect(who.textContent).toContain("Downtown");
    expect(who.textContent).toContain("Everyone there · 4 people");
    const body = drawer.querySelector(".annc-body") as HTMLElement;
    expect(body.lastElementChild?.textContent).toContain("Ask people to acknowledge");

    fireEvent.click(within(who).getByRole("button", { name: "Add people" }));
    const search = within(who).getByRole("searchbox", { name: "Search people" });
    const boxes = () => within(who).getAllByRole("checkbox").filter((box) => box.getAttribute("aria-label") !== "Select all");
    expect(boxes().map((box) => (box as HTMLInputElement).checked)).toEqual([false, false, false]);
    expect((within(who).getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(search, { target: { value: "server" } });
    expect(boxes().map((box) => box.closest("label")?.textContent)).toEqual([
      expect.stringContaining("Ana Diaz"),
      expect.stringContaining("Cy Park"),
    ]);
    fireEvent.click(within(who).getByRole("checkbox", { name: /Ana Diaz/ }));
    fireEvent.change(search, { target: { value: "ben" } });
    fireEvent.click(within(who).getByRole("checkbox", { name: /Ben Cole/ }));
    expect(who.textContent).toContain("2 selected");
    fireEvent.click(within(who).getByRole("button", { name: "Add 2 people" }));

    expect(within(who).queryByRole("searchbox")).toBeNull();
    expect(within(who).getByText("Added here · 2")).toBeTruthy();
    expect(within(who).getByRole("button", { name: "Remove Ana Diaz" })).toBeTruthy();
    expect(within(who).getByRole("button", { name: "Remove Ben Cole" })).toBeTruthy();
    expect(within(who).queryByText("Cy Park")).toBeNull();

    fireEvent.click(within(who).getByRole("button", { name: "Add people" }));
    fireEvent.click(within(who).getByRole("checkbox", { name: /Cy Park/ }));
    fireEvent.click(within(who).getByRole("button", { name: "Cancel" }));
    expect(within(who).queryByText("Cy Park")).toBeNull();
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
    const footer = drawer.querySelector(".annc-foot") as HTMLElement;
    expect(within(footer).getAllByRole("button").map((button) => button.textContent)).toEqual(["Archive", "Close"]);

    fireEvent.click(within(footer).getByRole("button", { name: "Archive" }));
    expect(setAnnouncementState).not.toHaveBeenCalled();
    fireEvent.click(within(footer).getByRole("button", { name: "Archive it?" }));
    await waitFor(() => expect(setAnnouncementState).toHaveBeenCalledWith(workspaceId, id, "archive", 4, []));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Archived. Nobody sees it; it stays under Archived."));
  });

  it("unpublishes with a second red click and stays open to say for how many", async () => {
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
    // No "Archive: unpublish first" line (Mert, 2026-10-12): Unpublish and the green button only.
    const footer = drawer.querySelector(".annc-foot") as HTMLElement;
    expect(within(footer).getAllByRole("button").map((button) => button.textContent)).toEqual(["Unpublish", "Save changes"]);
    expect(within(drawer).queryByText(/unpublish first/)).toBeNull();
    fireEvent.click(within(drawer).getByRole("button", { name: "Unpublish" }));
    expect(setAnnouncementState).not.toHaveBeenCalled();
    fireEvent.click(within(drawer).getByRole("button", { name: "Unpublish for 12 people?" }));
    await waitFor(() => expect(setAnnouncementState).toHaveBeenCalledWith(workspaceId, id, "unpublish", 2, []));
    const again = await screen.findByRole("dialog", { name: "Fire drill" });
    await waitFor(() => expect(within(again).getByText("Unpublished for 12 people.")).toBeTruthy());
    expect(within(again).getByRole("button", { name: "Archive" })).toBeTruthy();
  });

  // BILDIRIM-05 (KARARLAR S-123, S-96): nobody is notified, so saving says who sees it, not who "gets a notice".
  it("saves a published post and says how many people see the update", async () => {
    const id = "a8200000-0000-4000-8000-000000000042";
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
    vi.mocked(getAnnouncement).mockResolvedValue(published);
    vi.mocked(previewAnnouncement).mockResolvedValue(preview({ recipient_count: 12 }));
    vi.mocked(saveAnnouncement).mockResolvedValue({
      status: "published",
      display_status: "published",
      announcement_id: id,
      revision: 3,
      recipient_count: 12,
      shift_changes: 0,
      brought_back: 0,
    });
    renderList(`/app/announcements/${id}`);
    const drawer = await screen.findByRole("dialog", { name: "Fire drill" });
    fireEvent.change(within(drawer).getByLabelText("Title"), { target: { value: "Fire drill moved" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Saved. 12 people see the update."));
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
  it("lists current posts with Acknowledge only where asked, and ended ones under Earlier in the same list, with no tabs (S-181)", async () => {
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
    await screen.findByRole("list", { name: "Current announcements" });
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Current 2",
      "Earlier 1",
    ]);
    const currentRows = document.querySelector<HTMLElement>('.announcement-reader-list[data-section="current"]')!;
    const earlierRows = document.querySelector<HTMLElement>('.announcement-reader-list[data-section="earlier"]')!;
    const desktop = within(currentRows);
    const askedRow = desktop.getByRole("button", { name: /Uniform policy/ });
    expect(within(askedRow).getByText("Acknowledge")).toBeTruthy();
    expect(within(desktop.getByRole("button", { name: /New coffee/ })).queryByText("Acknowledge")).toBeNull();
    expect(desktop.queryByText("Summer hours")).toBeNull();
    expect(earlierRows.dataset.section).toBe("earlier");
    expect(within(earlierRows).getByRole("button", { name: /Summer hours/ })).toBeTruthy();
    // The phone's cards say the same.
    const cards = within(screen.getByRole("list", { name: "Current announcements" }));
    expect(within(cards.getByRole("button", { name: "Uniform policy, Acknowledge" })).getByText("Acknowledge")).toBeTruthy();
    expect(within(cards.getByRole("button", { name: "New coffee" })).queryByText("Acknowledge")).toBeNull();
    expect(within(screen.getByRole("list", { name: "Earlier announcements" })).getByRole("button", { name: "Summer hours" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New" })).toBeNull();
    expect(screen.queryByText("You're all caught up")).toBeNull();
  });

  it("says you're all caught up over the earlier posts when nothing is current (S-181)", async () => {
    const ended = record({
      id: "a8200000-0000-4000-8000-000000000064",
      title: "Summer hours",
      status: "published",
      display_status: "past",
      published_at: "2026-06-01T16:00:00.000Z",
      can_edit: false,
    });
    vi.mocked(getAnnouncements).mockResolvedValue(list({ can_manage: false, announcements: [ended] }));
    renderList();
    await screen.findByRole("list", { name: "Earlier announcements" });
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Current 0",
      "Earlier 1",
    ]);
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(screen.getByText("No current announcements.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Current announcements" })).toBeNull();
    expect(screen.queryByText("No announcements for you right now.")).toBeNull();
  });

  it("says there are no announcements yet when there are none at all, with no box and no headings (S-181)", async () => {
    vi.mocked(getAnnouncements).mockResolvedValue(list({ can_manage: false, announcements: [] }));
    renderList();
    expect(await screen.findByRole("heading", { name: "No announcements yet" })).toBeTruthy();
    expect(screen.getByText("Updates your managers share with your team will show up here.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /^Current/ })).toBeNull();
    expect(document.querySelector(".announcement-reader-list")).toBeNull();
    expect(screen.queryByText("No announcements for you right now.")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("in the employee view a manager reads the employee's feed and opens a post there (EMPLOYEE-ANNOUNCEMENTS)", async () => {
    const live = record({
      id: "a8200000-0000-4000-8000-000000000065",
      title: "Uniform policy",
      status: "published",
      display_status: "published",
      published_at: "2026-10-10T16:00:00.000Z",
    });
    const draft = record({ id: "a8200000-0000-4000-8000-000000000066", title: "Patio menu" });
    vi.mocked(getAnnouncements).mockResolvedValue(list({ can_manage: true, announcements: [live, draft] }));
    renderAt("/app/employee-hub/announcements", <AnnouncementsPage view="employee" />, [
      "/app/employee-hub/announcements",
      "/app/employee-hub/announcements/:announcementId",
    ]);
    await screen.findByRole("list", { name: "Current announcements" });
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Current 1"]);
    expect(screen.queryByRole("button", { name: "New" })).toBeNull();
    expect(screen.queryByText("Patio menu")).toBeNull();
    const rows = document.querySelector<HTMLElement>('.announcement-reader-list[data-section="current"]')!;
    fireEvent.click(within(rows).getByRole("button", { name: /Uniform policy/ }));
    // The post opens at the employee view's own address, in the reader, not the manager's drawer.
    expect(await screen.findByRole("dialog", { name: "Uniform policy" })).toBeTruthy();
    expect(getAnnouncement).not.toHaveBeenCalled();
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

  // BILDIRIM-15: a phone alert's tap lands on a post that went out after the list on hand was read.
  describe("a post newer than the list on hand", () => {
    const id = "a8200000-0000-4000-8000-000000000081";
    const fresh = record({
      id,
      title: "Walk-in closed",
      body: "Use the reach-in on the line until Friday.",
      status: "published",
      display_status: "published",
      can_edit: false,
    });
    // The list read a moment ago, still fresh for the app (App.tsx keeps lists 30 s).
    function clientHolding(held: AnnouncementList) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
      client.setQueryData(["announcements", workspaceId], held);
      return client;
    }
    const open = (client: QueryClient) =>
      renderAt(`/app/announcements/${id}`, <AnnouncementsPage />, ["/app/announcements", "/app/announcements/:announcementId"], client);

    it("asks for the list again and opens the post", async () => {
      vi.mocked(getAnnouncements).mockReset().mockResolvedValue(list({ can_manage: false, announcements: [fresh] }));
      open(clientHolding(list({ can_manage: false, announcements: [] })));
      expect(screen.queryByText("This announcement is no longer available.")).toBeNull();
      const reader = await screen.findByRole("dialog", { name: "Walk-in closed" });
      expect(within(reader).getByText("Use the reach-in on the line until Friday.")).toBeTruthy();
      expect(getAnnouncements).toHaveBeenCalledTimes(1);
    });

    it("says it is gone only once a fresh list has no such post, asking once", async () => {
      vi.mocked(getAnnouncements).mockReset().mockResolvedValue(list({ can_manage: false, announcements: [] }));
      open(clientHolding(list({ can_manage: false, announcements: [] })));
      expect(await screen.findByText("This announcement is no longer available.")).toBeTruthy();
      await act(async () => undefined);
      expect(getAnnouncements).toHaveBeenCalledTimes(1);
    });
  });
});

describe("Important Dates (EKRAN-08)", () => {
  it("lists published dates in calendar order, past ones on their own tab, with no breadcrumb on top", async () => {
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
    // Status · Important date · Category · Starts · Ends; no "That day" (Mert 2026-10-13).
    expect(within(table).getAllByRole("columnheader").map((heading) => heading.textContent)).toEqual([
      "Status",
      "Important date",
      "Category",
      "Starts",
      "Ends",
    ]);
    expect(within(table).queryByText("That day")).toBeNull();
    expect(within(table).queryByText("Downtown closed")).toBeNull();
    const thanksgiving = within(table).getAllByRole("row")[1]!;
    expect(within(thanksgiving).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "Published",
      "Thanksgiving",
      "Holiday",
      "Thu, Nov 26",
      "Thu, Nov 26",
    ]);
    // No "Announcements › Important Dates" line on top (Mert 2026-10-13).
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Announcements" })).toBeNull();
    expect(screen.getByRole("button", { name: "New" })).toBeTruthy();
    // The phone's cards: same order; the days, then the kind.
    const cards = () =>
      within(screen.getByRole("list", { name: "Important dates" }))
        .getAllByRole("button")
        .map((card) => card.getAttribute("aria-label"));
    expect(cards()).toEqual(["Thanksgiving, Thu, Nov 26, Published", "Christmas, Fri, Dec 25, Published"]);
    const card = within(screen.getByRole("button", { name: "Thanksgiving, Thu, Nov 26, Published" }));
    expect(card.getByText("Holiday")).toBeTruthy();
    expect(card.queryByText(/Downtown closed/)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Past" }));
    expect(titles()).toEqual(["Labor Day"]);
    expect(cards()).toEqual(["Labor Day, Mon, Sep 7, Past"]);
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

  // Mert 2026-10-14: on a phone "+ Add" sits at the right end of the tab row.
  it("puts New at the right end of the tab row on a phone, short label Add", async () => {
    stubPhoneWidth();
    vi.mocked(getImportantDates).mockResolvedValue({ workspace_id: workspaceId, time_format: "12h", can_write: true, dates: [] });
    const path = "/app/announcements/important-dates";
    renderAt(path, <ImportantDatesPage />, [path]);
    const add = await screen.findByRole("button", { name: "New" });
    const search = screen.getByLabelText("Search important dates");
    expect(add.closest(".catalog-toolbar-status-row .catalog-tab-add")).toBeTruthy();
    expect(search.closest("label")?.nextElementSibling).toBeNull();
    expect(add.querySelector(".list-add-short")?.textContent).toBe("Add");
  });
  afterEach(() => vi.unstubAllGlobals());
});

function loc(location_id: string, name: string, day: "open" | "closed" | "short" = "open") {
  return { location_id, name, short_name: name, timezone: "America/Los_Angeles", archived: false, day, opens: null, closes: null };
}

// Loading and error look the same everywhere (Mert 2026-10-14, "B").
describe("loading and error", () => {
  it("Announcements: outline while loading, then the load-error card that tries again", async () => {
    vi.mocked(getAnnouncements).mockReturnValueOnce(new Promise(() => undefined));
    const first = renderList();
    expect(screen.getByText("Loading announcements").closest("[role=status]")).toBeTruthy();
    first.unmount();

    vi.mocked(getAnnouncements).mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValue(list());
    renderList();
    const card = await screen.findByRole("alert");
    expect(within(card).getByRole("heading", { name: "We couldn't load announcements" })).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "We couldn't load announcements" })).toBeNull());
  });

  it("Important Dates: the load-error card tries again", async () => {
    vi.mocked(getImportantDates)
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValue({ workspace_id: workspaceId, time_format: "12h", can_write: true, dates: [] });
    const path = "/app/announcements/important-dates";
    renderAt(path, <ImportantDatesPage />, [path]);
    const card = await screen.findByRole("alert");
    expect(within(card).getByRole("heading", { name: "We couldn't load Important Dates" })).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table", { name: "Important dates" })).toBeTruthy();
  });

  // A refresh that fails over a list on screen keeps the list and says so in
  // one line; the full card is for a page with nothing to show (Mert
  // 2026-10-14: that card sits in the middle of the page, so it would push the
  // list to the bottom).
  it("Announcements: a failed refresh keeps the list with the refresh line, not the full card", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(getAnnouncements)
      .mockResolvedValueOnce(list({ announcements: [record({ id: "a8200000-0000-4000-8000-000000000095", title: "Patio menu" })] }))
      .mockRejectedValueOnce(new Error("Failed to fetch"));
    renderAt("/app/announcements", <AnnouncementsPage />, ["/app/announcements"], client);
    await screen.findAllByText("Patio menu");
    await act(() => client.refetchQueries());
    const line = await screen.findByRole("alert");
    expect(line.className).toContain("load-refresh");
    expect(screen.queryByRole("heading", { name: "We couldn't load announcements" })).toBeNull();
    expect(screen.getAllByText("Patio menu").length).toBeGreaterThan(0);
  });

  it("Important Dates: a failed refresh keeps the table with the refresh line, not the full card", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(getImportantDates)
      .mockResolvedValueOnce({ workspace_id: workspaceId, time_format: "12h", can_write: true, dates: [] })
      .mockRejectedValueOnce(new Error("Failed to fetch"));
    const path = "/app/announcements/important-dates";
    renderAt(path, <ImportantDatesPage />, [path], client);
    await screen.findByRole("table", { name: "Important dates" });
    await act(() => client.refetchQueries());
    const line = await screen.findByRole("alert");
    expect(line.className).toContain("load-refresh");
    expect(screen.queryByRole("heading", { name: "We couldn't load Important Dates" })).toBeNull();
    expect(screen.getByRole("table", { name: "Important dates" })).toBeTruthy();
  });

  it("an announcement that did not load gives the inset card in its drawer", async () => {
    const id = "a8200000-0000-4000-8000-000000000091";
    vi.mocked(getAnnouncements).mockResolvedValue(list());
    vi.mocked(getAnnouncement).mockRejectedValueOnce(new Error("Failed to fetch"));
    renderList(`/app/announcements/${id}`);
    const card = await screen.findByRole("alert");
    expect(card.className).toContain("inset");
    expect(within(card).getByRole("heading", { level: 3, name: "We couldn't load this announcement" })).toBeTruthy();
  });
});
