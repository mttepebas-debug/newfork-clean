import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  EmployeeDetail,
  EmployeeOnboardingManager,
  EmployeeSection,
  WeeklyPreferenceRead,
} from "@newfork/shared";
import {
  defaultDocumentLifecycleSettings,
  emptyWeeklyPreference,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import {
  getDocument,
  listDocuments,
  previewEmployeeDocumentAssignments,
} from "../documents/document-data";
vi.mock("../documents/document-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../documents/document-data")>()),
  getDocument: vi.fn(),
  previewEmployeeDocumentAssignments: vi.fn(),
  listDocuments: vi.fn().mockResolvedValue([]),
}));
import { EmployeeDrawer } from "./EmployeeDrawer";
import {
  loadWeeklyPreferences,
  previewWeeklyPreferences,
  saveWeeklyPreferences,
} from "../availability/availability-data";
vi.mock("../availability/availability-data", () => ({
  loadWeeklyPreferences: vi.fn(),
  previewWeeklyPreferences: vi.fn(),
  saveWeeklyPreferences: vi.fn(),
}));
import {
  getEmployeeDetail,
  getEmployeeAvatar,
  loadEmployeeInvitationLink,
  loadEmployeeReferenceData,
  saveOwnEmploymentContact,
  prepareEmployeeInvitation,
  removeEmployeeAccess,
  removeEmployeeAvatar,
  retryEmployeeInvitation,
  revokeEmployeeInvitation,
  saveEmployee,
  setEmployeeArchived,
  terminateEmployee,
  updateEmployeeRole,
} from "./employee-data";
import {
  getEmployeeOnboardingReview,
  reviewEmployeeOnboarding,
} from "./onboarding-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const employeeId = "fe201916-aa0e-480b-9144-1e1c8da20a31";
const employeeRoleId = "2efe6c80-634b-4b1d-8f09-7cba30697dd6";
const managerRoleId = "cb8b3ca2-bdaa-460b-9ae8-ef6b8c049226";
const ownerRoleId = "4b70f8b8-8f68-4f1e-b3b6-b0717caf49ab";

function weeklyModel(): WeeklyPreferenceRead {
  return {
    employee_id: employeeId,
    employee_name: "Alex Kim",
    can_manage: true,
    can_edit_employee: false,
    settings: {
      input_mode: "time_range",
      warning_policy: "confirm",
      onboarding_required: false,
      revision: 1,
    },
    employee: {
      revision: 1,
      submitted: true,
      updated_at: null,
      preference: emptyWeeklyPreference("time_range"),
    },
    manager: {
      revision: 0,
      submitted: false,
      updated_at: null,
      preference: emptyWeeklyPreference("time_range"),
      enabled: true,
      notes: Array<string>(7).fill(""),
    },
    shift_types: [],
    time_format: "24h",
  };
}

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
  permissions: [
    "employees.read",
    "employees.manage",
    "employees.archive",
    "employee_access.manage",
    "employee_onboarding.review",
    "employee_documents.review",
    "availability.read",
    "employee_documents.read",
    "employees.private.read",
    "employees.private.manage",
    "employee_access.read",
  ],
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
  role_id: null,
  display_status: "not_invited",
  archived_at: null,
  revision: 1,
  user_id: null,
  internal_note: "",
  private_contact: null,
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

const refresh = vi.fn();
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context, refresh }),
}));
vi.mock("./onboarding-data", () => ({
  getEmployeeDocumentDownload: vi.fn(),
  getEmployeeOnboardingReview: vi.fn(),
  reviewEmployeeOnboarding: vi.fn(),
}));
vi.mock("./employee-data", () => ({
  getEmployeeDetail: vi.fn(),
  getEmployeeAvatar: vi.fn(),
  loadEmployeeInvitationLink: vi.fn(),
  saveOwnEmploymentContact: vi.fn(),
  loadEmployeeReferenceData: vi.fn(),
  prepareEmployeeInvitation: vi.fn(),
  removeEmployeeAccess: vi.fn(),
  removeEmployeeAvatar: vi.fn(),
  retryEmployeeInvitation: vi.fn(),
  revokeEmployeeInvitation: vi.fn(),
  saveEmployee: vi.fn(),
  setEmployeeArchived: vi.fn(),
  terminateEmployee: vi.fn(),
  updateEmployeeRole: vi.fn(),
}));

