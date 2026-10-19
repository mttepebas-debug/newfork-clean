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
import { RequestError } from "../lib/request-error";
import { stubPhoneWidth } from "../lib/phone-width.test-util";

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
  system_key: null,
  lineup_icons: ["001-server"],
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
  // BL-1045: by its key, a department deleted meanwhile; the lists load again
  // and the draft stays. A refusal without the key reloads nothing.
  it.each([
    [new RequestError("This item was deleted. Reload the catalog.", "catalog.deleted", undefined, 409), 1],
    [new Error("Name already exists"), 0],
  ])("reloads the lists only for an item deleted meanwhile (%s)", async (refusal, reloads) => {
    vi.mocked(api.updateDepartmentWithJobs).mockRejectedValue(refusal);
    const onSaved = vi.fn(async () => {});
    const onClose = vi.fn();
    wrap(
      <JobCatalogEditor
        editor={{ type: "departments", item: department }}
        workspaceId="workspace"
        departments={[department]}
        jobs={[job]}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );
    fireEvent.change(screen.getByLabelText("Department name"), { target: { value: "Dining" } });
    fireEvent.click(screen.getByRole("button", { name: "Save department" }));
    expect((await screen.findByRole("alert")).textContent).toContain(refusal.message);
    expect(onSaved).toHaveBeenCalledTimes(reloads);
    expect((screen.getByLabelText("Department name") as HTMLInputElement).value).toBe("Dining");
    expect(onClose).not.toHaveBeenCalled();
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

  it("says it under an existing department's name and holds Save until it is fixed", () => {
    editor({ item: department });
    const name = screen.getByLabelText("Department name");
    fireEvent.change(name, { target: { value: "Aşçı" } });
    saysUnder(name);
    expect(screen.getByRole("button", { name: "Save department" })).toHaveProperty("disabled", true);
    fireEvent.change(name, { target: { value: "Kitchen" } });
    expect(name.getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByRole("button", { name: "Save department" })).toHaveProperty("disabled", false);
  });

  it("says it under a job's name in the Jobs drawer and holds Save", async () => {
    wrap(
      <JobAssignmentsDrawer
        workspaceId="workspace"
        job={job}
        departments={[department]}
        onClose={vi.fn()}
      />,
    );
    const name = screen.getByLabelText("Job name");
    fireEvent.change(name, { target: { value: "Aşçı" } });
    saysUnder(name);
    // Even with a person's change waiting, Save stays off.
    fireEvent.click(await screen.findByLabelText("Assign Employee 1"));
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    fireEvent.change(name, { target: { value: "Cook" } });
    expect(name.getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);
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
  // Mert's comments on the Jobs page, 2026-10-14.
  it("puts the assignment tabs above the search, says nothing when nothing is pending, and shows no Primary tag", async () => {
    drawer();
    await screen.findByLabelText("Assign Employee 0");
    const tabs = screen.getByRole("button", { name: "Not assigned" });
    const search = screen.getByLabelText("Search employees");
    expect(tabs.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Primary")).toBeNull();
    expect(screen.queryByText("No pending changes")).toBeNull();
    const summary = document.querySelector(".job-change-summary") as HTMLElement;
    expect(summary.getAttribute("aria-live")).toBe("polite");
    expect(summary.textContent).toBe("");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Assign Employee 1"));
    expect(screen.getByText("1 to assign · 0 to remove")).toBeTruthy();
  });
  it("shows no pager when every employee fits on one page", async () => {
    vi.mocked(api.loadJobEmployees).mockResolvedValue({
      employees: Array.from({ length: 16 }, (_, index) => employee(index)),
      total: 16,
      manageable_total: 16,
      assigned_count: 0,
      locations: [],
    });
    drawer();
    await screen.findByLabelText("Assign Employee 15");
    fireEvent.scroll(screen.getByRole("region", { name: "Employee list" }));
    expect(api.loadJobEmployees).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("1–16 of 16")).toBeNull();
  });
  it("has no bulk dropdown or pager and loads beyond 100 employees on scroll", async () => {
    drawer();
    await screen.findByLabelText("Assign Employee 0");
    expect(screen.queryByLabelText("Bulk assignment actions")).toBeNull();
    expect(screen.queryByRole("button", { name: /employee page/ })).toBeNull();
    expect(screen.queryByLabelText("Assign Employee 50")).toBeNull();
    const list = screen.getByRole("region", { name: "Employee list" });
    fireEvent.scroll(list);
    await screen.findByLabelText("Assign Employee 50");
    expect(screen.getByLabelText("Assign Employee 0")).toBeTruthy();
    fireEvent.scroll(list);
    expect(await screen.findByLabelText("Assign Employee 124")).toBeTruthy();
    fireEvent.scroll(list);
    expect(api.loadJobEmployees).toHaveBeenCalledTimes(3);
  });
  it("loads the next employees only near the end of the list", async () => {
    drawer();
    await screen.findByLabelText("Assign Employee 0");
    const list = screen.getByRole("region", { name: "Employee list" });
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 3000 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 400 });
    list.scrollTop = 0;
    fireEvent.scroll(list);
    expect(api.loadJobEmployees).toHaveBeenCalledTimes(1);
    list.scrollTop = 2400;
    fireEvent.scroll(list);
    expect(await screen.findByLabelText("Assign Employee 50")).toBeTruthy();
  });
  it("stops loading on its own after the next employees fail", async () => {
    const loaded = vi.mocked(api.loadJobEmployees).getMockImplementation()!;
    vi.mocked(api.loadJobEmployees).mockImplementation(async (workspace, job, query) => {
      if (query.page > 0) throw new Error("Network down");
      return loaded(workspace, job, query);
    });
    const proto = Element.prototype;
    const height = Object.getOwnPropertyDescriptor(proto, "scrollHeight");
    const client = Object.getOwnPropertyDescriptor(proto, "clientHeight");
    Object.defineProperty(proto, "scrollHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => 400 });
    try {
      drawer();
      await screen.findByRole("alert");
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(api.loadJobEmployees).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(proto, "scrollHeight", height!);
      Object.defineProperty(proto, "clientHeight", client!);
    }
  });
  it("keeps loaded employees when the next ones fail and retries them", async () => {
    drawer();
    await screen.findByLabelText("Assign Employee 0");
    const loaded = vi.mocked(api.loadJobEmployees).getMockImplementation()!;
    vi.mocked(api.loadJobEmployees).mockRejectedValueOnce(new Error("Network down"));
    fireEvent.scroll(screen.getByRole("region", { name: "Employee list" }));
    const alert = await screen.findByRole("alert");
    expect(screen.getByLabelText("Assign Employee 0")).toBeTruthy();
    vi.mocked(api.loadJobEmployees).mockImplementation(loaded);
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Assign Employee 50")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
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
  it("preserves mixed changes across loaded pages and saves only the target job deltas", async () => {
    drawer();
    fireEvent.click(await screen.findByLabelText("Assign Employee 0"));
    fireEvent.click(screen.getByLabelText("Assign Employee 1"));
    fireEvent.scroll(screen.getByRole("region", { name: "Employee list" }));
    fireEvent.click(await screen.findByLabelText("Assign Employee 50"));
    expect(
      (screen.getByLabelText("Assign Employee 0") as HTMLInputElement).checked,
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
  // AVATAR-IKON: the database compares the drawings too, so the original the drawer sends carries them.
  it("saves a renamed job with the drawings it was read with as part of the original", async () => {
    drawer();
    fireEvent.change(await screen.findByLabelText("Job name"), {
      target: { value: "Head Server" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const details = { color: "#4478A8", department_id: department.id, lineup_icons: ["001-server"] };
    await waitFor(() =>
      expect(api.saveJobDetails).toHaveBeenCalledWith("workspace", jobId, {
        job: { name: "Head Server", ...details },
        expected_job: { name: "Server", ...details },
        changes: [],
      }),
    );
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
  // BL-1045: the database names the kind of refusal. Only "someone changed or
  // deleted it meanwhile" has something newer to load; any other refusal
  // keeps its sentence without a Reload latest that would change nothing.
  it.each([
    ["job.changed", 409, true],
    ["employee.revision_conflict", 409, true],
    ["employee.archived", 409, true],
    ["job.deleted", 409, true],
    ["department.deleted", 409, true],
    [undefined, 400, false],
    ["catalog.system_record", 400, false],
  ] as const)("offers Reload latest for a refusal keyed %s: %s", async (reason, status, offered) => {
    vi.mocked(api.saveJobDetails).mockRejectedValue(
      new RequestError("Not saved.", reason, undefined, status),
    );
    drawer();
    fireEvent.click(await screen.findByLabelText("Assign Employee 0"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Not saved.");
    expect(screen.queryByRole("button", { name: "Reload latest" }) !== null).toBe(offered);
  });
  it("protects dirty dismissal and disables protected/archived changes", async () => {
    const close = drawer();
    fireEvent.click(await screen.findByLabelText("Assign Employee 0"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
    // BL-659: Discard throws the edits away, so it is red; Keep editing white.
    expect(screen.getByRole("button", { name: "Discard changes" }).className).toBe(
      "job-danger-button",
    );
    expect(screen.getByRole("button", { name: "Keep editing" }).className).toBe(
      "job-secondary-button",
    );
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

// Settings → Jobs & departments in the shared list language (Mert's Jobs V1
// and his ten Jobs decisions, 2026-10-13/14).
describe("catalog navigation", () => {
  const bartender = { ...job, id: "bartender", name: "Bartender" } as Job;
  const runner = { ...job, id: "other", name: "Runner", department_id: null } as Job;
  function Url() {
    return <output data-testid="url">{useLocation().search}</output>;
  }
  function page(entry?: string) {
    return wrap(
      <>
        <JobsSettingsPage />
        <Url />
      </>,
      entry,
    );
  }
  const group = (name: string) => screen.getByRole("rowgroup", { name });
  const names = (scope: HTMLElement) =>
    [...scope.querySelectorAll(".job-catalog-row .job-row-name")].map((node) => node.textContent);
  afterEach(() => vi.unstubAllGlobals());

  it("has Jobs, Departments and Archived tabs and one table with a sub-heading per department", async () => {
    page();
    await screen.findByRole("rowgroup", { name: "Service" });
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Jobs", "Departments", "Archived"]);
    expect(screen.getByRole("tab", { name: "Jobs" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("Show archived")).toBeNull();
    expect(screen.queryByText("Collapse all")).toBeNull();
    expect(names(group("Service"))).toEqual(["Server"]);
    expect(names(group("No department"))).toEqual(["Runner"]);
    // "1 job", not "1 jobs".
    expect(within(group("Service")).getByText("1 job · 2 employees")).toBeTruthy();
    const add = screen.getByRole("button", { name: "New job" });
    expect(add.closest(".catalog-toolbar-filter-row")?.lastElementChild).toBe(add);
  });

  // Decision 3: a column sorts inside each department; A to Z by default.
  it("sorts inside each department, A to Z until a column is chosen", async () => {
    vi.mocked(organization.listJobs).mockResolvedValue([job, bartender, runner]);
    vi.mocked(api.loadJobCounts).mockResolvedValue({
      jobs: [
        { id: job.id, employee_count: 1 },
        { id: bartender.id, employee_count: 3 },
      ],
      departments: [{ id: department.id, employee_count: 4 }],
    });
    page();
    await screen.findByRole("rowgroup", { name: "Service" });
    expect(names(group("Service"))).toEqual(["Bartender", "Server"]);
    fireEvent.click(screen.getByRole("button", { name: "Job" }));
    expect(names(group("Service"))).toEqual(["Bartender", "Server"]);
    fireEvent.click(screen.getByRole("button", { name: "Job" }));
    expect(names(group("Service"))).toEqual(["Server", "Bartender"]);
    expect(names(group("No department"))).toEqual(["Runner"]);
    await screen.findByText("4 employees", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Employees" }));
    expect(names(group("Service"))).toEqual(["Server", "Bartender"]);
    // No separate clear button: the same heading goes descending, then back to A→Z.
    expect(screen.queryByRole("button", { name: "Clear column sorting" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Employees" }));
    fireEvent.click(screen.getByRole("button", { name: "Employees" }));
    expect(names(group("Service"))).toEqual(["Bartender", "Server"]);
  });

  it("filters to one department, and a new job starts in it", async () => {
    page();
    await screen.findByRole("rowgroup", { name: "Service" });
    fireEvent.change(screen.getByLabelText("Filter by department"), { target: { value: departmentId } });
    expect(screen.queryByRole("rowgroup", { name: "No department" })).toBeNull();
    expect(screen.getByTestId("url").textContent).toContain(`department=${departmentId}`);
    fireEvent.click(screen.getByRole("button", { name: "New job" }));
    const created = await screen.findByRole("dialog");
    expect((within(created).getByLabelText("Department") as HTMLSelectElement).value).toBe(departmentId);
  });

  it("searches jobs within their department and keeps the search in the URL", async () => {
    page();
    await screen.findByRole("rowgroup", { name: "No department" });
    fireEvent.change(screen.getByLabelText("Search jobs or departments"), { target: { value: "Server" } });
    await waitFor(() => expect(screen.queryByRole("rowgroup", { name: "No department" })).toBeNull());
    expect(names(group("Service"))).toEqual(["Server"]);
    expect(screen.getByTestId("url").textContent).toContain("q=Server");
  });

  // Decision 8: Department · Jobs · Employees; the jobs count opens the Jobs tab
  // filtered to the department.
  it("lists departments with a jobs count that opens the Jobs tab filtered to them", async () => {
    page("/app/settings/jobs?tab=departments");
    const show = await screen.findByRole("button", { name: "Show the 1 job in Service" });
    expect(screen.getByRole("tab", { name: "Departments" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "New department" })).toBeTruthy();
    fireEvent.click(show);
    expect(screen.getByRole("tab", { name: "Jobs" }).getAttribute("aria-selected")).toBe("true");
    expect((screen.getByLabelText("Filter by department") as HTMLSelectElement).value).toBe(departmentId);
    expect(screen.queryByRole("rowgroup", { name: "No department" })).toBeNull();
  });

  // Decision 6: archiving a department takes its active jobs with it; the
  // database does it, so the page writes the department alone.
  it("archives a department in one write and says its jobs go with it", async () => {
    vi.mocked(organization.setDepartmentArchived).mockResolvedValue(undefined);
    page();
    await screen.findByRole("rowgroup", { name: "Service" });
    const menu = within(group("Service"));
    expect(menu.getByText("Its 1 job will be archived too.")).toBeTruthy();
    fireEvent.click(menu.getByRole("button", { name: "Archive Service" }));
    expect(organization.setDepartmentArchived).not.toHaveBeenCalled();
    fireEvent.click(menu.getByRole("button", { name: "Confirm archive Service" }));
    await waitFor(() =>
      expect(organization.setDepartmentArchived).toHaveBeenCalledExactlyOnceWith("workspace", departmentId, true),
    );
    expect(organization.setJobArchived).not.toHaveBeenCalled();
  });

  it("shows archived departments and jobs in two groups and restores each with one click", async () => {
    const archivedDepartment = { ...department, archived_at: "2026-10-01T12:00:00Z" } as Department;
    const archivedJob = { ...job, archived_at: "2026-10-01T12:00:00Z" } as Job;
    vi.mocked(organization.listDepartments).mockResolvedValue([archivedDepartment]);
    vi.mocked(organization.listJobs).mockResolvedValue([archivedJob, runner]);
    vi.mocked(organization.setJobArchived).mockResolvedValue(undefined);
    page("/app/settings/jobs?tab=archived");
    const departments = await screen.findByRole("rowgroup", { name: "Archived departments" });
    expect(names(departments)).toEqual(["Service"]);
    expect(within(departments).getByRole("button", { name: "Restore Service" }).title).toBe("Comes back with no jobs");
    const jobs = group("Archived jobs");
    expect(names(jobs)).toEqual(["Server"]);
    expect(jobs.textContent).toContain("Service · archived");
    const restore = within(jobs).getByRole("button", { name: "Restore Server" });
    expect(restore.title).toBe("Comes back under No department");
    fireEvent.click(restore);
    await waitFor(() =>
      expect(organization.setJobArchived).toHaveBeenCalledExactlyOnceWith("workspace", jobId, false),
    );
    expect(organization.saveJob).not.toHaveBeenCalled();
  });

  // Departments and jobs share the Archived rows: no Name or Department column.
  it("titles no Name or Department column in Archived", async () => {
    vi.mocked(organization.listJobs).mockResolvedValue([{ ...job, archived_at: "2026-10-01T12:00:00Z" } as Job]);
    page("/app/settings/jobs?tab=archived");
    await screen.findByRole("button", { name: "Restore Server" });
    const headings = document.querySelector(".jobs-archived-row[role='row']") as HTMLElement;
    expect(headings.textContent).not.toMatch(/Name|Department/);
    expect(within(headings).getByRole("button", { name: "Archived" })).toBeTruthy();
    // The job's button keeps its own name; its department sits beside it.
    expect(screen.getByRole("button", { name: "Server" })).toBeTruthy();
  });

  it("leaves counts at — with no message when they don't load", async () => {
    vi.mocked(api.loadJobCounts).mockRejectedValue(new Error("offline"));
    page();
    const service = await screen.findByRole("rowgroup", { name: "Service" });
    await waitFor(() => expect(within(service).getByText("—")).toBeTruthy());
    expect(screen.queryByText("Employee counts didn't load.")).toBeNull();
    // Sorting by counts that didn't load would mean nothing.
    expect(screen.queryByRole("button", { name: "Employees" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("says a restored job goes back under its department while that department is active", async () => {
    vi.mocked(organization.listJobs).mockResolvedValue([{ ...job, archived_at: "2026-10-01T12:00:00Z" } as Job]);
    page("/app/settings/jobs?tab=archived");
    const restore = await screen.findByRole("button", { name: "Restore Server" });
    expect(restore.title).toBe("Comes back under Service");
    expect(screen.queryByRole("rowgroup", { name: "Archived departments" })).toBeNull();
  });

  it("opens a job's drawer from its row and keeps it in the URL", async () => {
    page();
    fireEvent.click(await screen.findByRole("button", { name: "Server" }));
    expect(await screen.findByRole("dialog", { name: "Edit job: Server" })).toBeTruthy();
    expect(screen.getByTestId("url").textContent).toContain(`jobId=${jobId}`);
  });

  // Decision 10: on a phone the add button sits in the tab row, right of Archived.
  it("puts New job in the tab row on a phone", async () => {
    stubPhoneWidth();
    page();
    await screen.findByRole("rowgroup", { name: "Service" });
    const add = screen.getByRole("button", { name: "New job" });
    expect(add.closest(".catalog-toolbar-status-row .catalog-tab-add")).toBeTruthy();
    expect(add.closest(".catalog-toolbar-filter-row")).toBeNull();
  });

  it("outlines the list while loading and offers Try again when it fails", async () => {
    vi.mocked(organization.listDepartments).mockRejectedValue(new Error("offline"));
    page();
    expect(screen.getByText("Loading jobs and departments")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "We couldn't load jobs and departments" })).toBeTruthy();
    vi.mocked(organization.listDepartments).mockResolvedValue([department]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("rowgroup", { name: "Service" })).toBeTruthy();
  });
});
