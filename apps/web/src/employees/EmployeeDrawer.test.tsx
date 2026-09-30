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
import { MemoryRouter } from "react-router";
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
import { RequestError } from "../lib/request-error";
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
  removeEmployeeFromLocation,
  retryEmployeeInvitation,
  revokeEmployeeInvitation,
  saveEmployee,
  setEmployeeArchived,
  setEmployeeManagedLocations,
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
  actions: [
    "employee.read",
    "employee.list",
    "employee.create",
    "availability.team_read",
    "documents.read",
    "onboarding.review",
  ],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
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
      removable: true,
    },
  ],
  managed_locations: [],
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
  allowed: {
    save: true,
    terminate: true,
    archive: true,
    remove_access: true,
    change_role: true,
    make_admin: true,
    set_managed_locations: false,
    invite: true,
    onboarding_review: true,
  },
} satisfies EmployeeDetail;

// What the server answers for the owner's own record: save, nothing else.
const ownRecordAllowed = {
  save: true,
  terminate: false,
  archive: false,
  remove_access: false,
  change_role: false,
  make_admin: false,
  set_managed_locations: false,
  invite: false,
  onboarding_review: false,
};

const refresh = vi.fn();
// The signed-in reader; a test that needs another sets it first.
let currentContext: ActiveWorkspaceContext = context;
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: currentContext, refresh }),
}));
vi.mock("./onboarding-data", () => ({
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
  removeEmployeeFromLocation: vi.fn(),
  retryEmployeeInvitation: vi.fn(),
  revokeEmployeeInvitation: vi.fn(),
  saveEmployee: vi.fn(),
  setEmployeeArchived: vi.fn(),
  setEmployeeManagedLocations: vi.fn(),
  terminateEmployee: vi.fn(),
  updateEmployeeRole: vi.fn(),
}));

let renderedDetail: EmployeeDetail = detail;
// Roles the drawer may offer; a test that needs others sets this first.
let inviteRolesFixture: {
  id: string;
  name: string;
  systemKey: "employee" | "manager" | "admin";
  accessClass: "employee" | "manager" | "admin";
}[] = [];
// When set, the detail read fails with this instead of answering.
let detailFailure: Error | null = null;
// Locations the drawer may pick beyond the record's own; a test sets it first.
let extraReferenceLocations: { id: string; name: string; archived: boolean }[] = [];
beforeEach(() => {
  inviteRolesFixture = [
    { id: employeeRoleId, name: "Employee", systemKey: "employee", accessClass: "employee" },
    { id: managerRoleId, name: "Manager", systemKey: "manager", accessClass: "manager" },
  ];
  detailFailure = null;
  extraReferenceLocations = [];
  currentContext = context;
});

