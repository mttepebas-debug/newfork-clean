import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { emptyWeeklyPreference, type WeeklyTeamRead } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvailabilityPage } from "./AvailabilityPage";
import { loadWeeklyTeam } from "../availability/availability-data";

import { RequestError } from "../lib/request-error";
const workspace = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const main = "11000000-0000-4000-8000-000000000001";
const patio = "11000000-0000-4000-8000-000000000002";
const alex = "15000000-0000-4000-8000-000000000001";
const jordan = "15000000-0000-4000-8000-000000000002";
const sam = "15000000-0000-4000-8000-000000000003";
const dinner = "15000000-0000-4000-8000-000000000004";

// What the core lets the reader do; a test that needs less sets it first.
let actions: string[] = ["employee.read"];
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: { workspace: { id: workspace }, actions } }),
}));
vi.mock("../availability/availability-data", () => ({
  loadWeeklyTeam: vi.fn(),
}));
vi.mock("../employees/EmployeeDrawer", () => ({
  EmployeeDrawer: ({
    employeeId,
    section,
    onClose,
  }: {
    employeeId: string;
    section: string;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="Employee">
      <span>{employeeId + ":" + section}</span>
      <button onClick={onClose}>Close employee</button>
    </div>
  ),
}));
function fixture(): WeeklyTeamRead {
  const preference = emptyWeeklyPreference("time_range");
  preference.days[1]!.ranges = [{ start: "09:00", end: "17:00" }];
  preference.days[2]!.all_day = true;
  return {
    locations: [
      { id: main, name: "Main Dining" },
      { id: patio, name: "Patio" },
    ],
    time_format: "24h",
    shift_types: [],
    employees: [
      {
        id: alex,
        display_name: "Alex Kim",
        employee_code: "E-001",
        location_ids: [main],
        submitted: true,
        preference,
        can_open: true,
      },
      {
        id: jordan,
        display_name: "Jordan Lee",
        employee_code: "E-002",
        location_ids: [patio],
        submitted: false,
        preference: emptyWeeklyPreference("time_range"),
        can_open: true,
      },
      {
        id: sam,
        display_name: "Sam Chen",
        employee_code: "E-003",
        location_ids: [main],
        submitted: true,
        preference: emptyWeeklyPreference("time_range"),
        can_open: false,
      },
    ],
  };
}
function LocationMarker() {
  return <output data-testid="url">{useLocation().search}</output>;
}
function renderPage(path = "/app/availability") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AvailabilityPage />
        <LocationMarker />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  actions = ["employee.read"];
  vi.resetAllMocks();
  vi.mocked(loadWeeklyTeam).mockResolvedValue(fixture());
});
afterEach(cleanup);

