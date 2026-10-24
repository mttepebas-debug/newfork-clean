import {
  act,
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
  emergencyIsOwnPhoneMessage,
  emptyWeeklyPreference,
  managementAndOwnerRefusals,
  usLettersMessage,
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
  saveWeeklyPreferences,
} from "../availability/availability-data";
vi.mock("../availability/availability-data", () => ({
  loadWeeklyPreferences: vi.fn(),
  saveWeeklyPreferences: vi.fn(),
}));
import {
  getEmployeeDetail,
  getEmployeeAvatar,
  loadEmployeeInvitationLink,
  loadEmployeeReferenceData,
  saveOwnEmploymentContact,
  changeEmployeeAccess,
  prepareEmployeeInvitation,
  previewEmployeeAccessChange,
  removeEmployeeAccess,
  removeEmployeeAvatar,
  removeEmployeeFromLocation,
  revokeEmployeeInvitation,
  saveEmployee,
  setEmployeeArchived,
  terminateEmployee,
  updateEmployeeInvitationAccess,
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
const adminRoleId = "a0000000-0000-4000-8000-00000000000a";
const mainDiningId = "11000000-0000-4000-8000-000000000001";
// What an access change sends when it drops no employee app.
const noImpact = {
  shifts_opened: 0,
  requests_closed: 0,
  applications_closed: 0,
  time_off_withdrawn: 0,
  availability_deleted: false,
};

function weeklyModel(): WeeklyPreferenceRead {
  return {
    employee_id: employeeId,
    employee_name: "Alex Kim",
    can_manage: true,
    can_edit_employee: false,
    settings: {
      onboarding_required: false,
      revision: 1,
    },
    employee: {
      revision: 1,
      submitted: true,
      updated_at: null,
      preference: emptyWeeklyPreference(),
    },
    manager: {
      revision: 0,
      submitted: false,
      updated_at: null,
      preference: emptyWeeklyPreference(),
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
    access: { employee: false, management: "owner" },
    status: "active",
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
  is_workspace_owner: false,
  role_id: null,
  access: { employee: true, management: null },
  employee_role_id: null,
  management_role_id: null,
  managed_location_ids: [],
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
  invite: false,
  onboarding_review: false,
};

const refresh = vi.fn();
// The signed-in reader; a test that needs another sets it first.
let currentContext: ActiveWorkspaceContext = context;
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: currentContext, refresh }),
}));
// The drawer's one toast: a removal that takes the person out of reach.
const toast = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("@newfork/ui", async (original) => ({
  ...(await original<object>()),
  useToast: () => toast,
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
  changeEmployeeAccess: vi.fn(),
  prepareEmployeeInvitation: vi.fn(),
  previewEmployeeAccessChange: vi.fn(),
  removeEmployeeAccess: vi.fn(),
  removeEmployeeAvatar: vi.fn(),
  removeEmployeeFromLocation: vi.fn(),
  revokeEmployeeInvitation: vi.fn(),
  saveEmployee: vi.fn(),
  setEmployeeArchived: vi.fn(),
  terminateEmployee: vi.fn(),
  updateEmployeeInvitationAccess: vi.fn(),
}));

