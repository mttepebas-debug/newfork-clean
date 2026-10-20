import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { usLettersMessage, usPhoneMessage } from "@newfork/shared";
import type {
  ActiveWorkspaceContext,
  Department,
  Job,
  Location,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OwnerOnboardingPage from "./OwnerOnboardingPage";
import { RequestError } from "../lib/request-error";
import {
  loadEmployeeReferenceData,
  saveEmployee,
} from "../employees/employee-data";
import {
  listAccountWorkspaces,
  queueOwnerOnboardingInvitationIntent,
  resetOwnerOnboarding,
  saveOwnerOnboarding,
  supabaseClient,
} from "../lib/supabase";
import {
  listDepartments,
  listJobs,
  listLocations,
  saveDepartment,
  saveJob,
  saveLocation,
  setDepartmentArchived,
  setJobArchived,
} from "../settings/organization-data";

const authState = vi.hoisted(() => ({
  account: {
    userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
    email: "owner@example.test",
    displayName: "Owner User",
    phone: null,
    theme: "system" as const,
  },
  context: null as ActiveWorkspaceContext | null,
  refresh: vi.fn(),
  signOut: vi.fn(),
  updateAccount: vi.fn(),
}));

const storage = vi.hoisted(() => ({
  supabaseClient: { auth: { getSession: vi.fn() } },
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account: authState.account,
    context: authState.context,
    refresh: authState.refresh,
    signOut: authState.signOut,
    updateAccount: authState.updateAccount,
  }),
}));

vi.mock("../employees/employee-data", () => ({
  loadEmployeeReferenceData: vi.fn(),
  saveEmployee: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  apiRequest: vi
    .fn()
    .mockResolvedValue({ timezone: null, status: "unavailable" }),
  listAccountWorkspaces: vi.fn(),
  queueOwnerOnboardingInvitationIntent: vi.fn(),
  resetOwnerOnboarding: vi.fn(),
  saveOwnerOnboarding: vi.fn(),
  supabaseClient: storage.supabaseClient,
}));

vi.mock("../settings/organization-data", () => {
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
  listLocations: vi.fn(),
  saveDepartment: vi.fn(),
  saveJob: vi.fn(),
  saveLocation: vi.fn(),
  setDepartmentArchived: vi.fn(),
  setJobArchived: vi.fn(),
  setLocationArchived: vi.fn(),
};
});

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const locationId = "11000000-0000-4000-8000-000000000001";
const departmentId = "12000000-0000-4000-8000-000000000001";
const jobId = "13000000-0000-4000-8000-000000000001";
const employeeId = "15000000-0000-4000-8000-000000000001";

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

const department = {
  id: departmentId,
  workspace_id: workspaceId,
  name: "Front of house",
  color: "#3C7A68",
  
  archived_at: null,
  system_key: null,
} satisfies Department;

const job = {
  id: jobId,
  workspace_id: workspaceId,
  department_id: departmentId,
  name: "Server",
  color: "#4478A8",
  
  archived_at: null,
  system_key: null,
  lineup_icons: ["001-server"],
} satisfies Job;

function contextForStep(currentStep: 1 | 2 | 3 | 4): ActiveWorkspaceContext {
  return {
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
    permissions: ["workspace.read", "workspace.manage", "employees.manage"],
    actions: [],
    onboarding: { status: "incomplete", currentStep, revision: 1 },
    documentAccess: { restricted: false },
    locationScope: { allLocations: true, locationIds: [] },
  };
}