describe("weekly team availability", () => {
  it("shows a fixed Monday-first week with unavailable ranges and available defaults", async () => {
    renderPage();
    await screen.findByText("Alex Kim");
    expect(loadWeeklyTeam).toHaveBeenCalledWith(workspace);
    expect(
      screen.getAllByRole("columnheader").map((el) => el.textContent),
    ).toEqual(["Employee", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(
      screen.getByRole("button", { name: "Alex Kim Monday: 09:00 – 17:00" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Alex Kim Tuesday: All day" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Jordan Lee Monday: Available" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Sam Chen Monday: Available" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.queryByText(/Schedule conflicts|Missing availability/),
    ).toBeNull();
    expect(document.querySelector('input[type="date"]')).toBeNull();
  });
  it("names a person by full name only and keeps a day cell to three lines", async () => {
    const model = fixture();
    model.employees[0]!.preference.days[1]!.ranges = [
      { start: "07:00", end: "09:00" },
      { start: "12:00", end: "14:00" },
      { start: "18:00", end: "21:00" },
      { start: "22:00", end: "23:00" },
    ];
    vi.mocked(loadWeeklyTeam).mockResolvedValue(model);
    renderPage();
    const person = await screen.findByRole("button", { name: "Alex Kim" });
    expect(person.textContent).toBe("Alex Kim");
    expect(screen.queryByText("E-001")).toBeNull();
    const monday = screen.getByRole("button", {
      name: "Alex Kim Monday: 07:00 – 09:00, 12:00 – 14:00, 18:00 – 21:00, 22:00 – 23:00",
    });
    expect(
      Array.from(monday.querySelectorAll("span")).map((line) => line.textContent),
    ).toEqual(["07:00 – 09:00", "12:00 – 14:00", "+2 more"]);
  });
  it("keeps the heading row over an empty view with its two lines", async () => {
    vi.mocked(loadWeeklyTeam).mockResolvedValue({ ...fixture(), employees: [] });
    renderPage();
    expect(await screen.findByText("No employees match this view")).toBeTruthy();
    expect(
      screen.getByText("Try another status or location, or clear your search."),
    ).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(8);
  });
  // BL-661: one person is "1 employee".
  it("counts one employee in the singular", async () => {
    const model = fixture();
    vi.mocked(loadWeeklyTeam).mockResolvedValue({ ...model, employees: model.employees.slice(0, 1) });
    renderPage();
    expect(await screen.findByText("1 employee")).toBeTruthy();
  });
  it("combines location, search and declaration filters without treating an empty declaration as missing", async () => {
    renderPage();
    await screen.findByText("Alex Kim");
    fireEvent.click(screen.getByRole("button", { name: "Not submitted" }));
    expect(screen.queryByText("Sam Chen")).toBeNull();
    expect(screen.getByText("Jordan Lee")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Submitted" }));
    expect(screen.getByText("Sam Chen")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search employees"), {
      target: { value: "e-003" },
    });
    expect(screen.queryByText("Alex Kim")).toBeNull();
    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: patio },
    });
    expect(screen.getByText("No employees match this view")).toBeTruthy();
  });
  it("opens the selected employee availability and preserves filters on close", async () => {
    renderPage(
      "/app/availability?location=" +
        main +
        "&q=Alex&submission=submitted&date=2026-08-17",
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Alex Kim Tuesday: All day" }),
    );
    await screen.findByRole("dialog");
    expect(screen.getByText(alex + ":availability")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close employee" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("url").textContent).toBe(
      "?location=" + main + "&q=Alex&submission=submitted",
    );
  });
  it("refreshes via the existing weekly save invalidation and hides cached data on access loss", async () => {
    const client = renderPage();
    await screen.findByText("Alex Kim");
    const next = fixture();
    next.employees[0]!.preference.days[1]!.all_day = true;
    next.employees[0]!.preference.days[1]!.ranges = [];
    vi.mocked(loadWeeklyTeam).mockResolvedValue(next);
    await client.invalidateQueries({
      queryKey: ["weekly-preferences", workspace],
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Alex Kim Monday: All day" }),
    );
    await screen.findByRole("dialog");
    vi.mocked(loadWeeklyTeam).mockRejectedValue(
      Object.assign(new Error("Access denied"), { status: 403 }),
    );
    await client.invalidateQueries({
      queryKey: ["weekly-preferences", workspace],
    });
    await screen.findByRole("alert");
    expect(screen.queryByText("Alex Kim")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("shows current type hours and keeps missing or archived types visibly unavailable", async () => {
    const model = fixture();
    model.employees[0]!.preference = emptyWeeklyPreference("shift_type");
    model.employees[0]!.preference.days[1]!.shift_type_ids = [dinner, sam];
    model.shift_types = [
      {
        id: dinner,
        name: "Dinner",
        start_time: "18:00",
        end_time: "23:00",
        archived: true,
        selectable: false,
      },
    ];
    vi.mocked(loadWeeklyTeam).mockResolvedValue(model);
    renderPage();
    expect((await screen.findByText("Dinner")).getAttribute("title")).toBe(
      "18:00 – 23:00 (archived)",
    );
    expect(
      screen
        .getByRole("button", {
          name: "Alex Kim Monday: Dinner, Unavailable shift type",
        })
        .closest("td")
        ?.getAttribute("data-unavailable"),
    ).toBe("true");
  });
  it("retries a failed initial read", async () => {
    vi.mocked(loadWeeklyTeam).mockRejectedValueOnce(
      new Error("Could not load"),
    );
    renderPage();
    const card = await screen.findByRole("alert");
    expect(card.textContent).toContain("We couldn't load team availability");
    expect(card.textContent).toContain("Nothing was changed.");
    expect(screen.queryByText("Could not load")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Alex Kim")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("draws the table's outline while team availability loads", async () => {
    vi.mocked(loadWeeklyTeam).mockReturnValueOnce(new Promise(() => {}));
    renderPage();
    const status = (await screen.findByText("Loading availability")).closest("[role=status]")!;
    expect(status.className).toContain("nf-list-outline");
    expect(status.querySelectorAll(".nf-list-outline-row")).toHaveLength(8);
  });
});

describe("no access (FB-6.1.9)", () => {
  it("shows the no-access card, not the raw error, when the API refuses team availability (FB-6.1.9)", async () => {
    vi.mocked(loadWeeklyTeam).mockRejectedValueOnce(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to team availability" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});

// BL-243: the drawer reads the person's record, so it opens only for a reader
// the core lets read employees.
describe("weekly team availability without employee reading", () => {
  it("does not open the employee drawer, by click or by link", async () => {
    actions = [];
    renderPage(`/app/availability?employeeId=${alex}&section=availability`);
    await screen.findByText("Alex Kim");
    expect(
      screen.getByRole("button", { name: "Alex Kim Monday: 09:00 – 17:00" }),
    ).toHaveProperty("disabled", true);
    expect(screen.queryByRole("dialog", { name: "Employee" })).toBeNull();
  });
});
