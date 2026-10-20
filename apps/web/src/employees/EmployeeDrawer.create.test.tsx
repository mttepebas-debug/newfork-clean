import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BrowserRouter, useLocation, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { managementAndOwnerRefusals, type EmployeeSection } from "@newfork/shared";
import { EmployeeDrawer } from "./EmployeeDrawer";
import {
  createEmployee,
  getEmployeeDetail,
  loadEmployeeReferenceData,
} from "./employee-data";

const ids = {
  workspace: "11000000-0000-4000-8000-000000000001",
  employee: "11000000-0000-4000-8000-000000000002",
  location: "11000000-0000-4000-8000-000000000003",
  job: "11000000-0000-4000-8000-000000000004",
  role: "11000000-0000-4000-8000-000000000005",
  custom: "11000000-0000-4000-8000-000000000006",
};
const roles = [
  {
    id: ids.role,
    name: "Employee",
    systemKey: "employee" as const,
    accessClass: "employee" as const,
  },
  {
    id: ids.custom,
    name: "Shift Lead",
    systemKey: null,
    accessClass: "manager" as const,
  },
];
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: {
      workspace: { id: "11000000-0000-4000-8000-000000000001" },
      membership: { access: { employee: false, management: "owner" } },
      permissions: ["employees.manage"],
      // The core's answer: inviting is employee.invite, not a permission key.
      actions: ["employee.create", "employee.invite"],
    },
  }),
}));
vi.mock("./employee-data", async (original) => ({
  ...(await original<object>()),
  createEmployee: vi.fn(),
  getEmployeeDetail: vi.fn(),
  loadEmployeeReferenceData: vi.fn(),
}));

