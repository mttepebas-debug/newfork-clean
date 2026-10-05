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
import {
  listImportantDates,
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

const dates = [
  {
    id: "90000000-0000-4000-8000-000000000001",
    workspace_id: workspaceId,
    location_id: null,
    location_name: null,
    title: "New Year's Day",
    type: "holiday",
    starts_on: "2027-01-01",
    ends_on: "2027-01-01",
    recurrence: "annual",
    note: "Restaurant-wide holiday.",
    affects_scheduling: true,
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
    location_name: "Main Dining",
    title: "Private buyout",
    type: "closed_day",
    starts_on: "2027-02-14",
    ends_on: "2027-02-14",
    recurrence: "none",
    note: "",
    affects_scheduling: true,
    archived_at: null,
    status: "published",
    can_edit: true,
    can_unpublish: true,
    can_archive: true,
  },
] satisfies ImportantDate[];

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("./organization-data", () => ({
  listImportantDates: vi.fn(),
  saveImportantDate: vi.fn(),
  setImportantDateState: vi.fn(),
}));

function renderPage() {
  // What may be done comes from the server (FB-6.7): the owner, anywhere.
  vi.mocked(listImportantDates).mockResolvedValue({ dates, locations: [location], can_manage: true, can_target_workspace: true });
  vi.mocked(saveImportantDate).mockResolvedValue({ important_date_id: "71000000-0000-4000-8000-000000000001", status: "published" });
  vi.mocked(setImportantDateState).mockResolvedValue({ important_date_id: "71000000-0000-4000-8000-000000000001", status: "unpublished" });
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
  const day = (offset: number) => {
    const date = new Date(`${todayIn()}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
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
  it("lists holidays and closed days with scheduling impact flags", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Important Dates" }),
    ).toBeTruthy();
    expect(await screen.findByText("New Year's Day")).toBeTruthy();
    expect(screen.getByText("Private buyout")).toBeTruthy();
    expect(screen.getAllByText("Closed day").length).toBeGreaterThan(0);
    expect(screen.getByText("Repeats yearly")).toBeTruthy();
    expect(screen.getAllByText("Schedule flag")).toHaveLength(2);
  });

  it("creates a location closed day that always affects scheduling", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "New date" }));
    const form = screen.getByRole("form", { name: "Add important date" });
    fireEvent.change(within(form).getByLabelText("Title"), {
      target: { value: "Kitchen maintenance" },
    });
    fireEvent.change(within(form).getByLabelText("Type"), {
      target: { value: "closed_day" },
    });
    fireEvent.click(within(form).getByLabelText("Select locations"));
    fireEvent.click(within(form).getByLabelText("Main Dining"));
    fireEvent.change(within(form).getByLabelText("Starts"), {
      target: { value: "2027-03-10" },
    });
    fireEvent.change(within(form).getByLabelText("Ends"), {
      target: { value: "2027-03-10" },
    });
    expect(
      within(form).getByLabelText("Flag this date inside scheduling"),
    ).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Save date" }));

    await waitFor(() =>
      expect(saveImportantDate).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          title: "Kitchen maintenance",
          type: "closed_day",
          location_id: locationId,
          location_ids: [locationId],
          affects_scheduling: true,
        }),
        // A new date: no id yet, so no revision to name (KK-92 c).
        undefined,
        undefined,
      ),
    );
  });
});
