import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BrowserRouter, useLocation, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmployeeSection } from "@newfork/shared";
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
      membership: { role: "owner" },
      permissions: ["employees.manage", "employee_access.manage"],
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
        private_contact: null,
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

  it("offers Save and Invite together after completing assignments and adding email", async () => {
    setup();
    expect(screen.getByLabelText("Invite role")).toHaveProperty(
      "disabled",
      true,
    );
    expect(disabled("Invite")).toBe(true);
    fillNames();
    next();
    fireEvent.click(await screen.findByLabelText("Downtown"));
    fireEvent.click(screen.getByLabelText("Server"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ada@example.test" },
    });
    expect(screen.getByLabelText("Invite role")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Invite role")).toHaveProperty(
      "disabled",
      false,
    );
    expect(disabled("Save")).toBe(false);
    expect(disabled("Invite")).toBe(false);
    fireEvent.keyDown(screen.getByLabelText("E-mail"), { key: "Enter" });
    await waitFor(() =>
      expect(createEmployee).toHaveBeenCalledWith(
        ids.workspace,
        expect.objectContaining({ invite_role_id: null }),
      ),
    );
  });

  it("keeps the drawer mounted when browser history leaves a dirty create route", async () => {
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
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(
      (screen.getByLabelText("First name") as HTMLInputElement).value,
    ).toBe("Ada");
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() =>
      expect(window.location.search).toContain("mode=create"),
    );
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadEmployeeReferenceData).mockResolvedValue({
      locations: [{ id: ids.location, name: "Downtown", archived: false }],
      jobs: [{ id: ids.job, name: "Server", archived: false }],
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
        invite_role_id: null,
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
  it("invites with the selected custom role and keeps draft through refetch and navigation", async () => {
    const { client } = setup();
    fillNames();
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ada@example.test" },
    });
    await screen.findByRole("option", { name: "Shift Lead" });
    fireEvent.change(screen.getByLabelText("Invite role"), {
      target: { value: ids.custom },
    });
    next();
    fireEvent.click(screen.getByLabelText("Remote"));
    await client.invalidateQueries({
      queryKey: ["employee-reference-data", ids.workspace],
    });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      (screen.getByLabelText("Invite role") as HTMLSelectElement).value,
    ).toBe(ids.custom);
    expect(disabled("Invite")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() =>
      expect(createEmployee).toHaveBeenCalledWith(
        ids.workspace,
        expect.objectContaining({ invite_role_id: ids.custom }),
      ),
    );
  });
  it("does not silently replace a deleted selected role", async () => {
    const { client } = setup();
    fillNames();
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ada@example.test" },
    });
    await screen.findByRole("option", { name: "Shift Lead" });
    fireEvent.change(screen.getByLabelText("Invite role"), {
      target: { value: ids.custom },
    });
    next();
    fireEvent.click(screen.getByLabelText("Remote"));
    vi.mocked(loadEmployeeReferenceData).mockResolvedValue({
      locations: [],
      jobs: [],
      inviteRoles: [roles[0]!],
    });
    await client.invalidateQueries({
      queryKey: ["employee-reference-data", ids.workspace],
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Invite role")).toHaveProperty("value", ""),
    );
    expect(disabled("Invite")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(
      screen.getByLabelText("Invite role").getAttribute("aria-invalid"),
    ).toBe("true");
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
  it("does not navigate from wheel events and confirms abandoning a dirty draft", async () => {
    const { onClose } = setup();
    fillNames();
    fireEvent.wheel(
      screen.getByLabelText("First name").closest(".employee-section-scroll")!,
      { deltaY: 160 },
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(
      (screen.getByLabelText("First name") as HTMLInputElement).value,
    ).toBe("Ada");
  });
  it("normalizes unsupported create sections", () => {
    setup("access");
    expect(screen.getByRole("heading", { name: "Profile" })).toBeTruthy();
  });
});
