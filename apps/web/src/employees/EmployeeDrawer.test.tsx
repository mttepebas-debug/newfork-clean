import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext, EmployeeDetail } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { EmployeeDrawer } from "./EmployeeDrawer";
import {
  getEmployeeDetail,
  loadEmployeeReferenceData,
  prepareEmployeeInvitation,
  revokeEmployeeInvitation,
  saveEmployee,
  setEmployeeArchived,
} from "./employee-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const employeeId = "fe201916-aa0e-480b-9144-1e1c8da20a31";
const employeeRoleId = "2efe6c80-634b-4b1d-8f09-7cba30697dd6";
const managerRoleId = "cb8b3ca2-bdaa-460b-9ae8-ef6b8c049226";

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
  permissions: ["employees.manage", "employee_access.manage"],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const detail = {
  id: employeeId,
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
  role_name: null,
  display_status: "not_invited",
  archived_at: null,
  revision: 1,
  user_id: null,
  internal_note: "",
  locations: [
    {
      id: "11000000-0000-4000-8000-000000000001",
      name: "Main Dining",
      primary: true,
      archived: false,
    },
  ],
  jobs: [
    {
      id: "22000000-0000-4000-8000-000000000001",
      name: "Server",
      primary: true,
      archived: false,
    },
  ],
  invitation: null,
  onboarding: {
    status: "not_requested",
    required_documents: 0,
    completed_documents: 0,
  },
  events: [],
} satisfies EmployeeDetail;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("./onboarding-data", () => ({
  getEmployeeDocumentDownload: vi.fn(),
  getEmployeeOnboardingReview: vi.fn(),
  reviewEmployeeOnboarding: vi.fn(),
}));
vi.mock("./employee-data", () => ({
  getEmployeeDetail: vi.fn(),
  loadEmployeeReferenceData: vi.fn(),
  prepareEmployeeInvitation: vi.fn(),
  revokeEmployeeInvitation: vi.fn(),
  saveEmployee: vi.fn(),
  setEmployeeArchived: vi.fn(),
}));

function renderDrawer(section: "profile" | "access" = "access") {
  vi.mocked(getEmployeeDetail).mockResolvedValue(detail);
  vi.mocked(loadEmployeeReferenceData).mockResolvedValue({
    locations: detail.locations,
    jobs: detail.jobs,
    inviteRoles: [
      {
        id: employeeRoleId,
        name: "Employee",
        systemKey: "employee",
        accessClass: "employee",
      },
      {
        id: managerRoleId,
        name: "Manager",
        systemKey: "manager",
        accessClass: "manager",
      },
    ],
  });
  vi.mocked(prepareEmployeeInvitation).mockResolvedValue({
    id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
    expiresAt: "2026-08-24T12:00:00.000Z",
  });
  vi.mocked(revokeEmployeeInvitation).mockResolvedValue();
  vi.mocked(saveEmployee).mockResolvedValue(employeeId);
  vi.mocked(setEmployeeArchived).mockResolvedValue();

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EmployeeDrawer
        employeeId={employeeId}
        creating={false}
        section={section}
        onSectionChange={vi.fn()}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("EmployeeDrawer", () => {
  it("sends the selected access-tab invite role with the employee invitation", async () => {
    renderDrawer();

    fireEvent.change(await screen.findByLabelText("Invite role"), {
      target: { value: managerRoleId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() =>
      expect(prepareEmployeeInvitation).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        "alex@example.test",
        managerRoleId,
      ),
    );
  });

  it("lets managers choose the invite role while editing the profile email", async () => {
    renderDrawer("profile");

    fireEvent.change(await screen.findByLabelText("Invitation email"), {
      target: { value: "alex@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Invite role"), {
      target: { value: managerRoleId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() =>
      expect(prepareEmployeeInvitation).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        "alex@example.test",
        managerRoleId,
      ),
    );
  });
});