function renderPage(step: 1 | 2 | 3 | 4 = 1) {
  authState.context = contextForStep(step);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/onboarding"]}>
        <OwnerOnboardingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OwnerOnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.context = null;
    authState.refresh.mockResolvedValue(undefined);
    authState.updateAccount.mockResolvedValue(undefined);
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    vi.mocked(listLocations).mockResolvedValue([]);
    vi.mocked(listDepartments).mockResolvedValue([]);
    vi.mocked(listJobs).mockResolvedValue([]);
    vi.mocked(saveLocation).mockResolvedValue(undefined);
    vi.mocked(saveDepartment).mockResolvedValue(undefined);
    vi.mocked(saveJob).mockResolvedValue(job);
    vi.mocked(resetOwnerOnboarding).mockResolvedValue(undefined);
    vi.mocked(saveOwnerOnboarding).mockResolvedValue(undefined);
    vi.mocked(queueOwnerOnboardingInvitationIntent).mockResolvedValue(
      undefined,
    );
    vi.mocked(saveEmployee).mockResolvedValue(employeeId);
    vi.mocked(loadEmployeeReferenceData).mockResolvedValue({
      locations: [{ id: locationId, name: "Main Dining", archived: false }],
      departments: [],
      jobs: [{ id: jobId, name: "Server", archived: false, departmentId: null, owner: false }],
      inviteRoles: [],
    });
  });

  it("saves workspace identity before moving to locations", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Name your workspace",
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Taylor" },
    });
    fireEvent.change(screen.getByLabelText("Last name"), {
      target: { value: "Owner" },
    });
    const progress = screen.getByRole("progressbar", { name: "Steps done" });
    expect(progress.getAttribute("aria-valuenow")).toBe("0");
    expect(progress.getAttribute("aria-valuemax")).toBe("4");
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // The name belongs to the account and was given at sign-up; this step
    // states it rather than asking for it again.
    await waitFor(() =>
      expect(saveOwnerOnboarding).toHaveBeenCalledWith(supabaseClient, {
        workspaceId,
        workspaceName: "Meyhouse",
        nextStep: 2,
        complete: false,
        expectedRevision: 1,
        ownerFirstName: "Taylor",
        ownerMiddleName: "",
        ownerLastName: "Owner",
      }),
    );
    expect(authState.updateAccount).toHaveBeenCalledWith(
      "Taylor Owner",
      "system",
      null,
    );
    expect(saveLocation).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", {
        name: "Where does your team work?",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("progressbar", { name: "Steps done" })
        .getAttribute("aria-valuenow"),
    ).toBe("1");
  });

  // BL-1046: setup saved from a tab that fell behind. The page reads the setup
  // again and says so, instead of "owner onboarding revision conflict".
  it("reloads setup saved over a newer one and says so", async () => {
    vi.mocked(saveOwnerOnboarding).mockRejectedValue(
      new RequestError(
        "owner onboarding revision conflict",
        "workspace.onboarding_changed",
        undefined,
        409,
      ),
    );
    renderPage();
    fireEvent.change(await screen.findByLabelText("First name"), {
      target: { value: "Taylor" },
    });
    fireEvent.change(screen.getByLabelText("Last name"), {
      target: { value: "Owner" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(
      await screen.findByText(
        "Your setup changed in another tab or window. You're seeing the latest version; check it and save again.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("owner onboarding revision conflict")).toBeNull();
    expect(authState.refresh).toHaveBeenCalled();
    // Still on the same step: nothing moved on.
    expect(
      screen.getByRole("heading", { name: "Name your workspace" }),
    ).toBeTruthy();
  });

  // The step is named for the workspace, so its name is the first field and
  // takes the cursor; the owner's own name follows.
  it("opens on the workspace name the heading asks for", async () => {
    renderPage();

    const heading = await screen.findByRole("heading", { name: "Name your workspace" });
    const form = heading.closest("section")!.querySelector("form")!;
    const first = form.querySelector("input")!;
    expect(first.id).toBe("workspace-name");
    expect(document.activeElement).toBe(first);
  });

  // Creating an account is an email and a password; the name is asked here,
  // where an employee record is about to need it, in the two parts it holds.
  it("asks for a first and last name rather than guessing at one string", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Name your workspace" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Your full name")).toBeNull();
    // BL-080: the name given here is the legal one, and the group says so.
    const name = screen.getByRole("group", {
      name: "Name as it appears on your ID",
    });
    expect(within(name).getByLabelText("First name")).toBeTruthy();
    expect(within(name).getByLabelText("Last name")).toBeTruthy();
    expect(name.getAttribute("aria-describedby")).toBe("owner-name-help");
    expect(document.getElementById("owner-name-help")?.textContent).toMatch(
      /preferred name later in Account › Profile/,
    );
    expect(
      screen.getByRole("button", { name: /continue/i }),
    ).toHaveProperty("disabled", true);
  });


  it("supports keyboard-style form submission for workspace identity", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Name your workspace",
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Taylor" },
    });
    fireEvent.change(screen.getByLabelText("Last name"), {
      target: { value: "Owner" },
    });
    const workspaceNameInput = screen.getByLabelText("Workspace name");
    fireEvent.submit(workspaceNameInput.closest("form")!);

    await waitFor(() =>
      expect(saveOwnerOnboarding).toHaveBeenCalledWith(supabaseClient, {
        workspaceId,
        workspaceName: "Meyhouse",
        nextStep: 2,
        complete: false,
        expectedRevision: 1,
        ownerFirstName: "Taylor",
        ownerMiddleName: "",
        ownerLastName: "Owner",
      }),
    );
  });

  it("adds locations before allowing the owner to continue to structure", async () => {
    renderPage(2);

    expect(
      await screen.findByRole("heading", {
        name: "Where does your team work?",
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Location name"), {
      target: { value: "Main Dining" },
    });
    fireEvent.change(screen.getByLabelText(/^Short name/), {
      target: { value: "MAIN" },
    });
    fireEvent.change(screen.getByLabelText("Street address"), {
      target: { value: "1 Main St" },
    });
    fireEvent.change(screen.getByLabelText("City"), {
      target: { value: "Los Angeles" },
    });
    fireEvent.change(screen.getByLabelText("State or region"), {
      target: { value: "CA" },
    });
    fireEvent.change(screen.getByLabelText("Postal code"), {
      target: { value: "90001" },
    });
    // The zone starts on the one the browser is in; the owner is normally
    // setting up the place they are standing in.
    const zone = screen.getByRole("combobox", { name: "Time zone" });
    expect((zone as HTMLSelectElement).value).not.toBe("");
    fireEvent.change(zone, { target: { value: "" } });
    expect(
      screen.getByRole("button", { name: /add location/i }),
    ).toHaveProperty("disabled", true);
    fireEvent.change(zone, { target: { value: "America/Los_Angeles" } });
    fireEvent.click(screen.getByRole("button", { name: /add location/i }));

    await waitFor(() =>
      expect(saveLocation).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          name: "Main Dining",
          short_name: "MAIN",
          street_address: "1 Main St",
          timezone: "America/Los_Angeles",
        }),
        // A third argument now: the id when a row is being edited, and nothing
        // when the form is adding one.
        undefined,
      ),
    );
    expect(saveOwnerOnboarding).toHaveBeenCalledWith(supabaseClient, {
      workspaceId,
      workspaceName: "Meyhouse",
      nextStep: 2,
      complete: false,
      expectedRevision: 1,
    });
    expect(await screen.findByText("Location added")).toBeTruthy();
  });

  it("allows location setup without address details", async () => {
    renderPage(2);

    expect(
      await screen.findByRole("heading", {
        name: "Where does your team work?",
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Location name"), {
      target: { value: "Patio" },
    });
    expect(screen.getByLabelText(/^Short name/)).toHaveProperty(
      "placeholder",
      "PT",
    );
    fireEvent.change(screen.getByLabelText(/^Phone number/), {
      target: { value: "4155550100" },
    });
    expect(screen.getByLabelText(/^Phone number/)).toHaveProperty(
      "value",
      "(415) 555-0100",
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Time zone" }), {
      target: { value: "America/New_York" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add location/i }));

    await waitFor(() =>
      expect(saveLocation).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          name: "Patio",
          short_name: "PT",
          phone: "+14155550100",
          street_address: "",
          city: "",
          region: "",
          postal_code: "",
          country_code: "US",
          timezone: "America/New_York",
        }),
        undefined,
      ),
    );
  });

  it("reports an invalid short name or phone only after submit", async () => {
    renderPage(2);
    await screen.findByRole("heading", { name: "Where does your team work?" });
    fireEvent.change(screen.getByLabelText("Location name"), {
      target: { value: "Patio" },
    });
    fireEvent.change(screen.getByLabelText(/^Short name/), {
      target: { value: "p!" },
    });
    fireEvent.change(screen.getByLabelText(/^Phone number/), {
      target: { value: "415" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Time zone" }), {
      target: { value: "America/New_York" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /add location/i }));
    expect(
      screen.getAllByRole("alert").map((alert) => alert.textContent),
    ).toEqual([
      expect.stringContaining("letters A–Z, numbers or hyphens"),
      usPhoneMessage,
    ]);
    expect(
      screen.getByLabelText(/^Short name/).getAttribute("aria-invalid"),
    ).toBe("true");
    expect(saveLocation).not.toHaveBeenCalled();
  });

  it("continues from locations after at least one location exists", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    renderPage(2);

    expect(
      await screen.findByRole("heading", {
        name: "Where does your team work?",
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(saveOwnerOnboarding).toHaveBeenCalledWith(supabaseClient, {
        workspaceId,
        workspaceName: "Meyhouse",
        nextStep: 3,
        complete: false,
        expectedRevision: 1,
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "What jobs do people work?",
      }),
    ).toBeTruthy();
  });

  it("says the list is empty rather than showing nothing", async () => {
    vi.mocked(listLocations).mockResolvedValue([]);
    renderPage(2);

    expect(
      await screen.findByText("No locations yet. Add the first one below."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue/i })).toHaveProperty(
      "disabled",
      true,
    );
  });

  // Two places called "Main" are told apart by these, not by the name.
  it("shows what tells one location from another", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    renderPage(2);

    await screen.findByRole("heading", { name: "Where does your team work?" });
    expect(screen.getByText("MAIN")).toBeTruthy();
    expect(screen.getByText("Los Angeles, CA")).toBeTruthy();
    expect(screen.getByText("America/Los_Angeles")).toBeTruthy();
  });

  it("opens a saved US phone in the mask", async () => {
    vi.mocked(listLocations).mockResolvedValue([{ ...location, phone: "+14155550100" }]);
    renderPage(2);

    fireEvent.click(await screen.findByRole("button", { name: "Edit Main Dining" }));
    expect(screen.getByLabelText(/^Phone number/)).toHaveProperty("value", "(415) 555-0100");
  });

  it("edits a location in the form instead of asking for all nine fields again", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    renderPage(2);

    fireEvent.click(await screen.findByRole("button", { name: "Edit Main Dining" }));

    expect(
      (screen.getByLabelText("Location name") as HTMLInputElement).value,
    ).toBe("Main Dining");
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe(
      "Los Angeles",
    );
    // Leaving the edit half done and walking on is the one way out of this
    // screen that would save nothing and lose the change.
    expect(screen.getByRole("button", { name: /continue/i })).toHaveProperty(
      "disabled",
      true,
    );

    fireEvent.change(screen.getByLabelText("Location name"), {
      target: { value: "Main Dining Room" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(saveLocation).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ name: "Main Dining Room" }),
        locationId,
      ),
    );
  });

  it("says which location already goes by a short name, and saves nothing", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    renderPage(2);

    await screen.findByRole("heading", { name: "Where does your team work?" });
    fireEvent.change(screen.getByLabelText("Location name"), {
      target: { value: "Main Bar" },
    });
    fireEvent.change(screen.getByLabelText("Short name"), {
      target: { value: "main" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add location/i }));

    // The unique index would have answered this as a constraint violation with
    // nowhere to read it.
    expect(
      await screen.findByText("Main Dining already goes by that short name."),
    ).toBeTruthy();
    expect(saveLocation).not.toHaveBeenCalled();
  });

  it("adds a department on its own, and keeps the next job pointed at it", async () => {
    const second = {
      ...department,
      id: "12000000-0000-4000-8000-000000000002",
      name: "Back of house",
    };
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department]);
    vi.mocked(listJobs).mockResolvedValue([job]);
    renderPage(3);

    expect(
      await screen.findByRole("heading", {
        name: "What jobs do people work?",
      }),
    ).toBeTruthy();
    // Adding a department is its own act now, not a mode hidden under an
    // option inside the job selector.
    expect(screen.queryByLabelText("Department name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /new department/i }));
    fireEvent.change(screen.getByLabelText("Department name"), {
      target: { value: "Back of house" },
    });
    vi.mocked(listDepartments).mockResolvedValue([department, second]);
    fireEvent.click(screen.getByRole("button", { name: /add department/i }));

    await waitFor(() =>
      expect(saveDepartment).toHaveBeenCalledWith(workspaceId, {
        name: "Back of house",
        color: "#3C7A68",
      }),
    );
    // A job entered straight afterwards used to land silently in the first
    // department, because every refresh reset the selector.
    const selector = (await screen.findByLabelText(
      "Department",
    )) as HTMLSelectElement;
    await waitFor(() => expect(selector.value).toBe(second.id));
    expect(saveJob).not.toHaveBeenCalled();
  });

  it("takes a department's jobs with it, and says how many", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department]);
    vi.mocked(listJobs).mockResolvedValue([job]);
    renderPage(3);

    expect(
      await screen.findByRole("heading", {
        name: "What jobs do people work?",
      }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Front of house" }),
    );
    expect(setDepartmentArchived).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm remove, takes 1 job with it" }),
    );

    await waitFor(() =>
      expect(setJobArchived).toHaveBeenCalledWith(workspaceId, jobId, true),
    );
    expect(setDepartmentArchived).toHaveBeenCalledWith(
      workspaceId,
      departmentId,
      true,
    );
  });

  it("moves a job to another department from the chip it sits in", async () => {
    const second = {
      ...department,
      id: "12000000-0000-4000-8000-000000000002",
      name: "Back of house",
    };
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department, second]);
    vi.mocked(listJobs).mockResolvedValue([job]);
    renderPage(3);

    fireEvent.click(await screen.findByRole("button", { name: "Server" }));
    fireEvent.change(screen.getByLabelText("Department", { selector: "#job-panel-department" }), {
      target: { value: second.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveJob).toHaveBeenCalledWith(
        workspaceId,
        { name: "Server", color: "#4478A8", department_id: second.id },
        jobId,
      ),
    );
  });

  it("says the list is empty instead of showing nothing at all", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([]);
    vi.mocked(listJobs).mockResolvedValue([]);
    renderPage(3);

    expect(
      await screen.findByText("No departments yet. Add the first one below."),
    ).toBeTruthy();
    // Nothing to choose from, so the form opens on the department field and
    // the selector is never drawn.
    expect(screen.getByLabelText("Department name")).toBeTruthy();
    expect(screen.queryByLabelText("Department")).toBeNull();
  });

  it("uses existing references when creating the first job", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department]);
    vi.mocked(listJobs).mockResolvedValue([]);
    renderPage(3);

    expect(
      await screen.findByRole("heading", {
        name: "What jobs do people work?",
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Job or role"), {
      target: { value: "Server" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add job/i }));

    await waitFor(() =>
      expect(saveJob).toHaveBeenCalledWith(workspaceId, {
        name: "Server",
        color: "#4478A8",
        department_id: departmentId,
      }),
    );
    expect(saveDepartment).not.toHaveBeenCalled();
    expect(saveOwnerOnboarding).toHaveBeenCalledWith(supabaseClient, {
      workspaceId,
      workspaceName: "Meyhouse",
      nextStep: 3,
      complete: false,
      expectedRevision: 1,
    });
    expect(await screen.findByText("Job added")).toBeTruthy();
  });

  it("continues to the optional team step when structure exists", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department]);
    vi.mocked(listJobs).mockResolvedValue([job]);
    renderPage(3);

    expect(
      await screen.findByRole("heading", {
        name: "What jobs do people work?",
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(saveOwnerOnboarding).toHaveBeenCalledWith(supabaseClient, {
        workspaceId,
        workspaceName: "Meyhouse",
        nextStep: 4,
        complete: false,
        expectedRevision: 1,
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Add your team" }),
    ).toBeTruthy();
  });

  it("adds the first employee and persists invite intent for setup finish", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department]);
    vi.mocked(listJobs).mockResolvedValue([job]);
    renderPage(4);

    expect(
      await screen.findByRole("heading", { name: "Add your team" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Alex" },
    });
    fireEvent.change(screen.getByLabelText("Last name"), {
      target: { value: "Kim" },
    });
    fireEvent.change(screen.getByLabelText("Invitation email"), {
      target: { value: "alex@example.test" },
    });
    // Same gate as the in-app drawer: no assignment, no save.
    expect(
      screen.getByRole("button", { name: /add employee/i }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Main Dining" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Server" }));
    fireEvent.click(screen.getByRole("button", { name: /add employee/i }));

    await waitFor(() =>
      expect(saveEmployee).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          first_name: "Alex",
          last_name: "Kim",
          invitation_email: "alex@example.test",
          location_ids: [locationId],
          primary_location_id: locationId,
          job_ids: [jobId],
          primary_job_id: jobId,
          expected_revision: null,
        }),
      ),
    );
    expect(queueOwnerOnboardingInvitationIntent).toHaveBeenCalledWith(
      supabaseClient,
      {
        workspaceId,
        employeeId,
        email: "alex@example.test",
      },
    );
    expect(
      await screen.findByText(
        "Added. The invitation goes out when setup finishes.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /finish setup/i }));

    await waitFor(() =>
      expect(saveOwnerOnboarding).toHaveBeenCalledWith(supabaseClient, {
        workspaceId,
        workspaceName: "Meyhouse",
        nextStep: 4,
        complete: true,
        expectedRevision: 1,
      }),
    );
    expect(queueOwnerOnboardingInvitationIntent).toHaveBeenCalledTimes(1);
  });

  // EMP-001 C (S2): any job can be primary, a Management job too.
  describe("the first job ticked is a team member's primary (EMP-001 C)", () => {
    const managementId = "12000000-0000-4000-8000-0000000000aa";
    const managerJobId = "13000000-0000-4000-8000-0000000000aa";
    async function addWithJobs(picks: string[]) {
      vi.mocked(listLocations).mockResolvedValue([location]);
      vi.mocked(listDepartments).mockResolvedValue([
        department,
        { ...department, id: managementId, name: "Management", system_key: "management" },
      ]);
      vi.mocked(listJobs).mockResolvedValue([
        job,
        { ...job, id: managerJobId, name: "Manager", department_id: managementId },
      ]);
      renderPage(4);
      await screen.findByRole("heading", { name: "Add your team" });
      fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Maya" } });
      fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Reed" } });
      fireEvent.click(screen.getByRole("checkbox", { name: "Main Dining" }));
      for (const name of picks) fireEvent.click(screen.getByRole("checkbox", { name }));
      fireEvent.click(screen.getByRole("button", { name: /add employee/i }));
    }

    // BL-489: as in the Employees drawer, the Owner job is nobody's to tick.
    it("shows the Owner job switched off and unticked, and every other job open", async () => {
      vi.mocked(listLocations).mockResolvedValue([location]);
      vi.mocked(listDepartments).mockResolvedValue([
        department,
        { ...department, id: managementId, name: "Management", system_key: "management" },
      ]);
      vi.mocked(listJobs).mockResolvedValue([
        job,
        { ...job, id: managerJobId, name: "Manager", department_id: managementId },
        { ...job, id: "13000000-0000-4000-8000-0000000000ab", name: "Owner", department_id: managementId, system_key: "owner" },
      ]);
      renderPage(4);
      const owner = (await screen.findByRole("checkbox", { name: "Owner" })) as HTMLInputElement;
      expect(owner.disabled).toBe(true);
      expect(owner.checked).toBe(false);
      expect(owner.closest("label")!.dataset.locked).toBe("true");
      expect(owner.closest("label")!.dataset.lockedReason).toBe("true");
      const note = document.getElementById(owner.getAttribute("aria-describedby") ?? "");
      expect(note?.textContent).toBe("Only the workspace owner holds the Owner job.");
      expect(note?.classList.contains("sr-only")).toBe(true);
      for (const name of ["Server", "Manager"]) {
        const box = screen.getByRole("checkbox", { name }) as HTMLInputElement;
        expect(box.disabled).toBe(false);
        expect(box.closest("label")!.dataset.lockedReason).toBeUndefined();
      }
    });

    it("makes the first job ticked primary, a Management job too", async () => {
      await addWithJobs(["Manager", "Server"]);
      await waitFor(() =>
        expect(saveEmployee).toHaveBeenCalledWith(
          workspaceId,
          expect.objectContaining({ job_ids: [managerJobId, jobId], primary_job_id: managerJobId }),
        ),
      );
    });

    it("keeps a job primary after it moved under Management from Back: Jobs", async () => {
      vi.mocked(listLocations).mockResolvedValue([location]);
      vi.mocked(listDepartments).mockResolvedValue([
        department,
        { ...department, id: managementId, name: "Management", system_key: "management" },
      ]);
      // A second job stays outside Management: Continue counts only those (K2).
      const host = { ...job, id: "13000000-0000-4000-8000-0000000000ac", name: "Host" };
      vi.mocked(listJobs).mockResolvedValue([job, host]);
      renderPage(4);
      await screen.findByRole("heading", { name: "Add your team" });
      fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Maya" } });
      fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Reed" } });
      fireEvent.click(screen.getByRole("checkbox", { name: "Main Dining" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Server" }));
      // The wizard bar's Back: Jobs.
      fireEvent.click(document.querySelector(".pb-bar .pb-btn-secondary")!);
      await screen.findByRole("heading", { name: "What jobs do people work?" });
      vi.mocked(listJobs).mockResolvedValue([{ ...job, department_id: managementId }, host]);
      fireEvent.click(screen.getByRole("button", { name: "Server" }));
      fireEvent.change(screen.getByLabelText("Department", { selector: "#job-panel-department" }), {
        target: { value: managementId },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(saveJob).toHaveBeenCalled());
      fireEvent.click(await screen.findByRole("button", { name: /continue/i }));
      await screen.findByRole("heading", { name: "Add your team" });
      fireEvent.click(screen.getByRole("button", { name: /add employee/i }));
      await waitFor(() =>
        expect(saveEmployee).toHaveBeenCalledWith(
          workspaceId,
          expect.objectContaining({ job_ids: [jobId], primary_job_id: jobId }),
        ),
      );
    });

    it("adds somebody who only manages with Manager as the primary job", async () => {
      await addWithJobs(["Manager"]);
      await waitFor(() =>
        expect(saveEmployee).toHaveBeenCalledWith(
          workspaceId,
          expect.objectContaining({ job_ids: [managerJobId], primary_job_id: managerJobId }),
        ),
      );
    });
  });

  // EMP-001 C3 (K2, Done when 19): Management and its jobs come with the
  // workspace and do not count; the server counts the same way.
  describe("what counts towards finishing the jobs step (EMP-001 C)", () => {
    const managementId = "12000000-0000-4000-8000-0000000000aa";
    const management = { ...department, id: managementId, name: "Leadership", system_key: "management" as const };
    const ownerJob = { ...job, id: "13000000-0000-4000-8000-0000000000ab", name: "Owner", department_id: managementId, system_key: "owner" as const };
    const managerJob = { ...job, id: "13000000-0000-4000-8000-0000000000aa", name: "Manager", department_id: managementId };
    async function jobsStep(departments: Department[], jobs: Job[]) {
      vi.mocked(listLocations).mockResolvedValue([location]);
      vi.mocked(listDepartments).mockResolvedValue(departments);
      vi.mocked(listJobs).mockResolvedValue(jobs);
      renderPage(3);
      await screen.findByRole("heading", { name: "What jobs do people work?" });
      await screen.findByRole("button", { name: "Manager" });
      return screen.getByRole("button", { name: /continue/i }) as HTMLButtonElement;
    }

    it("keeps Continue off while Management and its jobs are all there is, and asks for a department", async () => {
      const next = await jobsStep([management], [ownerJob, managerJob]);
      expect(next.disabled).toBe(true);
      expect(screen.getByRole("heading", { name: "Add a department" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    });

    // BL-480 (variant B): the list says what is missing, naming Management as it is called now.
    const missingLine =
      "Leadership comes with every workspace. Add a department for the jobs your team works.";

    it("says under Management what is missing while it is all there is", async () => {
      await jobsStep([management], [ownerJob, managerJob]);
      const line = screen.getByText(missingLine);
      expect(line.closest("[role='list']")).toBeTruthy();
    });

    it("drops that line once a department of their own is there", async () => {
      await jobsStep([management, department], [ownerJob, managerJob, job]);
      expect(screen.queryByText(missingLine)).toBeNull();
    });

    it("keeps Continue off when the only job added sits under Management", async () => {
      const next = await jobsStep([management, department], [ownerJob, managerJob, { ...job, department_id: managementId }]);
      expect(next.disabled).toBe(true);
    });

    it("turns Continue on with a department and a job outside Management", async () => {
      const next = await jobsStep([management, department], [ownerJob, managerJob, job]);
      expect(next.disabled).toBe(false);
    });

    it("does not finish setup on Management alone, and says what is missing", async () => {
      vi.mocked(listLocations).mockResolvedValue([location]);
      vi.mocked(listDepartments).mockResolvedValue([management]);
      vi.mocked(listJobs).mockResolvedValue([ownerJob, managerJob]);
      renderPage(4);
      await screen.findByRole("heading", { name: "Add your team" });
      await screen.findByRole("checkbox", { name: "Manager" });
      fireEvent.click(screen.getByRole("button", { name: /finish setup/i }));
      expect(
        await screen.findByText("Add at least one active department and job outside Leadership before finishing setup"),
      ).toBeTruthy();
      expect(saveOwnerOnboarding).not.toHaveBeenCalledWith(
        supabaseClient,
        expect.objectContaining({ complete: true }),
      );
    });
  });

  it("does not finish when the required foundation is missing", async () => {
    renderPage(4);

    expect(
      await screen.findByRole("heading", { name: "Add your team" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(
      await screen.findByText(
        "Add at least one active location before finishing setup",
      ),
    ).toBeTruthy();
    expect(saveOwnerOnboarding).not.toHaveBeenCalledWith(
      supabaseClient,
      expect.objectContaining({ complete: true }),
    );
  });

  it("finishes setup without adding employees when the foundation exists", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department]);
    vi.mocked(listJobs).mockResolvedValue([job]);
    renderPage(4);

    expect(
      await screen.findByRole("heading", { name: "Add your team" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /finish setup/i }));

    await waitFor(() =>
      expect(saveOwnerOnboarding).toHaveBeenCalledWith(supabaseClient, {
        workspaceId,
        workspaceName: "Meyhouse",
        nextStep: 4,
        complete: true,
        expectedRevision: 1,
      }),
    );
    expect(saveEmployee).not.toHaveBeenCalled();
    expect(queueOwnerOnboardingInvitationIntent).not.toHaveBeenCalled();
  });

  it("blocks finish when an optional employee draft has unsaved input", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department]);
    vi.mocked(listJobs).mockResolvedValue([job]);
    renderPage(4);

    expect(
      await screen.findByRole("heading", { name: "Add your team" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Invitation email"), {
      target: { value: "draft@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(
      await screen.findByText(
        "Add the employee draft or clear it before finishing setup",
      ),
    ).toBeTruthy();
    expect(saveOwnerOnboarding).not.toHaveBeenCalledWith(
      supabaseClient,
      expect.objectContaining({ complete: true }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear draft" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm clear" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /finish setup/i }));

    await waitFor(() =>
      expect(saveOwnerOnboarding).toHaveBeenCalledWith(
        supabaseClient,
        expect.objectContaining({ complete: true }),
      ),
    );
  });

  it("resets an incomplete owner setup back to the first step", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department]);
    vi.mocked(listJobs).mockResolvedValue([job]);
    renderPage(2);

    expect(
      await screen.findByRole("heading", {
        name: "Where does your team work?",
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(resetOwnerOnboarding).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm start over" }),
    );

    await waitFor(() =>
      expect(resetOwnerOnboarding).toHaveBeenCalledWith(
        supabaseClient,
        workspaceId,
      ),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Name your workspace",
      }),
    ).toBeTruthy();
    expect(await screen.findByText("Setup reset")).toBeTruthy();
  });

  it("lets the owner sign out of setup; one workspace has nowhere to switch to", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      {
        id: workspaceId,
        name: "Meyhouse",
        role: "owner",
        status: "active",
        isActive: true,
        onboarding: { status: "incomplete", currentStep: 1 },
      },
    ]);
    renderPage(1);

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(authState.signOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(listAccountWorkspaces).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "Switch workspace" }),
    ).toBeNull();
  });

  it("offers the organization switcher when the account has another workspace", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      {
        id: workspaceId,
        name: "Meyhouse",
        role: "owner",
        status: "active",
        isActive: true,
        onboarding: { status: "incomplete", currentStep: 1 },
      },
      {
        id: "7ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        name: "West Room",
        role: "employee",
        status: "pending",
        isActive: false,
        onboarding: { status: "complete", currentStep: 4 },
      },
    ]);
    renderPage(1);

    expect(
      await screen.findByRole("button", { name: "Switch workspace" }),
    ).toBeTruthy();
  });
});