function renderDrawer(
  section: EmployeeSection = "access",
  detailFixture: EmployeeDetail = detail,
  onboardingFixture: EmployeeOnboardingManager | null = {
    case_id: "aa000000-0000-4000-8000-000000000001",
    employee_id: employeeId,
    case_status: "in_progress",
    revision: 1,
    submitted_at: null,
    progress_completed: 0,
    progress_total: 0,
    ssn_present: false,
    requirements: [],
  },
  onOnboardingReviewSuccess?: (review: {
    readonly action: "accept_requirement" | "reject_requirement";
    readonly requirementId: string;
  }) => void,
) {
  vi.mocked(getEmployeeDetail).mockResolvedValue(detailFixture);
  vi.mocked(loadEmployeeReferenceData).mockResolvedValue({
    locations: detailFixture.locations.map((location) => ({
      ...location,
      timezone: "America/Los_Angeles",
    })),
    jobs: detailFixture.jobs,
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
  vi.mocked(retryEmployeeInvitation).mockResolvedValue({
    id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
    expiresAt: "2026-08-24T12:00:00.000Z",
  });
  vi.mocked(getEmployeeAvatar).mockResolvedValue({ present: false, url: null });
  vi.mocked(removeEmployeeAvatar).mockResolvedValue();
  vi.mocked(removeEmployeeAccess).mockResolvedValue();
  vi.mocked(revokeEmployeeInvitation).mockResolvedValue();
  vi.mocked(saveEmployee).mockResolvedValue(employeeId);
  vi.mocked(setEmployeeArchived).mockResolvedValue();
  vi.mocked(terminateEmployee).mockResolvedValue({
    terminationId: "ca000000-0000-4000-8000-000000000001",
    effectiveAt: "2026-09-02T19:00:00.000Z",
    releasedShiftCount: 2,
    idempotentReplay: false,
  });
  vi.mocked(updateEmployeeRole).mockResolvedValue();
  vi.mocked(getEmployeeOnboardingReview).mockResolvedValue(onboardingFixture);
  vi.mocked(reviewEmployeeOnboarding).mockResolvedValue(2);

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  const onSectionChange = vi.fn();
  function Harness() {
    const [activeSection, setActiveSection] = useState(section);
    return (
      <EmployeeDrawer
        employeeId={employeeId}
        creating={false}
        section={activeSection}
        onSectionChange={(nextSection) => {
          onSectionChange(nextSection);
          setActiveSection(nextSection);
        }}
        onClose={onClose}
        onCreated={vi.fn()}
        onOnboardingReviewSuccess={onOnboardingReviewSuccess}
      />
    );
  }
  const view = render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  return { client, onClose, onSectionChange, ...view };
}

describe("EmployeeDrawer", () => {
  it("saves an email without inviting, clears dirty state and closes with Done", async () => {
    const { onClose, onSectionChange } = renderDrawer("profile");
    const input = await screen.findByLabelText("E-mail");
    fireEvent.change(input, { target: { value: "new@example.test" } });
    expect(
      (screen.getByRole("button", { name: "Invite" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    vi.mocked(getEmployeeDetail).mockResolvedValue({
      ...detail,
      invitation_email: "new@example.test",
      revision: 2,
    });
    fireEvent.keyDown(input, { key: "Enter" });
    const done = await screen.findByRole("button", { name: "Done" });
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    expect(onSectionChange).toHaveBeenCalledWith("profile");
    expect(
      (
        screen.getByRole("button", {
          name: "Terminate employee",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(prepareEmployeeInvitation).not.toHaveBeenCalled();
    fireEvent.click(done);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("saves edited email before inviting with one click", async () => {
    renderDrawer("profile");
    fireEvent.change(await screen.findByLabelText("E-mail"), {
      target: { value: "new@example.test" },
    });
    vi.mocked(getEmployeeDetail).mockResolvedValue({
      ...detail,
      invitation_email: "new@example.test",
      revision: 2,
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    const inviteRole = screen.getByLabelText("Invite role");
    expect(inviteRole.getAttribute("aria-invalid")).toBe("true");
    expect(inviteRole.closest("label")?.className).toContain(
      "employee-invite-role-invalid-1",
    );
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(inviteRole.closest("label")?.className).toContain(
      "employee-invite-role-invalid-0",
    );
    expect(prepareEmployeeInvitation).not.toHaveBeenCalled();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    fireEvent.change(inviteRole, {
      target: { value: employeeRoleId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() =>
      expect(prepareEmployeeInvitation).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        "new@example.test",
        employeeRoleId,
      ),
    );
    expect(saveEmployee).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveEmployee).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(prepareEmployeeInvitation).mock.invocationCallOrder[0]!,
    );
  });

  it("changes Done back to Save changes after another edit", async () => {
    const { onClose } = renderDrawer("profile");
    fireEvent.change(await screen.findByLabelText("First name"), {
      target: { value: "Alexandra" },
    });
    vi.mocked(getEmployeeDetail).mockResolvedValue({
      ...detail,
      first_name: "Alexandra",
      revision: 2,
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("button", { name: "Done" });
    fireEvent.change(screen.getByLabelText("Last name"), {
      target: { value: "Reed" },
    });
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Save changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    vi.mocked(getEmployeeDetail).mockResolvedValue({
      ...detail,
      first_name: "Alexandra",
      last_name: "Reed",
      revision: 3,
    });
    fireEvent.keyDown(screen.getByLabelText("Last name"), { key: "Enter" });
    await waitFor(() => expect(saveEmployee).toHaveBeenCalledTimes(2));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("holds Save when an edit clears the last location, unless remote or excluded", async () => {
    renderDrawer("employment");
    fireEvent.click(await screen.findByLabelText("Main Dining"));
    const save = screen.getByRole("button", { name: "Save changes" });
    // The server refuses this shape; before, Save stayed enabled and failed
    // after the round trip.
    expect(save).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByLabelText("Remote"));
    expect(save).toHaveProperty("disabled", false);
    expect(saveEmployee).not.toHaveBeenCalled();
  });

  it("terminates with archived location and job without reassigning or saving", async () => {
    renderDrawer("employment", {
      ...detail,
      locations: detail.locations.map((location) => ({
        ...location,
        archived: true,
      })),
      jobs: detail.jobs.map((job) => ({ ...job, archived: true })),
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Terminate employee" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Terminate employee" });
    fireEvent.change(within(dialog).getByLabelText("Effective date and time"), {
      target: { value: "2026-09-01T12:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Employment ended" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirm termination" }),
    );
    await waitFor(() =>
      expect(terminateEmployee).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        expect.objectContaining({ worksiteTimezone: "America/Los_Angeles" }),
      ),
    );
    expect(saveEmployee).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delete (context as ActiveWorkspaceContext).documentAccess;
    vi.mocked(listDocuments).mockResolvedValue([]);
    vi.mocked(loadWeeklyPreferences).mockResolvedValue(weeklyModel());
    vi.mocked(previewWeeklyPreferences).mockResolvedValue({ items: [] });
  });

  it("leaves weekly drafts without the obsolete availability navigation prompt", async () => {
    const { onClose, onSectionChange } = renderDrawer("availability");
    fireEvent.click(
      await screen.findByRole("tab", { name: "Manager reminders" }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Monday all day unavailable" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Close employee details" })[0]!,
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Stay here" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Employee section"), {
      target: { value: "profile" },
    });
    expect(onSectionChange).toHaveBeenCalledWith("profile");
    expect(saveWeeklyPreferences).not.toHaveBeenCalled();
    expect(saveEmployee).not.toHaveBeenCalled();
  });

  it("saves reminders independently without submitting the employee profile", async () => {
    const next = weeklyModel();
    next.manager!.preference.days[1]!.all_day = true;
    next.manager!.revision = 1;
    next.manager!.submitted = true;
    vi.mocked(saveWeeklyPreferences).mockResolvedValue({
      model: next,
      finalized: [],
      kept_count: 0,
      cancelled_count: 0,
      resolved_count: 0,
    });
    const { container } = renderDrawer("availability");
    fireEvent.click(
      await screen.findByRole("tab", { name: "Manager reminders" }),
    );
    expect(loadWeeklyPreferences).toHaveBeenCalledWith(
      workspaceId,
      employeeId,
      false,
    );
    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^Save changes$/ })).toBeNull();
    fireEvent.click(
      screen.getByRole("switch", { name: "Monday all day unavailable" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    expect(saveEmployee).not.toHaveBeenCalled();
    expect(saveWeeklyPreferences).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({
        employee_id: employeeId,
        source: "manager",
        expected_revision: 0,
        preference: expect.objectContaining({
          days: expect.arrayContaining([
            expect.objectContaining({ day: 1, all_day: true }),
          ]),
        }),
      }),
      expect.any(String),
      false,
    );
  });

  it("shows an expandable empty employee week and honors server read-only manager scope", async () => {
    const model = weeklyModel();
    model.can_manage = false;
    vi.mocked(loadWeeklyPreferences).mockResolvedValue(model);
    const { container } = renderDrawer("availability");
    await screen.findByText("Available all week");
    expect(
      container
        .querySelector("details.weekly-available-summary")
        ?.hasAttribute("open"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: "Manager reminders" }));
    expect(
      screen
        .getByRole("switch", { name: "Enable manager reminders" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Save" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("does not fall back to legacy availability when the weekly endpoint fails", async () => {
    vi.mocked(loadWeeklyPreferences).mockRejectedValueOnce(
      new Error("Weekly preferences unavailable"),
    );
    renderDrawer("availability");
    await screen.findByText("Weekly preferences unavailable");
    expect(
      screen.queryByRole("button", { name: "Enter availability for employee" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("tab", { name: "Manager reminders" });
    expect(saveWeeklyPreferences).not.toHaveBeenCalled();
  });

  it("shows the normal empty state when the employee has no onboarding case", async () => {
    renderDrawer("documents", detail, null);

    expect(
      await screen.findByText("No documents match these filters."),
    ).toBeTruthy();
    expect(screen.queryByText("Loading onboarding...")).toBeNull();
    expect(getEmployeeOnboardingReview).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Accept / })).toBeNull();
  });

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

    fireEvent.change(await screen.findByLabelText("E-mail"), {
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

  it("does not overwrite unsaved profile changes when employee detail refetches", async () => {
    const { client } = renderDrawer("profile");

    fireEvent.change(await screen.findByLabelText("First name"), {
      target: { value: "Draft Alex" },
    });
    vi.mocked(getEmployeeDetail).mockResolvedValue({
      ...detail,
      first_name: "Server Alex",
      display_name: "Server Alex Kim",
      revision: 2,
    });

    await client.invalidateQueries({
      queryKey: ["employee-detail", workspaceId, employeeId],
    });

    await waitFor(() => expect(getEmployeeDetail).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("First name")).toHaveProperty(
      "value",
      "Draft Alex",
    );
  });

  it("does not overwrite an unsaved invite role choice when employee detail refetches", async () => {
    const { client } = renderDrawer("access");

    fireEvent.change(await screen.findByLabelText("Invite role"), {
      target: { value: managerRoleId },
    });
    vi.mocked(getEmployeeDetail).mockResolvedValue({
      ...detail,
      revision: 2,
    });

    await client.invalidateQueries({
      queryKey: ["employee-detail", workspaceId, employeeId],
    });

    await waitFor(() => expect(getEmployeeDetail).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Invite role")).toHaveProperty(
      "value",
      managerRoleId,
    );
  });

  it("updates the workspace role for a linked employee", async () => {
    renderDrawer("access", {
      ...detail,
      role_id: employeeRoleId,
      role_name: "Employee",
      user_id: "16000000-0000-4000-8000-000000000005",
      display_status: "active",
    });

    fireEvent.change(await screen.findByLabelText("Workspace role"), {
      target: { value: managerRoleId },
    });

    await waitFor(() =>
      expect(updateEmployeeRole).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        managerRoleId,
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the linked owner role and lifecycle read-only", async () => {
    renderDrawer("access", {
      ...detail,
      role_id: ownerRoleId,
      role_name: "Owner",
      user_id: context.userId,
      display_status: "active",
    });

    expect(await screen.findByLabelText("Workspace role")).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.queryByRole("button", { name: "Remove access" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Terminate employee" }),
    ).toBeNull();
    expect(updateEmployeeRole).not.toHaveBeenCalled();
    expect(removeEmployeeAccess).not.toHaveBeenCalled();
    expect(setEmployeeArchived).not.toHaveBeenCalled();
  });

  it("shows invitation delivery failure without clearing the pending invite", async () => {
    renderDrawer("access", {
      ...detail,
      display_status: "invited",
      invitation: {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        email: "alex@example.test",
        role_id: employeeRoleId,
        status: "pending",
        expires_at: "2099-08-24T12:00:00.000Z",
        sent_at: "2026-08-17T12:00:00.000Z",
        delivery_status: "failed",
        delivery_attempted_at: "2026-08-17T12:01:00.000Z",
        delivery_failed_at: "2026-08-17T12:01:00.000Z",
        delivery_error: "Invitation delivery failed (503)",
      },
    });

    expect(
      await screen.findAllByText("Invitation delivery failed"),
    ).toHaveLength(2);
    expect(screen.getByText("Invitation delivery failed (503)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(retryEmployeeInvitation).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
      ),
    );
    expect(screen.getByRole("button", { name: "Resend" })).toBeTruthy();
  });

  // Everyone else gives an emergency contact while onboarding. The owner never
  // runs it, so theirs is entered here — by them, and never required.
  it("lets the owner enter their own emergency contact", async () => {
    vi.mocked(saveOwnEmploymentContact).mockResolvedValue(undefined);
    renderDrawer("profile", {
      ...detail,
      user_id: context.userId,
      role_name: "Owner",
      private_contact: null,
    });

    const name = await screen.findByLabelText("Emergency contact");
    fireEvent.change(name, { target: { value: "Morgan Tepebas" } });
    fireEvent.change(screen.getByLabelText("Emergency phone"), {
      target: { value: "3105550101" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save emergency contact" }),
    );

    await waitFor(() =>
      expect(saveOwnEmploymentContact).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        expect.objectContaining({
          name: "Morgan Tepebas",
          phone: "3105550101",
        }),
      ),
    );
  });

  it("will not save half an emergency contact", async () => {
    renderDrawer("profile", {
      ...detail,
      user_id: context.userId,
      role_name: "Owner",
      private_contact: null,
    });

    fireEvent.change(await screen.findByLabelText("Emergency contact"), {
      target: { value: "Morgan Tepebas" },
    });

    expect(
      screen.getByRole("button", { name: "Save emergency contact" }),
    ).toHaveProperty("disabled", true);
  });

  it("shows somebody else's emergency contact without offering to edit it", async () => {
    renderDrawer("profile", { ...detail, role_name: "Employee" });

    await screen.findByLabelText("First name");
    expect(
      screen.queryByRole("button", { name: "Save emergency contact" }),
    ).toBeNull();
  });

  it("names the role an invitation grants and the person who sent it", async () => {
    renderDrawer("access", {
      ...detail,
      display_status: "invited",
      invitation: {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        email: "alex@example.test",
        role_id: employeeRoleId,
        status: "pending",
        expires_at: "2099-08-24T12:00:00.000Z",
        sent_at: "2026-08-17T12:00:00.000Z",
        delivery_status: "sent",
        role_name: "Manager",
        invited_by_name: "Mert Tepebas",
      },
    });

    expect(await screen.findByText("Invited by")).toBeTruthy();
    expect(screen.getByText("Mert Tepebas")).toBeTruthy();
    expect(screen.getAllByText("Manager").length).toBeGreaterThan(0);
    expect(screen.getByText("Expires")).toBeTruthy();
  });

  it("copies the invitation link when email did not get there", async () => {
    const writeText = vi.fn(async () => undefined);
    const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    // Put it back, so a file that runs after this one in the same environment
    // still finds the clipboard it expects.
    onTestFinished(() => {
      if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    });
    vi.mocked(loadEmployeeInvitationLink).mockResolvedValue({
      url: "http://newfork.test/invite/accept?token=abc",
      expiresAt: "2099-08-24T12:00:00.000Z",
    });
    renderDrawer("access", {
      ...detail,
      display_status: "invited",
      invitation: {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        email: "alex@example.test",
        role_id: employeeRoleId,
        status: "pending",
        expires_at: "2099-08-24T12:00:00.000Z",
        sent_at: "2026-08-17T12:00:00.000Z",
        delivery_status: "sent",
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "http://newfork.test/invite/accept?token=abc",
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Link copied" }),
    ).toBeTruthy();
  });

  it("asks twice before revoking an invitation", async () => {
    renderDrawer("access", {
      ...detail,
      display_status: "invited",
      invitation: {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        email: "alex@example.test",
        role_id: employeeRoleId,
        status: "pending",
        expires_at: "2099-08-24T12:00:00.000Z",
        sent_at: "2026-08-17T12:00:00.000Z",
        delivery_status: "sent",
      },
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Revoke invitation" }),
    );
    expect(revokeEmployeeInvitation).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole("button", { name: /Click again to revoke/ }),
    );

    await waitFor(() =>
      expect(revokeEmployeeInvitation).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
      ),
    );
  });

  it("sends a reminder for the current pending invitation", async () => {
    renderDrawer("access", {
      ...detail,
      display_status: "invited",
      invitation: {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        email: "alex@example.test",
        role_id: employeeRoleId,
        status: "pending",
        expires_at: "2099-08-24T12:00:00.000Z",
        sent_at: "2026-08-17T12:00:00.000Z",
        delivery_status: "sent",
        delivery_attempted_at: "2026-08-17T12:01:00.000Z",
        delivery_failed_at: null,
        delivery_error: null,
      },
    });

    expect(await screen.findAllByText("Invitation sent")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Revoke invitation" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send reminder" }));

    await waitFor(() =>
      expect(retryEmployeeInvitation).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
      ),
    );
  });

  it("keeps profile photo removal disabled until a workspace photo exists", async () => {
    renderDrawer("access");

    expect(await screen.findByText("Profile photo removal")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove photo" })).toHaveProperty(
      "disabled",
      true,
    );
    // Kiosk section is post-MVP and hidden while postMvpSurfaces is false.
    expect(screen.queryByText("Reset PIN")).toBeNull();
  });

  it("removes the workspace profile photo when one exists, on the second click", async () => {
    const { client } = renderDrawer("access");

    const removePhoto = await screen.findByRole("button", {
      name: "Remove photo",
    });
    expect(removePhoto).toHaveProperty("disabled", true);
    vi.mocked(getEmployeeAvatar).mockResolvedValue({
      present: true,
      url: "https://example.test/avatar.png",
    });
    await client.invalidateQueries({
      queryKey: ["employee-avatar", workspaceId, employeeId],
    });
    await waitFor(() => expect(removePhoto).toHaveProperty("disabled", false));
    // The first click only arms it: losing a photo to one stray click is what
    // the two-click button exists to prevent.
    fireEvent.click(removePhoto);
    expect(removeEmployeeAvatar).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole("button", { name: /Click again to remove/ }),
    );

    await waitFor(() =>
      expect(removeEmployeeAvatar).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
      ),
    );
  });

  it("locks profile identity and email while an invitation is pending", async () => {
    renderDrawer("profile", {
      ...detail,
      display_status: "invited",
      invitation: {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        email: "alex@example.test",
        role_id: employeeRoleId,
        status: "pending",
        expires_at: "2099-08-24T12:00:00.000Z",
        sent_at: "2026-08-17T12:00:00.000Z",
        delivery_status: "sent",
        delivery_attempted_at: "2026-08-17T12:01:00.000Z",
        delivery_failed_at: null,
        delivery_error: null,
      },
    });

    expect(await screen.findByLabelText("First name")).toHaveProperty(
      "readOnly",
      true,
    );
    expect(screen.getByLabelText("Last name")).toHaveProperty("readOnly", true);
    expect(screen.getByLabelText("E-mail")).toHaveProperty("readOnly", true);
    expect(screen.getByLabelText("Invite role")).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("unlocks profile identity and email after a pending invitation is revoked", async () => {
    renderDrawer("profile", {
      ...detail,
      display_status: "not_invited",
      invitation: {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        email: "alex@example.test",
        role_id: employeeRoleId,
        status: "revoked",
        expires_at: "2099-08-24T12:00:00.000Z",
        sent_at: "2026-08-17T12:00:00.000Z",
        delivery_status: "sent",
        delivery_attempted_at: "2026-08-17T12:01:00.000Z",
        delivery_failed_at: null,
        delivery_error: null,
      },
    });

    expect(await screen.findByLabelText("First name")).toHaveProperty(
      "readOnly",
      false,
    );
    expect(screen.getByLabelText("Last name")).toHaveProperty(
      "readOnly",
      false,
    );
    expect(screen.getByLabelText("E-mail")).toHaveProperty("readOnly", false);
    expect(screen.getByLabelText("Invite role")).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("shows removed access after an accepted invitation even after its expiry date", async () => {
    renderDrawer("access", {
      ...detail,
      display_status: "not_invited",
      user_id: null,
      invitation: {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        email: "alex@example.test",
        role_id: employeeRoleId,
        status: "accepted",
        expires_at: "2026-08-24T12:00:00.000Z",
        sent_at: "2026-08-17T12:00:00.000Z",
        delivery_status: "sent",
        delivery_attempted_at: "2026-08-17T12:01:00.000Z",
        delivery_failed_at: null,
        delivery_error: null,
      },
    });

    expect(await screen.findAllByText("Access removed")).toHaveLength(2);
    expect(screen.queryByText("Invitation expired")).toBeNull();
  });

  it("routes the no-email access state to the profile email field", async () => {
    renderDrawer("access", {
      ...detail,
      invitation_email: null,
      invitation: null,
    });

    expect(await screen.findByText("No email")).toBeTruthy();
    expect(
      screen.getByText("Add an email before sending an invite."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add email" }));

    const email = await screen.findByLabelText("E-mail");
    await waitFor(() => expect(document.activeElement).toBe(email));
  });

  it("shows linked private contact details as read-only profile data", async () => {
    renderDrawer("profile", {
      ...detail,
      user_id: "16000000-0000-4000-8000-000000000005",
      account_email: "alex.account@example.test",
      private_contact: {
        legal_first_name: "Alex",
        legal_last_name: "Kim",
        preferred_name: "",
        phone: "3105559999",
        street_address: "100 Main Street",
        city: "Los Angeles",
        region: "CA",
        postal_code: "90001",
        country_code: "US",
        date_of_birth: "1990-02-14",
        emergency_contact_name: "Jamie Kim",
        emergency_contact_relationship: "Sibling",
        emergency_contact_phone: "3105550001",
        emergency_contact_email: "jamie@example.test",
        share_phone_with_teammates: true,
        share_email_with_teammates: true,
      },
    });

    expect(
      await screen.findByRole("heading", { name: "Identity" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Contact" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Address" })).toBeTruthy();
    expect(screen.getByLabelText("E-mail")).toHaveProperty(
      "value",
      "alex.account@example.test",
    );
    expect(screen.getByLabelText("E-mail")).toHaveProperty("readOnly", true);
    expect(screen.getByLabelText("Phone")).toHaveProperty(
      "value",
      "3105559999",
    );
    expect(screen.getByLabelText("Phone")).toHaveProperty("readOnly", true);
    expect(screen.getByLabelText("Date of birth")).toHaveProperty(
      "value",
      "1990-02-14",
    );
    expect(screen.getByLabelText("Emergency contact")).toHaveProperty(
      "value",
      "Jamie Kim",
    );
    expect(screen.getByLabelText("Street address")).toHaveProperty(
      "value",
      "100 Main Street",
    );
    expect(screen.getByLabelText("City")).toHaveProperty(
      "value",
      "Los Angeles",
    );
    expect(screen.getByLabelText("State")).toHaveProperty("value", "CA");
    expect(screen.getByLabelText("ZIP code")).toHaveProperty("value", "90001");
  });

  it("allows excluded employees to be saved without location or job assignments", async () => {
    renderDrawer("employment", {
      ...detail,
      primary_location_id: null,
      primary_location_name: null,
      location_count: 0,
      primary_job_id: null,
      primary_job_name: null,
      job_count: 0,
      locations: [],
      jobs: [],
    });

    fireEvent.click(await screen.findByLabelText("Exclude from schedule"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(saveEmployee).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          location_ids: [],
          primary_location_id: null,
          job_ids: [],
          primary_job_id: null,
          is_excluded_from_schedule: true,
        }),
        employeeId,
      ),
    );
  });

  it("shows selected work modes in employment and the summary rail", async () => {
    renderDrawer("employment", {
      ...detail,
      is_remote: true,
      is_excluded_from_schedule: true,
    });

    expect(
      (await screen.findByLabelText("Remote")).closest("label")?.dataset
        .selected,
    ).toBe("true");
    expect(
      screen.getByLabelText("Exclude from schedule").closest("label")?.dataset
        .selected,
    ).toBe("true");
    const workStatus = screen.getByLabelText("Work status");
    expect(within(workStatus).getByText("Remote")).toBeTruthy();
    expect(within(workStatus).getByText("Off schedule")).toBeTruthy();
  });

  it("marks normal employee assignments as required in edit mode", async () => {
    renderDrawer("employment");

    await screen.findByText("Locations");

    expect(screen.getAllByText("Required")).toHaveLength(2);
    expect(screen.queryByText("Optional")).toBeNull();
  });

  it("shows legal name review in the profile tab when employee changes the provisional name", async () => {
    renderDrawer("profile", detail, {
      case_id: "aa000000-0000-4000-8000-000000000001",
      employee_id: employeeId,
      case_status: "submitted",
      revision: 4,
      submitted_at: "2026-09-02T19:00:00.000Z",
      progress_completed: 2,
      progress_total: 3,
      ssn_present: false,
      requirements: [
        {
          id: "ab000000-0000-4000-8000-000000000001",
          kind: "profile",
          title: "Profile and privacy",
          description: "Legal name differs from the provisional employee name.",
          status: "awaiting_review",
          required: true,
          blocks_activation: true,
          requires_review: true,
          sort_order: 10,
          source_id: null,
          accepted_formats: [],
          content_text: null,
          content_digest: null,
          intent_statement: null,
          rejection_reason: null,
        },
      ],
    });

    expect(await screen.findByText("Legal name review")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Accept Profile and privacy" }),
    );

    await waitFor(() =>
      expect(reviewEmployeeOnboarding).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        {
          action: "accept_requirement",
          requirementId: "ab000000-0000-4000-8000-000000000001",
          reason: "",
          revision: 4,
        },
      ),
    );
  });

  it("opens the shared document detail from the employee-scoped list", async () => {
    const obligation = {
      id: "ab000000-0000-4000-8000-000000000002",
      workspace_id: workspaceId,
      employee_id: employeeId,
      employee_name: "Alex Kim",
      title: "Food handler card",
      source_id: null,
      kind: "document" as const,
      mode: "required" as const,
      status: "missing" as const,
      revision: 1,
      requires_review: true,
      deadline_at: null,
      remaining_seconds: null,
      rejection_reason: null,
      suspended: false,
      submitted_id: null,
      approved_id: null,
      location_ids: [],
      location_names: [],
      timezone: "America/Los_Angeles",
      settings: {
        ...defaultDocumentLifecycleSettings,
        mode: "required" as const,
      },
      accepted_formats: ["pdf" as const],
      tracks_expiry: false,
    };
    vi.mocked(listDocuments).mockResolvedValue([obligation]);
    vi.mocked(getDocument).mockResolvedValue({
      obligation,
      submissions: [],
      history: [],
    });
    renderDrawer("documents", detail);
    fireEvent.click(
      await screen.findByRole("row", {
        name: "Alex Kim Food handler card Missing",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Food handler card" }),
    ).toBeTruthy();
    expect(getDocument).toHaveBeenCalledWith(
      { workspaceId, selfOnly: false },
      obligation.id,
    );
    expect(reviewEmployeeOnboarding).not.toHaveBeenCalled();
  });

  it("requires termination details and submits a worksite-local effective time", async () => {
    renderDrawer("employment");

    fireEvent.click(
      await screen.findByRole("button", { name: "Terminate employee" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Terminate employee" });
    fireEvent.change(within(dialog).getByLabelText("Effective date and time"), {
      target: { value: "2026-09-01T12:00" },
    });
    fireEvent.change(
      within(dialog).getByLabelText("Open time entry handling"),
      {
        target: { value: "close_at" },
      },
    );
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Employment ended" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirm termination" }),
    );

    await waitFor(() =>
      expect(terminateEmployee).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        expect.objectContaining({
          effectiveLocal: "2026-09-01T12:00",
          worksiteTimezone: "America/Los_Angeles",
          timeEntryAction: "close_at",
          reason: "Employment ended",
          idempotencyKey: expect.any(String),
        }),
      ),
    );
    expect(
      await screen.findByText(
        "Employee terminated. 2 published shifts released.",
      ),
    ).toBeTruthy();
  });
});

describe("employee assignment document impact", () => {
  it("blocks changed assignments for the current preview and ignores a late older result", async () => {
    (context as ActiveWorkspaceContext).documentAccess = { restricted: false };
    let resolveA!: (value: []) => void;
    let resolveB!: (value: []) => void;
    vi.mocked(previewEmployeeDocumentAssignments)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveB = resolve;
          }),
      );
    const fixture = {
      ...detail,
      user_id: context.userId,
      locations: [
        ...detail.locations,
        {
          ...detail.locations[0]!,
          id: "11000000-0000-4000-8000-000000000002",
          name: "Secondary Branch",
          primary: false,
        },
      ],
      jobs: [
        ...detail.jobs,
        {
          ...detail.jobs[0]!,
          id: "22000000-0000-4000-8000-000000000002",
          name: "Runner",
          primary: false,
        },
      ],
    } satisfies EmployeeDetail;
    renderDrawer("employment", fixture);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Secondary Branch" }),
    );
    await waitFor(() =>
      expect(previewEmployeeDocumentAssignments).toHaveBeenCalledTimes(1),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Runner" }));
    await waitFor(() =>
      expect(previewEmployeeDocumentAssignments).toHaveBeenCalledTimes(2),
    );
    resolveA([]);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toHaveProperty("disabled", true),
    );
    expect(saveEmployee).not.toHaveBeenCalled();
    resolveB([]);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toHaveProperty("disabled", false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(saveEmployee).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          location_ids: [detail.locations[0]!.id],
          job_ids: [detail.jobs[0]!.id],
        }),
        employeeId,
      ),
    );
    delete (context as ActiveWorkspaceContext).documentAccess;
  });
});
