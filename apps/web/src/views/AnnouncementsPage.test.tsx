import type {
  ActiveWorkspaceContext,
  AnnouncementDetail,
  AnnouncementList,
  AnnouncementPreview,
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
        ? preview({ counts: { removed: 2, edited: 0, opened: 0, kept: 0, quiet: 0 } })
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
    expect(within(drawer).queryByRole("tab", { name: "History" })).toBeNull();
    // Nothing is red before a try.
    expect(within(drawer).queryByText("Add a title.")).toBeNull();

    fireEvent.click(within(drawer).getByRole("button", { name: "Next" }));
    expect(await within(drawer).findByText("Add a title.")).toBeTruthy();
    expect(within(drawer).getByRole("tab", { name: /Details/ }).getAttribute("aria-selected")).toBe("true");

    fireEvent.change(within(drawer).getByLabelText("Title"), { target: { value: " Patio closes early " } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(within(drawer).getByRole("tab", { name: "Locations & publishing" }).getAttribute("aria-selected")).toBe("true"),
    );
    // The one location this person writes for starts checked.
    expect((within(drawer).getByRole("checkbox", { name: "Downtown" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(drawer).getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(within(drawer).getByRole("tab", { name: /Audience/ }).getAttribute("aria-selected")).toBe("true"),
    );

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
});

function loc(location_id: string, name: string, day: "open" | "closed" | "short" = "open") {
  return { location_id, name, short_name: name, timezone: "America/Los_Angeles", archived: false, day, opens: null, closes: null };
}