// The drawer copies the loaded employee into its form one effect after the
// data arrives. A click in that first frame lands on an empty form and wipes
// the person's jobs and locations (BL-322), so wait until the Employment
// section is up and its form holds them.
async function employeeLoaded() {
  await waitFor(() => {
    screen.getByLabelText("Exclude from schedule");
    for (const item of [...renderedDetail.jobs, ...renderedDetail.locations]) {
      expect((screen.getByLabelText(item.name) as HTMLInputElement).checked).toBe(true);
    }
  });
}

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
  renderedDetail = detailFixture;
  if (detailFailure) vi.mocked(getEmployeeDetail).mockRejectedValue(detailFailure);
  else vi.mocked(getEmployeeDetail).mockResolvedValue(detailFixture);
  vi.mocked(loadEmployeeReferenceData).mockResolvedValue({
    locations: [...detailFixture.locations, ...extraReferenceLocations].map((location) => ({
      ...location,
      timezone: "America/Los_Angeles",
    })),
    departments: [],
    jobs: detailFixture.jobs.map((job) => ({
      id: job.id,
      name: job.name,
      archived: job.archived,
      departmentId: null,
      management: false,
      owner: false,
    })),
    inviteRoles: inviteRolesFixture,
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
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    </MemoryRouter>,
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
    // A location the reader may not Remove is the one the form can untick (FB-6.2.8).
    renderDrawer("employment", { ...detail, locations: [{ ...detail.locations[0]!, removable: false }] });
    await employeeLoaded();
    fireEvent.click(screen.getByLabelText("Main Dining"));
    const save = screen.getByRole("button", { name: "Save changes" });
    // The server refuses this shape; before, Save stayed enabled and failed
    // after the round trip.
    expect(save).toHaveProperty("disabled", true);
    // Save says why it is held (BL-218), in the words the API would use.
    expect(
      screen.getByText("Choose at least one location and mark one as primary, or turn on Remote or Exclude from schedule."),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Remote"));
    expect(save).toHaveProperty("disabled", false);
    expect(saveEmployee).not.toHaveBeenCalled();
  });

  // BL-278 (2): termination releases published shifts; Schedule and the
  // dashboard must not keep showing them.
  it("refreshes Schedule and the dashboard after a termination", async () => {
    const { client } = renderDrawer("employment");
    client.setQueryData(["schedule-read", workspaceId, "2026-09-01"], { shifts: [] });
    client.setQueryData(["workspace-dashboard", workspaceId], { pending: 1 });
    fireEvent.click(await screen.findByRole("button", { name: "Terminate employee" }));
    const dialog = screen.getByRole("dialog", { name: "Terminate employee" });
    fireEvent.change(within(dialog).getByLabelText("Effective date and time"), { target: { value: "2026-09-01T12:00" } });
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Employment ended" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm termination" }));
    await waitFor(() => expect(client.getQueryState(["schedule-read", workspaceId, "2026-09-01"])?.isInvalidated).toBe(true));
    expect(client.getQueryState(["workspace-dashboard", workspaceId])?.isInvalidated).toBe(true);
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
      allowed: ownRecordAllowed,
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
      await screen.findByRole("button", { name: /Confirm revoke/ }),
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
      await screen.findByRole("button", { name: /Confirm remove/ }),
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

    await employeeLoaded();
    fireEvent.click(screen.getByLabelText("Exclude from schedule"));
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

  describe("a Management job is primary by its department (BL-218 .3b)", () => {
    // Deniz works Host and Cook; Host moved under Management, so the database
    // cleared the primary.
    const deniz = {
      ...detail,
      primary_job_id: null,
      primary_job_name: null,
      job_count: 2,
      jobs: [
        { id: "22000000-0000-4000-8000-0000000000b1", name: "Host", primary: false, archived: false },
        { id: "22000000-0000-4000-8000-0000000000b2", name: "Cook", primary: false, archived: false },
      ],
    };
    function denizReferences() {
      vi.mocked(loadEmployeeReferenceData).mockResolvedValueOnce({
        locations: deniz.locations.map((location) => ({ ...location, timezone: "America/Los_Angeles" })),
        departments: [{ id: "dd000000-0000-4000-8000-000000000001", name: "Management", archived: false, management: true }],
        jobs: [
          { id: deniz.jobs[0]!.id, name: "Host", archived: false, departmentId: "dd000000-0000-4000-8000-000000000001", management: true, owner: false },
          { id: deniz.jobs[1]!.id, name: "Cook", archived: false, departmentId: null, management: false, owner: false },
        ],
        inviteRoles: [],
      });
    }

    it("does not make the job just unticked the primary", async () => {
      denizReferences();
      renderDrawer("employment", deniz);
      await employeeLoaded();
      fireEvent.click(screen.getByLabelText("Cook"));
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() =>
        expect(saveEmployee).toHaveBeenCalledWith(
          workspaceId,
          expect.objectContaining({ job_ids: [deniz.jobs[0]!.id], primary_job_id: null }),
          employeeId,
        ),
      );
    });

    it("saves Deniz and shows the database answer when a primary job is missing", async () => {
      denizReferences();
      vi.mocked(saveEmployee).mockRejectedValueOnce(
        new RequestError("Mark one of the jobs outside Management as primary.", "employee.primary_job_required", undefined, 400),
      );
      renderDrawer("employment", deniz);
      fireEvent.change(await screen.findByLabelText("Start date"), { target: { value: "2027-02-01" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      expect(await screen.findByText("Mark one of the jobs outside Management as primary.")).toBeTruthy();
      expect(saveEmployee).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ job_ids: deniz.jobs.map((job) => job.id), primary_job_id: null }),
        employeeId,
      );
    });

    const serverJobId = detail.jobs[0]!.id;
    const managerJobId = "22000000-0000-4000-8000-0000000000aa";
    function withManagementJob() {
      vi.mocked(loadEmployeeReferenceData).mockResolvedValueOnce({
        locations: detail.locations.map((location) => ({ ...location, timezone: "America/Los_Angeles" })),
        departments: [{ id: "dd000000-0000-4000-8000-000000000001", name: "Leadership", archived: false, management: true }],
        jobs: [
          { id: serverJobId, name: "Server", archived: false, departmentId: null, management: false, owner: false },
          { id: managerJobId, name: "Floor Manager", archived: false, departmentId: "dd000000-0000-4000-8000-000000000001", management: true, owner: false },
        ],
        inviteRoles: [],
      });
    }
    const jobRow = (name: string) => screen.getByLabelText(name).closest("div")!;

    it("saves somebody who only manages at one location with no primary job", async () => {
      withManagementJob();
      renderDrawer("employment");
      await employeeLoaded();
      fireEvent.click(screen.getByLabelText("Floor Manager"));
      fireEvent.click(screen.getByLabelText("Server"));
      // No primary to pick for a Management job.
      expect(within(jobRow("Floor Manager")).queryByLabelText("Primary")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() =>
        expect(saveEmployee).toHaveBeenCalledWith(
          workspaceId,
          expect.objectContaining({
            location_ids: [detail.locations[0]!.id],
            primary_location_id: detail.locations[0]!.id,
            job_ids: [managerJobId],
            primary_job_id: null,
          }),
          employeeId,
        ),
      );
    });

    it("keeps the primary on the job outside Management for somebody who does both", async () => {
      withManagementJob();
      renderDrawer("employment");
      await employeeLoaded();
      fireEvent.click(screen.getByLabelText("Floor Manager"));
      expect(within(jobRow("Floor Manager")).queryByLabelText("Primary")).toBeNull();
      expect((within(jobRow("Server")).getByLabelText("Primary") as HTMLInputElement).checked).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() =>
        expect(saveEmployee).toHaveBeenCalledWith(
          workspaceId,
          expect.objectContaining({ job_ids: [serverJobId, managerJobId], primary_job_id: serverJobId }),
          employeeId,
        ),
      );
    });
  });

  it("does not make the location just unticked a Remote person's primary", async () => {
    const second = { id: "11000000-0000-4000-8000-000000000002", name: "Patio", primary: false, archived: false, removable: false };
    renderDrawer("employment", {
      ...detail,
      is_remote: true,
      primary_location_id: null,
      primary_location_name: null,
      location_count: 2,
      locations: [{ ...detail.locations[0]!, primary: false }, second],
    });
    await employeeLoaded();
    fireEvent.click(screen.getByLabelText("Patio"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(saveEmployee).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ location_ids: [detail.locations[0]!.id], primary_location_id: null }),
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
    // The server gives the private contact to who may read it (KK-35 S3).
    renderDrawer("profile", {
      ...detail,
      private_contact: {
        legal_first_name: "Alex",
        legal_last_name: "Kim",
        phone: null,
        date_of_birth: null,
        emergency_contact_name: null,
        emergency_contact_relationship: null,
        emergency_contact_email: "",
        emergency_contact_phone: null,
        share_phone_with_teammates: false,
        share_email_with_teammates: false,
      },
    }, {
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
  });
});

