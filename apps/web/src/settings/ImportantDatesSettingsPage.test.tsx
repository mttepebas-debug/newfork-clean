import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  ImportantDate,
  Location,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import ImportantDatesSettingsPage, { dateTab } from "./ImportantDatesSettingsPage";
import { todayIn } from "../lib/today";
import { RequestError } from "../lib/request-error";
import {
  getImportantDateHistory,
  listImportantDates,
  previewImportantDateClosure,
  saveImportantDate,
  setImportantDateState,
} from "./organization-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const locationId = "11000000-0000-4000-8000-000000000001";

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
    "schedule.read",
    "important_dates.read",
    "important_dates.manage",
  ],
  actions: [],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const location = {
  id: locationId,
  workspace_id: workspaceId,
  name: "Main Dining",
  street_address: "1 Main St",
  city: "Los Angeles",
  region: "CA",
  postal_code: "90001",
  country_code: "US",
  timezone: "America/Los_Angeles",
  sort_order: 0,
  archived_at: null,
  short_name: "MAIN",
} satisfies Location;

// Dates relative to today, so a fixture never drifts into the Past tab.
function day(offset: number): string {
  const date = new Date(`${todayIn()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

const dates: ImportantDate[] = [
  {
    id: "90000000-0000-4000-8000-000000000001",
    workspace_id: workspaceId,
    location_id: null,
    location_name: null,
    title: "New Year's Day",
    type: "holiday",
    starts_on: day(30),
    ends_on: day(30),
    recurrence: "annual",
    note: "Restaurant-wide holiday.",
    all_day: true,
    start_time: null,
    end_time: null,
    location_days: {},
    archived_at: null,
    status: "published",
    can_edit: true,
    can_unpublish: true,
    can_archive: true,
  },
  {
    id: "90000000-0000-4000-8000-000000000002",
    workspace_id: workspaceId,
    location_id: locationId,
    location_ids: [locationId],
    location_name: "Main Dining",
    title: "Private buyout",
    type: "event",
    starts_on: day(60),
    ends_on: day(60),
    recurrence: "none",
    note: "",
    all_day: true,
    start_time: null,
    end_time: null,
    location_days: { [locationId]: { status: "closed" } },
    archived_at: null,
    revision: 3,
    status: "published",
    can_edit: true,
    can_unpublish: true,
    can_archive: true,
  },
];

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("./organization-data", () => ({
  getImportantDateHistory: vi.fn(),
  listImportantDates: vi.fn(),
  previewImportantDateClosure: vi.fn(),
  saveImportantDate: vi.fn(),
  setImportantDateState: vi.fn(),
}));

const shiftId = "72000000-0000-4000-8000-000000000001";
const listedShift = {
  id: shiftId,
  source_id: "72000000-0000-4000-8000-000000000002",
  employee_id: "73000000-0000-4000-8000-000000000001",
  employee_name: "Ana Diaz",
  location_id: locationId,
  location_name: "Main Dining",
  job_name: "Server",
  scheduled_date: day(30),
  start_time: "09:00",
  end_time: "17:00",
  starts_at: `${day(30)}T16:00:00Z`,
  ends_at: `${day(31)}T00:00:00Z`,
  reason: "closed" as const,
  opens: null,
  closes: null,
  default_choice: "remove" as const,
};

function renderPage() {
  // What may be done comes from the server (FB-6.7): the owner, anywhere.
  vi.mocked(listImportantDates).mockResolvedValue({ dates, locations: [location], can_manage: true, can_target_workspace: true });
  vi.mocked(saveImportantDate).mockResolvedValue({ important_date_id: "71000000-0000-4000-8000-000000000001", status: "published" });
  vi.mocked(setImportantDateState).mockResolvedValue({ important_date_id: "71000000-0000-4000-8000-000000000001", status: "unpublished" });
  vi.mocked(previewImportantDateClosure).mockResolvedValue({
    fingerprint: "fingerprint-1",
    shifts: [listedShift],
    hidden_shift_count: 0,
    draft_shift_count: 0,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ImportantDatesSettingsPage />
    </QueryClientProvider>,
  );
}

describe("important date tabs", () => {
  const row = (id: string, title: string, starts: number, ends: number, archived = false) => ({
    ...dates[0]!,
    id,
    title,
    starts_on: day(starts),
    ends_on: day(ends),
    recurrence: "none" as const,
    archived_at: archived ? "2026-09-01T00:00:00Z" : null,
  });
  const today = row("90000000-0000-4000-8000-000000000011", "Inventory today", 0, 0);
  const yesterday = row("90000000-0000-4000-8000-000000000012", "Staff party yesterday", -1, -1);
  const running = row("90000000-0000-4000-8000-000000000013", "Patio repairs", -3, 0);
  const archived = row("90000000-0000-4000-8000-000000000014", "Old closure", 5, 5, true);

  it("sorts a date by its last day against today, archived first", () => {
    expect(dateTab(today, todayIn())).toBe("upcoming");
    expect(dateTab(running, todayIn())).toBe("upcoming");
    expect(dateTab(yesterday, todayIn())).toBe("past");
    expect(dateTab(archived, todayIn())).toBe("archived");
  });

  it("opens on Upcoming and moves each row to its own tab", async () => {
    vi.mocked(listImportantDates).mockResolvedValue({
      dates: [today, yesterday, running, archived],
      locations: [location],
      can_manage: true,
      can_target_workspace: true,
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ImportantDatesSettingsPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Inventory today")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Upcoming" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Patio repairs")).toBeTruthy();
    expect(screen.queryByText("Staff party yesterday")).toBeNull();
    expect(screen.queryByText("Old closure")).toBeNull();
    expect(screen.queryByText("Show archived")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Past" }));
    expect(screen.getByText("Staff party yesterday")).toBeTruthy();
    expect(screen.queryByText("Inventory today")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
    expect(screen.getByText("Old closure")).toBeTruthy();
    expect(screen.queryByText("Staff party yesterday")).toBeNull();
  });

  it("names each tab's empty table", async () => {
    vi.mocked(listImportantDates).mockResolvedValue({
      dates: [yesterday],
      locations: [location],
      can_manage: true,
      can_target_workspace: true,
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ImportantDatesSettingsPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("No upcoming important dates")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
    expect(screen.getByText("No archived important dates")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Past" }));
    expect(screen.getByText("Staff party yesterday")).toBeTruthy();
  });

  it("keeps the first-run sentence when there is no date at all", async () => {
    vi.mocked(listImportantDates).mockResolvedValue({
      dates: [],
      locations: [location],
      can_manage: true,
      can_target_workspace: true,
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ImportantDatesSettingsPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("No important dates yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Past" }));
    expect(screen.getByText("No past important dates")).toBeTruthy();
  });
});

describe("ImportantDatesSettingsPage", () => {
  it("lists holidays and events with what each does to the locations", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Important Dates" }),
    ).toBeTruthy();
    const holiday = (await screen.findByText("New Year's Day")).closest(".important-date-catalog-row") as HTMLElement;
    const buyout = screen.getByText("Private buyout").closest(".important-date-catalog-row") as HTMLElement;
    expect(within(holiday).getByText("None")).toBeTruthy();
    expect(within(buyout).getByText("Closed")).toBeTruthy();
    expect(screen.queryByText("Closed day")).toBeNull();
  });

  it("closes a location, keeps a listed shift and saves the choice with the preview's fingerprint", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "New date" }));
    const form = screen.getByRole("form", { name: "Add important date" });
    fireEvent.change(within(form).getByLabelText("Title"), {
      target: { value: "Kitchen maintenance" },
    });
    fireEvent.change(within(form).getByLabelText("Type"), {
      target: { value: "holiday" },
    });
    fireEvent.change(within(form).getByLabelText("Starts"), {
      target: { value: day(30) },
    });
    fireEvent.change(within(form).getByLabelText("Ends"), {
      target: { value: day(30) },
    });
    fireEvent.click(
      within(within(form).getByRole("radiogroup", { name: "Main Dining that day" })).getByRole("radio", { name: "Closed" }),
    );

    expect(await within(form).findByText("1 shift will be removed")).toBeTruthy();
    expect(previewImportantDateClosure).toHaveBeenLastCalledWith(
      workspaceId,
      expect.objectContaining({
        location_ids: [],
        all_day: true,
        location_days: { [locationId]: { status: "closed" } },
      }),
    );
    fireEvent.click(within(form).getByRole("button", { name: "Review shifts" }));
    const pick = within(form).getByRole("group", { name: "Ana Diaz's shift" });
    expect(within(pick).getByRole("button", { name: "Remove" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(pick).getByRole("button", { name: "Keep" }));
    expect(within(form).getByText("No shift changes · 1 kept")).toBeTruthy();
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveImportantDate).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          title: "Kitchen maintenance",
          type: "holiday",
          location_ids: [],
          all_day: true,
          start_time: null,
          end_time: null,
          location_days: { [locationId]: { status: "closed" } },
        }),
        // A new date: no id yet, so no revision to name (KK-92 c).
        undefined,
        undefined,
        { shift_choices: { [shiftId]: "keep" }, expected_fingerprint: "fingerprint-1" },
      ),
    );
    await waitFor(() => expect(screen.queryByRole("form", { name: "Add important date" })).toBeNull());
  });

  it("keeps the hours off while All day is on, and gives short hours their own times", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "New date" }));
    const form = screen.getByRole("form", { name: "Add important date" });
    const startTime = within(form).getByLabelText("Start time");
    expect(startTime).toHaveProperty("disabled", true);
    fireEvent.click(within(form).getByLabelText("All day"));
    expect(startTime).toHaveProperty("disabled", false);
    fireEvent.change(startTime, { target: { value: "18:00" } });
    fireEvent.change(within(form).getByLabelText("End time"), { target: { value: "09:00" } });
    expect(within(form).getByText("End time must be after the start time.")).toBeTruthy();

    fireEvent.click(
      within(within(form).getByRole("radiogroup", { name: "Main Dining that day" })).getByRole("radio", { name: "Short hours" }),
    );
    expect(within(form).getByLabelText<HTMLInputElement>("Main Dining opens").value).toBe("10:00");
    expect(within(form).getByLabelText<HTMLInputElement>("Main Dining closes").value).toBe("15:00");
    fireEvent.change(within(form).getByLabelText("Title"), { target: { value: "Christmas Eve" } });
    expect(within(form).getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  it("will not save a date without a location", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "New date" }));
    const form = screen.getByRole("form", { name: "Add important date" });
    fireEvent.change(within(form).getByLabelText("Title"), { target: { value: "Staff day" } });
    fireEvent.click(within(form).getByLabelText("All locations"));
    expect(within(form).getByText("Not included")).toBeTruthy();
    expect(within(form).getByText("Choose at least one location.")).toBeTruthy();
    expect(within(form).getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  it("says in plain words when the shifts changed under the save", async () => {
    renderPage();
    vi.mocked(saveImportantDate).mockRejectedValueOnce(
      new RequestError("closure changed", "important_date.closure_changed", undefined, 409),
    );
    fireEvent.click(await screen.findByText("Private buyout"));
    const form = await screen.findByRole("form", { name: "Edit Private buyout" });
    fireEvent.change(within(form).getByLabelText("Title"), { target: { value: "Private buyout dinner" } });
    expect(await within(form).findByText("1 shift will be removed")).toBeTruthy();
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect((await within(form).findByRole("alert")).textContent).toContain(
      "The shifts on this date changed. Review them on the Shifts tab, then save again.",
    );
    expect(saveImportantDate).toHaveBeenLastCalledWith(
      workspaceId,
      expect.objectContaining({ title: "Private buyout dinner", location_ids: [locationId] }),
      dates[1]!.id,
      3,
      { shift_choices: {}, expected_fingerprint: "fingerprint-1" },
    );
  });

  it("shows who changed the date and what each location did", async () => {
    renderPage();
    vi.mocked(getImportantDateHistory).mockResolvedValue({
      important_date_id: dates[1]!.id,
      author_user_id: null,
      author_name: "Zeynep Aydin",
      changes: [
        {
          id: "74000000-0000-4000-8000-000000000001",
          action: "updated",
          changed_at: "2026-10-01T17:30:00Z",
          actor_user_id: null,
          actor_name: "Zeynep Aydin",
          before: { ...dates[1]!, location_days: {} },
          after: dates[1]!,
        },
        {
          id: "74000000-0000-4000-8000-000000000002",
          action: "updated",
          changed_at: null,
          actor_user_id: null,
          actor_name: null,
          before: { hidden: true },
          after: { hidden: true },
        },
      ],
    });
    fireEvent.click(await screen.findByText("Private buyout"));
    const form = await screen.findByRole("form", { name: "Edit Private buyout" });
    fireEvent.click(within(form).getByRole("tab", { name: "History" }));

    expect(await within(form).findByText("Changed by Zeynep Aydin")).toBeTruthy();
    expect(within(form).getByText((_, node) => node?.textContent === "Main Dining: Open → Closed")).toBeTruthy();
    expect(within(form).getByText("Hidden change")).toBeTruthy();
  });
});
