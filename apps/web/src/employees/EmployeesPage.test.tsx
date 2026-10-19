import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ActiveWorkspaceContext, EmployeeSummary } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmployeesPage from "./EmployeesPage";
import { listEmployees } from "./employee-data";

import { RequestError } from "../lib/request-error";
import { stubPhoneWidth } from "../lib/phone-width.test-util";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

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
    access: { employee: false, management: "owner" },
    status: "active",
  },
  permissions: ["employees.read", "employees.manage"],
  actions: ["employee.list", "employee.read", "employee.create"],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const employees = [
  {
    id: "15000000-0000-4000-8000-000000000001",
    workspace_id: workspaceId,
    employee_code: "NF-001",
    first_name: "Alex",
    last_name: "Kim",
    preferred_name: "",
    display_name: "Alex Kim",
    invitation_email: "alex@example.test",
    start_date: "2027-01-05",
    locations: [{ id: "11000000-0000-4000-8000-000000000001", name: "Main Dining", primary: true }],
    primary_job_id: "22000000-0000-4000-8000-000000000001",
    primary_job_name: "Server",
    job_count: 1,
    management_access: false,
    employee_access: true,
    display_status: "active",
    archived_at: null,
    revision: 1,
  },
  {
    id: "15000000-0000-4000-8000-000000000002",
    workspace_id: workspaceId,
    employee_code: "NF-002",
    first_name: "Blair",
    last_name: "Patel",
    preferred_name: "",
    display_name: "Blair Patel",
    invitation_email: null,
    start_date: null,
    locations: [{ id: "11000000-0000-4000-8000-000000000002", name: "Patio", primary: true }],
    primary_job_id: "22000000-0000-4000-8000-000000000002",
    primary_job_name: "Host",
    job_count: 1,
    management_access: false,
    employee_access: false,
    display_status: "invited",
    archived_at: null,
    revision: 1,
  },
] satisfies EmployeeSummary[];

let currentContext: ActiveWorkspaceContext = context;
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context: currentContext }) }));
vi.mock("./employee-data", () => ({ listEmployees: vi.fn() }));
vi.mock("./EmployeeDrawer", () => ({
  EmployeeDrawer: () => <div role="dialog">Employee drawer</div>,
}));

// The table's rows; a phone's cards (G2) name the same people again.
const inTable = () => within(screen.getByRole("table"));

