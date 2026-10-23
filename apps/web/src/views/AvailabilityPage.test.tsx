// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { emptyWeeklyPreference, type WeeklyTeamRead } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvailabilityPage } from "./AvailabilityPage";
import { loadWeeklyTeam } from "../availability/availability-data";
import { stubPhoneWidth } from "../lib/phone-width.test-util";
import { RequestError } from "../lib/request-error";

const workspace = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const main = "11000000-0000-4000-8000-000000000001";
const patio = "11000000-0000-4000-8000-000000000002";
const alex = "15000000-0000-4000-8000-000000000001";
const jordan = "15000000-0000-4000-8000-000000000002";
const sam = "15000000-0000-4000-8000-000000000003";

// What the core lets the reader do; a test that needs less sets it first.
let actions: string[] = ["employee.read"];
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: { workspace: { id: workspace }, actions } }),
}));
vi.mock("../availability/availability-data", () => ({
  loadWeeklyTeam: vi.fn(),
}));
vi.mock("../availability/WeeklyPreferencesPanel", () => ({
  WeeklyPreferencesPanel: (props: { employeeId: string; audience: string; short?: boolean }) => (
    <div data-testid="panel">{`${props.employeeId}:${props.audience}:${props.short ? "short" : "long"}`}</div>
  ),
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
  const preference = emptyWeeklyPreference();
  preference.days[1]!.ranges = [{ start: "09:00", end: "17:00" }];
  preference.days[2]!.all_day = true;
  return {
    locations: [
      { id: main, name: "Main Dining" },
      { id: patio, name: "Patio" },
    ],
    time_format: "24h",
    employees: [
      {
        id: alex,
        display_name: "Alex Kim",
        employee_code: "E-001",
        job_name: "Server",
        location_ids: [main],
        submitted: true,
        updated_at: "2026-10-15T18:00:00.000Z",
        preference,
        can_open: true,
      },
      {
        id: jordan,
        display_name: "Jordan Lee",
        employee_code: "E-002",
        job_name: null,
        location_ids: [patio],
        submitted: false,
        updated_at: null,
        preference: emptyWeeklyPreference(),
        can_open: true,
      },
      {
        id: sam,
        display_name: "Sam Chen",
        employee_code: "E-003",
        job_name: "Host",
        location_ids: [main],
        submitted: true,
        updated_at: "2026-10-14T18:00:00.000Z",
        preference: emptyWeeklyPreference(),
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
const people = () => within(screen.getByRole("navigation", { name: "Employees" })).getAllByRole("button");
const detail = () => screen.getByRole("region", { name: /Availability of/ });

beforeEach(() => {
  actions = ["employee.read"];
  vi.resetAllMocks();
  vi.mocked(loadWeeklyTeam).mockResolvedValue(fixture());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Availability: the people on the left, the chosen person's week on the right", () => {
  // Spec "Kurallar" 6: no promise of a coverage check the product does not make.
  it("says what the page is for, and who sets the weeks", async () => {
    renderPage();
    await screen.findByRole("navigation", { name: "Employees" });
    expect(screen.getByText("Team availability")).toBeTruthy();
    expect(screen.getByText("Your team's weekly preferences. They guide the schedule; you can still schedule anyone.")).toBeTruthy();
    expect(screen.queryByText(/coverage/i)).toBeNull();
    expect(screen.getByText("Employees set their own availability. Managers can read it and keep private notes in each person's profile.")).toBeTruthy();
  });

  it("lists each employee with their job and the week as seven dots", async () => {
    renderPage();
    await screen.findByRole("navigation", { name: "Employees" });
    expect(loadWeeklyTeam).toHaveBeenCalledWith(workspace);
    expect(people().map((person) => person.textContent)).toEqual([
      "AKAlex KimServer",
      "JLJordan LeeNot submitted yet",
      "SCSam ChenHost",
    ]);
    const dots = people()[0]!.querySelectorAll(".avt-dots > i");
    expect([...dots].map((dot) => dot.className)).toEqual([
      "is-some", "is-off", "is-free", "is-free", "is-free", "is-free", "is-free",
    ]);
    // A week never shared draws no dots.
    expect(people()[1]!.querySelector(".avt-dots")).toBeNull();
    // No date picker: availability is one week that repeats (M1).
    expect(document.querySelector('input[type="date"]')).toBeNull();
  });

  it("shows the first person's week until another is chosen", async () => {
    renderPage();
    await screen.findByRole("navigation", { name: "Employees" });
    expect(people()[0]!.getAttribute("aria-current")).toBe("true");
    expect(within(detail()).getByRole("heading", { name: "Alex Kim" })).toBeTruthy();
    expect(within(detail()).getByText("Server · Updated Oct 15")).toBeTruthy();
    expect(detail().querySelector(".avr-sum")?.textContent).toBe(
      "Alex prefers not to work Mon 09:00 – 17:00 and Tue all day.",
    );
    const boxes = within(detail()).getAllByRole("listitem");
    expect(boxes).toHaveLength(7);
    expect(boxes[0]!.textContent).toContain("Unavailable 09:00 – 17:00");
    expect(boxes[2]!.textContent).toContain("Available all day");
    fireEvent.click(people()[1]!);
    expect(people()[1]!.getAttribute("aria-current")).toBe("true");
    expect(within(detail()).getByText("Not submitted")).toBeTruthy();
    // A week never shared counts as open every day (Mert 2026-10-20).
    const open = within(detail()).getAllByRole("listitem");
    expect(open).toHaveLength(7);
    expect(open.every((box) => box.className.includes("is-free"))).toBe(true);
    expect(screen.getByTestId("url").textContent).toBe(`?person=${jordan}`);
  });

  it("opens the person's profile in the Employees drawer and keeps the filters on close", async () => {
    renderPage(`/app/availability?location=${main}&q=Alex&submission=submitted&date=2026-08-17`);
    await screen.findByRole("navigation", { name: "Employees" });
    fireEvent.click(within(detail()).getByRole("button", { name: "Open profile" }));
    await screen.findByRole("dialog");
    expect(screen.getByText(alex + ":availability")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close employee" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("url").textContent).toBe(`?location=${main}&q=Alex&submission=submitted`);
  });

  it("offers no profile the reader may not open", async () => {
    renderPage(`/app/availability?person=${sam}`);
    await screen.findByRole("navigation", { name: "Employees" });
    expect(within(detail()).getByRole("heading", { name: "Sam Chen" })).toBeTruthy();
    expect(within(detail()).queryByRole("button", { name: "Open profile" })).toBeNull();
  });

  it("counts each status in its tab, and filters by status, location and search", async () => {
    renderPage();
    await screen.findByRole("navigation", { name: "Employees" });
    const tabs = within(screen.getByRole("group", { name: "Submission status" })).getAllByRole("button");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["All3", "Submitted2", "Not submitted1"]);
    expect(screen.getByText("3 employees")).toBeTruthy();
    fireEvent.click(tabs[2]!);
    expect(screen.queryByText("Sam Chen")).toBeNull();
    expect(people().map((person) => person.textContent)).toEqual(["JLJordan LeeNot submitted yet"]);
    // The chosen person follows the list: Jordan's week shows.
    expect(within(detail()).getByRole("heading", { name: "Jordan Lee" })).toBeTruthy();
    fireEvent.click(tabs[1]!);
    expect(screen.getAllByText("Sam Chen").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Search employees"), { target: { value: "e-003" } });
    expect(people().map((person) => person.textContent)).toEqual(["SCSam ChenHost"]);
    expect(tabs.map((tab) => tab.textContent)).toEqual(["All1", "Submitted1", "Not submitted0"]);
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: patio } });
    expect(screen.getByText("No employees match this view")).toBeTruthy();
    expect(screen.getByText("Try another status or location, or clear your search.")).toBeTruthy();
  });

  it("says what green and orange mean", async () => {
    renderPage();
    await screen.findByRole("navigation", { name: "Employees" });
    const legend = screen.getByRole("list", { name: "Legend" });
    expect(legend.textContent).toBe("AvailablePrefers not to work");
  });

  // BL-661: one person is "1 employee".
  it("counts one employee in the singular", async () => {
    const model = fixture();
    vi.mocked(loadWeeklyTeam).mockResolvedValue({ ...model, employees: model.employees.slice(0, 1) });
    renderPage();
    expect(await screen.findByText("1 employee")).toBeTruthy();
  });

  it("follows a refresh and hides cached people when access is lost", async () => {
    const client = renderPage();
    await screen.findByRole("navigation", { name: "Employees" });
    const next = fixture();
    next.employees[0]!.preference.days[1]!.all_day = true;
    next.employees[0]!.preference.days[1]!.ranges = [];
    vi.mocked(loadWeeklyTeam).mockResolvedValue(next);
    await client.invalidateQueries({ queryKey: ["weekly-preferences", workspace] });
    await waitFor(() => expect(within(detail()).getAllByRole("listitem")[0]!.textContent).toContain("Unavailable all day"));
    vi.mocked(loadWeeklyTeam).mockRejectedValue(Object.assign(new Error("Access denied"), { status: 403 }));
    await client.invalidateQueries({ queryKey: ["weekly-preferences", workspace] });
    await screen.findByRole("alert");
    expect(screen.queryByText("Alex Kim")).toBeNull();
  });

  it("retries a failed first read", async () => {
    vi.mocked(loadWeeklyTeam).mockRejectedValueOnce(new Error("Could not load"));
    renderPage();
    const card = await screen.findByRole("alert");
    expect(card.textContent).toContain("We couldn't load team availability");
    expect(card.textContent).toContain("Nothing was changed.");
    expect(screen.queryByText("Could not load")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getAllByText("Alex Kim").length).toBeGreaterThan(0));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the list when a refresh fails, says so, and tries again", async () => {
    const client = renderPage();
    await screen.findByRole("navigation", { name: "Employees" });
    vi.mocked(loadWeeklyTeam).mockRejectedValueOnce(new Error("Could not load"));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["weekly-preferences"] });
    });
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Team availability didn't refresh. This is the last view that loaded.",
    );
    expect(screen.getAllByText("Alex Kim").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(loadWeeklyTeam).toHaveBeenCalledTimes(3);
  });

  it("draws the list's outline while team availability loads", async () => {
    vi.mocked(loadWeeklyTeam).mockReturnValueOnce(new Promise(() => {}));
    renderPage();
    const status = (await screen.findByText("Loading availability")).closest("[role=status]")!;
    expect(status.className).toContain("nf-list-outline");
    expect(status.querySelectorAll(".nf-list-outline-row")).toHaveLength(8);
  });
});