function setup(initial: EmployeeSection = "profile") {
  const onCreated = vi.fn(),
    onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Harness() {
    const [section, setSection] = useState(initial);
    return (
      <EmployeeDrawer
        employeeId={null}
        creating
        section={section}
        onSectionChange={setSection}
        onCreated={onCreated}
        onClose={onClose}
      />
    );
  }
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  return { client, onCreated, onClose };
}
function fillNames() {
  fireEvent.change(screen.getByLabelText("First name"), {
    target: { value: "Ada" },
  });
  fireEvent.change(screen.getByLabelText("Last name"), {
    target: { value: "Lovelace" },
  });
}
function next() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}
function disabled(name: string) {
  return (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;
}

describe("employee create flow", () => {
  it("hides private contact fields without private Read permission", () => {
    setup();
    expect(screen.queryByLabelText("Phone")).toBeNull();
  });

  // K2 as changed by KK-205 (BL-777): a preferred name typed here was dropped
  // without a word. Nobody can fill it on a new employee, so it is not shown;
  // the employee asks for it in onboarding or their profile.
  // E10 (BL-669 3): what Employment lacks is said there, not on Profile
  // before the person has reached it.
  it("says a missing location or job only from the Employment step", () => {
    setup();
    fillNames();
    const blocker = () => document.querySelector('.window-alert[role="status"]');
    expect(blocker()).toBeNull();
    next();
    expect(blocker()?.textContent).toBeTruthy();
  });

  it("does not show Preferred name on a new employee", () => {
    setup();
    expect(screen.getByLabelText("First name")).toBeTruthy();
    expect(screen.queryByLabelText("Preferred name")).toBeNull();
  });

  it.each(["Enter", "Escape", "outside"])(
    "creates with Enter then closes unchanged with %s",
    async (closeMethod) => {
      const onClose = vi.fn();
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      vi.mocked(getEmployeeDetail).mockResolvedValue({
        id: ids.employee,
        workspace_id: ids.workspace,
        employee_code: "NF-101",
        first_name: "Ada",
        last_name: "Lovelace",
        preferred_name: "",
        display_name: "Ada Lovelace",
        invitation_email: null,
        start_date: null,
        internal_note: "",
        revision: 1,
        primary_location_id: ids.location,
        primary_job_id: ids.job,
        primary_location_name: "Downtown",
        location_count: 1,
        primary_job_name: "Server",
        job_count: 1,
        role_name: null,
        is_workspace_owner: false,
        access: { employee: true, management: null },
        employee_role_id: null,
        management_role_id: null,
        managed_location_ids: [],
        private_contact: null,
        allowed: {
          save: true,
          terminate: true,
          archive: true,
          remove_access: true,
          change_role: true,
          make_admin: true,
          invite: true,
          onboarding_review: true,
        },
        onboarding: {
          status: "not_requested",
          required_documents: 0,
          completed_documents: 0,
        },
        locations: [
          {
            id: ids.location,
            name: "Downtown",
            primary: true,
            archived: false,
            removable: true,
          },
        ],
        jobs: [{ id: ids.job, name: "Server", primary: true, archived: false }],
        archived_at: null,
        display_status: "not_invited",
        user_id: null,
        invitation: null,
        events: [],
      });
      function Harness() {
        const [employeeId, setEmployeeId] = useState<string | null>(null);
        const [section, setSection] = useState<EmployeeSection>("profile");
        return (
          <EmployeeDrawer
            employeeId={employeeId}
            creating={!employeeId}
            section={section}
            onSectionChange={setSection}
            onClose={onClose}
            onCreated={(id) => {
              setEmployeeId(id);
              setSection("profile");
            }}
          />
        );
      }
      render(
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>,
      );
      fillNames();
      fireEvent.keyDown(screen.getByLabelText("Last name"), { key: "Enter" });
      expect(
        screen.getByRole("heading", { name: "Employment" }).style.outline,
      ).toBe("none");
      fireEvent.click(await screen.findByLabelText("Downtown"));
      fireEvent.click(screen.getByLabelText("Server"));
      fireEvent.keyDown(screen.getByLabelText("Server"), { key: "Enter" });
      await screen.findByRole("button", { name: "Done" });
      await screen.findByLabelText("First name");
      expect(screen.getByRole("heading", { name: "Profile" })).toBeTruthy();
      if (closeMethod === "outside")
        fireEvent.click(
          screen.getAllByRole("button", { name: "Close employee details" })[0]!,
        );
      else
        fireEvent.keyDown(screen.getByRole("heading", { name: "Profile" }), {
          key: closeMethod,
        });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(createEmployee).toHaveBeenCalledTimes(1);
    },
  );

  // Bug 3: the role field waited for an email without saying so, and read
  // "No assignable roles" while the roles were still loading or had failed.
  // QA: Invite says why it waits (the footer's role field said it before Tur 4 B).
  it("says Invite waits for an email, then for a location and a job", async () => {
    setup();
    const invite = screen.getByRole("button", { name: "Invite" });
    const reason = () =>
      document.getElementById(invite.getAttribute("aria-describedby") ?? "")?.textContent;
    expect(reason()).toBe("Add an email to invite.");
    fillNames();
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ada@example.test" },
    });
    expect(reason()).toBe("Choose a location and a job to invite.");
    next();
    fireEvent.click(await screen.findByLabelText("Downtown"));
    fireEvent.click(screen.getByLabelText("Server"));
    expect(invite.getAttribute("aria-describedby")).toBeNull();
    expect(disabled("Invite")).toBe(false);
  });

  it("tells roles that did not load, and no management role to give, apart", async () => {
    vi.mocked(loadEmployeeReferenceData).mockRejectedValue(new Error("offline"));
    const failed = setup();
    expect(await screen.findByText("We couldn't load locations, jobs and roles")).toBeTruthy();
    failed.client.clear();
    document.body.innerHTML = "";

    // Only the employee role is the reader's to give: the management app says who can.
    vi.mocked(loadEmployeeReferenceData).mockResolvedValue({
      locations: [{ id: ids.location, name: "Downtown", archived: false }],
      departments: [],
      jobs: [{ id: ids.job, name: "Server", archived: false, departmentId: null, owner: false }],
      inviteRoles: [roles[0]!],
    });
    setup();
    fillNames();
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ada@example.test" },
    });
    next();
    fireEvent.click(await screen.findByLabelText("Downtown"));
    fireEvent.click(screen.getByLabelText("Server"));
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    const management = (await screen.findByLabelText("Management app")) as HTMLInputElement;
    expect(management.disabled).toBe(true);
    expect(management.closest("label")?.getAttribute("title")).toBe(
      "Only owners and admins can give management access.",
    );
  });

  it("offers Save and Invite together after completing assignments and adding email", async () => {
    setup();
    // Tur 4 B: no role picker in the footer; Invite asks for access itself.
    expect(screen.queryByLabelText("Invite role")).toBeNull();
    expect(disabled("Invite")).toBe(true);
    fillNames();
    next();
    fireEvent.click(await screen.findByLabelText("Downtown"));
    fireEvent.click(screen.getByLabelText("Server"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ada@example.test" },
    });
    expect(disabled("Save")).toBe(false);
    expect(disabled("Invite")).toBe(false);
    fireEvent.keyDown(screen.getByLabelText("E-mail"), { key: "Enter" });
    await waitFor(() =>
      expect(createEmployee).toHaveBeenCalledWith(
        ids.workspace,
        expect.objectContaining({ invite_access: null }),
      ),
    );
  });

  // EMP-001 K7 (i), user decision 2026-09-30: the drawer never asks before
  // what was typed is dropped.
  it("lets browser history leave a filled create form without asking", async () => {
    window.history.replaceState({ idx: 0 }, "", "/app/employees");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    function RouteHarness() {
      const location = useLocation(),
        navigate = useNavigate();
      return location.search.includes("mode=create") ? (
        <EmployeeDrawer
          employeeId={null}
          creating
          section="profile"
          onSectionChange={() => {}}
          onClose={() => navigate("/app/employees", { replace: true })}
          onCreated={() => {}}
        />
      ) : (
        <button onClick={() => navigate("?mode=create")}>Add</button>
      );
    }
    render(
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <RouteHarness />
        </BrowserRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fillNames();
    window.history.back();
    expect(await screen.findByRole("button", { name: "Add" })).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(window.location.search).not.toContain("mode=create");
    expect(createEmployee).not.toHaveBeenCalled();
  });
  // Not a warning: the request already left, and its answer needs the form.
  it("holds the route while the create request is on its way, without asking, and lets go once it is answered", async () => {
    window.history.replaceState({ idx: 0 }, "", "/app/employees");
    let answer: (result: { id: string; invitation: null }) => void = () => {};
    vi.mocked(createEmployee).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    function RouteHarness() {
      const location = useLocation(),
        navigate = useNavigate();
      const [section, setSection] = useState<EmployeeSection>("profile");
      return location.search.includes("mode=create") ? (
        <EmployeeDrawer
          employeeId={null}
          creating
          section={section}
          onSectionChange={setSection}
          onClose={() => navigate("/app/employees", { replace: true })}
          onCreated={() => {}}
        />
      ) : (
        <button onClick={() => navigate("?mode=create")}>Add</button>
      );
    }
    render(
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <RouteHarness />
        </BrowserRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fillNames();
    next();
    fireEvent.click(screen.getByLabelText("Remote"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(createEmployee).toHaveBeenCalledTimes(1));
    window.history.back();
    // The entry is left and restored; wait for the restore, not the moment between.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await waitFor(() =>
      expect(window.location.search).toContain("mode=create"),
    );
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    answer({ id: ids.employee, invitation: null });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Saving..." })).toBeNull(),
    );
    window.history.back();
    expect(await screen.findByRole("button", { name: "Add" })).toBeTruthy();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadEmployeeReferenceData).mockResolvedValue({
      locations: [{ id: ids.location, name: "Downtown", archived: false }],
      departments: [],
      jobs: [{ id: ids.job, name: "Server", archived: false, departmentId: null, owner: false }],
      inviteRoles: roles,
    });
    vi.mocked(createEmployee).mockResolvedValue({
      id: ids.employee,
      invitation: null,
    });
  });
  it("requires both names, then navigates without creating an employee", () => {
    setup();
    expect(disabled("Next")).toBe(true);
    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Ada" },
    });
    fireEvent.change(screen.getByLabelText("Last name"), {
      target: { value: "   " },
    });
    expect(disabled("Next")).toBe(true);
    fillNames();
    expect(disabled("Next")).toBe(false);
    next();
    expect(screen.getByRole("heading", { name: "Employment" })).toBeTruthy();
    expect(createEmployee).not.toHaveBeenCalled();
    expect(disabled("Save")).toBe(true);
  });
  it("says a required name is missing under its field, tied to the field", () => {
    setup();
    const first = screen.getByLabelText("First name");
    fireEvent.blur(first, { relatedTarget: screen.getByLabelText("Last name") });
    expect(first.getAttribute("aria-invalid")).toBe("true");
    const note = document.getElementById(first.getAttribute("aria-describedby") ?? "");
    expect(note?.textContent).toBe("First name is required.");
    expect(first.closest("label")!.contains(note)).toBe(true);
  });
  it("allows Next with invalid email but prevents save and invite", async () => {
    setup();
    fillNames();
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "bad-address" },
    });
    expect(disabled("Next")).toBe(false);
    next();
    fireEvent.click(screen.getByLabelText("Remote"));
    expect(disabled("Save")).toBe(true);
    expect(disabled("Invite")).toBe(true);
  });
  it("requires location AND job in normal mode and saves without inviting", async () => {
    const { onCreated } = setup();
    fillNames();
    next();
    fireEvent.click(await screen.findByLabelText("Downtown"));
    expect(disabled("Save")).toBe(true);
    fireEvent.click(screen.getByLabelText("Server"));
    expect(disabled("Save")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(ids.employee));
    expect(createEmployee).toHaveBeenCalledWith(
      ids.workspace,
      expect.objectContaining({
        invite_access: null,
        employee: expect.objectContaining({
          location_ids: [ids.location],
          job_ids: [ids.job],
        }),
      }),
    );
  });
  it.each(["Remote", "Exclude from schedule"])(
    "saves %s without any assignments",
    async (mode) => {
      setup();
      fillNames();
      next();
      fireEvent.click(screen.getByLabelText(mode));
      expect(disabled("Save")).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(createEmployee).toHaveBeenCalledTimes(1));
      expect(
        vi.mocked(createEmployee).mock.calls[0]![1].employee.location_ids,
      ).toEqual([]);
      expect(
        vi.mocked(createEmployee).mock.calls[0]![1].employee.job_ids,
      ).toEqual([]);
    },
  );
  it("preserves assignments while toggling work mode and revalidates when toggled off", async () => {
    setup();
    fillNames();
    next();
    fireEvent.click(await screen.findByLabelText("Downtown"));
    fireEvent.click(screen.getByLabelText("Remote"));
    expect(disabled("Save")).toBe(false);
    fireEvent.click(screen.getByLabelText("Exclude from schedule"));
    fireEvent.click(screen.getByLabelText("Remote"));
    expect(disabled("Save")).toBe(false);
    fireEvent.click(screen.getByLabelText("Exclude from schedule"));
    expect(disabled("Save")).toBe(true);
    expect(
      (screen.getByLabelText("Downtown") as HTMLInputElement).checked,
    ).toBe(true);
  });
  // Tur 4 B (Mert, 2026-10-20): Invite opens Access; with nothing chosen both
  // boxes shake red and say so, and nothing is sent.
  it("opens Access on Invite and asks for an access before sending anything", async () => {
    setup();
    fillNames();
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ada@example.test" },
    });
    next();
    fireEvent.click(await screen.findByLabelText("Downtown"));
    fireEvent.click(screen.getByLabelText("Server"));
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByRole("heading", { name: "Access", level: 2 })).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toBe(
      managementAndOwnerRefusals["access.role_required"],
    );
    expect(
      document.querySelector(".access-choices")?.classList.contains("access-invalid"),
    ).toBe(true);
    expect(createEmployee).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Employee app"));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() =>
      expect(createEmployee).toHaveBeenCalledWith(
        ids.workspace,
        expect.objectContaining({
          invite_access: { employee_role_id: ids.role, management_role_id: null, managed_location_ids: [] },
        }),
      ),
    );
  });
  it("invites to both apps with a custom role and keeps the choice through refetch and navigation", async () => {
    const { client, onCreated } = setup();
    fillNames();
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ada@example.test" },
    });
    next();
    fireEvent.click(await screen.findByLabelText("Downtown"));
    fireEvent.click(screen.getByLabelText("Server"));
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await screen.findByRole("heading", { name: "Access", level: 2 });
    fireEvent.click(screen.getByLabelText("Employee app"));
    fireEvent.click(screen.getByLabelText("Management app"));
    fireEvent.click(await screen.findByLabelText("Shift Lead"));
    fireEvent.click(screen.getByLabelText("Downtown"));
    await client.invalidateQueries({
      queryKey: ["employee-reference-data", ids.workspace],
    });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() =>
      expect(createEmployee).toHaveBeenCalledWith(
        ids.workspace,
        expect.objectContaining({
          invite_access: {
            employee_role_id: ids.role,
            management_role_id: ids.custom,
            managed_location_ids: [ids.location],
          },
        }),
      ),
    );
    // The drawer stays on Access for the new record.
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(ids.employee, "access"));
  });
  // A manager manages somewhere (K4): the invitation names where.
  it("holds a manager's invitation until a location to manage is chosen", async () => {
    setup();
    fillNames();
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ada@example.test" },
    });
    next();
    fireEvent.click(await screen.findByLabelText("Downtown"));
    fireEvent.click(screen.getByLabelText("Server"));
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await screen.findByRole("heading", { name: "Access", level: 2 });
    fireEvent.click(screen.getByLabelText("Management app"));
    fireEvent.click(await screen.findByLabelText("Shift Lead"));
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      managementAndOwnerRefusals["access.manages_required"],
    );
    expect(createEmployee).not.toHaveBeenCalled();
    // Save keeps the record without inviting anybody to manage.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(createEmployee).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createEmployee).mock.calls[0]![1].invite_access).toBeNull();
  });
  it("does not silently replace a deleted chosen role", async () => {
    const { client } = setup();
    fillNames();
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ada@example.test" },
    });
    next();
    fireEvent.click(await screen.findByLabelText("Downtown"));
    fireEvent.click(screen.getByLabelText("Server"));
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await screen.findByRole("heading", { name: "Access", level: 2 });
    fireEvent.click(screen.getByLabelText("Management app"));
    fireEvent.click(await screen.findByLabelText("Shift Lead"));
    fireEvent.click(screen.getByLabelText("Downtown"));
    vi.mocked(loadEmployeeReferenceData).mockResolvedValue({
      locations: [{ id: ids.location, name: "Downtown", archived: false }],
      departments: [],
      jobs: [{ id: ids.job, name: "Server", archived: false, departmentId: null, owner: false }],
      inviteRoles: [roles[0]!],
    });
    await client.invalidateQueries({
      queryKey: ["employee-reference-data", ids.workspace],
    });
    await waitFor(() => expect(screen.queryByLabelText("Shift Lead")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      managementAndOwnerRefusals["access.management_role_required"],
    );
    expect(createEmployee).not.toHaveBeenCalled();
    expect(disabled("Save")).toBe(false);
  });
  it("retries an uncertain request with the same command and locks edits", async () => {
    vi.mocked(createEmployee).mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    setup();
    fillNames();
    next();
    fireEvent.click(screen.getByLabelText("Remote"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry request" }),
    );
    await waitFor(() => expect(createEmployee).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createEmployee).mock.calls[0]![1]).toEqual(
      vi.mocked(createEmployee).mock.calls[1]![1],
    );
  });
  it("does not navigate from wheel events", () => {
    setup();
    fillNames();
    fireEvent.wheel(
      screen.getByLabelText("First name").closest(".employee-section-scroll")!,
      { deltaY: 160 },
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });
  it("closes a filled form on Escape, a click outside and Cancel without asking", () => {
    const { onClose } = setup();
    fillNames();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Close employee details" })[0]!,
    );
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(createEmployee).not.toHaveBeenCalled();
  });
  it("normalizes unsupported create sections", () => {
    setup("access");
    expect(screen.getByRole("heading", { name: "Profile" })).toBeTruthy();
  });
});
