import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext, EmployeeSummary } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import EmployeesPage from "./EmployeesPage";
import { listEmployees } from "./employee-data";

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
  onboarding: { status: "complete", currentStep: 2 },
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
  },
] satisfies EmployeeSummary[];

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("./employee-data", () => ({ listEmployees: vi.fn() }));
vi.mock("./EmployeeDrawer", () => ({
  EmployeeDrawer: () => <div role="dialog">Employee drawer</div>,
}));

function renderPage() {
  window.localStorage.clear();
  vi.mocked(listEmployees).mockResolvedValue(employees);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/employees"]}>
        <EmployeesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("EmployeesPage", () => {
  it("lets managers personalize table columns without losing the directory row", async () => {
    renderPage();

    expect(await screen.findByText("Alex Kim")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Access" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Invite email" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    fireEvent.click(screen.getByLabelText("Access"));

    await waitFor(() =>
      expect(screen.queryByRole("columnheader", { name: "Access" })).toBeNull(),
    );
    expect(screen.getByText("Alex Kim")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByRole("columnheader", { name: "Invite email" })).toBeTruthy();
    expect(screen.getByText("alex@example.test")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.queryByRole("columnheader", { name: "Invite email" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Access" })).toBeTruthy();
  });
});
