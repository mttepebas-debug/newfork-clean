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
import ImportantDatesSettingsPage from "./ImportantDatesSettingsPage";
import {
  listImportantDates,
  saveImportantDate,
  setImportantDateArchived,
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
  },
] satisfies ImportantDate[];

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("./organization-data", () => ({
  listImportantDates: vi.fn(),
  saveImportantDate: vi.fn(),
  setImportantDateArchived: vi.fn(),
}));

function renderPage() {
  vi.mocked(listImportantDates).mockResolvedValue({ dates, locations: [location] });
  vi.mocked(saveImportantDate).mockResolvedValue(undefined);
  vi.mocked(setImportantDateArchived).mockResolvedValue(undefined);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ImportantDatesSettingsPage />
    </QueryClientProvider>,
  );
}

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
    fireEvent.click(await screen.findByRole("button", { name: "Add date" }));
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
        undefined,
      ),
    );
  });
});