// FB-6.2 .7a: the buttons open from what the server says this reader may do
// to this record (detail.allowed), whatever the reader's permissions say.
describe("EmployeeDrawer record actions follow the server", () => {
  const none = {
    save: false,
    terminate: false,
    archive: false,
    remove_access: false,
    change_role: false,
    make_admin: false,
    set_managed_locations: false,
    invite: false,
    onboarding_review: false,
  };
  const linked = {
    ...detail,
    role_id: employeeRoleId,
    role_name: "Employee",
    user_id: "16000000-0000-4000-8000-000000000005",
    display_status: "active" as const,
  };

  it("opens the record read-only when saving is not allowed", async () => {
    renderDrawer("profile", { ...detail, allowed: none });
    expect(await screen.findByLabelText("First name")).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: /^(Save|Done)$/ })).toBeNull();
  });

  it("hides Terminate when the server does not allow it", async () => {
    renderDrawer("profile", { ...detail, allowed: { ...detail.allowed, terminate: false } });
    await screen.findByLabelText("First name");
    expect(screen.queryByRole("button", { name: "Terminate employee" })).toBeNull();
  });

  it("hides Restore when archiving is not allowed", async () => {
    renderDrawer("profile", {
      ...detail,
      archived_at: "2026-09-01T12:00:00.000Z",
      display_status: "archived",
      allowed: { ...detail.allowed, archive: false },
    });
    await screen.findByLabelText("First name");
    expect(screen.queryByRole("button", { name: "Restore employee" })).toBeNull();
  });

  it("hides Remove access when the server does not allow it", async () => {
    renderDrawer("access", { ...linked, allowed: { ...detail.allowed, remove_access: false } });
    const role = await screen.findByLabelText("Workspace role");
    await waitFor(() => expect(role).toHaveProperty("disabled", false));
    expect(screen.queryByRole("button", { name: "Remove access" })).toBeNull();
  });

  it("locks the workspace role when changing it is not allowed", async () => {
    renderDrawer("access", { ...linked, allowed: { ...detail.allowed, change_role: false } });
    expect(await screen.findByLabelText("Workspace role")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Remove access" })).toBeTruthy();
  });

  it("offers an admin role only when making an admin is allowed", async () => {
    inviteRolesFixture = [
      { id: employeeRoleId, name: "Employee", systemKey: "employee", accessClass: "employee" },
      { id: "a0000000-0000-4000-8000-00000000000a", name: "Admin", systemKey: "admin", accessClass: "admin" },
    ];
    renderDrawer("access", { ...linked, allowed: { ...detail.allowed, make_admin: false } });
    const select = await screen.findByLabelText("Workspace role");
    await waitFor(() => expect(within(select).getByRole("option", { name: "Employee" })).toBeTruthy());
    expect(within(select).queryByRole("option", { name: "Admin" })).toBeNull();
  });

  it("shows the no-access card, not the server's sentence, for a person out of reach", async () => {
    detailFailure = new RequestError("Not allowed", "authz.out_of_scope", "employee.read", 403);
    renderDrawer("profile");
    expect(await screen.findByRole("heading", { name: "You don't have access to this employee" })).toBeTruthy();
    expect(screen.queryByText("Not allowed")).toBeNull();
  });

  it("shows the no-access card, not the server's sentence, to somebody not a member", async () => {
    detailFailure = new RequestError("Workspace not found", "authz.not_member", undefined, 404);
    renderDrawer("profile");
    expect(await screen.findByRole("heading", { name: "You don't have access to this employee" })).toBeTruthy();
    expect(screen.queryByText("Workspace not found")).toBeNull();
    expect(screen.queryByText("Employee read required")).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Save|Done|Terminate employee)$/ })).toBeNull();
  });

  it("keeps any other failure as the drawer's error line", async () => {
    detailFailure = new RequestError("Employee directory service is not configured", undefined, undefined, 503);
    renderDrawer("profile");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /You don't have access/ })).toBeNull();
  });
});