function renderPage(initialEntry = "/app/employees", data: EmployeeSummary[] = employees) {
  window.localStorage.clear();
  currentContext = context;
  vi.mocked(listEmployees).mockResolvedValue(data);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <EmployeesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("EmployeesPage", () => {
  // KARARLAR S-179: the Access column names the app a person reaches, not their rank.
  it("names the app each person reaches in the Access column", async () => {
    const alex: EmployeeSummary = employees[0]!;
    const blair: EmployeeSummary = employees[1]!;
    renderPage("/app/employees", [
      { ...alex, id: "15000000-0000-4000-8000-000000000003", display_name: "Cam Lee", management_access: true, employee_access: true },
      { ...alex, id: "15000000-0000-4000-8000-000000000004", display_name: "Dee Ross", management_access: true, employee_access: false },
      alex,
      blair,
    ]);
    expect(await inTable().findByText("Cam Lee")).toBeTruthy();
    const access = (name: string) =>
      within(inTable().getByText(name).closest("tr")!).getAllByRole("cell").map((cell) => cell.textContent);
    expect(access("Cam Lee")).toContain("Management + Employee");
    expect(access("Dee Ross")).toContain("Management");
    expect(access("Alex Kim")).toContain("Employee");
    expect(access("Blair Patel")).toContain("No access");
    expect(screen.queryByText("No app access")).toBeNull();
  });

  it("lets managers personalize table columns without losing the directory row", async () => {
    renderPage();

    expect(await inTable().findByText("Alex Kim")).toBeTruthy();
    const table = screen.getByRole("table");
    expect(screen.getByRole("columnheader", { name: "Access" })).toBeTruthy();
    expect(
      screen.queryByRole("columnheader", { name: "Invite email" }),
    ).toBeNull();
    expect(within(table).getByText("Main Dining")).toBeTruthy();
    expect(within(table).getByText("Server")).toBeTruthy();
    expect(within(table).getByText("No access")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Table column settings" }),
    );
    fireEvent.click(screen.getByLabelText("Access"));

    await waitFor(() =>
      expect(screen.queryByRole("columnheader", { name: "Access" })).toBeNull(),
    );
    expect(inTable().getByText("Alex Kim")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(
      screen.getByRole("columnheader", { name: "Invite email" }),
    ).toBeTruthy();
    expect(screen.getByText("alex@example.test")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(
      screen.queryByRole("columnheader", { name: "Invite email" }),
    ).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Access" })).toBeTruthy();
  });

  it("places view tabs above search with an icon-only column settings control", async () => {
    const { container } = renderPage();

    expect(await inTable().findByText("Alex Kim")).toBeTruthy();
    const toolbar = container.querySelector(".employees-toolbar");
    expect(toolbar).toBeTruthy();
    expect(
      toolbar?.children[0]?.classList.contains("employee-toolbar-controls"),
    ).toBe(true);
    expect(
      toolbar?.children[1]?.classList.contains("catalog-toolbar-filter-row"),
    ).toBe(true);
    expect(
      screen.getByPlaceholderText("Search name, location, or job"),
    ).toBeTruthy();

    const controls = toolbar!.children[0] as HTMLElement;
    expect(
      within(controls).getByRole("group", { name: "Employee status" }),
    ).toBeTruthy();
    const settingsButton = within(controls).getByRole("button", {
      name: "Table column settings",
    });
    expect(settingsButton.textContent).toBe("");

    const filterRow = toolbar!.children[1] as HTMLElement;
    expect(
      within(filterRow).getByRole("combobox", {
        name: "Filter employees by location",
      }),
    ).toBeTruthy();
    expect(
      within(filterRow).getByRole("textbox", { name: "Search employees" }),
    ).toBeTruthy();
  });

  it("exits archive mode from the page tabs without a sidebar reload", async () => {
    renderPage("/app/employees/archive?q=alex");

    expect(
      await screen.findByRole("heading", { name: "Employees" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Active" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Employees" })).toBeTruthy(),
    );
    await waitFor(() =>
      expect(listEmployees).toHaveBeenLastCalledWith(
        workspaceId,
        false,
        "alex",
        "active",
      ),
    );
  });
});

describe("no access (FB-6.1.9)", () => {
  it("shows the no-access card, not the raw error, when the API refuses employees (FB-6.1.9)", async () => {
    vi.mocked(listEmployees).mockRejectedValueOnce(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to Employees" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});

// Loading and error in the "B" look (Mert 2026-10-14).
describe("EmployeesPage loading and error", () => {
  // The answers are queued before rendering; the client is returned so a test can refresh.
  function renderQueued(initialEntry = "/app/employees") {
    window.localStorage.clear();
    currentContext = context;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <EmployeesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return client;
  }

  it("shows the list's grey outline under the column headers while employees load", async () => {
    vi.mocked(listEmployees).mockReset().mockReturnValue(new Promise(() => {}));
    renderQueued();
    const outline = await screen.findByRole("status");
    expect(outline.textContent).toBe("Loading employees");
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(0);
    expect(screen.queryByText("Loading employees...")).toBeNull();
  });

  it("shows the card with Try again, not the raw error, when employees fail to load", async () => {
    vi.mocked(listEmployees)
      .mockReset()
      .mockRejectedValueOnce(new RequestError("connect ECONNREFUSED", "network", undefined, 503))
      .mockResolvedValue(employees);
    renderQueued();
    expect(await screen.findByRole("heading", { name: "We couldn't load employees" })).toBeTruthy();
    expect(screen.getByText("The employee list didn't load. Nothing was changed.")).toBeTruthy();
    expect(screen.queryByText("connect ECONNREFUSED")).toBeNull();
    expect(screen.queryByRole("heading", { name: "No employees yet" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await inTable().findByText("Alex Kim")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "We couldn't load employees" })).toBeNull();
  });

  it("keeps the last list and says so when a refresh fails", async () => {
    vi.mocked(listEmployees).mockReset().mockResolvedValueOnce(employees);
    const client = renderQueued();
    expect(await inTable().findByText("Alex Kim")).toBeTruthy();
    vi.mocked(listEmployees)
      .mockRejectedValueOnce(new RequestError("Gateway timeout", "network", undefined, 504))
      .mockResolvedValue(employees);
    await act(async () => {
      await client.refetchQueries();
    });
    const line = await screen.findByRole("alert");
    expect(line.textContent).toContain("The employee list didn't refresh. This is the last list that loaded.");
    expect(inTable().getByText("Alex Kim")).toBeTruthy();
    expect(screen.queryByText("Gateway timeout")).toBeNull();
    fireEvent.click(within(line).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(listEmployees).toHaveBeenCalledTimes(3);
  });

  it("still says the last list was empty when a refresh fails", async () => {
    vi.mocked(listEmployees).mockReset().mockResolvedValueOnce([]);
    const client = renderQueued();
    expect(await screen.findByRole("heading", { name: "No employees yet" })).toBeTruthy();
    vi.mocked(listEmployees).mockRejectedValue(new RequestError("Gateway timeout", "network", undefined, 504));
    await act(async () => {
      await client.refetchQueries();
    });
    expect((await screen.findByRole("alert")).textContent).toContain("The employee list didn't refresh.");
    expect(screen.getByRole("heading", { name: "No employees yet" })).toBeTruthy();
  });
});

// FB-6.2 .7a: "Add employee" is the core's answer, not the permission list.
describe("EmployeesPage add employee", () => {
  it("offers Add employee when the core lets the reader create somebody", async () => {
    renderPage();
    currentContext = { ...context, permissions: ["employees.read"] };
    expect(await inTable().findByText("Alex Kim")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add employee" })).toBeTruthy();
  });

  it("hides Add employee when the core does not, whatever the permissions", async () => {
    renderPage();
    currentContext = {
      ...context,
      actions: context.actions.filter((action) => action !== "employee.create"),
    };
    expect(await inTable().findByText("Alex Kim")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add employee" })).toBeNull();
  });

  // Mert 2026-10-14: a phone puts "+ Add" beside the location list, the search under both.
  describe("on a phone", () => {
    afterEach(() => vi.unstubAllGlobals());
    it("keeps Add employee after the search on a computer", async () => {
      renderPage();
      expect(await inTable().findByText("Alex Kim")).toBeTruthy();
      const add = screen.getByRole("button", { name: "Add employee" });
      expect(add.previousElementSibling?.classList.contains("toolbar-search")).toBe(true);
    });
    it("puts Add employee right after the location list", async () => {
      stubPhoneWidth();
      renderPage();
      await screen.findAllByText("Alex Kim");
      const add = screen.getByRole("button", { name: "Add employee" });
      expect(add.previousElementSibling).toBe(
        screen.getByRole("combobox", { name: "Filter employees by location" }),
      );
      expect(add.nextElementSibling?.classList.contains("toolbar-search")).toBe(true);
    });
  });
});

// EKRAN-03 C1a: the shared list language, pagination and keyboard fixes.
describe("EmployeesPage list (EKRAN-03 C1a)", () => {
  it("puts a green Add employee at the right end of the filter row, not in the header (G1)", async () => {
    const { container } = renderPage();
    expect(await inTable().findByText("Alex Kim")).toBeTruthy();
    const add = screen.getByRole("button", { name: "Add employee" });
    expect(add.closest(".catalog-toolbar-filter-row")).toBeTruthy();
    expect(add.className).toContain("list-add-action");
    expect(container.querySelector(".catalog-page-header")?.contains(add)).toBe(false);
    expect(container.querySelector(".employees-page")?.classList.contains("list-page")).toBe(true);
  });

  it("says just Add on a phone, keeping Add employee as the button's name (Mert 2026-10-13)", async () => {
    renderPage();
    expect(await inTable().findByText("Alex Kim")).toBeTruthy();
    const add = screen.getByRole("button", { name: "Add employee" });
    expect(add.querySelector(".list-add-short")?.textContent).toBe("Add");
    expect(add.querySelector(".list-add-long")?.textContent).toBe("Add employee");
  });

  it("marks the chosen status tab with aria-pressed (L3)", async () => {
    renderPage("/app/employees?status=invited");
    expect(await inTable().findByText("Blair Patel")).toBeTruthy();
    const group = screen.getByRole("group", { name: "Employee status" });
    expect(within(group).getByRole("button", { name: "Invited" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(group).getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("closes the column picker with Escape and gives focus back to its button (L7)", async () => {
    renderPage();
    expect(await inTable().findByText("Alex Kim")).toBeTruthy();
    const trigger = screen.getByRole("button", { name: "Table column settings" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Employee table columns" })).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText("Access"), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Employee table columns" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the chosen location in the list when the tab has nobody there (L11)", async () => {
    renderPage(`/app/employees?location=${employees[0]!.locations[0]!.id}`);
    expect(await inTable().findByText("Alex Kim")).toBeTruthy();
    vi.mocked(listEmployees).mockResolvedValue([employees[1]!]);
    fireEvent.click(screen.getByRole("button", { name: "Invited" }));
    await waitFor(() => expect(listEmployees).toHaveBeenLastCalledWith(workspaceId, false, "", "invited"));
    const select = screen.getByRole("combobox", { name: "Filter employees by location" }) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe(employees[0]!.locations[0]!.id));
    expect(within(select).getByRole("option", { name: "Main Dining" })).toBeTruthy();
  });

  // BL-436 / K6: the filter means "works here", not "works here first".
  const mainDining = employees[0]!.locations[0]!;
  const patio = employees[1]!.locations[0]!;
  const casey = {
    ...employees[0]!,
    id: "15000000-0000-4000-8000-000000000003",
    employee_code: "NF-003",
    first_name: "Casey",
    last_name: "Owner",
    display_name: "Casey Owner",
    // The owner works everywhere with no primary.
    locations: [{ ...mainDining, primary: false }, { ...patio, primary: false }],
  };
  const drew = {
    ...employees[0]!,
    id: "15000000-0000-4000-8000-000000000004",
    employee_code: "NF-004",
    first_name: "Drew",
    last_name: "Lee",
    display_name: "Drew Lee",
    // Works at Patio first and at Rooftop, where nobody else works.
    locations: [patio, { id: "11000000-0000-4000-8000-000000000003", name: "Rooftop", primary: false }],
  };
  const remote = {
    ...employees[0]!,
    id: "15000000-0000-4000-8000-000000000005",
    employee_code: "NF-005",
    first_name: "Remy",
    last_name: "Stone",
    display_name: "Remy Stone",
    locations: [],
  };
  const team = [...employees, casey, drew, remote];
  const names = () => team.map((person) => person.display_name).filter((name) => inTable().queryByText(name));

  it("lists everybody who works at the chosen location, the owner and a second location included (BL-436)", async () => {
    renderPage(`/app/employees?location=${patio.id}`, team);
    expect(await inTable().findByText("Blair Patel")).toBeTruthy();
    expect(names()).toEqual(["Blair Patel", "Casey Owner", "Drew Lee"]);
  });

  it("offers a location somebody works at only as a second one (BL-436)", async () => {
    renderPage("/app/employees", team);
    expect(await inTable().findByText("Alex Kim")).toBeTruthy();
    const select = screen.getByRole("combobox", { name: "Filter employees by location" }) as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual([
      "All locations",
      "Main Dining",
      "Patio",
      "Rooftop",
      "No location",
    ]);
    fireEvent.change(select, { target: { value: "11000000-0000-4000-8000-000000000003" } });
    await waitFor(() => expect(names()).toEqual(["Drew Lee"]));
  });

  it("lists who works nowhere under No location (K6)", async () => {
    renderPage("/app/employees?location=none", team);
    expect(await inTable().findByText("Remy Stone")).toBeTruthy();
    expect(names()).toEqual(["Remy Stone"]);
  });

  it("says No matching employees on an empty status tab, not No employees yet (L26)", async () => {
    renderPage("/app/employees?status=onboarding", []);
    expect(await screen.findByText("No matching employees")).toBeTruthy();
    expect(screen.queryByText("No employees yet")).toBeNull();
  });

  it("opens a row with Space as well as Enter (E3-17)", async () => {
    renderPage();
    const row = (await inTable().findByText("Alex Kim")).closest("tr")!;
    fireEvent.keyDown(row, { key: " " });
    expect(await screen.findByText("Employee drawer")).toBeTruthy();
  });

  it("draws one card per person for a phone: name, where · job, status (G2, Mert 2026-10-13)", async () => {
    const twoPlaces = {
      ...employees[0]!,
      locations: [
        { id: "11000000-0000-4000-8000-000000000001", name: "Main Dining", primary: true },
        { id: "11000000-0000-4000-8000-000000000002", name: "Patio", primary: false },
      ],
      job_count: 2,
    };
    const nowhere = { ...employees[1]!, locations: [] };
    renderPage("/app/employees", [twoPlaces, nowhere]);
    const cards = await screen.findByRole("list", { name: "Employees" });
    const alex = within(cards).getByRole("button", { name: "Alex Kim, Active, Main Dining +1, Server +1" });
    expect(alex.querySelector(".list-card-line")?.textContent).toBe("Main Dining +1 · Server +1");
    expect(alex.querySelector(".list-chip")?.getAttribute("data-tone")).toBe("green");
    const blair = within(cards).getByRole("button", { name: /^Blair Patel, Invited/ });
    expect(blair.querySelector(".list-card-line")?.textContent).toBe("No location · Host");
    expect(blair.querySelector(".list-chip")?.getAttribute("data-tone")).toBe("amber");
    fireEvent.click(alex);
    expect(await screen.findByText("Employee drawer")).toBeTruthy();
  });

  it("draws no cards for an empty list, so its empty line shows (G2)", async () => {
    renderPage("/app/employees?status=onboarding", []);
    expect(await screen.findByText("No matching employees")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Employees" })).toBeNull();
  });

  it("shows 50 people a page and the page numbers under a long list (K-S9)", async () => {
    const many = Array.from({ length: 120 }, (_, index) => ({
      ...employees[0]!,
      id: `15000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
      employee_code: `NF-${index + 100}`,
      display_name: `Person ${String(index + 1).padStart(3, "0")}`,
    }));
    renderPage("/app/employees", many);
    expect(await inTable().findByText("Person 001")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Pages" });
    expect(within(nav).getByText("1–50 of 120")).toBeTruthy();
    expect(within(nav).getAllByRole("button", { name: /^Page \d$/ }).map((b) => b.textContent)).toEqual(["1", "2", "3"]);
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(50);
    fireEvent.click(within(nav).getByRole("button", { name: "Page 3" }));
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(20);
    expect(inTable().getByText("Person 120")).toBeTruthy();
  });
});