let renderedDetail: EmployeeDetail = detail;
// Roles the drawer may offer; a test that needs others sets this first.
let inviteRolesFixture: {
  id: string;
  name: string;
  systemKey: "employee" | "manager" | "admin" | null;
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

/** Everything a control is described by (a Tooltip's text or an off-screen note). */
function describedBy(control: HTMLElement): string {
  return (control.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")
    .trim();
}

/** A Terminate switched off: still reachable by keyboard and tap, does nothing (BL-429). */
function switchedOff(control: HTMLElement) {
  expect(control.getAttribute("aria-disabled")).toBe("true");
  expect((control as HTMLButtonElement).disabled).toBe(false);
}

/** The off-screen reason a switched-off control is described by. */
function lockReason(control: HTMLElement): string | null {
  return (
    (control.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id))
      .find((note) => note?.classList.contains("sr-only"))?.textContent ?? null
  );
}

/** One of the Access tab's two accesses (DAVET-ERISIM, Tur 4 B). */
async function accessBox(name: "Employee app" | "Management app") {
  return (await screen.findByRole("checkbox", { name })) as HTMLInputElement;
}

/** The Access tab's choice of accesses: the box that shakes when nothing is chosen. */
function accessChoices() {
  return screen.getByRole("checkbox", { name: "Employee app" }).closest("fieldset")!;
}

/**
 * Ticks the management app once the roles to give have arrived, picks the
 * role and, for a manager, the locations they manage.
 */
async function giveManagement(roleName = "Manager", locations: readonly string[] = ["Main Dining"]) {
  const box = await accessBox("Management app");
  await waitFor(() => expect(box.disabled).toBe(false));
  fireEvent.click(box);
  fireEvent.click(screen.getByRole("radio", { name: roleName }));
  if (!locations.length) return;
  const manages = screen.getByRole("group", { name: /^Manages/ });
  for (const name of locations) fireEvent.click(within(manages).getByLabelText(name));
}

/** The rail's photo button (the phone header draws a compact twin). */
async function photoButton(name: string) {
  return (await screen.findAllByRole("button", { name }))[0]!;
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
      owner: false,
    })),
    inviteRoles: inviteRolesFixture,
  });
  vi.mocked(prepareEmployeeInvitation).mockResolvedValue({
    id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
    expiresAt: "2026-08-24T12:00:00.000Z",
  });
  vi.mocked(previewEmployeeAccessChange).mockResolvedValue({
    shifts_opened: 3,
    requests_closed: 1,
    applications_closed: 0,
    time_off_withdrawn: 0,
    availability_deleted: true,
  });
  vi.mocked(changeEmployeeAccess).mockResolvedValue({
    membership_id: "aa000000-0000-4000-8000-0000000000aa",
    employee_role_id: employeeRoleId,
    management_role_id: null,
    impact: {
      shifts_opened: 0,
      requests_closed: 0,
      applications_closed: 0,
      time_off_withdrawn: 0,
      availability_deleted: false,
    },
  });
  vi.mocked(updateEmployeeInvitationAccess).mockResolvedValue();
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
    // Nothing chosen yet: Invite takes the reader to Access and the choice shakes.
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    const choices = await waitFor(() => accessChoices());
    expect(choices.getAttribute("aria-invalid")).toBe("true");
    expect(choices.className).toContain("access-invalid-1");
    expect(screen.getByRole("alert").textContent).toBe("Choose at least one access.");
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(accessChoices().className).toContain("access-invalid-0");
    expect(prepareEmployeeInvitation).not.toHaveBeenCalled();
    expect(saveEmployee).not.toHaveBeenCalled();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    fireEvent.click(await accessBox("Employee app"));
    // A choice made puts the error away until the next attempt.
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() =>
      expect(prepareEmployeeInvitation).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        "new@example.test",
        { employee_role_id: employeeRoleId, management_role_id: null, managed_location_ids: [] },
      ),
    );
    expect(saveEmployee).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveEmployee).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(prepareEmployeeInvitation).mock.invocationCallOrder[0]!,
    );
  });

  // A record saved on the way to an invitation returns to Profile; the
  // invitation is read on Access, and goes out with the access chosen there,
  // not the one read back after the save.
  it("stays on Access and sends the chosen access when Invite saves the record first", async () => {
    const { onSectionChange } = renderDrawer("profile");
    fireEvent.change(await screen.findByLabelText("E-mail"), {
      target: { value: "new@example.test" },
    });
    vi.mocked(getEmployeeDetail).mockResolvedValue({
      ...detail,
      invitation_email: "new@example.test",
      revision: 2,
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    fireEvent.click(await accessBox("Employee app"));
    onSectionChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() => expect(prepareEmployeeInvitation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(prepareEmployeeInvitation).mock.calls[0]![3]).toEqual({
      employee_role_id: employeeRoleId,
      management_role_id: null,
      managed_location_ids: [],
    });
    expect(onSectionChange).toHaveBeenLastCalledWith("access");
    expect(await screen.findByRole("heading", { name: "Access", level: 2 })).toBeTruthy();
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

  // DAVET-ERISIM (Mert, 2026-10-20): Remote and Exclude from schedule never lift the rule.
  it("holds Save when an edit clears the last location, Remote or not", async () => {
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
      screen.getByText("Choose at least one location and mark one as primary."),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Remote"));
    expect(save).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByLabelText("Exclude from schedule"));
    expect(save).toHaveProperty("disabled", true);
    // The fields still say what holds Save.
    expect(within(screen.getByRole("group", { name: /^Locations/ })).getByText("Required")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: /^Jobs/ })).getByText("Required")).toBeTruthy();
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
    // Two clicks: termination is destructive (K8).
    fireEvent.click(within(dialog).getByRole("button", { name: "Terminate" }));
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
    // Two clicks: termination is destructive (K8).
    fireEvent.click(within(dialog).getByRole("button", { name: "Terminate" }));
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
  });

  it("leaves weekly drafts without the obsolete availability navigation prompt", async () => {
    const { onClose, onSectionChange } = renderDrawer("availability");
    fireEvent.click(
      await screen.findByRole("tab", { name: "Manager notes" }),
    );
    // Monday is the day open in the manager's hours; mark it unavailable.
    fireEvent.click(screen.getByRole("radio", { name: /^Unavailable/ }));
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
    });
    const { container } = renderDrawer("availability");
    fireEvent.click(
      await screen.findByRole("tab", { name: "Manager notes" }),
    );
    expect(loadWeeklyPreferences).toHaveBeenCalledWith(
      workspaceId,
      employeeId,
      false,
    );
    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^Save changes$/ })).toBeNull();
    // Monday is the day open in the manager's hours; mark it unavailable.
    fireEvent.click(screen.getByRole("radio", { name: /^Unavailable/ }));
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

  it("reads the employee's week read only and honors server read-only manager scope", async () => {
    const model = weeklyModel();
    model.can_manage = false;
    vi.mocked(loadWeeklyPreferences).mockResolvedValue(model);
    renderDrawer("availability");
    // KARARLAR M2: only Alex changes his week; the drawer reads it.
    await screen.findByText("Read only. Only Alex can change this.");
    expect(screen.getByText("Alex is open to work any time.")).toBeTruthy();
    expect(screen.getAllByRole("listitem").filter((item) => item.classList.contains("avr-tile"))).toHaveLength(7);
    fireEvent.click(screen.getByRole("tab", { name: "Manager notes" }));
    expect(
      screen
        .getByRole("switch", { name: "Manager notes" })
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
    await screen.findByRole("heading", { level: 3, name: "We couldn't load availability" });
    expect(screen.queryByText("Weekly preferences unavailable")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Enter availability for employee" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("tab", { name: "Manager notes" });
    expect(saveWeeklyPreferences).not.toHaveBeenCalled();
  });

  it("shows the normal empty state when the employee has no onboarding case", async () => {
    renderDrawer("documents", detail, null);

    // BL-834: none at all reads as none yet, not as a filter miss.
    expect(
      await screen.findByRole("heading", { name: "No documents yet" }),
    ).toBeTruthy();
    expect(screen.getByText("Documents they submit show up here.")).toBeTruthy();
    expect(screen.queryByText("Loading onboarding...")).toBeNull();
    expect(getEmployeeOnboardingReview).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Accept / })).toBeNull();
  });

  it("sends the management access chosen in Access with the employee invitation", async () => {
    renderDrawer();

    const management = await accessBox("Management app");
    await waitFor(() => expect(management.disabled).toBe(false));
    fireEvent.click(management);
    // The management app asks for a role first.
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(screen.getByRole("alert").textContent).toBe("Choose a role for the management app.");
    fireEvent.click(screen.getByRole("radio", { name: "Manager" }));
    // A manager manages somewhere.
    const manages = screen.getByRole("group", { name: /^Manages/ });
    expect(within(manages).getByText("Required")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(screen.getByRole("alert").textContent).toBe("Choose at least one location they manage.");
    expect(prepareEmployeeInvitation).not.toHaveBeenCalled();
    fireEvent.click(within(manages).getByLabelText("Main Dining"));
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() =>
      expect(prepareEmployeeInvitation).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        "alex@example.test",
        { employee_role_id: null, management_role_id: managerRoleId, managed_location_ids: [mainDiningId] },
      ),
    );
    expect(saveEmployee).not.toHaveBeenCalled();
  });

  it("keeps the access chosen in Access while the profile email is edited", async () => {
    renderDrawer("access");
    fireEvent.click(await accessBox("Employee app"));
    fireEvent.change(screen.getByLabelText("Employee section"), { target: { value: "profile" } });
    fireEvent.change(await screen.findByLabelText("E-mail"), {
      target: { value: "alex.kim@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() =>
      expect(prepareEmployeeInvitation).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        "alex.kim@example.test",
        { employee_role_id: employeeRoleId, management_role_id: null, managed_location_ids: [] },
      ),
    );
    expect(saveEmployee).toHaveBeenCalledTimes(1);
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

  it("does not overwrite an unsaved access choice when employee detail refetches", async () => {
    const { client } = renderDrawer("access");

    await giveManagement();
    vi.mocked(getEmployeeDetail).mockResolvedValue({
      ...detail,
      revision: 2,
    });

    await client.invalidateQueries({
      queryKey: ["employee-detail", workspaceId, employeeId],
    });

    await waitFor(() => expect(getEmployeeDetail).toHaveBeenCalledTimes(2));
    expect((await accessBox("Management app")).checked).toBe(true);
    expect(screen.getByRole("radio", { name: "Manager" })).toHaveProperty("checked", true);
    expect(
      within(screen.getByRole("group", { name: /^Manages/ })).getByLabelText("Main Dining"),
    ).toHaveProperty("checked", true);
  });

  it("keeps the linked owner's access and lifecycle read-only: Owner, every location", async () => {
    renderDrawer("access", {
      ...detail,
      role_id: ownerRoleId,
      role_name: "Owner",
      is_workspace_owner: true,
      user_id: context.userId,
      display_status: "active",
      access: { employee: false, management: "owner" },
      management_role_id: ownerRoleId,
      // Even a reader the server lets change roles and remove access changes
      // nothing on the owner's record.
      allowed: { ...ownRecordAllowed, change_role: true, remove_access: true },
    });

    const owner = await screen.findByRole("radio", { name: "Owner" });
    expect(owner).toHaveProperty("checked", true);
    // Switched off with its fieldset: nothing on the owner's role is picked.
    expect(owner.closest("fieldset")).toHaveProperty("disabled", true);
    expect(within(owner.closest("div")!).getByText("Every location")).toBeTruthy();
    // Nothing else is offered in its place, and nothing names where they manage.
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.queryByRole("group", { name: /^Manages/ })).toBeNull();
    expect((await accessBox("Employee app")).disabled).toBe(true);
    expect((await accessBox("Management app")).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Remove all access" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Terminate employee" }),
    ).toBeNull();
    expect(changeEmployeeAccess).not.toHaveBeenCalled();
    expect(removeEmployeeAccess).not.toHaveBeenCalled();
    expect(setEmployeeArchived).not.toHaveBeenCalled();
  });

  // The tab opens for who may invite, change or remove access, or read an
  // invitation; saving the record alone does not open it.
  it("offers no Access tab on the owner's own record, where the server allows only saving", async () => {
    renderDrawer("access", {
      ...detail,
      role_id: ownerRoleId,
      role_name: "Owner",
      is_workspace_owner: true,
      user_id: context.userId,
      display_status: "active",
      access: { employee: false, management: "owner" },
      management_role_id: ownerRoleId,
      allowed: ownRecordAllowed,
    });
    expect(await screen.findByRole("heading", { level: 2, name: "Profile" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Access" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Employee app" })).toBeNull();
  });

  it("shows invitation delivery failure without clearing the pending invite", async () => {
    renderDrawer("access", {
      ...detail,
      display_status: "invited",
      invitation: {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        email: "alex@example.test",
        role_id: employeeRoleId,
        employee_role_id: employeeRoleId,
        management_role_id: null,
        managed_location_ids: [],
        status: "pending",
        expires_at: "2099-08-24T12:00:00.000Z",
        sent_at: "2026-08-17T12:00:00.000Z",
        delivery_status: "failed",
        delivery_attempted_at: "2026-08-17T12:01:00.000Z",
        delivery_failed_at: "2026-08-17T12:01:00.000Z",
        delivery_error: "Invitation delivery failed (503)",
      },
    });

    expect(await screen.findByText("Not delivered")).toBeTruthy();
    expect(
      screen.getByText("Invitation delivery failed (503) Resend sends a new link."),
    ).toBeTruthy();
    // The link still works: it can be copied and revoked.
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resend" }));
    await waitFor(() =>
      expect(prepareEmployeeInvitation).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        "alex@example.test",
        { employee_role_id: employeeRoleId, management_role_id: null, managed_location_ids: [] },
      ),
    );
    expect(saveEmployee).not.toHaveBeenCalled();
  });

  // Everyone else gives an emergency contact while onboarding. The owner never
  // runs it, so theirs is entered here — by them, and never required. It goes
  // with the drawer's one Save (K3, P20).
  it("lets the owner enter their own emergency contact, saved with Save changes", async () => {
    vi.mocked(saveOwnEmploymentContact).mockResolvedValue(undefined);
    renderDrawer("profile", {
      ...detail,
      user_id: context.userId,
      role_name: "Owner",
      is_workspace_owner: true,
      private_contact: null,
    });

    const name = await screen.findByLabelText("Emergency contact");
    fireEvent.change(name, { target: { value: "Morgan Tepebas" } });
    fireEvent.change(screen.getByLabelText("Emergency phone"), {
      target: { value: "3105550101" },
    });
    expect(screen.queryByRole("button", { name: "Save emergency contact" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(saveOwnEmploymentContact).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        // A US number in E.164 (BL-503).
        expect.objectContaining({
          name: "Morgan Tepebas",
          phone: "+13105550101",
        }),
      ),
    );
    expect(saveEmployee).not.toHaveBeenCalled();
  });

  // BL-503: KARARLAR "Form ve girdi kuralları (ABD)".
  it("draws the owner's emergency phone with a fixed +1 and the mask", async () => {
    renderDrawer("profile", {
      ...detail,
      user_id: context.userId,
      role_name: "Owner",
      is_workspace_owner: true,
      private_contact: null,
    });

    const phone = await screen.findByLabelText("Emergency phone");
    expect(phone.closest(".us-phone-field")?.querySelector(".us-phone-prefix")?.textContent).toBe("+1");
    fireEvent.change(phone, { target: { value: "310555010199" } });
    expect(phone).toHaveProperty("value", "(310) 555-0101");
  });

  // BL-969 code review: the saved number is E.164 and the field hands back
  // the mask; typed back to the same number, nothing has changed.
  it("does not count the owner's emergency phone as changed when it is typed back", async () => {
    renderDrawer("profile", {
      ...detail,
      user_id: context.userId,
      role_name: "Owner",
      is_workspace_owner: true,
      private_contact: {
        phone: "+13105559999",
        street_address: null,
        city: null,
        region: null,
        postal_code: null,
        country_code: null,
        date_of_birth: null,
        emergency_contact_name: "Morgan",
        emergency_contact_relationship: "Spouse",
        emergency_contact_phone: "+14155550100",
        emergency_contact_email: "",
        share_phone_with_teammates: false,
        share_email_with_teammates: false,
      },
    });

    const phone = await screen.findByLabelText("Emergency phone");
    expect(phone).toHaveProperty("value", "(415) 555-0100");
    fireEvent.change(phone, { target: { value: "(415) 555-0101" } });
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", false);
    fireEvent.change(phone, { target: { value: "(415) 555-0100" } });
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);
  });

  // TEL-2 (Mert, 2026-10-09): the emergency contact is somebody else.
  it("refuses the owner's own number as their emergency phone until one digit differs", async () => {
    renderDrawer("profile", {
      ...detail,
      user_id: context.userId,
      role_name: "Owner",
      is_workspace_owner: true,
      private_contact: {
        phone: "+13105559999",
        street_address: null,
        city: null,
        region: null,
        postal_code: null,
        country_code: null,
        date_of_birth: null,
        emergency_contact_name: "Morgan",
        emergency_contact_relationship: "Spouse",
        emergency_contact_phone: "+14155550100",
        emergency_contact_email: "",
        share_phone_with_teammates: false,
        share_email_with_teammates: false,
      },
    });

    const phone = await screen.findByLabelText("Emergency phone");
    // No room is kept before the refusal (UI-FIELDMSG-2, Mert 2026-10-18).
    expect(phone.closest(".employee-field")?.querySelector(".field-note")).toBeNull();
    expect(phone.closest(".employee-field")?.textContent).not.toContain(emergencyIsOwnPhoneMessage);
    fireEvent.change(phone, { target: { value: "3105559999" } });
    expect(phone.getAttribute("aria-invalid")).toBe("true");
    expect(
      (phone.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent),
    ).toContain(emergencyIsOwnPhoneMessage);
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);

    fireEvent.change(phone, { target: { value: "(310) 555-999" } });
    expect(phone.getAttribute("aria-invalid")).toBeNull();
    fireEvent.change(phone, { target: { value: "(310) 555-9998" } });
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", false);
  });

  it("says under the owner's emergency contact that Turkish-only letters are not taken", async () => {
    renderDrawer("profile", {
      ...detail,
      user_id: context.userId,
      role_name: "Owner",
      is_workspace_owner: true,
      private_contact: null,
    });

    const name = await screen.findByLabelText("Emergency contact");
    fireEvent.change(name, { target: { value: "Ayşe Yılmaz" } });
    fireEvent.change(screen.getByLabelText("Emergency phone"), {
      target: { value: "3105550101" },
    });
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(
      (name.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent),
    ).toContain(usLettersMessage);
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);
  });

  it.each([["First name"], ["Middle name"], ["Last name"]])(
    "says under %s that Turkish-only letters are not taken, and keeps Save off",
    async (label) => {
      renderDrawer("profile");
      const field = await screen.findByLabelText(label);
      fireEvent.change(field, { target: { value: "Şule" } });
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(
        (field.getAttribute("aria-describedby") ?? "")
          .split(" ")
          .map((id) => document.getElementById(id)?.textContent),
      ).toContain(usLettersMessage);
      expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);
    },
  );

  it("will not save half an emergency contact", async () => {
    renderDrawer("profile", {
      ...detail,
      user_id: context.userId,
      role_name: "Owner",
      is_workspace_owner: true,
      private_contact: null,
    });

    fireEvent.change(await screen.findByLabelText("Emergency contact"), {
      target: { value: "Morgan Tepebas" },
    });

    expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Emergency phone").getAttribute("aria-required")).toBe("true");
  });

  it("shows somebody else's emergency contact without offering to edit it", async () => {
    renderDrawer("profile", { ...detail, role_name: "Employee" });

    await screen.findByLabelText("First name");
    expect(
      screen.queryByRole("button", { name: "Save emergency contact" }),
    ).toBeNull();
  });

  it("names who sent an invitation, when it expires, and the access it grants", async () => {
    renderDrawer("access", {
      ...detail,
      display_status: "invited",
      invitation: {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        email: "alex@example.test",
        role_id: managerRoleId,
        employee_role_id: null,
        management_role_id: managerRoleId,
        managed_location_ids: [mainDiningId],
        status: "pending",
        expires_at: "2099-08-24T12:00:00.000Z",
        sent_at: "2026-08-17T12:00:00.000Z",
        delivery_status: "sent",
        role_name: "Manager",
        invited_by_name: "Mert Tepebas",
      },
    });

    expect(
      await screen.findByText("Sent Aug 17 by Mert Tepebas · expires Aug 24"),
    ).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByText("alex@example.test")).toBeTruthy();
    expect((await accessBox("Employee app")).checked).toBe(false);
    expect((await accessBox("Management app")).checked).toBe(true);
    expect(await screen.findByRole("radio", { name: "Manager" })).toHaveProperty("checked", true);
    expect(
      within(screen.getByRole("group", { name: /^Manages/ })).getByLabelText("Main Dining"),
    ).toHaveProperty("checked", true);
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
        employee_role_id: employeeRoleId,
        management_role_id: null,
        managed_location_ids: [],
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
        employee_role_id: employeeRoleId,
        management_role_id: null,
        managed_location_ids: [],
        status: "pending",
        expires_at: "2099-08-24T12:00:00.000Z",
        sent_at: "2026-08-17T12:00:00.000Z",
        delivery_status: "sent",
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(revokeEmployeeInvitation).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm revoke" }),
    );

    await waitFor(() =>
      expect(revokeEmployeeInvitation).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
      ),
    );
  });

  it("resends the current pending invitation as a new link with the access it carries", async () => {
    renderDrawer("access", {
      ...detail,
      display_status: "invited",
      invitation: {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        email: "alex@example.test",
        role_id: employeeRoleId,
        employee_role_id: employeeRoleId,
        management_role_id: null,
        managed_location_ids: [],
        status: "pending",
        expires_at: "2099-08-24T12:00:00.000Z",
        sent_at: "2026-08-17T12:00:00.000Z",
        delivery_status: "sent",
        delivery_attempted_at: "2026-08-17T12:01:00.000Z",
        delivery_failed_at: null,
        delivery_error: null,
      },
    });

    expect(await screen.findByText("Pending")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send reminder" })).toBeNull();
    // Resend lives in Access; the footer has no second Invite.
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
    const resend = screen.getByRole("button", { name: "Resend" });
    expect(resend.getAttribute("title")).toBe("Sends a new link. The old link stops working.");
    fireEvent.click(resend);

    await waitFor(() =>
      expect(prepareEmployeeInvitation).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        "alex@example.test",
        { employee_role_id: employeeRoleId, management_role_id: null, managed_location_ids: [] },
      ),
    );
    expect(saveEmployee).not.toHaveBeenCalled();
  });

  it("draws the avatar as a plain picture until a workspace photo exists", async () => {
    const { client, container } = renderDrawer("profile");

    await screen.findByLabelText("First name");
    await waitFor(() => expect(getEmployeeAvatar).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /photo/ })).toBeNull();
    expect(container.querySelector(".drawer-avatar")?.tagName).toBe("SPAN");
    vi.mocked(getEmployeeAvatar).mockResolvedValue({
      present: true,
      url: "https://example.test/avatar.png",
    });
    await client.invalidateQueries({
      queryKey: ["employee-avatar", workspaceId, employeeId],
    });
    expect(
      await photoButton("Alex's photo. Select twice to remove it."),
    ).toBeTruthy();
  });

  it("removes the workspace profile photo from the avatar, on the second click", async () => {
    vi.mocked(getEmployeeAvatar).mockResolvedValueOnce({
      present: true,
      url: "https://example.test/avatar.png",
    });
    renderDrawer("profile");
    const photo = await photoButton("Alex's photo. Select twice to remove it.");
    expect(photo.querySelector("img")?.getAttribute("src")).toBe("https://example.test/avatar.png");
    // The first click only arms it: losing a photo to one stray click is what
    // the two clicks exist to prevent.
    fireEvent.click(photo);
    expect(removeEmployeeAvatar).not.toHaveBeenCalled();
    expect(photo.getAttribute("aria-label")).toBe("Remove Alex's photo");
    expect(screen.getByText("Click again to remove the photo.")).toBeTruthy();
    fireEvent.click(photo);

    await waitFor(() =>
      expect(removeEmployeeAvatar).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
      ),
    );
    expect(removeEmployeeAvatar).toHaveBeenCalledTimes(1);
  });

  it("removes the photo from the phone header's avatar too, saying tap again", async () => {
    vi.mocked(getEmployeeAvatar).mockResolvedValueOnce({
      present: true,
      url: "https://example.test/avatar.png",
    });
    renderDrawer("profile");
    await photoButton("Alex's photo. Select twice to remove it.");
    const compact = screen
      .getAllByRole("button", { name: "Alex's photo. Select twice to remove it." })
      .find((button) => button.classList.contains("compact"))!;
    fireEvent.click(compact);
    expect(screen.getByText("Tap again to remove the photo.")).toBeTruthy();
    expect(removeEmployeeAvatar).not.toHaveBeenCalled();
    fireEvent.click(compact);
    await waitFor(() => expect(removeEmployeeAvatar).toHaveBeenCalledTimes(1));
  });

  it("locks profile identity and email while an invitation is pending", async () => {
    renderDrawer("profile", {
      ...detail,
      display_status: "invited",
      invitation: {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        email: "alex@example.test",
        role_id: employeeRoleId,
        employee_role_id: employeeRoleId,
        management_role_id: null,
        managed_location_ids: [],
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
    // The invitation out is resent from Access, not invited again from here.
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
  });

  it("unlocks profile identity and email after a pending invitation is revoked", async () => {
    renderDrawer("profile", {
      ...detail,
      display_status: "not_invited",
      invitation: {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        email: "alex@example.test",
        role_id: employeeRoleId,
        employee_role_id: employeeRoleId,
        management_role_id: null,
        managed_location_ids: [],
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
    expect(screen.getByRole("button", { name: "Invite" })).toHaveProperty(
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
        employee_role_id: employeeRoleId,
        management_role_id: null,
        managed_location_ids: [],
        status: "accepted",
        expires_at: "2026-08-24T12:00:00.000Z",
        sent_at: "2026-08-17T12:00:00.000Z",
        delivery_status: "sent",
        delivery_attempted_at: "2026-08-17T12:01:00.000Z",
        delivery_failed_at: null,
        delivery_error: null,
      },
    });

    expect(await screen.findByText("Access removed")).toBeTruthy();
    expect(
      screen.getByText("The record and work history are kept. Select Invite to give access again."),
    ).toBeTruthy();
    expect(screen.queryByText("Expired")).toBeNull();
    // Access is chosen again before a new invitation.
    expect((await accessBox("Employee app")).checked).toBe(false);
    expect(screen.getByRole("button", { name: "Invite" })).toBeTruthy();
  });

  it("routes the no-email access state to the profile email field", async () => {
    renderDrawer("access", {
      ...detail,
      invitation_email: null,
      invitation: null,
    });

    // In place of the address, and on its pill.
    expect(await screen.findAllByText("No email")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
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
        phone: "+13105559999",
        street_address: "100 Main Street",
        city: "Los Angeles",
        region: "CA",
        postal_code: "90001",
        country_code: "US",
        date_of_birth: "1990-02-14",
        emergency_contact_name: "Jamie Kim",
        emergency_contact_relationship: "Sibling",
        emergency_contact_phone: "+13105550001",
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
    // Shown as a US number (P4).
    expect(screen.getByLabelText("Phone")).toHaveProperty(
      "value",
      "+1 (310) 555-9999",
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

  it("holds Save for somebody excluded from the schedule with no location or job", async () => {
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
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Choose at least one location and mark one as primary.")).toBeTruthy();
    expect(saveEmployee).not.toHaveBeenCalled();
  });

  // EMP-001 C (S2, items 12 and 23): any job can be primary, Manager too; only
  // the Owner job never is. The first job ticked becomes the primary.
  describe("the primary job (EMP-001 C)", () => {
    const serverJobId = detail.jobs[0]!.id;
    const managerJobId = "22000000-0000-4000-8000-0000000000aa";
    const ownerJobId = "22000000-0000-4000-8000-0000000000ab";
    const managementId = "dd000000-0000-4000-8000-000000000001";
    function withManagementJobs() {
      vi.mocked(loadEmployeeReferenceData).mockResolvedValueOnce({
        locations: detail.locations.map((location) => ({ ...location, timezone: "America/Los_Angeles" })),
        departments: [{ id: managementId, name: "Leadership", archived: false, management: true }],
        jobs: [
          { id: serverJobId, name: "Server", archived: false, departmentId: null, owner: false },
          { id: managerJobId, name: "Floor Manager", archived: false, departmentId: managementId, owner: false },
          { id: ownerJobId, name: "Owner", archived: false, departmentId: managementId, owner: true },
        ],
        inviteRoles: [],
      });
    }
    const jobRow = (name: string) => screen.getByLabelText(name).closest("div")!;
    const primaryOf = (name: string) => within(jobRow(name)).getByLabelText("Primary") as HTMLInputElement;
    // The file does not clear its mocks; these tests read what was saved.
    beforeEach(() => vi.mocked(saveEmployee).mockClear());
    const save = () => fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const savedWith = (expected: object) =>
      waitFor(() =>
        expect(saveEmployee).toHaveBeenCalledWith(workspaceId, expect.objectContaining(expected), employeeId),
      );

    it("makes the first job ticked the primary, a Management job too", async () => {
      withManagementJobs();
      renderDrawer("employment", { ...detail, primary_job_id: null, primary_job_name: null, job_count: 0, jobs: [] });
      await employeeLoaded();
      fireEvent.click(screen.getByLabelText("Floor Manager"));
      expect(primaryOf("Floor Manager").checked).toBe(true);
      save();
      await savedWith({ job_ids: [managerJobId], primary_job_id: managerJobId });
    });

    it("lets the primary be moved by hand once a second job is ticked", async () => {
      withManagementJobs();
      renderDrawer("employment");
      await employeeLoaded();
      fireEvent.click(screen.getByLabelText("Floor Manager"));
      expect(primaryOf("Server").checked).toBe(true);
      fireEvent.click(primaryOf("Floor Manager"));
      save();
      await savedWith({ job_ids: [serverJobId, managerJobId], primary_job_id: managerJobId });
    });

    it("moves the primary to the first job left, never to the one just unticked", async () => {
      withManagementJobs();
      renderDrawer("employment");
      await employeeLoaded();
      fireEvent.click(screen.getByLabelText("Floor Manager"));
      fireEvent.click(screen.getByLabelText("Server"));
      expect(primaryOf("Floor Manager").checked).toBe(true);
      save();
      await savedWith({ job_ids: [managerJobId], primary_job_id: managerJobId });
    });

    it("never marks the Owner job primary: the next job the owner is given takes it", async () => {
      withManagementJobs();
      renderDrawer("employment", {
        ...detail,
        role_name: "Owner",
        is_workspace_owner: true,
        primary_job_id: null,
        primary_job_name: null,
        jobs: [{ id: ownerJobId, name: "Owner", primary: false, archived: false }],
      });
      await employeeLoaded();
      expect(within(jobRow("Owner")).queryByLabelText("Primary")).toBeNull();
      fireEvent.click(screen.getByLabelText("Server"));
      expect(primaryOf("Server").checked).toBe(true);
      expect(within(jobRow("Owner")).queryByLabelText("Primary")).toBeNull();
      save();
      await savedWith({ job_ids: [ownerJobId, serverJobId], primary_job_id: serverJobId });
    });

    // Mert, 20 Oct: setup makes the Owner job and the first location the
    // founder's primary. On the owner's locked rows the drawer says so in grey,
    // with nothing to pick.
    it("shows the owner's primary job and location as plain text on their locked rows", async () => {
      withManagementJobs();
      renderDrawer("employment", {
        ...detail,
        role_name: "Owner",
        is_workspace_owner: true,
        primary_job_id: ownerJobId,
        primary_job_name: "Owner",
        jobs: [{ id: ownerJobId, name: "Owner", primary: true, archived: false }],
      });
      await employeeLoaded();
      expect(within(jobRow("Owner")).getByText("Primary")).toBeTruthy();
      expect(within(jobRow("Owner")).queryByRole("radio")).toBeNull();
      const locationRow = screen.getByLabelText(detail.locations[0]!.name).closest("div")!;
      expect(within(locationRow).getByText("Primary")).toBeTruthy();
      expect(within(locationRow).queryByRole("radio")).toBeNull();
    });

    // Security review D1: a record read with a job and no primary (saved while
    // Remote) goes out as it was read. The drawer makes up no primary; the
    // database answers and its sentence is shown.
    it("sends a job with no primary as it was read and shows the database answer", async () => {
      const sentence = "Mark one of the jobs as primary.";
      vi.mocked(saveEmployee).mockRejectedValueOnce(
        new RequestError(sentence, "employee.primary_job_required", undefined, 400),
      );
      renderDrawer("employment", {
        ...detail,
        first_name: "Emre",
        display_name: "Emre Kim",
        is_remote: true,
        primary_job_id: null,
        primary_job_name: null,
        jobs: [{ ...detail.jobs[0]!, primary: false }],
      });
      await employeeLoaded();
      fireEvent.click(screen.getByLabelText("Remote"));
      save();
      expect(await screen.findByText(sentence)).toBeTruthy();
      expect(saveEmployee).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ is_remote: false, job_ids: [serverJobId], primary_job_id: null }),
        employeeId,
      );
    });

    // BL-1045: by its key, a location or job deleted while the drawer was open;
    // the lists load again and the database's sentence is shown. A refusal
    // without such a key reloads nothing.
    it.each([
      ["location.deleted", "This location was deleted. Reload locations.", 2],
      ["job.deleted", "This job was deleted. Reload jobs before assigning it.", 2],
      ["employee.primary_job_required", "Mark one of the jobs as primary.", 1],
    ])("reloads the locations and jobs only for one deleted meanwhile (%s)", async (reason, sentence, reads) => {
      vi.mocked(saveEmployee).mockRejectedValueOnce(
        new RequestError(sentence, reason, undefined, reason.endsWith(".deleted") ? 409 : 400),
      );
      renderDrawer("employment");
      await employeeLoaded();
      fireEvent.click(screen.getByLabelText("Remote"));
      const before = vi.mocked(loadEmployeeReferenceData).mock.calls.length;
      save();
      expect(await screen.findByText(sentence)).toBeTruthy();
      await waitFor(() =>
        expect(vi.mocked(loadEmployeeReferenceData).mock.calls.length - before).toBe(reads - 1),
      );
    });

    // EMP-001 C3 (Done when 20): the Owner job is nobody's to tick or untick.
    const ownersRecord = {
      ...detail,
      role_name: "Owner",
      is_workspace_owner: true,
      primary_job_id: null,
      primary_job_name: null,
      jobs: [{ id: ownerJobId, name: "Owner", primary: false, archived: false }],
    };

    it("shows the Owner job switched off and unticked on anybody else's record", async () => {
      withManagementJobs();
      renderDrawer("employment");
      await employeeLoaded();
      const owner = screen.getByLabelText("Owner") as HTMLInputElement;
      expect(owner.checked).toBe(false);
      expect(owner.disabled).toBe(true);
      expect(jobRow("Owner").dataset.locked).toBe("true");
      expect(jobRow("Owner").dataset.lockedReason).toBe("true");
      expect(lockReason(owner)).toBe("Only the workspace owner holds the Owner job.");
      expect(within(jobRow("Owner")).queryByLabelText("Primary")).toBeNull();
    });

    it("shows the Owner job ticked and switched off on the owner's record", async () => {
      withManagementJobs();
      renderDrawer("employment", ownersRecord);
      await employeeLoaded();
      const owner = screen.getByLabelText("Owner") as HTMLInputElement;
      expect(owner.checked).toBe(true);
      expect(owner.disabled).toBe(true);
      expect(jobRow("Owner").dataset.locked).toBe("true");
      expect(lockReason(owner)).toBe("Only the workspace owner holds the Owner job.");
      expect(within(jobRow("Owner")).queryByLabelText("Primary")).toBeNull();
    });

    it.each([
      ["anybody else's", detail],
      ["the owner's", ownersRecord],
    ])("leaves the Manager job a plain job with Primary on %s record", async (_whose, record) => {
      withManagementJobs();
      renderDrawer("employment", record);
      await employeeLoaded();
      const manager = screen.getByLabelText("Floor Manager") as HTMLInputElement;
      expect(manager.disabled).toBe(false);
      expect(jobRow("Floor Manager").dataset.locked).toBeUndefined();
      fireEvent.click(manager);
      expect(primaryOf("Floor Manager")).toBeTruthy();
    });
  });

  // EMP-001 C3 (Done when 21): the owner works at every location; there is
  // nothing to pick and no primary to choose.
  describe("the owner's locations (EMP-001 C)", () => {
    const patio = { id: "11000000-0000-4000-8000-000000000002", name: "Patio", primary: false, archived: false, removable: false };
    const ownersRecord = {
      ...detail,
      role_name: "Owner",
      is_workspace_owner: true,
      user_id: context.userId,
      allowed: ownRecordAllowed,
      location_count: 2,
      locations: [{ ...detail.locations[0]!, removable: false }, patio],
    };
    const locations = () => screen.getByLabelText("Main Dining").closest("fieldset")!;
    beforeEach(() => vi.mocked(saveEmployee).mockClear());

    it("shows every location ticked and switched off, with no Primary", async () => {
      renderDrawer("employment", ownersRecord);
      await employeeLoaded();
      for (const name of ["Main Dining", "Patio"]) {
        const box = screen.getByLabelText(name) as HTMLInputElement;
        expect(box.checked).toBe(true);
        expect(box.disabled).toBe(true);
        expect(box.closest("div")!.dataset.locked).toBe("true");
        expect(lockReason(box)).toBe("The workspace owner works at every location.");
      }
      expect(within(locations()).queryByLabelText("Primary")).toBeNull();
    });

    // Nothing is asked of the owner here, so the heading does not say Required.
    it("does not mark the owner's Locations as Required", async () => {
      renderDrawer("employment", ownersRecord);
      await employeeLoaded();
      expect(within(locations()).queryByText("Required")).toBeNull();
    });

    it("keeps Required on anybody else's Locations", async () => {
      renderDrawer("employment", { ...ownersRecord, role_name: "Employee", is_workspace_owner: false, allowed: detail.allowed });
      await employeeLoaded();
      expect(within(locations()).getByText("Required")).toBeTruthy();
    });

    // The name is greyed only on a row switched off for a reason; a location
    // with Remove on its row keeps its look.
    it("marks the rows switched off for a reason, and not a location Remove takes off", async () => {
      const view = renderDrawer("employment", ownersRecord);
      await employeeLoaded();
      expect(screen.getByLabelText("Patio").closest("div")!.dataset.lockedReason).toBe("true");
      view.unmount();
      renderDrawer("employment");
      await screen.findByRole("button", { name: "Remove from Main Dining" });
      const row = screen.getByLabelText("Main Dining").closest("div")!;
      expect(row.dataset.locked).toBe("true");
      expect(row.dataset.lockedReason).toBeUndefined();
    });

    it("saves the owner's primary location as it was read", async () => {
      renderDrawer("employment", ownersRecord);
      await employeeLoaded();
      fireEvent.change(screen.getByLabelText("Internal note"), { target: { value: "Holds the keys" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() =>
        expect(saveEmployee).toHaveBeenCalledWith(
          workspaceId,
          expect.objectContaining({
            location_ids: [detail.locations[0]!.id, patio.id],
            primary_location_id: detail.primary_location_id,
            is_owner_record: true,
          }),
          employeeId,
        ),
      );
    });

    it("keeps Primary on anybody else's locations", async () => {
      renderDrawer("employment", { ...ownersRecord, role_name: "Employee", is_workspace_owner: false, allowed: detail.allowed });
      await employeeLoaded();
      expect(within(locations()).getAllByLabelText("Primary")).toHaveLength(2);
      expect((screen.getByLabelText("Patio") as HTMLInputElement).disabled).toBe(false);
    });

    // BL-421: the owner's record is known by the server's flag. A role can be
    // renamed, and any role can be named Owner.
    it("knows the owner's record by the flag when the role is named otherwise", async () => {
      renderDrawer("employment", { ...ownersRecord, role_name: "Founder" });
      await employeeLoaded();
      expect((screen.getByLabelText("Patio") as HTMLInputElement).disabled).toBe(true);
      fireEvent.change(screen.getByLabelText("Internal note"), { target: { value: "Holds the keys" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() =>
        expect(saveEmployee).toHaveBeenCalledWith(
          workspaceId,
          expect.objectContaining({ is_owner_record: true }),
          employeeId,
        ),
      );
    });

    it("does not take a role that is only named Owner for the owner's record", async () => {
      renderDrawer("employment", { ...ownersRecord, is_workspace_owner: false, allowed: detail.allowed });
      await employeeLoaded();
      fireEvent.change(screen.getByLabelText("Internal note"), { target: { value: "Opens on Mondays" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() =>
        expect(saveEmployee).toHaveBeenCalledWith(
          workspaceId,
          expect.objectContaining({ is_owner_record: false }),
          employeeId,
        ),
      );
    });

    it("locks the role and opens the owner's own emergency contact by the flag", async () => {
      const founder = {
        ...ownersRecord,
        role_id: ownerRoleId,
        role_name: "Founder",
        display_status: "active" as const,
        private_contact: null,
        access: { employee: false, management: "owner" as const },
        management_role_id: ownerRoleId,
        // Somebody who may change roles opens Access; the owner's stays locked.
        allowed: { ...ownRecordAllowed, change_role: true },
      };
      const view = renderDrawer("access", founder);
      // Owner by the flag, whatever the role is named.
      expect((await screen.findByRole("radio", { name: "Owner" })).closest("fieldset")).toHaveProperty("disabled", true);
      expect(screen.queryByRole("radio", { name: "Founder" })).toBeNull();
      expect((await accessBox("Management app")).disabled).toBe(true);
      view.unmount();
      renderDrawer("profile", founder);
      expect(await screen.findByLabelText("Emergency contact")).toBeTruthy();
    });
  });

  it("does not make the location just unticked a Remote person's primary, and asks for one", async () => {
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
    // No primary is invented for them; Remote no longer saves without one.
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Choose at least one location and mark one as primary.")).toBeTruthy();
    expect(saveEmployee).not.toHaveBeenCalled();
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

  // ROL-CIFT 2.2: only somebody with the employee access is ever scheduled, so
  // only their record offers to keep them off the schedule.
  it("offers Exclude from schedule only on a record with the employee access", async () => {
    const { unmount } = renderDrawer("employment", {
      ...detail,
      role_id: managerRoleId,
      role_name: "Manager",
      access: { employee: false, management: "manager" },
    });

    await screen.findByLabelText("Remote");
    expect(screen.queryByRole("checkbox", { name: "Exclude from schedule" })).toBeNull();
    unmount();

    renderDrawer("employment", {
      ...detail,
      role_id: managerRoleId,
      role_name: "Manager",
      access: { employee: true, management: "manager" },
    });
    expect(await screen.findByRole("checkbox", { name: "Exclude from schedule" })).toBeTruthy();
  });

  it("marks normal employee assignments as required in edit mode", async () => {
    renderDrawer("employment");

    await screen.findByText("Locations");

    expect(screen.getAllByText("Required")).toHaveLength(2);
    expect(screen.queryByText("Optional")).toBeNull();
  });

  // A legal name awaiting review, as the profile tab shows it.
  function renderLegalNameReview() {
    // The server gives the private contact to who may read it (KK-35 S3).
    renderDrawer("profile", {
      ...detail,
      role_id: employeeRoleId,
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
  }

  it("shows legal name review in the profile tab when employee changes the provisional name", async () => {
    renderLegalNameReview();

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

  // BL-1046: the employee or another reviewer moved the onboarding on first.
  it("reloads an onboarding review sent from an old copy and says so", async () => {
    renderLegalNameReview();
    vi.mocked(reviewEmployeeOnboarding).mockRejectedValue(
      new RequestError("onboarding changed; refresh required", "onboarding.changed", undefined, 409),
    );
    expect(await screen.findByText("Legal name review")).toBeTruthy();
    const reads = vi.mocked(getEmployeeOnboardingReview).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Accept Profile and privacy" }));
    expect(
      await screen.findByText("This onboarding changed meanwhile. You're seeing the latest version."),
    ).toBeTruthy();
    expect(screen.queryByText("onboarding changed; refresh required")).toBeNull();
    await waitFor(() =>
      expect(vi.mocked(getEmployeeOnboardingReview).mock.calls.length).toBeGreaterThan(reads),
    );
  });

  // KATILIM-ONAY (S-231): somebody who finished onboarding and waits for approval is let in with Approve.
  const waitingCase: EmployeeOnboardingManager = {
    case_id: "aa000000-0000-4000-8000-000000000001",
    employee_id: employeeId,
    case_status: "submitted",
    revision: 4,
    submitted_at: "2026-09-02T19:00:00.000Z",
    progress_completed: 1,
    progress_total: 1,
    ssn_present: false,
    requirements: [],
  };
  it("does not offer Approve to somebody who may not review the onboarding", async () => {
    renderDrawer("profile", { ...detail, allowed: { ...detail.allowed, onboarding_review: false } }, waitingCase);
    expect(await screen.findByText("Identity")).toBeTruthy();
    // The onboarding has loaded (its read answered) before Approve is looked for.
    await waitFor(() => expect(getEmployeeOnboardingReview).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
  it("does not offer Approve while something activation asks for is still open", async () => {
    renderDrawer("profile", detail, { ...waitingCase, case_status: "in_progress" });
    expect(await screen.findByText("Identity")).toBeTruthy();
    // The onboarding has loaded (its read answered) before Approve is looked for.
    await waitFor(() => expect(getEmployeeOnboardingReview).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
  it("approves somebody who finished onboarding and waits for approval", async () => {
    renderDrawer("profile", detail, {
      case_id: "aa000000-0000-4000-8000-000000000001",
      employee_id: employeeId,
      case_status: "submitted",
      revision: 4,
      submitted_at: "2026-09-02T19:00:00.000Z",
      progress_completed: 1,
      progress_total: 1,
      ssn_present: false,
      requirements: [
        {
          id: "ab000000-0000-4000-8000-000000000001",
          kind: "profile",
          title: "Profile and privacy",
          description: "",
          status: "completed",
          required: true,
          blocks_activation: true,
          requires_review: false,
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
    const approve = await screen.findByRole("button", { name: "Approve" });
    expect(screen.queryByRole("button", { name: "Activate employee access" })).toBeNull();
    fireEvent.click(approve);
    await waitFor(() =>
      expect(reviewEmployeeOnboarding).toHaveBeenCalledWith(workspaceId, employeeId, {
        action: "activate",
        requirementId: null,
        reason: "",
        revision: 4,
      }),
    );
  });

  // FB-6.6 S1: a legal name typed in onboarding is approved by an owner or an
  // admin, one rank up, never one's own; a manager never. Activation stays
  // with onboarding review.
  describe("legal name review asks the core", () => {
    const adminRoleId = "5d0a1f3e-7c2b-4e8a-9f61-2b3c4d5e6f70";
    const legalNameCase: EmployeeOnboardingManager = {
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
    };
    async function reviewButtons(overrides: Partial<EmployeeDetail> = {}) {
      renderDrawer(
        "profile",
        {
          ...detail,
          role_id: employeeRoleId,
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
          ...overrides,
        },
        legalNameCase,
      );
      await screen.findByText("Legal name review");
      return {
        accept: screen.getByRole("button", { name: "Accept Profile and privacy" }) as HTMLButtonElement,
        changes: screen.getByRole("button", {
          name: "Request changes for Profile and privacy",
        }) as HTMLButtonElement,
      };
    }

    it("closes it to a manager, whatever onboarding review they hold", async () => {
      currentContext = {
        ...context,
        membership: { ...context.membership, access: { employee: false, management: "manager" } },
        locationScope: { allLocations: false, locationIds: detail.locations.map((l) => l.id) },
      };
      const { accept, changes } = await reviewButtons();
      expect(accept.disabled).toBe(true);
      expect(changes.disabled).toBe(true);
    });

    // Review O1: the drawer's Tab trap must leave a box opened from it alone.
    it("keeps Shift+Tab inside the Request changes box", async () => {
      const rects = vi
        .spyOn(HTMLElement.prototype, "getClientRects")
        .mockReturnValue([{}] as unknown as DOMRectList);
      onTestFinished(() => rects.mockRestore());
      currentContext = { ...context, membership: { ...context.membership, access: { employee: false, management: "admin" } } };
      const { changes } = await reviewButtons();
      fireEvent.click(changes);
      const box = await screen.findByRole("alertdialog");
      const first = within(box).getAllByRole("button")[0]!;
      first.focus();
      fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
      expect(box.contains(document.activeElement)).toBe(true);
    });

    it("opens it to an admin for an employee", async () => {
      currentContext = { ...context, membership: { ...context.membership, access: { employee: false, management: "admin" } } };
      const { accept, changes } = await reviewButtons();
      expect(accept.disabled).toBe(false);
      expect(changes.disabled).toBe(false);
    });

    it("closes it on one's own legal name", async () => {
      currentContext = { ...context, membership: { ...context.membership, access: { employee: false, management: "admin" } } };
      inviteRolesFixture.push({ id: adminRoleId, name: "Admin", systemKey: "admin", accessClass: "admin" });
      const { accept } = await reviewButtons({ role_id: adminRoleId, user_id: context.userId });
      expect(accept.disabled).toBe(true);
    });
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
    // The manager's list opens on Needs review; a missing one sits under To do (KARARLAR S-255).
    fireEvent.click(await screen.findByRole("button", { name: /^To do/ }));
    fireEvent.click(
      await screen.findByRole("row", {
        name: "Alex Kim Food handler card Missing",
      }),
    );
    // A2 Tur 6: the drawer is headed by the person; its name says whose document it is.
    const review = await screen.findByRole("dialog", {
      name: "Alex Kim · Food handler card",
    });
    expect(
      within(review).getByRole("heading", { level: 2, name: "Alex Kim Missing" }),
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
    // Two clicks: termination is destructive (K8).
    fireEvent.click(within(dialog).getByRole("button", { name: "Terminate" }));
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

  it("says a back-dated termination releases only shifts that have not started", async () => {
    renderDrawer("employment");

    fireEvent.click(
      await screen.findByRole("button", { name: "Terminate employee" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Terminate employee" });
    // A worked shift stays with who worked it, whatever the date (K1, BL-766).
    expect(dialog.textContent).toContain(
      "Published shifts that haven't started yet will become open",
    );
    expect(dialog.textContent).not.toContain("at or after the effective time");
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
    // A click before the record reaches the form lands on an empty one and
    // saves Secondary Branch alone (seen on a slow CI runner, BL-969).
    await employeeLoaded();
    fireEvent.click(screen.getByRole("checkbox", { name: "Secondary Branch" }));
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

describe("employee assignment document check refused", () => {
  const saveHeldByDocumentCheck =
    "You can't save these changes without access to check documents.";
  it("says next to Save why it is held when the document check is refused", async () => {
    vi.mocked(previewEmployeeDocumentAssignments).mockRejectedValueOnce(
      new RequestError("Forbidden", "authz.missing_permission", undefined, 403),
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
    } satisfies EmployeeDetail;
    renderDrawer("employment", fixture);
    await employeeLoaded();
    expect(screen.queryByText(saveHeldByDocumentCheck)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Secondary Branch" }));
    const reason = await screen.findByText(saveHeldByDocumentCheck);
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toHaveProperty("disabled", true);
    expect(save.getAttribute("aria-describedby")).toBe(reason.id);
    expect(screen.queryByText("Forbidden")).toBeNull();
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

  it("hides Remove all access when the server does not allow it", async () => {
    renderDrawer("access", { ...linked, allowed: { ...detail.allowed, remove_access: false } });
    const management = await accessBox("Management app");
    await waitFor(() => expect(management.disabled).toBe(false));
    expect(screen.queryByRole("button", { name: "Remove all access" })).toBeNull();
  });

  it("locks the accesses when changing them is not allowed", async () => {
    renderDrawer("access", { ...linked, allowed: { ...detail.allowed, change_role: false } });
    expect(await screen.findByRole("button", { name: "Remove all access" })).toBeTruthy();
    expect((await accessBox("Employee app")).disabled).toBe(true);
    expect((await accessBox("Management app")).disabled).toBe(true);
  });

  it("asks twice before removing all access", async () => {
    renderDrawer("access", linked);
    fireEvent.click(await screen.findByRole("button", { name: "Remove all access" }));
    expect(removeEmployeeAccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove all access" }));
    await waitFor(() => expect(removeEmployeeAccess).toHaveBeenCalledWith(workspaceId, employeeId));
    expect(changeEmployeeAccess).not.toHaveBeenCalled();
  });

  it("offers an admin role only when making an admin is allowed", async () => {
    inviteRolesFixture = [
      { id: employeeRoleId, name: "Employee", systemKey: "employee", accessClass: "employee" },
      { id: managerRoleId, name: "Manager", systemKey: "manager", accessClass: "manager" },
      { id: adminRoleId, name: "Admin", systemKey: "admin", accessClass: "admin" },
    ];
    const view = renderDrawer("access", { ...linked, allowed: { ...detail.allowed, make_admin: false } });
    await giveManagement("Manager", []);
    expect(screen.queryByRole("radio", { name: "Admin" })).toBeNull();
    view.unmount();
    renderDrawer("access", linked);
    await giveManagement("Admin", []);
    expect(screen.getByRole("radio", { name: "Admin" })).toHaveProperty("checked", true);
    // An admin manages every location: nothing to pick.
    expect(screen.queryByRole("group", { name: /^Manages/ })).toBeNull();
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

  it("shows the load-error card for any other failure, not the server's sentence", async () => {
    detailFailure = new RequestError("Employee directory service is not configured", undefined, undefined, 503);
    renderDrawer("profile");
    expect(await screen.findByRole("heading", { level: 3, name: "We couldn't load this employee" })).toBeTruthy();
    expect(screen.getByText("This employee didn't load. Nothing was changed.")).toBeTruthy();
    expect(screen.queryByText("Employee directory service is not configured")).toBeNull();
    expect(screen.queryByRole("heading", { name: /You don't have access/ })).toBeNull();
    vi.mocked(getEmployeeDetail).mockResolvedValue(detail);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("First name")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "We couldn't load this employee" })).toBeNull();
  });

  it("shows a grey outline while the employee loads", async () => {
    vi.mocked(getEmployeeDetail).mockReturnValueOnce(new Promise(() => {}));
    renderDrawer("profile");
    expect(await screen.findByText("Loading employee")).toBeTruthy();
    expect(screen.queryByText("Loading employee...")).toBeNull();
    // QA 55: a person being loaded is not drawn as a new employee.
    expect(screen.queryByText("Code assigned on save")).toBeNull();
    expect(document.querySelector(".employee-avatar")?.textContent ?? "").toBe("");
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

// FB-6.2 .7b (KK-35): the drawer takes somebody off a location, invites and
// reviews onboarding only where the server says so; no permission key is read
// on screen.
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
    currentContext = { ...context, membership: { ...context.membership, access: { employee: false, management: "manager" } } };
    renderDrawer("employment", { ...detail, allowed: { ...detail.allowed, terminate: false } });
    const terminate = (await screen.findByRole("button", { name: "Terminate employee" })) as HTMLButtonElement;
    switchedOff(terminate);
    expect(describedBy(terminate)).toBe("Only an admin or the owner can terminate an employee.");
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

  // EMP-001: a manager manages only where they are assigned, so Employment
  // asks where they work and what they do, and nothing else.
  it("lists a manager's locations and jobs and no third list", async () => {
    extraReferenceLocations = [{ id: patio.id, name: "Patio", archived: false }];
    renderDrawer("employment", { ...detail, role_id: managerRoleId, role_name: "Manager" });
    await employeeLoaded();
    expect(document.querySelectorAll("fieldset.employee-assignment-picker")).toHaveLength(2);
    expect(screen.getAllByLabelText("Patio")).toHaveLength(1);
  });

  // EMP-001 K4 (user decision 2026-09-30): a manager who is not Remote has at
  // least one location, excluded from the schedule or not.
  describe("a manager needs a location (K4)", () => {
    const sentence = managementAndOwnerRefusals["employee.manager_location_required"];
    // The file does not clear its mocks; these tests count saves.
    beforeEach(() => vi.mocked(saveEmployee).mockClear());
    const managerAt =(patch: Partial<EmployeeDetail>) => ({
      ...detail,
      role_id: managerRoleId,
      role_name: "Manager",
      // A location the reader may not Remove is the one the form can untick.
      locations: [{ ...detail.locations[0]!, removable: false }],
      ...patch,
    });

    it("holds Save when a manager excluded from the schedule loses the last location, Remote or not", async () => {
      renderDrawer("employment", managerAt({ is_excluded_from_schedule: true }));
      await employeeLoaded();
      fireEvent.click(screen.getByLabelText("Main Dining"));
      const save = screen.getByRole("button", { name: "Save changes" });
      expect(save).toHaveProperty("disabled", true);
      expect(screen.getByText(sentence)).toBeTruthy();
      expect(within(screen.getByRole("group", { name: /^Locations/ })).getByText("Required")).toBeTruthy();
      fireEvent.click(screen.getByLabelText("Remote"));
      expect(save).toHaveProperty("disabled", true);
      expect(saveEmployee).not.toHaveBeenCalled();
    });

    it("tells a manager on the schedule the same, never to turn on Exclude from schedule", async () => {
      renderDrawer("employment", managerAt({}));
      await employeeLoaded();
      fireEvent.click(screen.getByLabelText("Main Dining"));
      expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);
      expect(screen.getByText(sentence)).toBeTruthy();
      fireEvent.click(screen.getByLabelText("Exclude from schedule"));
      expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);
      expect(screen.getByText(sentence)).toBeTruthy();
    });

    // ROL-CIFT 2.2: somebody who only manages has no "Exclude from schedule"
    // on their record, so what holds Save does not tell them to turn it on.
    it("tells somebody who only manages what holds Save without Exclude from schedule", async () => {
      renderDrawer("employment", managerAt({ access: { employee: false, management: "manager" } }));
      const server = await screen.findByLabelText("Server");
      await waitFor(() => expect((server as HTMLInputElement).checked).toBe(true));
      fireEvent.click(server);
      expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);
      expect(screen.getByText("Choose at least one job.")).toBeTruthy();
      expect(screen.queryByText(/Exclude from schedule/)).toBeNull();
      fireEvent.click(screen.getByLabelText("Remote"));
      expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);
    });

    it("holds Save when an employee excluded from the schedule loses the last location", async () => {
      renderDrawer("employment", {
        ...detail,
        role_id: employeeRoleId,
        role_name: "Employee",
        is_excluded_from_schedule: true,
        locations: [{ ...detail.locations[0]!, removable: false }],
      });
      await employeeLoaded();
      fireEvent.click(screen.getByLabelText("Main Dining"));
      expect(screen.getByRole("button", { name: "Save changes" })).toHaveProperty("disabled", true);
      expect(screen.getByText("Choose at least one location and mark one as primary.")).toBeTruthy();
    });
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

// FB-6.2 .7b visual QA (0806cc62): what an invitation and the private fields
// offer follows the record, not only the server's allowed answer.
describe("EmployeeDrawer .7b visual QA fixes", () => {

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

// EMP-001 slice A: the drawer's Profile and Employment look.
describe("EmployeeDrawer EMP-001 look", () => {
  const noPrivateRecord = {
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
  };
  const pendingInvitation = {
    id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
    email: "alex@example.test",
    role_id: employeeRoleId,
    employee_role_id: employeeRoleId,
    management_role_id: null,
    managed_location_ids: [],
    status: "pending" as const,
    expires_at: "2099-08-24T12:00:00.000Z",
    sent_at: "2026-08-17T12:00:00.000Z",
    delivery_status: "sent" as const,
    delivery_attempted_at: "2026-08-17T12:01:00.000Z",
    delivery_failed_at: null,
    delivery_error: null,
  };
  /** The text a field is described by, and whether it is kept off screen. */
  function described(input: HTMLElement) {
    const note = document.getElementById(input.getAttribute("aria-describedby") ?? "");
    return {
      text: note?.getAttribute("aria-label") ?? note?.textContent ?? null,
      hidden: note?.classList.contains("sr-only") ?? false,
    };
  }

  it.each([
    ["profile", "Profile"],
    ["employment", "Employment"],
    ["availability", "Availability"],
    ["documents", "Documents"],
    ["access", "Access"],
    ["history", "History"],
  ] as const)("has no description line under the %s tab's title", async (section, title) => {
    vi.mocked(loadWeeklyPreferences).mockResolvedValue(weeklyModel());
    renderDrawer(section, detail, null);
    const heading = await screen.findByRole("heading", { level: 2, name: title });
    await waitFor(() => expect(screen.queryByText("Loading employee")).toBeNull());
    expect(heading.closest(".employee-section-header")!.querySelector("p")).toBeNull();
  });

  it("puts the three names on one row, and preferred name beside date of birth", async () => {
    // The row exists only for a preferred name the employee asked for (KK-205).
    renderDrawer("profile", { ...detail, preferred_name: "Lex", private_contact: noPrivateRecord });
    const names = (await screen.findByLabelText("First name")).closest<HTMLElement>(".employee-name-grid")!;
    expect(within(names).getByLabelText("Middle name")).toBeTruthy();
    expect(within(names).getByLabelText("Last name")).toBeTruthy();
    expect(within(names).queryByLabelText("Preferred name")).toBeNull();
    const second = screen.getByLabelText("Preferred name").closest<HTMLElement>(".employee-form-grid")!;
    expect(within(second).getByLabelText("Date of birth")).toBeTruthy();
  });

  it("keeps why a name is locked for a screen reader only", async () => {
    renderDrawer("profile", {
      ...detail,
      user_id: "16000000-0000-4000-8000-000000000005",
      display_status: "active",
    });
    const first = await screen.findByLabelText("First name");
    expect(first).toHaveProperty("disabled", true);
    expect(described(first)).toEqual({ text: "Locked after activation", hidden: true });
    // Nothing at all is under it: no note, no kept room (UI-FIELDMSG-2).
    expect(document.querySelector(".employee-field-helper")).toBeNull();
    expect(first.closest(".employee-field")?.querySelector(".field-note")).toBeNull();
  });

  it("marks a verified e-mail inside the field", async () => {
    renderDrawer("profile", {
      ...detail,
      user_id: "16000000-0000-4000-8000-000000000005",
      account_email: "alex.account@example.test",
      display_status: "active",
    });
    const email = await screen.findByLabelText("E-mail");
    expect(within(email.closest("label")!).getByRole("img", { name: "Verified" })).toBeTruthy();
    expect(screen.queryByText("Verified account e-mail")).toBeNull();
    expect(described(email).text).toBe("Verified");
  });

  it("marks a waiting invitation inside the field and keeps the e-mail locked", async () => {
    renderDrawer("profile", { ...detail, display_status: "invited", invitation: pendingInvitation });
    const email = await screen.findByLabelText("E-mail");
    const field = email.closest("label")!;
    expect(within(field).getByRole("img", { name: "Invitation pending" })).toBeTruthy();
    expect(within(field).queryByRole("img", { name: "Verified" })).toBeNull();
    expect(email).toHaveProperty("readOnly", true);
    expect(described(email).text).toBe("Invitation pending");
    expect(described(screen.getByLabelText("First name"))).toEqual({
      text: "Locked while invitation is pending",
      hidden: true,
    });
  });

  it("shows no mark on an e-mail that is neither verified nor invited", async () => {
    renderDrawer("profile");
    const email = await screen.findByLabelText("E-mail");
    expect(within(email.closest("label")!).queryByRole("img")).toBeNull();
    expect(email).toHaveProperty("readOnly", false);
  });

  it("draws the owner's role as one switched-off row, asking for nothing", async () => {
    renderDrawer("access", {
      ...detail,
      role_id: ownerRoleId,
      role_name: "Owner",
      is_workspace_owner: true,
      user_id: context.userId,
      display_status: "active",
      access: { employee: false, management: "owner" },
      management_role_id: ownerRoleId,
      allowed: { ...ownRecordAllowed, change_role: true },
    });
    const owner = await screen.findByRole("radio", { name: "Owner" });
    const role = screen.getByRole("group", { name: /^Role/ });
    expect(owner.closest("fieldset")).toBe(role);
    expect(role).toHaveProperty("disabled", true);
    expect(within(role).queryByText("Required")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".access-note.warning")).toBeNull();
  });

  it("prints no warning or error on a linked person's untouched access", async () => {
    renderDrawer("access", {
      ...detail,
      role_id: managerRoleId,
      role_name: "Manager",
      user_id: "16000000-0000-4000-8000-000000000005",
      display_status: "active",
      access: { employee: true, management: "manager" },
      employee_role_id: employeeRoleId,
      management_role_id: managerRoleId,
      managed_location_ids: [mainDiningId],
    });
    expect(await screen.findByRole("radio", { name: "Manager" })).toHaveProperty("checked", true);
    expect(within(screen.getByRole("group", { name: /^Role/ })).getByText("Required")).toBeTruthy();
    expect(
      within(screen.getByRole("group", { name: /^Manages/ })).getByLabelText("Main Dining"),
    ).toHaveProperty("checked", true);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".access-note.warning")).toBeNull();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.getByText("Alex signs in with this email.")).toBeTruthy();
  });

  it("names what the photo button does to a screen reader, and prints no hint until it is armed", async () => {
    vi.mocked(getEmployeeAvatar).mockResolvedValueOnce({ present: true, url: "blob:photo" });
    renderDrawer("profile");
    const photo = await photoButton("Alex's photo. Select twice to remove it.");
    expect(photo.getAttribute("title")).toBe("Remove photo");
    expect(
      [...document.querySelectorAll(".drawer-avatar-hint")].map((hint) => hint.textContent),
    ).toEqual(["", ""]);
    expect(screen.queryByText("Profile photo removal")).toBeNull();
  });

  it("shows the initial while the photo loads, with nothing to remove", async () => {
    vi.mocked(getEmployeeAvatar).mockReturnValueOnce(new Promise(() => {}));
    const { container } = renderDrawer("profile");
    await screen.findByLabelText("First name");
    await waitFor(() =>
      expect(container.querySelector(".employee-summary-rail .drawer-avatar")?.textContent).toBe("A"),
    );
    expect(screen.queryByRole("button", { name: /photo/ })).toBeNull();
  });

  it("shows the initial when the photo fails, without the server's words", async () => {
    vi.mocked(getEmployeeAvatar).mockRejectedValueOnce(new Error("Storage unavailable"));
    const { container } = renderDrawer("profile");
    await screen.findByLabelText("First name");
    await waitFor(() => expect(getEmployeeAvatar).toHaveBeenCalled());
    expect(container.querySelector(".employee-summary-rail .drawer-avatar")?.textContent).toBe("A");
    expect(screen.queryByText("Storage unavailable")).toBeNull();
    expect(screen.queryByRole("button", { name: /photo/ })).toBeNull();
  });

  it("keeps the photo and its removal when the photo does not refresh", async () => {
    vi.mocked(getEmployeeAvatar).mockResolvedValueOnce({ present: true, url: "blob:photo" });
    const { client } = renderDrawer("profile");
    expect(await photoButton("Alex's photo. Select twice to remove it.")).toBeTruthy();
    vi.mocked(getEmployeeAvatar).mockRejectedValueOnce(new Error("Storage unavailable"));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["employee-avatar"] });
    });
    const photo = await photoButton("Alex's photo. Select twice to remove it.");
    expect(photo.querySelector("img")?.getAttribute("src")).toBe("blob:photo");
    expect(screen.queryByText("Storage unavailable")).toBeNull();
  });

  it("shows the photo without a way to remove it to a reader who cannot save the record", async () => {
    vi.mocked(getEmployeeAvatar).mockResolvedValueOnce({ present: true, url: "blob:photo" });
    const { container } = renderDrawer("profile", { ...detail, allowed: { ...detail.allowed, save: false } });
    await waitFor(() =>
      expect(container.querySelector(".employee-summary-rail .drawer-avatar img")?.getAttribute("src")).toBe(
        "blob:photo",
      ),
    );
    expect(screen.queryByRole("button", { name: /photo/ })).toBeNull();
    expect(document.querySelector(".drawer-avatar-hint")).toBeNull();
  });

  it("lists jobs under their departments, Management last", async () => {
    const kitchen = "dd000000-0000-4000-8000-0000000000c1";
    const floor = "dd000000-0000-4000-8000-0000000000c2";
    const management = "dd000000-0000-4000-8000-0000000000c3";
    const job = (id: string, name: string, departmentId: string | null) => ({
      id,
      name,
      archived: false,
      departmentId,
      owner: false,
    });
    vi.mocked(loadEmployeeReferenceData).mockResolvedValueOnce({
      locations: detail.locations.map((location) => ({ ...location, timezone: "America/Los_Angeles" })),
      departments: [
        { id: management, name: "Management", archived: false, management: true },
        { id: kitchen, name: "Kitchen", archived: false, management: false },
        { id: floor, name: "Floor", archived: false, management: false },
      ],
      jobs: [
        job("22000000-0000-4000-8000-0000000000d1", "Cook", kitchen),
        job("22000000-0000-4000-8000-0000000000d2", "Floor Manager", management),
        job(detail.jobs[0]!.id, "Server", floor),
        job("22000000-0000-4000-8000-0000000000d4", "Runner", null),
        job("22000000-0000-4000-8000-0000000000d5", "Dishwasher", kitchen),
      ],
      inviteRoles: [],
    });
    renderDrawer("employment");
    await employeeLoaded();
    const jobs = screen.getByRole("group", { name: /^Jobs/ });
    expect(
      [...jobs.querySelectorAll(".employee-assignment-group, input[type=checkbox]")].map(
        (node) => (node.closest("label") ?? node).textContent,
      ),
    ).toEqual([
      "Kitchen", "Cook", "Dishwasher",
      "Floor", "Server",
      "No department", "Runner",
      "Management", "Floor Manager",
    ]);
    expect(described(within(jobs).getByLabelText("Cook")).text).toBe("Kitchen");
  });

  it("keeps a job they work under its archived department", async () => {
    const closed = "dd000000-0000-4000-8000-0000000000c9";
    vi.mocked(loadEmployeeReferenceData).mockResolvedValueOnce({
      locations: detail.locations.map((location) => ({ ...location, timezone: "America/Los_Angeles" })),
      departments: [{ id: closed, name: "Patio", archived: true, management: false }],
      jobs: [{ id: detail.jobs[0]!.id, name: "Server", archived: false, departmentId: closed, owner: false }],
      inviteRoles: [],
    });
    renderDrawer("employment");
    await employeeLoaded();
    const jobs = screen.getByRole("group", { name: /^Jobs/ });
    expect(within(jobs).getByText("Patio")).toBeTruthy();
    expect(within(jobs).getByLabelText("Server")).toHaveProperty("checked", true);
  });

  it("lists jobs plainly when none sits in a department", async () => {
    renderDrawer("employment");
    await employeeLoaded();
    expect(document.querySelector(".employee-assignment-group")).toBeNull();
  });
});

// EMP-001 B4 (item 15, K7), as DAVET-ERISIM (Tur 4 B) left it: a linked
// person's accesses are picked in the form and Save changes saves them, the
// record first. The drawer never asks before it closes.
describe("EmployeeDrawer saves access with Save changes", () => {
  const linked = {
    ...detail,
    role_id: employeeRoleId,
    role_name: "Employee",
    user_id: "16000000-0000-4000-8000-000000000005",
    display_status: "active" as const,
    employee_role_id: employeeRoleId,
  };
  const asManager = {
    ...linked,
    role_id: managerRoleId,
    role_name: "Manager",
    access: { employee: true, management: "manager" as const },
    management_role_id: managerRoleId,
    managed_location_ids: [mainDiningId],
    revision: 2,
  };
  const managerAccess = {
    employee_role_id: employeeRoleId,
    management_role_id: managerRoleId,
    managed_location_ids: [mainDiningId],
    expected_impact: noImpact,
  };
  // The file does not clear its mocks; these tests count calls.
  beforeEach(() => {
    vi.mocked(saveEmployee).mockClear();
    vi.mocked(changeEmployeeAccess).mockClear();
    vi.mocked(previewEmployeeAccessChange).mockClear();
    vi.mocked(updateEmployeeInvitationAccess).mockClear();
    vi.mocked(prepareEmployeeInvitation).mockClear();
    vi.mocked(getEmployeeDetail).mockClear();
    refresh.mockClear();
  });
  const firstName = async () => {
    const input = (await screen.findByLabelText("First name")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Alex"));
    return input;
  };
  const goTo = (section: EmployeeSection) =>
    fireEvent.change(screen.getByLabelText("Employee section"), { target: { value: section } });
  const save = () => screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("holds the access picked in the form and sends nothing", async () => {
    renderDrawer("access", linked);
    await giveManagement();
    expect((await accessBox("Management app")).checked).toBe(true);
    expect(screen.getByRole("radio", { name: "Manager" })).toHaveProperty("checked", true);
    expect(save().disabled).toBe(false);
    await settled();
    expect(changeEmployeeAccess).not.toHaveBeenCalled();
    expect(previewEmployeeAccessChange).not.toHaveBeenCalled();
  });

  it("holds Save until a manager's role names where they manage", async () => {
    renderDrawer("access", linked);
    await giveManagement("Manager", []);
    expect(save().disabled).toBe(true);
    fireEvent.click(within(screen.getByRole("group", { name: /^Manages/ })).getByLabelText("Main Dining"));
    expect(save().disabled).toBe(false);
  });

  it("sends the access alone when only the access changed, and stays on Access", async () => {
    const { onSectionChange } = renderDrawer("access", linked);
    await giveManagement();
    vi.mocked(getEmployeeDetail).mockResolvedValue(asManager);
    fireEvent.click(save());
    await screen.findByRole("button", { name: "Done" });
    expect(changeEmployeeAccess).toHaveBeenCalledTimes(1);
    expect(changeEmployeeAccess).toHaveBeenCalledWith(workspaceId, employeeId, managerAccess);
    // Nothing is dropped, so nothing is previewed.
    expect(previewEmployeeAccessChange).not.toHaveBeenCalled();
    expect(saveEmployee).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(onSectionChange).not.toHaveBeenCalled();
    expect((await accessBox("Management app")).checked).toBe(true);
  });

  // BL-477: an access saved alone is heard, not only seen on the button.
  it("tells a screen reader the access was saved", async () => {
    renderDrawer("access", linked);
    await giveManagement();
    vi.mocked(getEmployeeDetail).mockResolvedValue(asManager);
    fireEvent.click(save());
    await screen.findByRole("button", { name: "Done" });
    expect(screen.getAllByRole("status").some((region) => region.textContent === "Access saved.")).toBe(true);
  });

  // BL-463: the access is saved even when reading the person again fails; the
  // drawer says so and offers Retry instead of a bare error.
  it("says the access was saved when reading the person again fails", async () => {
    renderDrawer("access", linked);
    await giveManagement();
    vi.mocked(getEmployeeDetail).mockRejectedValue(new Error("Failed to fetch"));
    fireEvent.click(save());
    expect(
      await screen.findByText(/^Access saved\. This employee didn't reload\.$/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText("Failed to fetch")).toBeNull();
  });

  it("sends the record, then the access, and returns to Profile", async () => {
    const { onSectionChange } = renderDrawer("profile", linked);
    fireEvent.change(await firstName(), { target: { value: "Alexa" } });
    goTo("access");
    await giveManagement();
    fireEvent.click(save());
    await waitFor(() => expect(changeEmployeeAccess).toHaveBeenCalledTimes(1));
    expect(changeEmployeeAccess).toHaveBeenCalledWith(workspaceId, employeeId, managerAccess);
    expect(saveEmployee).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveEmployee).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(changeEmployeeAccess).mock.invocationCallOrder[0]!,
    );
    await waitFor(() => expect(onSectionChange).toHaveBeenLastCalledWith("profile"));
  });

  it("keeps the picked access when it fails after the record landed; the retry sends the access alone", async () => {
    renderDrawer("profile", linked);
    fireEvent.change(await firstName(), { target: { value: "Alexa" } });
    goTo("access");
    await giveManagement();
    vi.mocked(changeEmployeeAccess).mockRejectedValueOnce(new Error("The access could not be changed"));
    vi.mocked(getEmployeeDetail).mockResolvedValue({ ...linked, first_name: "Alexa", revision: 2 });
    fireEvent.click(save());
    expect(await screen.findByText("The access could not be changed")).toBeTruthy();
    expect((await accessBox("Management app")).checked).toBe(true);
    expect(screen.getByRole("radio", { name: "Manager" })).toHaveProperty("checked", true);
    await waitFor(() => expect(save().disabled).toBe(false));
    fireEvent.click(save());
    await waitFor(() => expect(changeEmployeeAccess).toHaveBeenCalledTimes(2));
    expect(changeEmployeeAccess).toHaveBeenLastCalledWith(workspaceId, employeeId, managerAccess);
    expect(saveEmployee).toHaveBeenCalledTimes(1);
  });

  it("sends no access when the record is refused", async () => {
    renderDrawer("profile", linked);
    fireEvent.change(await firstName(), { target: { value: "Alexa" } });
    goTo("access");
    await giveManagement();
    vi.mocked(saveEmployee).mockRejectedValueOnce(new Error("The record could not be saved"));
    fireEvent.click(save());
    expect(await screen.findByText("The record could not be saved")).toBeTruthy();
    expect(changeEmployeeAccess).not.toHaveBeenCalled();
    expect((await accessBox("Management app")).checked).toBe(true);
  });

  // BL-431: what is unsaved may be the access, not the profile.
  it("holds Terminate while only the access is unsaved, and does not say profile", async () => {
    renderDrawer("access", linked);
    await giveManagement();
    const terminate = screen.getByRole("button", { name: "Terminate employee" }) as HTMLButtonElement;
    switchedOff(terminate);
    expect(describedBy(terminate)).toBe("Save your changes before terminating the employee");
  });

  // Visual QA D1: switched off has one look, the manager's, and says why.
  it("draws Terminate held by a draft like the manager's, with the reason read out", async () => {
    renderDrawer("access", linked);
    const live = (await screen.findByRole("button", { name: "Terminate employee" })) as HTMLButtonElement;
    expect(live.classList.contains("employee-terminate-passive")).toBe(false);
    await giveManagement();
    const held = screen.getByRole("button", { name: "Terminate employee" }) as HTMLButtonElement;
    switchedOff(held);
    expect(held.classList.contains("employee-terminate-passive")).toBe(true);
    expect(describedBy(held)).toBe("Save your changes before terminating the employee");
  });

  it("offers Save changes to a reader who may change access and not the record", async () => {
    renderDrawer("access", { ...linked, allowed: { ...detail.allowed, save: false } });
    await giveManagement();
    vi.mocked(getEmployeeDetail).mockResolvedValue({ ...asManager, allowed: { ...detail.allowed, save: false } });
    fireEvent.click(save());
    await waitFor(() =>
      expect(changeEmployeeAccess).toHaveBeenCalledWith(workspaceId, employeeId, managerAccess),
    );
    expect(saveEmployee).not.toHaveBeenCalled();
  });

  it("offers no Save changes to a reader who may change neither", async () => {
    renderDrawer("access", { ...linked, allowed: { ...detail.allowed, save: false, change_role: false } });
    expect(await screen.findByRole("button", { name: "Remove all access" })).toBeTruthy();
    expect((await accessBox("Management app")).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  // The access service moves the record's revision on. A form touched and put
  // back before the access was saved must still take the new one up.
  it("saves a later name change on the revision the access save left", async () => {
    renderDrawer("profile", linked);
    const name = await firstName();
    fireEvent.change(name, { target: { value: "Alexa" } });
    fireEvent.change(name, { target: { value: "Alex" } });
    goTo("access");
    await giveManagement();
    vi.mocked(getEmployeeDetail).mockResolvedValue(asManager);
    fireEvent.click(save());
    await screen.findByRole("button", { name: "Done" });
    goTo("profile");
    fireEvent.change(await firstName(), { target: { value: "Alexa" } });
    fireEvent.click(save());
    await waitFor(() => expect(saveEmployee).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveEmployee).mock.calls[0]![1]).toMatchObject({
      first_name: "Alexa",
      expected_revision: 2,
    });
  });

  // K7 (i), user decision 2026-09-30: leaving is never asked about.
  it("closes on Escape and on a click outside without asking, and forgets the picked access", async () => {
    const { onClose, unmount } = renderDrawer("access", linked);
    await giveManagement();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Close employee details" })[0]!);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await settled();
    expect(changeEmployeeAccess).not.toHaveBeenCalled();
    unmount();
    renderDrawer("access", linked);
    const management = await accessBox("Management app");
    await waitFor(() => expect(management.disabled).toBe(false));
    expect(management.checked).toBe(false);
    expect(screen.queryByRole("radio", { name: "Manager" })).toBeNull();
  });

  // BL-432: Enter sends what Save changes would, and nothing when it is off.
  it("sends nothing on Enter when nothing changed", async () => {
    renderDrawer("profile", linked);
    fireEvent.keyDown(await firstName(), { key: "Enter" });
    await settled();
    expect(saveEmployee).not.toHaveBeenCalled();
    expect(changeEmployeeAccess).not.toHaveBeenCalled();
  });

  it("locks a linked person's only access, and says Remove all access takes it", async () => {
    renderDrawer("access", linked);
    const employee = await accessBox("Employee app");
    const management = await accessBox("Management app");
    await waitFor(() => expect(management.disabled).toBe(false));
    expect(employee.checked).toBe(true);
    expect(employee.disabled).toBe(true);
    expect(employee.closest("label")!.getAttribute("title")).toBe(
      "This is Alex's only access. Remove all access takes it away.",
    );
  });

  describe("taking an access away (Tur 4 B)", () => {
    it("asks twice, in red, before removing the employee app, and sends what the preview said", async () => {
      renderDrawer("access", asManager);
      const employee = await accessBox("Employee app");
      await waitFor(() => expect(employee.disabled).toBe(false));
      fireEvent.click(employee);
      expect(
        await screen.findByText(/^When you save, 3 upcoming shifts become open and 1 pending request closes\./),
      ).toBeTruthy();
      expect(previewEmployeeAccessChange).toHaveBeenCalledWith(workspaceId, employeeId, {
        employee_role_id: null,
        management_role_id: managerRoleId,
      });
      expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
      const remove = screen.getByRole("button", { name: "Remove employee app" }) as HTMLButtonElement;
      expect(remove.className).toContain("danger-button");
      await waitFor(() => expect(remove.disabled).toBe(false));
      fireEvent.click(remove);
      expect(changeEmployeeAccess).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
      await waitFor(() =>
        expect(changeEmployeeAccess).toHaveBeenCalledWith(workspaceId, employeeId, {
          employee_role_id: null,
          management_role_id: managerRoleId,
          managed_location_ids: [mainDiningId],
          expected_impact: {
            shifts_opened: 3,
            requests_closed: 1,
            applications_closed: 0,
            time_off_withdrawn: 0,
            availability_deleted: true,
          },
        }),
      );
      expect(changeEmployeeAccess).toHaveBeenCalledTimes(1);
      expect(saveEmployee).not.toHaveBeenCalled();
    });

    it("puts the employee app back with Undo, and Save changes is plain again", async () => {
      renderDrawer("access", asManager);
      const employee = await accessBox("Employee app");
      await waitFor(() => expect(employee.disabled).toBe(false));
      fireEvent.click(employee);
      await screen.findByRole("button", { name: "Remove employee app" });
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(employee.checked).toBe(true);
      expect(screen.queryByText(/^When you save/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Remove employee app" })).toBeNull();
      expect(save().disabled).toBe(true);
      await settled();
      expect(changeEmployeeAccess).not.toHaveBeenCalled();
    });

    it("says what removing the management app takes away, asks twice, and Undo gives the role back", async () => {
      renderDrawer("access", asManager);
      const management = await accessBox("Management app");
      await waitFor(() => expect(management.disabled).toBe(false));
      fireEvent.click(management);
      expect(
        screen.getByText(/^When you save, Alex can no longer open the management app or manage Main Dining\./),
      ).toBeTruthy();
      expect(screen.queryByRole("radio", { name: "Manager" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(management.checked).toBe(true);
      expect(screen.getByRole("radio", { name: "Manager" })).toHaveProperty("checked", true);
      expect(
        within(screen.getByRole("group", { name: /^Manages/ })).getByLabelText("Main Dining"),
      ).toHaveProperty("checked", true);
      fireEvent.click(management);
      fireEvent.click(screen.getByRole("button", { name: "Remove management app" }));
      expect(changeEmployeeAccess).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
      await waitFor(() =>
        expect(changeEmployeeAccess).toHaveBeenCalledWith(workspaceId, employeeId, {
          employee_role_id: employeeRoleId,
          management_role_id: null,
          managed_location_ids: [],
          expected_impact: noImpact,
        }),
      );
      // Dropping the management app moves no shift: nothing is previewed.
      expect(previewEmployeeAccessChange).not.toHaveBeenCalled();
    });
  });

  // An invitation still out takes the access change on its own link (Tur 4 B).
  it("changes a pending invitation's access with Save changes, keeping the link", async () => {
    renderDrawer("access", {
      ...detail,
      display_status: "invited",
      invitation: {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        email: "alex@example.test",
        role_id: employeeRoleId,
        employee_role_id: employeeRoleId,
        management_role_id: null,
        managed_location_ids: [],
        status: "pending",
        expires_at: "2099-08-24T12:00:00.000Z",
        sent_at: "2026-08-17T12:00:00.000Z",
        delivery_status: "sent",
      },
    });
    await giveManagement();
    // No second Invite in the footer: the invitation out is the one changed.
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
    fireEvent.click(save());
    await waitFor(() =>
      expect(updateEmployeeInvitationAccess).toHaveBeenCalledWith(workspaceId, employeeId, {
        employee_role_id: employeeRoleId,
        management_role_id: managerRoleId,
        managed_location_ids: [mainDiningId],
      }),
    );
    expect(prepareEmployeeInvitation).not.toHaveBeenCalled();
    expect(changeEmployeeAccess).not.toHaveBeenCalled();
    expect(saveEmployee).not.toHaveBeenCalled();
  });
});

// EMP-001 B4 (coordinator's addition, 2026-09-30): a removal that takes the
// person out of the reader's reach closes the drawer and says what happened.
describe("EmployeeDrawer after a removal from a location", () => {
  const outOfReach = new RequestError("Not allowed", "authz.out_of_scope", "employee.read", 403);
  beforeEach(() => {
    toast.success.mockClear();
    vi.mocked(getEmployeeDetail).mockClear();
  });
  const removeFromMainDining = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Remove from Main Dining" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove from Main Dining" }));
  };

  it("closes and says so when the person can no longer be read", async () => {
    vi.mocked(removeEmployeeFromLocation).mockResolvedValue({ releasedShiftCount: 0, locationsLeft: 1 });
    const { onClose } = renderDrawer("employment");
    await screen.findByRole("button", { name: "Remove from Main Dining" });
    vi.mocked(getEmployeeDetail).mockRejectedValue(outOfReach);
    await removeFromMainDining();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith("Removed from Main Dining");
  });

  // BL-785: their shifts there from now on were left open; Schedule reads again.
  it("refreshes Schedule after a removal from a location", async () => {
    vi.mocked(removeEmployeeFromLocation).mockResolvedValue({ releasedShiftCount: 1, locationsLeft: 1 });
    const { client } = renderDrawer("employment");
    client.setQueryData(["schedule-read", workspaceId, "2026-09-01"], { shifts: [] });
    await removeFromMainDining();
    await waitFor(() =>
      expect(client.getQueryState(["schedule-read", workspaceId, "2026-09-01"])?.isInvalidated).toBe(true),
    );
  });

  it("stays open and reads the record again when the person is still in reach", async () => {
    vi.mocked(removeEmployeeFromLocation).mockResolvedValue({ releasedShiftCount: 0, locationsLeft: 1 });
    const { onClose } = renderDrawer("employment");
    await removeFromMainDining();
    await waitFor(() => expect(getEmployeeDetail).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onClose).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

// EKRAN-03 #1, #7, #8, #16: the termination window and the preferred name.
describe("EmployeeDrawer termination window (EKRAN-03)", () => {
  const noLocationLeft = {
    ...detail,
    primary_location_id: null,
    primary_location_name: null,
    location_count: 0,
    locations: [],
  } satisfies EmployeeDetail;
  const workspaceLocation = (id: string, name: string, timezone: string, archived = false) => ({
    id,
    name,
    archived,
    timezone,
  });

  beforeEach(() => vi.mocked(terminateEmployee).mockClear());

  async function openTermination(fixture: EmployeeDetail = detail) {
    renderDrawer("employment", fixture);
    fireEvent.click(await screen.findByRole("button", { name: "Terminate employee" }));
    return screen.getByRole("dialog", { name: "Terminate employee" });
  }

  // #1 (BL-765, K4): the server takes any valid zone from somebody with no
  // location left; the window offered none and stayed switched off.
  it("offers the workspace's time zones to somebody with no location left", async () => {
    vi.mocked(loadEmployeeReferenceData).mockResolvedValueOnce({
      locations: [
        workspaceLocation("11000000-0000-4000-8000-0000000000c1", "Kadikoy", "America/New_York"),
        workspaceLocation("11000000-0000-4000-8000-0000000000c2", "Uptown", "America/Chicago"),
        workspaceLocation("11000000-0000-4000-8000-0000000000c3", "Besiktas", "America/New_York"),
        workspaceLocation("11000000-0000-4000-8000-0000000000c4", "Old Port", "America/Denver", true),
      ],
      departments: [],
      jobs: [],
      inviteRoles: [],
    });
    const dialog = await openTermination(noLocationLeft);
    const zone = await within(dialog).findByLabelText("Worksite timezone");
    await waitFor(() =>
      expect(
        Array.from((zone as HTMLSelectElement).options).map((option) => option.value),
      ).toEqual(["America/New_York", "America/Chicago"]),
    );
    expect(within(dialog).queryByText("An active employee location with a timezone is required.")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Employment ended" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Terminate" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm termination" }));
    await waitFor(() =>
      expect(terminateEmployee).toHaveBeenCalledWith(
        workspaceId,
        employeeId,
        expect.objectContaining({ worksiteTimezone: "America/New_York" }),
      ),
    );
  });

  // #7 (BL-778, K8): termination is destructive: red, and a second click.
  it("asks twice, in red, before terminating", async () => {
    const dialog = await openTermination();
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Employment ended" } });
    const terminate = within(dialog).getByRole("button", { name: "Terminate" });
    expect(terminate.className).toContain("danger-button");
    fireEvent.click(terminate);
    expect(terminateEmployee).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm termination" }));
    await waitFor(() => expect(terminateEmployee).toHaveBeenCalledTimes(1));
  });

  // Arming must not move Cancel: the button is as wide as its armed words
  // from the start (measured 112 → 191 px before).
  it("keeps the button as wide at rest as when armed", async () => {
    const dialog = await openTermination();
    const terminate = within(dialog).getByRole("button", { name: "Terminate" });
    const sizer = terminate.querySelector("[aria-hidden='true']");
    expect(sizer?.textContent).toBe("Confirm termination");
  });

  // #8 (BL-779, T2): what is missing is said under its field, not in the
  // browser's bubble, and nothing is armed.
  it("says a missing reason under the field and does not arm", async () => {
    const dialog = await openTermination();
    expect(dialog.querySelector("form")?.noValidate).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Terminate" }));
    const reason = within(dialog).getByLabelText("Reason");
    expect(reason.getAttribute("aria-invalid")).toBe("true");
    const message = document.getElementById(reason.getAttribute("aria-describedby") ?? "");
    expect(message?.textContent).toBe("Enter a reason of at least 3 characters.");
    expect(document.activeElement).toBe(reason);
    expect(within(dialog).queryByRole("button", { name: "Confirm termination" })).toBeNull();
    expect(terminateEmployee).not.toHaveBeenCalled();
  });

  // #8 (BL-779): the window takes the focus, keeps Tab inside, and Escape
  // hands it back to the button that opened it.
  it("puts the focus on the first field when it opens", async () => {
    const dialog = await openTermination();
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByLabelText("Effective date and time")),
    );
  });

  it("keeps Tab inside the window", async () => {
    const dialog = await openTermination();
    const close = within(dialog).getByRole("button", { name: "Close termination dialog" });
    const terminate = within(dialog).getByRole("button", { name: "Terminate" });
    terminate.focus();
    fireEvent.keyDown(terminate, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(terminate);
  });

  // However the window closes, the focus goes back to the button that opened it.
  it.each([
    ["Cancel", (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Cancel" })],
    ["the close button", (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Close termination dialog" })],
  ])("gives the focus back to Terminate employee after %s", async (_name, closer) => {
    const dialog = await openTermination();
    fireEvent.click(closer(dialog));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Terminate employee" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Terminate employee" }));
  });

  // The window closes while the request is still settling and the button is
  // switched off; the focus must still land on it once it is back.
  it("gives the focus back to the drawer's button after a termination", async () => {
    const dialog = await openTermination();
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Employment ended" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Terminate" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm termination" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Terminate employee" })).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Terminate employee" })),
    );
  });

  // The pick lists can arrive after the window opens: the suggested time is
  // then "now" where the person works, not in the reader's own zone.
  it("suggests now in the worksite zone when the zones arrive late", async () => {
    let answer: (value: Awaited<ReturnType<typeof loadEmployeeReferenceData>>) => void = () => undefined;
    vi.mocked(loadEmployeeReferenceData).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const dialog = await openTermination();
    answer({
      locations: detail.locations.map((location) => ({ ...location, timezone: "Pacific/Honolulu" })),
      departments: [],
      jobs: [],
      inviteRoles: [],
    });
    const zone = within(dialog).getByLabelText("Worksite timezone") as HTMLSelectElement;
    await waitFor(() => expect(zone.value).toBe("Pacific/Honolulu"));
    // Worked out inside the wait, so an hour turning over cannot fail it.
    await waitFor(() => {
      const [day, hour] = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Pacific/Honolulu",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
      })
        .format(new Date())
        .split(", ");
      expect(
        (within(dialog).getByLabelText("Effective date and time") as HTMLInputElement).value.slice(0, 13),
      ).toBe(`${day}T${hour}`);
    });
  });

  // UI-FIELDMSG-2 (Mert 2026-10-18): the missing zone is said under its own field,
  // so a server refusal in the band never hides it.
  it("says under the timezone field while no zone is known, then nothing", async () => {
    let answer: (value: Awaited<ReturnType<typeof loadEmployeeReferenceData>>) => void = () => undefined;
    vi.mocked(loadEmployeeReferenceData).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const dialog = await openTermination();
    const zone = within(dialog).getByLabelText("Worksite timezone");
    const missing = "An active employee location with a timezone is required.";
    expect((zone as HTMLSelectElement).options).toHaveLength(0);
    expect(document.getElementById(zone.getAttribute("aria-describedby") ?? "")?.textContent).toBe(missing);
    expect(zone.closest("label")?.querySelector(".field-note")?.textContent).toBe(missing);
    expect(dialog.querySelector(".window-alert")).toBeNull();
    answer({
      locations: detail.locations.map((location) => ({ ...location, timezone: "Pacific/Honolulu" })),
      departments: [],
      jobs: [],
      inviteRoles: [],
    });
    await waitFor(() => expect((zone as HTMLSelectElement).value).toBe("Pacific/Honolulu"));
    expect(zone.getAttribute("aria-describedby")).toBeNull();
    expect(within(dialog).queryByText(missing)).toBeNull();
  });

  it("keeps a time already typed when the zones arrive late", async () => {
    let answer: (value: Awaited<ReturnType<typeof loadEmployeeReferenceData>>) => void = () => undefined;
    vi.mocked(loadEmployeeReferenceData).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const dialog = await openTermination();
    const effective = within(dialog).getByLabelText("Effective date and time") as HTMLInputElement;
    fireEvent.change(effective, { target: { value: "2026-09-01T12:00" } });
    answer({
      locations: detail.locations.map((location) => ({ ...location, timezone: "Pacific/Honolulu" })),
      departments: [],
      jobs: [],
      inviteRoles: [],
    });
    const zone = within(dialog).getByLabelText("Worksite timezone") as HTMLSelectElement;
    await waitFor(() => expect(zone.value).toBe("Pacific/Honolulu"));
    expect(effective.value).toBe("2026-09-01T12:00");
  });

  it("gives the focus back to Terminate employee on Escape", async () => {
    const dialog = await openTermination();
    fireEvent.keyDown(within(dialog).getByLabelText("Reason"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Terminate employee" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Terminate employee" }));
  });

  // #16 (BL-777, K2 as changed by KK-205): typed here, it was dropped without
  // a word. The drawer only shows one the employee asked for.
  it("leaves Preferred name out when the person has none", async () => {
    renderDrawer("profile");
    await screen.findByLabelText("First name");
    await waitFor(() => expect(screen.queryByText("Loading employee")).toBeNull());
    expect(screen.queryByLabelText("Preferred name")).toBeNull();
  });

  it("shows a preferred name as read-only text", async () => {
    renderDrawer("profile", { ...detail, preferred_name: "Lex" });
    const preferred = (await screen.findByLabelText("Preferred name")) as HTMLInputElement;
    expect(preferred.readOnly).toBe(true);
    expect(preferred.value).toBe("Lex");
  });
});

// EKRAN-03 #41 (BL-478, BL-479): the drawer keeps the keyboard.
describe("EmployeeDrawer keeps the keyboard (EKRAN-03)", () => {
  const panel = () => document.querySelector<HTMLElement>("[data-employee-drawer-panel]")!;

  it("takes the focus when it opens on somebody already saved", async () => {
    renderDrawer("profile");
    await screen.findByLabelText("First name");
    expect(panel().contains(document.activeElement)).toBe(true);
  });

  it("keeps Tab inside the drawer of somebody already saved", async () => {
    // jsdom lays nothing out; the trap skips what is not drawn.
    const rects = vi
      .spyOn(HTMLElement.prototype, "getClientRects")
      .mockReturnValue([{}] as unknown as DOMRectList);
    onTestFinished(() => rects.mockRestore());
    renderDrawer("profile");
    await screen.findByLabelText("First name");
    const items = Array.from(
      panel().querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
      ),
    );
    const first = items[0]!,
      last = items[items.length - 1]!;
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  // AC4 (BL-669 2), in Mert's order (Tur 4 B): Admin, Manager, then the
  // workspace's own roles, whatever order the server sends; the employee
  // role is the Employee app, not a management role.
  it("lists management roles in Access as Admin, Manager, then the workspace's own", async () => {
    inviteRolesFixture = [
      { id: "c0000000-0000-4000-8000-0000000000c1", name: "Shift Lead", systemKey: null, accessClass: "manager" },
      { id: managerRoleId, name: "Manager", systemKey: "manager", accessClass: "manager" },
      { id: employeeRoleId, name: "Employee", systemKey: "employee", accessClass: "employee" },
      { id: adminRoleId, name: "Admin", systemKey: "admin", accessClass: "admin" },
    ];
    renderDrawer("access", {
      ...detail,
      role_id: employeeRoleId,
      role_name: "Employee",
      user_id: "16000000-0000-4000-8000-000000000005",
      display_status: "active",
    });
    await giveManagement("Manager", []);
    const roles = screen.getByRole("group", { name: /^Role/ });
    expect(within(roles).getAllByRole("radio").map((radio) => radio.closest("label")!.textContent)).toEqual([
      "Admin",
      "Manager",
      "Shift Lead",
    ]);
    // Only the admin's role manages every location.
    expect(within(roles).getAllByText("Every location")).toHaveLength(1);
    expect(
      within(screen.getByRole("radio", { name: "Admin" }).closest("div")!).getByText("Every location"),
    ).toBeTruthy();
  });

  // Review D1: a read-only record's switched-off fields cannot take the focus.
  it("takes the focus on a read-only record already in the cache", async () => {
    const { client, unmount } = renderDrawer("profile", { ...detail, allowed: { ...detail.allowed, save: false } });
    await screen.findByLabelText("First name");
    unmount();
    const opener = document.createElement("button");
    document.body.append(opener);
    onTestFinished(() => opener.remove());
    opener.focus();
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <EmployeeDrawer
            employeeId={employeeId}
            creating={false}
            section="profile"
            onSectionChange={vi.fn()}
            onClose={vi.fn()}
            onCreated={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await screen.findByLabelText("First name");
    expect(panel().contains(document.activeElement)).toBe(true);
  });

  // Review D2: Escape closes the reason bubble, not the drawer and its draft.
  it("spends Escape on the reason bubble, keeping the drawer", async () => {
    currentContext = { ...context, membership: { ...context.membership, access: { employee: false, management: "manager" } } };
    const { onClose } = renderDrawer("employment", { ...detail, allowed: { ...detail.allowed, terminate: false } });
    const terminate = await screen.findByRole("button", { name: "Terminate employee" });
    fireEvent.focus(terminate);
    await screen.findByRole("tooltip");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });

  // #46 (BL-429): a manager reaches why Terminate is switched off by keyboard
  // and by tap, in the app's bubble; pressing it opens nothing.
  it("says why Terminate is switched off on focus and on a tap", async () => {
    currentContext = { ...context, membership: { ...context.membership, access: { employee: false, management: "manager" } } };
    renderDrawer("employment", { ...detail, allowed: { ...detail.allowed, terminate: false } });
    const terminate = await screen.findByRole("button", { name: "Terminate employee" });
    fireEvent.focus(terminate);
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "Only an admin or the owner can terminate an employee.",
    );
    fireEvent.blur(terminate);
    fireEvent.click(terminate);
    expect(screen.getByRole("tooltip").textContent).toBe("Only an admin or the owner can terminate an employee.");
    expect(screen.queryByRole("dialog", { name: "Terminate employee" })).toBeNull();
  });

  // The row that opened it can leave the list (removed from the location):
  // the focus goes to the page, not to the top of the document.
  it("hands the focus to the page when the row that opened it is gone", async () => {
    const page = document.createElement("main");
    const row = document.createElement("button");
    row.textContent = "Emre";
    const search = document.createElement("input");
    search.setAttribute("aria-label", "Search employees");
    page.append(search, row);
    document.body.append(page);
    onTestFinished(() => page.remove());
    row.focus();
    const { unmount } = renderDrawer("profile");
    await screen.findByLabelText("First name");
    row.remove();
    unmount();
    expect(document.activeElement).toBe(search);
  });
});

// EKRAN-03 #47 (E3-37): the drawer's words say what is true.
describe("EmployeeDrawer words (EKRAN-03)", () => {
  const archivedLinked = {
    ...detail,
    archived_at: "2026-09-01T00:00:00.000Z",
    display_status: "archived" as const,
    user_id: "16000000-0000-4000-8000-000000000005",
    role_id: employeeRoleId,
    role_name: "Employee",
  } satisfies EmployeeDetail;

  // K9 (AC8, BL-669 1).
  it("says an archived person with a linked account is archived, not onboarding", async () => {
    renderDrawer("access", archivedLinked);
    expect(await screen.findByText("Access is paused while the employee is archived.")).toBeTruthy();
    expect(within(document.querySelector(".access-invite-line")!).getByText("Archived")).toBeTruthy();
    expect(screen.queryByText("Accepted")).toBeNull();
    expect(screen.queryByText(/finishing setup/)).toBeNull();
    // Nothing to change while archived.
    expect((await accessBox("Employee app")).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Remove all access" })).toBeNull();
  });

  // K10 (BL-408): nothing to cancel in a drawer that only reads.
  it("offers one Close in a drawer that only reads", async () => {
    renderDrawer("profile", archivedLinked);
    expect(await screen.findByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  // BL-473 as the avatar has it (Mert, 20 Oct): an archived record's photo is
  // not removed from the drawer.
  it("offers no photo removal on an archived record", async () => {
    vi.mocked(getEmployeeAvatar).mockResolvedValueOnce({ present: true, url: "blob:photo" });
    const { container } = renderDrawer("profile", archivedLinked);
    await waitFor(() =>
      expect(container.querySelector(".employee-summary-rail .drawer-avatar img")?.getAttribute("src")).toBe(
        "blob:photo",
      ),
    );
    expect(screen.queryByRole("button", { name: /photo/ })).toBeNull();
  });

  // BL-430: a role nobody here may give is nothing to pick.
  it("switches the management app off when the reader has no management role to give", async () => {
    inviteRolesFixture = [{ id: employeeRoleId, name: "Employee", systemKey: "employee", accessClass: "employee" }];
    renderDrawer("access", { ...archivedLinked, archived_at: null, display_status: "active" });
    const management = await accessBox("Management app");
    await waitFor(() =>
      expect(management.closest("label")!.getAttribute("title")).toBe(
        "Only owners and admins can give management access.",
      ),
    );
    expect(management.disabled).toBe(true);
  });

  // BL-482: nothing is asked of the owner's Jobs either.
  it("does not mark the owner's Jobs as Required", async () => {
    renderDrawer("employment", { ...detail, role_name: "Owner", is_workspace_owner: true });
    const jobs = await screen.findByRole("group", { name: /^Jobs/ });
    expect(within(jobs).queryByText("Required")).toBeNull();
  });

  // BL-674 (Employees): History reads to the minute.
  it("writes History times without seconds", async () => {
    renderDrawer("history", {
      ...detail,
      events: [
        {
          id: "e1000000-0000-4000-8000-000000000001",
          action: "employee.updated",
          occurred_at: "2026-10-07T09:15:42.000Z",
          actor_user_id: "16000000-0000-4000-8000-000000000005",
          summary: "Profile updated",
        },
      ],
    });
    const when = (await screen.findByText("Profile updated")).parentElement!.querySelector("small")!;
    expect(when.textContent).not.toMatch(/:\d{2}:\d{2}/);
    expect(when.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  // E3-37: a zone reads as its name, not its code.
  it("names the worksite zone in words", async () => {
    renderDrawer("employment");
    fireEvent.click(await screen.findByRole("button", { name: "Terminate employee" }));
    const dialog = screen.getByRole("dialog", { name: "Terminate employee" });
    const zone = within(dialog).getByLabelText("Worksite timezone") as HTMLSelectElement;
    await waitFor(() => expect(zone.options[0]?.textContent).toBe("Pacific Time (Los Angeles)"));
    expect(zone.value).toBe("America/Los_Angeles");
  });
});

// EKRAN-03 #49: the drawer when something is missing.
describe("EmployeeDrawer when something is missing (EKRAN-03)", () => {
  // BL-244: an empty picker on a saved person looked like no assignments.
  it("says the pick lists did not load on somebody already saved, with Try again", async () => {
    vi.mocked(loadEmployeeReferenceData).mockRejectedValueOnce(new Error("down"));
    renderDrawer("employment");
    expect(await screen.findByRole("heading", { level: 3, name: "We couldn't load locations, jobs and roles" })).toBeTruthy();
    expect(screen.queryByText("down")).toBeNull();
    const reads = vi.mocked(loadEmployeeReferenceData).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "We couldn't load locations, jobs and roles" })).toBeNull(),
    );
    expect(vi.mocked(loadEmployeeReferenceData).mock.calls.length).toBe(reads + 1);
  });

  it("keeps the pickers and says so when the pick lists do not refresh", async () => {
    const { client } = renderDrawer("employment");
    expect(await screen.findByRole("button", { name: "Terminate employee" })).toBeTruthy();
    await waitFor(() => expect(loadEmployeeReferenceData).toHaveBeenCalled());
    vi.mocked(loadEmployeeReferenceData).mockRejectedValueOnce(new Error("down"));
    await act(async () => {
      await client.refetchQueries({ type: "active" });
    });
    const line = await screen.findByText(
      "Locations, jobs and roles didn't refresh. These are the last choices that loaded.",
    );
    expect(screen.queryByRole("heading", { name: "We couldn't load locations, jobs and roles" })).toBeNull();
    expect(screen.queryByText("down")).toBeNull();
    fireEvent.click(within(line.closest(".load-refresh") as HTMLElement).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText(/didn't refresh/)).toBeNull());
  });

  // BL-402: out of reach, the drawer does not draw a nameless record beside the card.
  it("draws only the no-access card for a person out of reach", async () => {
    detailFailure = new RequestError("Not allowed", "authz.out_of_scope", "employee.read", 403);
    renderDrawer("profile");
    await screen.findByRole("heading", { name: "You don't have access to this employee" });
    expect(screen.queryByText("Employee details")).toBeNull();
    expect(screen.queryByText("Code assigned on save")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Employee sections" })).toBeNull();
  });

  // BL-439: a long address is cut by the field's mark; the whole of it is a hover away.
  it("shows the whole e-mail address on hover", async () => {
    const email = "a.very.long.address.for.somebody@world.example.test";
    renderDrawer("profile", { ...detail, invitation_email: email });
    const field = (await screen.findByLabelText("E-mail")) as HTMLInputElement;
    expect(field.title).toBe(email);
  });
});

// EKRAN-03 #25 (BL-781): two people save the same record.
describe("EmployeeDrawer when someone else saved first (EKRAN-03)", () => {
  // Review O3: a merge does not pick a primary nobody chose (P11): a Remote
  // person, or the owner, may have jobs and locations and no primary.
  it("does not invent a primary the record did not have", async () => {
    // The owner's record, the one record the location and job rule leaves out (DAVET-ERISIM).
    const remote = { ...detail, is_workspace_owner: true, primary_job_id: null, primary_location_id: null };
    renderDrawer("profile", remote);
    fireEvent.change(await screen.findByLabelText("First name"), { target: { value: "Alexandra" } });
    vi.mocked(saveEmployee).mockRejectedValueOnce(
      new RequestError("Conflict", "employee.revision_conflict", undefined, 409),
    );
    vi.mocked(getEmployeeDetail).mockResolvedValue({ ...remote, last_name: "Reed", revision: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Someone else saved this employee meanwhile. Save again to apply your changes.");
    vi.mocked(saveEmployee).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveEmployee).toHaveBeenCalled());
    const sent = vi.mocked(saveEmployee).mock.calls[0]![1];
    expect(sent.primary_job_id).toBeNull();
    expect(sent.primary_location_id).toBeNull();
  });

  // Review Y1: the record read again in the background must not turn the other
  // person's change into "what was typed".
  it("keeps the other person's change when the record was read again before Save", async () => {
    const { client } = renderDrawer("profile");
    fireEvent.change(await screen.findByLabelText("First name"), { target: { value: "Alexandra" } });
    vi.mocked(getEmployeeDetail).mockResolvedValue({
      ...detail,
      last_name: "Reed",
      display_name: "Alex Reed",
      revision: 2,
    });
    await client.refetchQueries({ queryKey: ["employee-detail", workspaceId, employeeId] });
    // The new revision is drawn before Save is pressed.
    await screen.findByText("Alex Reed");
    vi.mocked(saveEmployee).mockRejectedValueOnce(
      new RequestError("Conflict", "employee.revision_conflict", undefined, 409),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Someone else saved this employee meanwhile. Save again to apply your changes.");
    vi.mocked(saveEmployee).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(saveEmployee).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ first_name: "Alexandra", last_name: "Reed", expected_revision: 2 }),
        employeeId,
      ),
    );
  });

  // Review O2: lists merge by what was added and taken away, not as a whole.
  it("keeps a job the other person added when another was added here", async () => {
    const otherJob = "22000000-0000-4000-8000-0000000000e1";
    const mineJob = "22000000-0000-4000-8000-0000000000e2";
    vi.mocked(loadEmployeeReferenceData).mockResolvedValueOnce({
      locations: detail.locations.map((location) => ({ ...location, timezone: "America/Los_Angeles" })),
      departments: [],
      jobs: [
        { id: detail.jobs[0]!.id, name: "Server", archived: false, departmentId: null, owner: false },
        { id: otherJob, name: "Host", archived: false, departmentId: null, owner: false },
        { id: mineJob, name: "Busser", archived: false, departmentId: null, owner: false },
      ],
      inviteRoles: [],
    });
    renderDrawer("employment");
    await employeeLoaded();
    fireEvent.click(screen.getByLabelText("Busser"));
    vi.mocked(saveEmployee).mockRejectedValueOnce(
      new RequestError("Conflict", "employee.revision_conflict", undefined, 409),
    );
    vi.mocked(getEmployeeDetail).mockResolvedValue({
      ...detail,
      job_count: 2,
      jobs: [...detail.jobs, { id: otherJob, name: "Host", primary: false, archived: false }],
      revision: 2,
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Someone else saved this employee meanwhile. Save again to apply your changes.");
    vi.mocked(saveEmployee).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveEmployee).toHaveBeenCalled());
    const sent = vi.mocked(saveEmployee).mock.calls[0]![1];
    expect([...sent.job_ids].sort()).toEqual([detail.jobs[0]!.id, otherJob, mineJob].sort());
  });

  it("keeps what was typed, takes up what the other saved, and saves on the next press", async () => {
    renderDrawer("profile");
    fireEvent.change(await screen.findByLabelText("First name"), { target: { value: "Alexandra" } });
    // Hande saved Ali's last name meanwhile; the record is at revision 2.
    vi.mocked(saveEmployee).mockRejectedValueOnce(
      new RequestError("Conflict", "employee.revision_conflict", undefined, 409),
    );
    vi.mocked(getEmployeeDetail).mockResolvedValue({ ...detail, last_name: "Reed", revision: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("Someone else saved this employee meanwhile. Save again to apply your changes."),
    ).toBeTruthy();
    expect(screen.queryByText("employee revision conflict")).toBeNull();
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Alexandra");
    await waitFor(() => expect((screen.getByLabelText("Last name") as HTMLInputElement).value).toBe("Reed"));

    vi.mocked(saveEmployee).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(saveEmployee).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ first_name: "Alexandra", last_name: "Reed", expected_revision: 2 }),
        employeeId,
      ),
    );
  });
});

// EKRAN-03 #21 (P4, BL-503 display half): a US number reads one way.
describe("EmployeeDrawer phone numbers (EKRAN-03)", () => {
  const withNumbers = {
    phone: "+16095518909",
    street_address: null,
    city: null,
    region: null,
    postal_code: null,
    country_code: null,
    date_of_birth: null,
    emergency_contact_name: "Morgan",
    emergency_contact_relationship: null,
    emergency_contact_phone: "+16095518910",
    emergency_contact_email: "",
    share_phone_with_teammates: false,
    share_email_with_teammates: false,
  };

  it("shows saved phone numbers as +1 (609) 551-8909", async () => {
    renderDrawer("profile", { ...detail, private_contact: withNumbers });
    expect(((await screen.findByLabelText("Phone")) as HTMLInputElement).value).toBe("+1 (609) 551-8909");
    expect((screen.getByLabelText("Emergency phone") as HTMLInputElement).value).toBe("+1 (609) 551-8910");
  });

});
