import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import type { Department, Job, JobAssignmentEmployee } from "@newfork/shared";
import { usLettersMessage } from "@newfork/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobCatalogEditor } from "./JobCatalogEditor";
import { JobAssignmentsDrawer } from "./JobAssignmentsDrawer";
import JobsSettingsPage from "./JobsSettingsPage";
import * as api from "./jobs-management-data";
import * as organization from "./organization-data";

vi.mock("./jobs-management-data", () => ({
  createDepartmentWithJobs: vi.fn(),
  createDepartmentJobs: vi.fn(),
  updateDepartmentWithJobs: vi.fn(),
  deleteJob: vi.fn(),
  loadJobCounts: vi.fn(),
  loadJobEmployees: vi.fn(),
  loadJobTargets: vi.fn(),
  saveJobDetails: vi.fn(),
  saveJobAssignments: vi.fn(),
}));
vi.mock("./organization-data", () => {
  // The one departments-and-jobs read answers from the two mocks the tests set.
  const listDepartments = vi.fn();
  const listJobs = vi.fn();
  return {
  listDepartments,
  listJobs,
  loadDepartmentsAndJobs: vi.fn(async (workspaceId: string) => ({
    departments: await listDepartments(workspaceId),
    jobs: await listJobs(workspaceId),
  })),
  saveDepartment: vi.fn(),
  saveJob: vi.fn(),
  setJobArchived: vi.fn(),
  setDepartmentArchived: vi.fn(),
};
});
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: {
      workspace: { id: "workspace" },
      permissions: [
        "workspace.manage",
        "settings.jobs.read",
        "settings.jobs.manage",
        "employees.read",
        "employees.manage",
      ],
    },
  }),
}));
vi.mock("./GeneralSettingsPage", () => ({
  errorText: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  SettingsHeader: ({
    title,
    action,
  }: {
    title: string;
    action: React.ReactNode;
  }) => (
    <header>
      <h1>{title}</h1>
      {action}
    </header>
  ),
}));

const departmentId = "12000000-0000-4000-8000-000000000001";
const jobId = "13000000-0000-4000-8000-000000000001";

const department = {
  id: departmentId,
  workspace_id: "workspace",
  name: "Service",
  color: "#3C7A68",
  archived_at: null,
} as Department;
const job = {
  ...department,
  id: jobId,
  name: "Server",
  department_id: department.id,
  color: "#4478A8",
} as Job;
function employee(index: number, assigned = false): JobAssignmentEmployee {
  return {
    employee_id: `employee-${index}`,
    display_name: `Employee ${index}`,
    employee_code: `E-${index}`,
    location_name: "Dining",
    display_status: "active",
    assigned,
    is_primary: assigned,
    revision: 1,
    can_manage: true,
    disabled_reason: null,
  };
}
function wrap(element: React.ReactNode, entry = "/app/settings/jobs") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rendered = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...rendered, client };
}
function editor(extra = {}) {
  const onClose = vi.fn();
  wrap(
    <JobCatalogEditor
      editor={{ type: "departments", ...extra }}
      workspaceId="workspace"
      departments={[department]}
      jobs={[job]}
      onClose={onClose}
      onSaved={async () => {}}
    />,
  );
  return onClose;
}
function drawer(archived = false) {
  const onClose = vi.fn();
  wrap(
    <JobAssignmentsDrawer
      workspaceId="workspace"
      job={{ ...job, archived_at: archived ? "2026-09-08" : null }}
      departments={[department]}
      onClose={onClose}
    />,
  );
  return onClose;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(organization.listDepartments).mockResolvedValue([department]);
  vi.mocked(organization.listJobs).mockResolvedValue([
    job,
    { ...job, id: "other", name: "Runner", department_id: null },
  ]);
  vi.mocked(api.loadJobCounts).mockResolvedValue({
    jobs: [{ id: job.id, employee_count: 2 }],
    departments: [{ id: department.id, employee_count: 2 }],
  });
  vi.mocked(api.loadJobEmployees).mockImplementation(
    async (_workspace, _job, query) => {
      const all = Array.from({ length: 125 }, (_, index) =>
        employee(index, index === 0),
      );
      const filtered = all.filter(
        (row) =>
          (!query.search || row.display_name === query.search) &&
          (query.filter === "all" ||
            row.assigned === (query.filter === "assigned")),
      );
      return {
        employees: filtered.slice(query.page * 50, query.page * 50 + 50),
        total: filtered.length,
        manageable_total: filtered.length,
        assigned_count: 1,
        locations: [],
      };
    },
  );
  vi.mocked(api.loadJobTargets).mockResolvedValue(
    Array.from({ length: 125 }, (_, index) => employee(index, index === 0)),
  );
  vi.mocked(api.saveJobAssignments).mockResolvedValue({
    changed_count: 1,
    unchanged_count: 0,
  });
  vi.mocked(api.saveJobDetails).mockResolvedValue({
    job,
    changed_count: 1,
    unchanged_count: 0,
  });
});
afterEach(cleanup);