// FB-6.2 .7a: which sections open is the core's answer (context.actions),
// not the permission list.
describe("EmployeeDrawer sections follow the core", () => {
  function sectionTab(name: string) {
    return screen.queryByRole("button", { name });
  }

  it("opens Availability and Documents when the core lets the reader do them", async () => {
    currentContext = { ...context, permissions: ["employees.read", "employees.manage"] };
    renderDrawer("profile");
    await screen.findByLabelText("First name");
    expect(sectionTab("Availability")).toBeTruthy();
    expect(sectionTab("Documents")).toBeTruthy();
  });

  it("keeps Availability and Documents shut when the core does not", async () => {
    currentContext = {
      ...context,
      actions: context.actions.filter(
        (action) => action !== "availability.team_read" && action !== "documents.read",
      ),
    };
    renderDrawer("profile");
    await screen.findByLabelText("First name");
    expect(sectionTab("Availability")).toBeNull();
    expect(sectionTab("Documents")).toBeNull();
  });

  it("does not ask for the onboarding review when the core says the reader reads nobody", async () => {
    currentContext = {
      ...context,
      actions: context.actions.filter((action) => action !== "employee.read"),
    };
    vi.mocked(getEmployeeOnboardingReview).mockClear();
    renderDrawer("profile");
    await screen.findByLabelText("First name");
    expect(getEmployeeOnboardingReview).not.toHaveBeenCalled();
  });
});

