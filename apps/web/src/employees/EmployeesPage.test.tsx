import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ActiveWorkspaceContext, EmployeeSummary } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import EmployeesPage from "./EmployeesPage";
import { listEmployees } from "./employee-data";

import { RequestError } from "../lib/request-error";
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
    role: "owner",
    status: "active",
    allLocations: true,
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
    primary_location_id: "11000000-0000-4000-8000-000000000001",
    primary_location_name: "Main Dining",
    location_count: 1,
    primary_job_id: "22000000-0000-4000-8000-000000000001",
    primary_job_name: "Server",
    job_count: 1,
    role_name: "Employee",
    display_status: "active",
    archived_at: null,
    revision: 1,
    managed_location_names: [],
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
    primary_location_id: "11000000-0000-4000-8000-000000000002",
    primary_location_name: "Patio",
    location_count: 1,
    primary_job_id: "22000000-0000-4000-8000-000000000002",
    primary_job_name: "Host",
    job_count: 1,
    role_name: null,
    display_status: "invited",
    archived_at: null,
    revision: 1,
    managed_location_names: [],
  },
] satisfies EmployeeSummary[];

let currentContext: ActiveWorkspaceContext = context;
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context: currentContext }) }));
vi.mock("./employee-data", () => ({ listEmployees: vi.fn() }));
vi.mock("./EmployeeDrawer", () => ({
  EmployeeDrawer: () => <div role="dialog">Employee drawer</div>,
}));

function renderPage(initialEntry = "/app/employees") {
  window.localStorage.clear();
  currentContext = context;
  vi.mocked(listEmployees).mockResolvedValue(employees);
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
  it("lets managers personalize table columns without losing the directory row", async () => {
    renderPage();

    expect(await screen.findByText("Alex Kim")).toBeTruthy();
    const table = screen.getByRole("table");
    expect(screen.getByRole("columnheader", { name: "Access" })).toBeTruthy();
    expect(
      screen.queryByRole("columnheader", { name: "Invite email" }),
    ).toBeNull();
    expect(within(table).getByText("Main Dining")).toBeTruthy();
    expect(within(table).getByText("Server")).toBeTruthy();
    expect(within(table).getByText("No app access")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Table column settings" }),
    );
    fireEvent.click(screen.getByLabelText("Access"));

    await waitFor(() =>
      expect(screen.queryByRole("columnheader", { name: "Access" })).toBeNull(),
    );
    expect(screen.getByText("Alex Kim")).toBeTruthy();

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

    expect(await screen.findByText("Alex Kim")).toBeTruthy();
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
    expect(await screen.findByRole("heading", { name: "You don't have access to employees" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});

// FB-6.2 .7a: "Add employee" is the core's answer, not the permission list.
describe("EmployeesPage add employee", () => {
  it("offers Add employee when the core lets the reader create somebody", async () => {
    renderPage();
    currentContext = { ...context, permissions: ["employees.read"] };
    expect(await screen.findByText("Alex Kim")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add employee" })).toBeTruthy();
  });

  it("hides Add employee when the core does not, whatever the permissions", async () => {
    renderPage();
    currentContext = {
      ...context,
      actions: context.actions.filter((action) => action !== "employee.create"),
    };
    expect(await screen.findByText("Alex Kim")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add employee" })).toBeNull();
  });
});