describe("Availability on a phone (720 px and below)", () => {
  beforeEach(() => stubPhoneWidth());

  it("lists the people; a tap opens the person's page with the two tabs, and back returns", async () => {
    renderPage();
    await screen.findByRole("navigation", { name: "Employees" });
    expect(screen.queryByRole("region", { name: /Availability of/ })).toBeNull();
    fireEvent.click(people()[0]!);
    expect(screen.getByTestId("url").textContent).toBe(`?person=${alex}`);
    expect(screen.queryByRole("navigation", { name: "Employees" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Alex Kim" })).toBeTruthy();
    expect(screen.getByText("Server · E-001")).toBeTruthy();
    // The drawer's two tabs, named shortly: the employee's week and the manager's notes.
    expect(screen.getByTestId("panel").textContent).toBe(`${alex}:manager:short`);
    fireEvent.click(screen.getByRole("button", { name: "Availability" }));
    expect(screen.getByTestId("url").textContent).toBe("");
    expect(people()).toHaveLength(3);
  });

  // Mert 2026-10-17 (AVAIL-GUN-S2): no status tabs on a phone; the list is everyone.
  it("has no status tabs and lists everyone, even with a status left in the address", async () => {
    renderPage("/app/availability?submission=missing");
    await screen.findByRole("navigation", { name: "Employees" });
    expect(screen.queryByRole("group", { name: "Submission status" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Not submitted/ })).toBeNull();
    expect(people()).toHaveLength(3);
    expect(screen.getByText("3 employees")).toBeTruthy();
    // Mert 2026-10-20: the count sits under the search, on the legend's row; no row of its own.
    const count = screen.getByText("3 employees");
    expect(count.closest(".catalog-toolbar-filter-row")).toBeTruthy();
    expect(count.previousElementSibling?.className).toBe("avt-legend");
    expect(document.querySelector(".catalog-toolbar-status-row")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search employees"), { target: { value: "e-003" } });
    expect(people().map((person) => person.textContent)).toEqual(["SCSam ChenHost"]);
    expect(screen.getByText("1 employee")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search employees"), { target: { value: "nobody" } });
    expect(screen.getByText("Try another location, or clear your search.")).toBeTruthy();
  });

  it("shows a person the reader may not open from the list's own week, read only", async () => {
    renderPage(`/app/availability?person=${sam}`);
    expect(await screen.findByRole("heading", { name: "Sam Chen" })).toBeTruthy();
    expect(screen.queryByTestId("panel")).toBeNull();
    // Mert 2026-10-17 (AVAIL-GUN-S3): the boxes start right under the person; no lock line, no sentence.
    expect(screen.queryByText("Read only. Only Sam can change this.")).toBeNull();
    expect(screen.queryByText("Sam is open to work any time.")).toBeNull();
    expect(screen.getByRole("list", { name: "Sam's week" })).toBeTruthy();
  });

  // The person's page sat in a white top (back, the person, the two tabs) and the
  // page's sky started under it (Mert 2026-10-22, "sayfanın en tepesinde gökyüzü
  // arka planı gözükmüyor"). The top paints no ground: the sky shows through.
  it("lets the page's sky through the person's top and its tabs", () => {
    const css = readFileSync("src/availability/weekly-team.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const media = "@media (max-width: 720px) {";
    const phone = css.slice(css.indexOf(media) + media.length);
    const body = (selector: string) =>
      [...phone.matchAll(/([^{}]+)\{([^}]*)\}/g)]
        .filter(([, head]) => head!.trim() === selector)
        .map(([, , rule]) => rule!)
        .join(";");
    expect(body(".avt-person-top")).not.toMatch(/background/);
    // The tabs are white in the desktop drawer (manager-availability.css); here they are clear.
    expect(body(".avt-person-page .avm-tabs")).toMatch(/background\s*:\s*transparent/);
  });
});

describe("no access (FB-6.1.9)", () => {
  it("shows the no-access card, not the raw error, when the API refuses team availability (FB-6.1.9)", async () => {
    vi.mocked(loadWeeklyTeam).mockRejectedValueOnce(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to Availability" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});

// BL-243: the drawer reads the person's record, so it opens only for a reader
// the core lets read employees.
describe("Availability without employee reading", () => {
  it("does not open the employee drawer, by button or by link", async () => {
    actions = [];
    renderPage(`/app/availability?employeeId=${alex}&section=availability`);
    await screen.findByRole("navigation", { name: "Employees" });
    expect(within(detail()).queryByRole("button", { name: "Open profile" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Employee" })).toBeNull();
  });
});