// BL-503: KARARLAR "Form ve girdi kuralları (ABD)" on every setup field.
describe("OwnerOnboardingPage US form rules", () => {
  // The line sits inside the label; the field's name stays the label alone,
  // so a screen reader does not read the line twice.
  const saysUnder = (label: string) => {
    const field = screen.getByRole("textbox", { name: label });
    const line = screen.getByText(usLettersMessage, { selector: `#${field.getAttribute("aria-describedby")}` });
    expect(field.getAttribute("aria-invalid")).toBe("true");
    return line;
  };

  it.each([["Last name"], ["Workspace name"]])("says under %s that Turkish-only letters are not taken, and holds Continue", async (label) => {
    renderPage(1);
    fireEvent.change(await screen.findByLabelText("First name"), { target: { value: "Mert" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Tepebas" } });
    fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "Meyhouse" } });
    fireEvent.change(screen.getByLabelText(label), { target: { value: "Kadıköy Şube" } });
    expect(saysUnder(label)).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue/i })).toHaveProperty("disabled", true);
  });

  it("says under Location name on save, and draws the phone with its +1", async () => {
    renderPage(2);
    await screen.findByRole("heading", { name: "Where does your team work?" });
    const phone = screen.getByLabelText(/^Phone number/);
    expect(phone.closest(".us-phone-field")?.querySelector(".us-phone-prefix")?.textContent).toBe("+1");
    fireEvent.change(screen.getByLabelText("Location name"), { target: { value: "Kadıköy" } });
    fireEvent.change(screen.getByLabelText(/^Short name/), { target: { value: "KDK" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Time zone" }), { target: { value: "America/New_York" } });
    fireEvent.click(screen.getByRole("button", { name: /add location/i }));
    expect(saysUnder("Location name")).toBeTruthy();
    expect(saveLocation).not.toHaveBeenCalled();
  });

  it("says under Department name and holds Add department", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department]);
    vi.mocked(listJobs).mockResolvedValue([job]);
    renderPage(3);
    await screen.findByRole("heading", { name: "What jobs do people work?" });
    fireEvent.click(screen.getByRole("button", { name: /new department/i }));
    fireEvent.change(screen.getByLabelText("Department name"), { target: { value: "Mutfak Ağı" } });
    expect(saysUnder("Department name")).toBeTruthy();
    expect(screen.getByRole("button", { name: /add department/i })).toHaveProperty("disabled", true);
  });

  it("says under Job or role and holds Add job", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department]);
    vi.mocked(listJobs).mockResolvedValue([job]);
    renderPage(3);
    await screen.findByRole("heading", { name: "What jobs do people work?" });
    fireEvent.change(screen.getByLabelText("Job or role"), { target: { value: "Garsonİ" } });
    expect(saysUnder("Job or role")).toBeTruthy();
    expect(screen.getByRole("button", { name: /add job/i })).toHaveProperty("disabled", true);
  });

  it("says under a department being renamed", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department]);
    vi.mocked(listJobs).mockResolvedValue([job]);
    renderPage(3);
    await screen.findByRole("heading", { name: "What jobs do people work?" });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: `Rename ${department.name}` }), {
      target: { value: "Mutfak Ağı" },
    });
    expect(saysUnder(`Rename ${department.name}`)).toBeTruthy();
  });

  it("says under the team member's First name", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department]);
    vi.mocked(listJobs).mockResolvedValue([job]);
    renderPage(4);
    await screen.findByRole("heading", { name: "Add your team" });
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Ayşe" } });
    expect(saysUnder("First name")).toBeTruthy();
  });
});
