import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import {
  loadEmployeeReferenceData,
  saveEmployee,
} from "../employees/employee-data";
import {
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
    updateAccount: authState.updateAccount,
  }),
}));

vi.mock("../employees/employee-data", () => ({
  loadEmployeeReferenceData: vi.fn(),
  saveEmployee: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  queueOwnerOnboardingInvitationIntent: vi.fn(),
  resetOwnerOnboarding: vi.fn(),
  saveOwnerOnboarding: vi.fn(),
  supabaseClient: storage.supabaseClient,
}));

vi.mock("../settings/organization-data", () => ({
  listDepartments: vi.fn(),
  listJobs: vi.fn(),
  listLocations: vi.fn(),
  saveDepartment: vi.fn(),
  saveJob: vi.fn(),
  saveLocation: vi.fn(),
}));

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
} satisfies Location;

const department = {
  id: departmentId,
  workspace_id: workspaceId,
  name: "Front of house",
  color: "#3C7A68",
  sort_order: 0,
  archived_at: null,
} satisfies Department;

const job = {
  id: jobId,
  workspace_id: workspaceId,
  department_id: departmentId,
  name: "Server",
  color: "#4478A8",
  sort_order: 0,
  archived_at: null,
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
      role: "owner",
      status: "active",
      allLocations: true,
    },
    permissions: ["workspace.read", "workspace.manage", "employees.manage"],
    onboarding: { status: "incomplete", currentStep, revision: 1 },
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
    vi.mocked(listLocations).mockResolvedValue([]);
    vi.mocked(listDepartments).mockResolvedValue([]);
    vi.mocked(listJobs).mockResolvedValue([]);
    vi.mocked(saveLocation).mockResolvedValue(undefined);
    vi.mocked(saveDepartment).mockResolvedValue(undefined);
    vi.mocked(saveJob).mockResolvedValue(undefined);
    vi.mocked(resetOwnerOnboarding).mockResolvedValue(undefined);
    vi.mocked(saveOwnerOnboarding).mockResolvedValue(undefined);
    vi.mocked(queueOwnerOnboardingInvitationIntent).mockResolvedValue(undefined);
    vi.mocked(saveEmployee).mockResolvedValue(employeeId);
    vi.mocked(loadEmployeeReferenceData).mockResolvedValue({
      locations: [{ id: locationId, name: "Main Dining", archived: false }],
      jobs: [{ id: jobId, name: "Server", archived: false }],
      inviteRoles: [],
    });
  });

  it("saves workspace identity before moving to locations", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Name the organization",
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your full name"), {
      target: { value: "Taylor Owner" },
    });
    const progress = screen.getByRole("progressbar", {
      name: "Owner onboarding progress",
    });
    expect(progress.getAttribute("aria-valuenow")).toBe("1");
    expect(progress.getAttribute("aria-valuetext")).toBe("Step 1 of 4");
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(authState.updateAccount).toHaveBeenCalledWith(
        "Taylor Owner",
        "system",
        null,
      ),
    );
    expect(saveOwnerOnboarding).toHaveBeenCalledWith(supabaseClient, {
      workspaceId,
      workspaceName: "Meyhouse",
      nextStep: 2,
      complete: false,
      expectedRevision: 1,
    });
    expect(saveLocation).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", {
        name: "Add at least one location",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("progressbar", { name: "Owner onboarding progress" })
        .getAttribute("aria-valuenow"),
    ).toBe("2");
  });

  it("requires the owner account name before moving to locations", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Name the organization",
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your full name"), {
      target: { value: "   " },
    });

    const submitButton = screen.getByRole("button", { name: /continue/i });
    expect(submitButton).toHaveProperty("disabled", true);
    expect(authState.updateAccount).not.toHaveBeenCalled();
    expect(saveOwnerOnboarding).not.toHaveBeenCalled();
  });

  it("supports keyboard-style form submission for workspace identity", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Name the organization",
      }),
    ).toBeTruthy();
    const workspaceNameInput = screen.getByLabelText("Workspace name");
    fireEvent.submit(workspaceNameInput.closest("form")!);

    await waitFor(() =>
      expect(saveOwnerOnboarding).toHaveBeenCalledWith(supabaseClient, {
        workspaceId,
        workspaceName: "Meyhouse",
        nextStep: 2,
        complete: false,
        expectedRevision: 1,
      }),
    );
    expect(authState.updateAccount).toHaveBeenCalledWith(
      "Owner User",
      "system",
      null,
    );
  });

  it("adds locations before allowing the owner to continue to structure", async () => {
    renderPage(2);

    expect(
      await screen.findByRole("heading", {
        name: "Add at least one location",
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Location name"), {
      target: { value: "Main Dining" },
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
    fireEvent.click(screen.getByRole("button", { name: /add location/i }));

    await waitFor(() =>
      expect(saveLocation).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          name: "Main Dining",
          street_address: "1 Main St",
          timezone: "America/Los_Angeles",
        }),
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
        name: "Add at least one location",
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Location name"), {
      target: { value: "Patio" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add location/i }));

    await waitFor(() =>
      expect(saveLocation).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          name: "Patio",
          street_address: "",
          city: "",
          region: "",
          postal_code: "",
          country_code: "US",
          timezone: "America/Los_Angeles",
        }),
      ),
    );
  });

  it("continues from locations after at least one location exists", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    renderPage(2);

    expect(
      await screen.findByRole("heading", {
        name: "Add at least one location",
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
        name: "Create the first team structure",
      }),
    ).toBeTruthy();
  });

  it("uses existing references when creating the first job", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department]);
    vi.mocked(listJobs).mockResolvedValue([]);
    renderPage(3);

    expect(
      await screen.findByRole("heading", {
        name: "Create the first team structure",
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
    expect(await screen.findByText("Department and job added")).toBeTruthy();
  });

  it("continues to the optional team step when structure exists", async () => {
    vi.mocked(listLocations).mockResolvedValue([location]);
    vi.mocked(listDepartments).mockResolvedValue([department]);
    vi.mocked(listJobs).mockResolvedValue([job]);
    renderPage(3);

    expect(
      await screen.findByRole("heading", {
        name: "Create the first team structure",
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
        "Team member added. Invite will be sent after setup finishes.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /skip and finish/i }));

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

  it("does not finish when the required foundation is missing", async () => {
    renderPage(4);

    expect(
      await screen.findByRole("heading", { name: "Add your team" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /skip and finish/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /skip and finish/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /skip and finish/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /skip and finish/i }));

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
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage(2);

    expect(
      await screen.findByRole("heading", {
        name: "Add at least one location",
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));

    await waitFor(() =>
      expect(resetOwnerOnboarding).toHaveBeenCalledWith(
        supabaseClient,
        workspaceId,
      ),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Name the organization",
      }),
    ).toBeTruthy();
    expect(await screen.findByText("Setup reset")).toBeTruthy();
  });
});