// FB-6.2 .7b (KK-35): the drawer takes somebody off a location, edits a
// manager's managed locations, invites and reviews onboarding only where the
// server says so; no permission key is read on screen.
describe("EmployeeDrawer locations and access follow the server", () => {
  const mainDining = "11000000-0000-4000-8000-000000000001";
  const patio = { id: "11000000-0000-4000-8000-000000000002", name: "Patio", primary: false, archived: false, removable: false };
  const legalNameOnly = {
    legal_first_name: "Alex",
    legal_last_name: "Kim",
    phone: null,
    date_of_birth: null,
    emergency_contact_name: null,
    emergency_contact_relationship: null,
    emergency_contact_email: "",
    emergency_contact_phone: null,
    share_phone_with_teammates: false,
    share_email_with_teammates: false,
  };
  const profileReview = {
    case_id: "aa000000-0000-4000-8000-000000000001",
    employee_id: employeeId,
    case_status: "submitted" as const,
    revision: 4,
    submitted_at: "2026-09-02T19:00:00.000Z",
    progress_completed: 3,
    progress_total: 3,
    ssn_present: false,
    requirements: [
      {
        id: "ab000000-0000-4000-8000-000000000001",
        kind: "profile" as const,
        title: "Profile and privacy",
        description: "Legal name differs from the provisional employee name.",
        status: "awaiting_review" as const,
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
  };

  it("takes somebody off a location the server lets the reader, in two clicks", async () => {
    vi.mocked(removeEmployeeFromLocation).mockResolvedValue({ releasedShiftCount: 1, locationsLeft: 1 });
    renderDrawer("employment", { ...detail, location_count: 2, locations: [...detail.locations, patio] });
    const remove = await screen.findByRole("button", { name: "Remove from Main Dining" });
    expect(screen.queryByRole("button", { name: "Remove from Patio" })).toBeNull();
    fireEvent.click(remove);
    expect(removeEmployeeFromLocation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove from Main Dining" }));
    await waitFor(() => expect(removeEmployeeFromLocation).toHaveBeenCalledWith(workspaceId, employeeId, mainDining));
  });

  it("offers no removal where the server answers no", async () => {
    renderDrawer("employment", { ...detail, locations: [{ ...detail.locations[0]!, removable: false }] });
    await screen.findByText("Locations");
    expect(screen.queryByRole("button", { name: /Remove from/ })).toBeNull();
  });

  // FB-6.2.8 A: Remove sits on the location's row and is the one way off it.
  it("lets only Remove take somebody off a location the server lets the reader remove", async () => {
    renderDrawer("employment");
    await screen.findByRole("button", { name: "Remove from Main Dining" });
    expect((screen.getByRole("checkbox", { name: "Main Dining" }) as HTMLInputElement).disabled).toBe(true);
  });

  it("shows a manager Terminate switched off, with the reason under Locations", async () => {
    currentContext = { ...context, membership: { ...context.membership, role: "manager" } };
    renderDrawer("employment", { ...detail, allowed: { ...detail.allowed, terminate: false } });
    const terminate = (await screen.findByRole("button", { name: "Terminate employee" })) as HTMLButtonElement;
    expect(terminate.disabled).toBe(true);
    expect(terminate.title).toBe("Only an admin or the owner can terminate an employee.");
    expect(
      screen.getByText(/Only an admin or the owner can terminate an employee\. To take Alex off Main Dining, use Remove\./),
    ).toBeTruthy();
  });

  it("shows an owner who may not terminate no switched-off Terminate and no note", async () => {
    renderDrawer("employment", { ...detail, allowed: { ...detail.allowed, terminate: false } });
    await screen.findByRole("button", { name: "Remove from Main Dining" });
    expect(screen.queryByRole("button", { name: "Terminate employee" })).toBeNull();
    expect(screen.queryByText(/Only an admin or the owner/)).toBeNull();
  });

  // FB-6.2.8 C: the field is shaped like Locations and saves only a change.
  it("offers Save for managed locations only once something changed", async () => {
    extraReferenceLocations = [{ id: patio.id, name: "Patio", archived: false }];
    renderDrawer("employment", {
      ...detail,
      managed_locations: [],
      allowed: { ...detail.allowed, set_managed_locations: true },
    });
    const group = await screen.findByRole("group", { name: "Manages without working there" });
    await within(group).findByLabelText("Patio");
    expect(within(group).queryByRole("button", { name: "Save managed locations" })).toBeNull();
    fireEvent.click(within(group).getByLabelText("Patio"));
    expect(within(group).getByRole("button", { name: "Save managed locations" })).toBeTruthy();
    fireEvent.click(within(group).getByLabelText("Patio"));
    expect(within(group).queryByRole("button", { name: "Save managed locations" })).toBeNull();
  });

  it("edits a manager's managed locations whole when the server lets the reader", async () => {
    const garden = "11000000-0000-4000-8000-000000000003";
    vi.mocked(setEmployeeManagedLocations).mockResolvedValue({ locationIds: [patio.id, garden] });
    extraReferenceLocations = [
      { id: patio.id, name: "Patio", archived: false },
      { id: garden, name: "Garden Room", archived: false },
    ];
    renderDrawer("employment", {
      ...detail,
      managed_locations: [{ id: patio.id, name: "Patio" }],
      allowed: { ...detail.allowed, set_managed_locations: true },
    });
    const group = await screen.findByRole("group", { name: "Manages without working there" });
    const patioBox = (await within(group).findByLabelText("Patio")) as HTMLInputElement;
    expect(patioBox.checked).toBe(true);
    fireEvent.click(within(group).getByLabelText("Garden Room"));
    fireEvent.click(within(group).getByRole("button", { name: "Save managed locations" }));
    await waitFor(() =>
      expect(setEmployeeManagedLocations).toHaveBeenCalledWith(workspaceId, employeeId, [patio.id, garden]),
    );
  });

  it("shows managed locations read-only to a reader the server does not let edit them", async () => {
    renderDrawer("employment", { ...detail, managed_locations: [{ id: patio.id, name: "Patio" }] });
    const group = await screen.findByRole("group", { name: "Manages without working there" });
    expect(within(group).getByText("Patio")).toBeTruthy();
    expect(within(group).queryByRole("checkbox")).toBeNull();
    expect(within(group).queryByRole("button")).toBeNull();
  });

  it("offers no invitation when the server says the reader may not invite, whatever their permissions", async () => {
    renderDrawer("profile", { ...detail, allowed: { ...detail.allowed, invite: false } });
    await screen.findByLabelText("E-mail");
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
  });

  it("offers no onboarding review when the server says no, whatever the reader's permissions", async () => {
    renderDrawer(
      "profile",
      { ...detail, private_contact: legalNameOnly, allowed: { ...detail.allowed, onboarding_review: false } },
      profileReview,
    );
    expect(await screen.findByText("Legal name review")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Accept Profile and privacy" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("hides the legal name review when the server gives no private contact", async () => {
    renderDrawer("profile", { ...detail, private_contact: null }, profileReview);
    await screen.findByLabelText("E-mail");
    expect(screen.queryByText("Legal name review")).toBeNull();
  });
});

// FB-6.2 .7b visual QA (0806cc62): what an invitation, a manager's managed
// locations and the private fields offer follows the record, not only the
// server's allowed answer.
describe("EmployeeDrawer .7b visual QA fixes", () => {
  const patio = { id: "11000000-0000-4000-8000-000000000002", name: "Patio", primary: false, archived: false, removable: false };

  it("offers no invitation to somebody whose account is already linked", async () => {
    renderDrawer("profile", {
      ...detail,
      user_id: "e1000000-0000-4000-8000-000000000001",
      display_status: "active",
      invitation: null,
      allowed: { ...detail.allowed, invite: true },
    });
    await screen.findByLabelText("E-mail");
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
  });

  it("still offers the invitation to somebody with no linked account", async () => {
    renderDrawer("profile", { ...detail, user_id: null, allowed: { ...detail.allowed, invite: true } });
    expect(await screen.findByRole("button", { name: "Invite" })).toBeTruthy();
  });

  it("never offers a location they work at as one they manage without working there", async () => {
    extraReferenceLocations = [{ id: patio.id, name: patio.name, archived: false }];
    renderDrawer("employment", {
      ...detail,
      managed_locations: [],
      allowed: { ...detail.allowed, set_managed_locations: true },
    });
    const group = await screen.findByRole("group", { name: "Manages without working there" });
    await within(group).findByLabelText("Patio");
    expect(within(group).queryByLabelText("Main Dining")).toBeNull();
  });

  it("shows the private fields when the server says they may be read but none are on file", async () => {
    renderDrawer("profile", {
      ...detail,
      // The server's answer for a reader who may read them and a person with
      // no private record yet (nf-db, QA fix 1).
      private_contact: {
        phone: null,
        street_address: null,
        city: null,
        region: null,
        postal_code: null,
        country_code: null,
        date_of_birth: null,
        emergency_contact_name: null,
        emergency_contact_relationship: null,
        emergency_contact_phone: null,
        emergency_contact_email: "",
        share_phone_with_teammates: false,
        share_email_with_teammates: false,
      },
    });
    expect(await screen.findByText("Date of birth")).toBeTruthy();
  });
});