describe("department job entry", () => {
  it("edits a department and adds jobs together, with close discarding the editor", async () => {
    const close = editor({ item: department });
    fireEvent.change(screen.getByLabelText("Department name"), {
      target: { value: "Dining" },
    });
    fireEvent.change(screen.getByLabelText("Job name 1"), {
      target: { value: "Host" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save department" }));
    await waitFor(() =>
      expect(api.updateDepartmentWithJobs).toHaveBeenCalledWith(
        "workspace",
        departmentId,
        {
          department: { name: "Dining", color: "#3C7A68" },
          jobs: [{ name: "Host", color: "#4478A8" }],
        },
      ),
    );
    await waitFor(() => expect(close).toHaveBeenCalled());
    cleanup();
    const escaped = editor({ item: department });
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    expect(escaped).toHaveBeenCalled();
  });
  it("Enter advances focus, keeps rows editable, and includes the last uncommitted job", async () => {
    editor();
    const name = screen.getByRole("textbox", { name: "Department name" });
    fireEvent.change(name, { target: { value: "Kitchen" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(document.activeElement).toBe(screen.getByLabelText("Job name 1"));
    fireEvent.change(screen.getByLabelText("Job name 1"), {
      target: { value: "Chef" },
    });
    fireEvent.change(screen.getByLabelText("Job color 1"), {
      target: { value: "#123456" },
    });
    fireEvent.keyDown(screen.getByLabelText("Job name 1"), { key: "Enter" });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Job name 2")),
    );
    expect(api.createDepartmentWithJobs).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Job name 2"), {
      target: { value: "Cook" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save department" }));
    await waitFor(() =>
      expect(api.createDepartmentWithJobs).toHaveBeenCalledWith("workspace", {
        department: { name: "Kitchen", color: "#3C7A68" },
        jobs: [
          { name: "Chef", color: "#123456" },
          { name: "Cook", color: "#4478A8" },
        ],
      }),
    );
  });
  it("existing department Add keeps form open and atomically saves multiple jobs", async () => {
    const close = editor({ type: "jobs", departmentId: department.id });
    expect(screen.queryByLabelText("Department name")).toBeNull();
    fireEvent.change(screen.getByLabelText("Job name 1"), {
      target: { value: "Chef" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByLabelText("Job name 2");
    expect(close).not.toHaveBeenCalled();
    expect(api.createDepartmentJobs).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Job name 2"), {
      target: { value: "Cook" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save jobs" }));
    await waitFor(() =>
      expect(api.createDepartmentJobs).toHaveBeenCalledWith(
        "workspace",
        departmentId,
        [
          { name: "Chef", color: "#4478A8" },
          { name: "Cook", color: "#4478A8" },
        ],
      ),
    );
  });
  it("preserves the draft when the atomic save fails", async () => {
    vi.mocked(api.createDepartmentJobs).mockRejectedValue(
      new Error("Name already exists"),
    );
    const close = editor({ type: "jobs", departmentId: department.id });
    fireEvent.change(screen.getByLabelText("Job name 1"), {
      target: { value: "Chef" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save jobs" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Name already exists",
    );
    expect(
      (screen.getByLabelText("Job name 1") as HTMLInputElement).value,
    ).toBe("Chef");
    expect(close).not.toHaveBeenCalled();
  });
  it("rejects duplicate active job names without making a request", async () => {
    editor({ type: "jobs", departmentId: department.id });
    fireEvent.change(screen.getByLabelText("Job name 1"), {
      target: { value: "server" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save jobs" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "already exists",
    );
    expect(api.createDepartmentJobs).not.toHaveBeenCalled();
  });
});

// BL-503: KARARLAR "Form ve girdi kuralları (ABD)".
describe("department and job names under the US letter rule", () => {
  const saysUnder = (field: HTMLElement) => {
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      usLettersMessage,
    );
  };

  it("says it under a new job row and holds Save", () => {
    editor({ item: department });
    const row = screen.getByLabelText("Job name 1");
    fireEvent.change(row, { target: { value: "Aşçı" } });
    saysUnder(row);
    expect(screen.getByRole("button", { name: "Save department" })).toHaveProperty("disabled", true);
  });

});

describe("job assignment drawer", () => {
  it("shows Mert's V1 drawer words: Details, Not assigned, Save, no help line", async () => {
    drawer();
    await screen.findByLabelText("Assign Employee 0");
    expect(screen.getByText("Details")).toBeTruthy();
    expect(screen.getByText("1 employee assigned")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not assigned" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Unassigned" })).toBeNull();
    expect(screen.queryByText("Check to assign. Uncheck to remove.")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });
  it("has no bulk dropdown and still pages beyond 100 employees", async () => {
    drawer();
    await screen.findByLabelText("Assign Employee 0");
    expect(screen.queryByLabelText("Bulk assignment actions")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next employee page" }));
    await screen.findByLabelText("Assign Employee 50");
    fireEvent.click(screen.getByRole("button", { name: "Next employee page" }));
    expect(await screen.findByLabelText("Assign Employee 124")).toBeTruthy();
  });
  it("deletes an assigned job through one confirmed command and closes the drawer", async () => {
    vi.mocked(api.deleteJob).mockResolvedValue({ removed_count: 1 });
    const close = drawer();
    await screen.findByLabelText("Assign Employee 0");
    fireEvent.click(screen.getByRole("button", { name: "Delete job" }));
    expect(api.deleteJob).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("group", { name: /Delete/ })).getByRole(
        "button",
        {
          name: "Delete job",
        },
      ),
    );
    await waitFor(() =>
      expect(api.deleteJob).toHaveBeenCalledExactlyOnceWith("workspace", jobId),
    );
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(api.saveJobAssignments).not.toHaveBeenCalled();
  });
  it("preserves mixed changes across pages and saves only the target job deltas", async () => {
    drawer();
    fireEvent.click(await screen.findByLabelText("Assign Employee 0"));
    fireEvent.click(screen.getByLabelText("Assign Employee 1"));
    fireEvent.click(screen.getByRole("button", { name: "Next employee page" }));
    fireEvent.click(await screen.findByLabelText("Assign Employee 50"));
    fireEvent.click(
      screen.getByRole("button", { name: "Previous employee page" }),
    );
    expect(
      ((await screen.findByLabelText("Assign Employee 0")) as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(
      (screen.getByLabelText("Assign Employee 1") as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.saveJobDetails).toHaveBeenCalledWith("workspace", jobId, {
        changes: [
          { employee_id: "employee-0", assigned: false, expected_revision: 1 },
          { employee_id: "employee-1", assigned: true, expected_revision: 1 },
          { employee_id: "employee-50", assigned: true, expected_revision: 1 },
        ],
      }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("filter changes keep pending removals visible until save, and conflict keeps the draft", async () => {
    vi.mocked(api.saveJobDetails).mockRejectedValue(
      new Error("Employee changed. Reload and review."),
    );
    drawer();
    await screen.findByLabelText("Assign Employee 0");
    fireEvent.click(screen.getByRole("button", { name: "Assigned" }));
    fireEvent.click(await screen.findByLabelText("Assign Employee 0"));
    expect(screen.getByLabelText("Assign Employee 0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Employee changed",
    );
    expect(screen.getByText("0 to assign · 1 to remove")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search employees"), {
      target: { value: "Employee 99" },
    });
    expect(screen.getByText("0 to assign · 1 to remove")).toBeTruthy();
  });
  it("protects dirty dismissal and disables protected/archived changes", async () => {
    const close = drawer();
    fireEvent.click(await screen.findByLabelText("Assign Employee 0"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    cleanup();
    drawer(true);
    expect(
      ((await screen.findByLabelText("Assign Employee 0")) as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });
});

describe("catalog navigation", () => {
  it("sorts job names and employee counts both ways", async () => {
    const { container } = wrap(
      <>
        <JobsSettingsPage />
        <Url />
      </>,
      "/app/settings/jobs?view=jobs",
    );
    await waitFor(() =>
      expect(container.querySelectorAll(".job-catalog-row").length).toBe(2),
    );
    await screen.findByRole("button", { name: "Sort by Job" });
    const names = () =>
      [...container.querySelectorAll(".job-catalog-row .job-row-name")].map(
        (node) => node.textContent,
      );
    fireEvent.click(screen.getByRole("button", { name: "Sort by Job" }));
    expect(names()).toEqual(["Runner", "Server"]);
    fireEvent.click(screen.getByRole("button", { name: "Sort by Job" }));
    expect(names()).toEqual(["Server", "Runner"]);
    fireEvent.click(screen.getByRole("button", { name: "Sort by Employees" }));
    expect(names()).toEqual(["Runner", "Server"]);
    fireEvent.click(screen.getByRole("button", { name: "Sort by Employees" }));
    expect(names()).toEqual(["Server", "Runner"]);
  });

  // BL-475: departments and jobs come A to Z from the server and nobody moves
  // them by hand; the row menus keep Edit, Manage employees and Archive.
  it("offers no Move up or Move down and lists jobs in the server's order", async () => {
    vi.mocked(organization.listJobs).mockResolvedValue([
      { ...job, id: "bartender", name: "Bartender" },
      job,
      { ...job, id: "other", name: "Runner", department_id: null },
    ]);
    wrap(<JobsSettingsPage />);
    const service = await screen.findByRole("region", { name: "Service" });
    expect(
      within(service)
        .getAllByRole("button", { name: /^(Bartender|Server)$/ })
        .map((button) => button.textContent),
    ).toEqual(["Bartender", "Server"]);
    expect(screen.getByRole("button", { name: "Edit department" })).toBeTruthy();
    expect(screen.queryByText("Move up")).toBeNull();
    expect(screen.queryByText("Move down")).toBeNull();
  });

  it("says 1 job, not 1 jobs, for a department with one job", async () => {
    wrap(<JobsSettingsPage />);
    const service = await screen.findByRole("region", { name: "Service" });
    expect(within(service).getByText("1 job")).toBeTruthy();
    expect(screen.queryByText(/1 jobs/)).toBeNull();
  });
  function Url() {
    return <output data-testid="url">{useLocation().search}</output>;
  }
  it("offers one Add menu in All and closes the editor when switching views", async () => {
    wrap(<JobsSettingsPage />);
    await screen.findByRole("region", { name: "Service" });
    const add = screen.getByRole("button", { name: "Add" });
    expect(screen.queryByRole("button", { name: "Add department" })).toBeNull();
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("button", { name: "Department" }));
    expect(screen.getByRole("form", { name: "Add department" })).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByLabelText("Department name"),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Jobs" }));
    expect(screen.queryByRole("form", { name: "Add department" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add job" }));
    expect(screen.getByRole("dialog", { name: "Add job" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Departments" }));
    expect(screen.queryByRole("dialog", { name: "Add job" })).toBeNull();
  });
  it("defaults to All, searches children with parent context and persists view in URL", async () => {
    wrap(
      <>
        <JobsSettingsPage />
        <Url />
      </>,
    );
    expect(
      (await screen.findByRole("tab", { name: "All" })).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
    await screen.findByRole("region", { name: "No department" });
    fireEvent.change(screen.getByLabelText("Search jobs and departments"), {
      target: { value: "Server" },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "No department" }),
      ).toBeNull(),
    );
    expect(
      within(screen.getByRole("region", { name: "Service" })).getByRole(
        "button",
        { name: "Server" },
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Jobs" }));
    expect(screen.getByTestId("url").textContent).toContain("view=jobs");
    expect(screen.getByTestId("url").textContent).toContain("q=Server");
  });
});
