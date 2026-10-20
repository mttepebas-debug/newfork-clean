import {
  act,
  configure,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

// The phone bar (ManagementMobileNav) repeats the sidebar's links; jsdom applies
// no media queries, so sidebar links are read inside the sidebar.
const sidebar = () =>
  within(screen.getByRole("complementary", { name: "Application sidebar" }));
// The drafts list as the API answers it: each draft with its facts, and the live total.
const draftList = (drafts: readonly ScheduleDraftSummary[]): ScheduleDraftList => ({
  drafts: drafts.map((draft) => ({ updated_by_name: "Olcay Owner", shift_count: 0, paid_minutes: 0, open_shift_count: 0, ...draft })),
  published: { shift_count: 0, paid_minutes: 0, open_shift_count: 0 },
});
import type { ScheduleReadModel } from "@newfork/shared";
import type { ScheduleDraftList, ScheduleDraftSummary } from "@newfork/shared/schedule";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, appQueryClient } from "./App";
import { renderExportFiles, downloadExportFile } from "./schedule/export-v2/files";
import {
  acquireScheduleEditSession,
  authorizeScheduleExportV2,
  applyScheduleAutoFill,
  createScheduleExportSchedule,
  createScheduleShift,
  createScheduleShifts,
  deleteScheduleExportSchedule,
  deleteScheduleShift,
  autosaveScheduleEditSession,
  discardScheduleEditSession,
  undoScheduleEditSessionStep,
  fetchPendingOps,
  fetchScheduleDraftShifts,
  fetchSchedulePublicationStatus,
  getScheduleReadModel,
  updateScheduleShift,
  listScheduleDrafts,
  listScheduleExportPresets,
  listScheduleExportSchedules,
  listScheduleRecentExports,
  listScheduleTemplates,
  applyScheduleTemplate,
  previewScheduleTemplateApply,
  previewScheduleAutoFill,
  previewSchedulePublication,
  previewScheduleUnpublish,
  publishScheduleDraft,
  restoreScheduleShift,
  ScheduleRequestError,
  saveScheduleDraft,
  updateScheduleExportSchedule,
  unpublishSchedule,
} from "./schedule/schedule-data";
import { loadShiftAvailability } from "./availability/availability-data";

// The person signed in for a test. The real sign-in (auth/AuthContext.tsx) has
// its own tests; here a stand-in hands the app a member of Meyhouse with the
// role in testAuth.role (set it before rendering to start signed in), and the
// sign-in screen's "Sign in" signs in as testAuth.nextRole (see signInAs).
type TestRole = "owner" | "admin" | "manager" | "employee";
const testAuth = vi.hoisted(() => ({
  role: null as TestRole | null,
  nextRole: "owner" as TestRole,
  timeFormat: "system" as "system" | "12h" | "24h",
  // Actions the core leaves out for this sign-in (a role with a permission removed).
  withoutActions: [] as string[],
  // ROL-CIFT: a management role that also holds the employee access. Left out:
  // only the employee role does.
  employeeAccess: null as boolean | null,
}));

vi.mock("./auth/AuthContext", async () => {
  const React = await import("react");
  const shared = await import("@newfork/shared");
  const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
  const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
  const contextFor = (role: TestRole) => shared.activeWorkspaceContextSchema.parse({
    userId,
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
      userId,
      workspaceId,
      access: role === "employee"
        ? { employee: true, management: null }
        : { employee: testAuth.employeeAccess ?? false, management: role },
      status: "active",
    },
    permissions: shared.permissionsForRole(role),
    // What the core would list for this role with every location: the
    // actions the matrix twin answers yes to somewhere (a person action for
    // somebody: an employee), plus workspace.read, which every active member
    // has (authz_has_permission). app_private.actor_actions lists person
    // actions the same way.
    actions: shared.authzActionKeys.filter((action) => {
      if (testAuth.withoutActions.includes(action)) return false;
      if (action === "workspace.read") return true;
      // One's own hub, for whoever holds the employee access (ROL-CIFT 6.2).
      if (action === "employee_hub.read" || action === "employee_hub.self")
        return role === "employee" || testAuth.employeeAccess === true;
      const rule = (shared.targetedAuthzActions as Record<string, { person?: boolean }>)[action];
      return rule !== undefined && (shared.expected as (...args: unknown[]) => boolean)(
        {
          workspaceId,
          role,
          status: "active",
          locationIds: [],
          permissions: shared.permissionsForRole(role),
        },
        action,
        ...(rule.person ? [{ person: { role: "employee", isSelf: false } }] : []),
      );
    }),
    onboarding: { status: "complete", currentStep: 2 },
    documentAccess: { restricted: false },
    locationScope: { allLocations: true, locationIds: [] },
  });
  const account = shared.accountProfileSchema.parse({
    userId,
    email: "owner@newfork.test",
    displayName: "Local Owner",
    phone: null,
    theme: "system",
  });
  const AuthContext = React.createContext<unknown>(null);
  function AuthProvider({ children }: { readonly children: React.ReactNode }) {
    const [role, setRole] = React.useState<TestRole | null>(testAuth.role);
    const context = React.useMemo(() => (role ? contextFor(role) : null), [role]);
    const value = React.useMemo(
      () => ({
        account: role ? { ...account, timeFormat: testAuth.timeFormat } : null,
        authenticated: role !== null,
        context,
        error: null,
        ready: true,
        supabaseConfigured: true,
        signIn: async () => {
          testAuth.role = testAuth.nextRole;
          setRole(testAuth.nextRole);
          return true;
        },
        signUp: async () => false,
        refresh: async () => context,
        signOut: async () => {
          testAuth.role = null;
          setRole(null);
        },
        updateAccount: async () => undefined,
      }),
      [context, role],
    );
    return React.createElement(AuthContext.Provider, { value }, children);
  }
  return { AuthProvider, useAuth: () => React.useContext(AuthContext) };
});

vi.mock("./schedule/export-v2/files", async importOriginal => ({
  ...await importOriginal<typeof import("./schedule/export-v2/files")>(),
  renderExportFiles: vi.fn(), downloadExportFile: vi.fn(),
}));
configure({ asyncUtilTimeout: 5000 });

const exportSaveIdleHarness = vi.hoisted(() => ({ expire: undefined as (() => void) | undefined }));
vi.mock("./schedule/hooks/useEditIdleTimer", async importOriginal => {
  const original = await importOriginal<typeof import("./schedule/hooks/useEditIdleTimer")>();
  return { ...original, useEditIdleTimer: (args: import("./schedule/hooks/useEditIdleTimer").UseEditIdleTimerArgs) => {
    if (args.enabled) exportSaveIdleHarness.expire = args.onTimeout;
    return original.useEditIdleTimer(args);
  } };
});

const scheduleFixture = vi.hoisted(() => ({
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  week_start: "2026-08-17",
  week_start_day: "monday",
  settings: {
    time_format: "12h",
    // Database defaults; the read model always carries conflict rules.
    conflict_rules: {
      approved_time_off: "block",
      closed_location: "confirm",
      minimum_travel: "confirm",
      minimum_rest: "confirm",
    },
  },
  locations: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Main Dining",
      short_name: "MAIN",
      timezone: "America/Los_Angeles",
      sort_order: 0,
      publication_status: "published",
      published_at: "2026-08-17T12:00:00Z",
    },
  ],
  departments: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Front of house",
      color: "#2563EB",
      system_key: null,
    },
  ],
  jobs: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      department_id: "22222222-2222-4222-8222-222222222222",
      system_key: null,
      name: "Server",
      color: "#2563EB",
    },
  ],
  referenced_jobs: [],
  referenced_shift_types: [],
  shift_types: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Dinner",
      color: "#7C3AED",
      sort_order: 0,
      default_start_time: "16:00",
      default_end_time: "22:00",
    },
  ],
  shift_labels: [],
  employees: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      employee_code: "NF-001",
      display_name: "Alex Rivera",
      location_ids: ["11111111-1111-4111-8111-111111111111"],
      job_ids: ["33333333-3333-4333-8333-333333333333"],
      primary_job_id: "33333333-3333-4333-8333-333333333333",
    },
  ],
  shifts: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      location_id: "11111111-1111-4111-8111-111111111111",
      employee_id: "55555555-5555-4555-8555-555555555555",
      job_id: "33333333-3333-4333-8333-333333333333",
      shift_type_id: "44444444-4444-4444-8444-444444444444",
      scheduled_date: "2026-08-17",
      start_time: "16:00",
      end_time: "22:30",
      crosses_midnight: false,
      unpaid_break_minutes: 0,
      hide_time_on_badge: false,
      label_ids: [],
      label_names: [],
      note: "",
      warning_codes: [],
    },
  ],
  closures: [],
  important_dates: [],
})) as ScheduleReadModel;

beforeEach(() => {
  // jsdom does not implement the native dialog top-layer methods.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  // jsdom does not implement matchMedia; emulate a desktop viewport.
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("min-width"), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-17T12:00:00Z"));
  appQueryClient.clear();
  window.history.pushState({}, "", "/");
  window.localStorage.clear();
  testAuth.role = null;
  testAuth.nextRole = "owner";
  testAuth.withoutActions = [];
  testAuth.employeeAccess = null;
  testAuth.timeFormat = "system";
  resetScheduleApiMocks();
  vi.mocked(authorizeScheduleExportV2).mockReset().mockResolvedValue(undefined);
  vi.mocked(renderExportFiles).mockReset().mockResolvedValue([{ name: "schedule.pdf", blob: new Blob(["pdf"]) }]);
  vi.mocked(downloadExportFile).mockReset();
  exportSaveIdleHarness.expire = undefined;
  URL.createObjectURL = vi.fn(() => "blob:test-export");
  URL.revokeObjectURL = vi.fn();
});

afterEach(async () => {
  cleanup();
  await appQueryClient.cancelQueries();
  appQueryClient.clear();
  vi.useRealTimers();
});

// Signs in through the real sign-in screen as a member with this role.
async function signInAs(
  role: TestRole,
  app: Pick<typeof screen, "findByLabelText" | "getByLabelText" | "getByRole"> = screen,
) {
  testAuth.nextRole = role;
  fireEvent.change(await app.findByLabelText("Email"), {
    target: { value: `${role}@newfork.test` },
  });
  fireEvent.change(app.getByLabelText("Password"), {
    target: { value: "test-password" },
  });
  await act(async () => {
    fireEvent.click(app.getByRole("button", { name: "Sign in" }));
  });
}

function scheduleFixtureForWeek(weekStart: string): ScheduleReadModel {
  return {
    ...scheduleFixture,
    week_start: weekStart,
    shifts: scheduleFixture.shifts.map((shift) => ({
      ...shift,
      scheduled_date: weekStart,
    })),
  };
}

/** An edit with unsaved work: leaving it asks to save first. */
function unsavedEdit() {
  const acquired = makeDefaultEditAcquireResult();
  return { ...acquired, session: { ...acquired.session, dirty: true } };
}
/** The Save draft window (not the Publish menu): leaving an unsaved edit asks to save it first. */
async function openSaveDraftWindow() {
  fireEvent.click(sidebar().getByRole("link", { name: "Employees" }));
  fireEvent.click(within(
    await screen.findByRole("alertdialog", { name: "Save changes before leaving?" }),
  ).getByRole("button", { name: "Save draft" }));
}

/** The New Schedule window at one of its tabs; returns the window. */
async function openNewScheduleTab(tab: "Schedules" | "Templates" | "Export") {
  fireEvent.click(await screen.findByRole("button", { name: /^Draft selector:/ }, { timeout: 5000 }));
  fireEvent.click(await screen.findByRole("tab", { name: new RegExp(`^${tab}`) }));
  return screen.findByRole("dialog", { name: /^Schedules for / });
}

async function openPublishedScheduleEditor(
  app: Pick<typeof screen, "findByRole" | "getByRole"> = screen,
) {
  const draftSelectorButton = await app.findByRole(
    "button",
    { name: "Draft selector: New Schedule" },
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(draftSelectorButton);
    await Promise.resolve();
  });
  const editLiveButton = await app.findByRole(
    "button",
    { name: "Edit live schedule" },
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(editLiveButton);
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function clickReadyButton(
  app: Pick<typeof screen, "findByRole">,
  name: string | RegExp,
) {
  const button = await app.findByRole("button", { name }, { timeout: 5000 });
  await waitFor(() => expect(button).toHaveProperty("disabled", false));
  fireEvent.click(button);
  return button;
}

function makeDefaultEditAcquireResult() {
  return {
    status: "acquired" as const,
    session: {
      id: "77777777-7777-4777-8777-777777777777",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      source_kind: "published" as const,
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      location_ids: ["11111111-1111-4111-8111-111111111111"],
      holder_name: "Development Owner",
      revision: 1,
      dirty: false,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: scheduleFixture.shifts.map((shift) => ({
        ...shift,
        unpaid_break_minutes: 30 as const,
        revision: 1,
      })),
    },
  };
}

function resetScheduleApiMocks() {
  vi.mocked(loadShiftAvailability).mockReset();
  vi.mocked(loadShiftAvailability).mockResolvedValue({
    conflict_severity: "warn",
    coverage: "full",
    operation: "allowed",
    time_basis: "type_default",
    timezone: "America/Los_Angeles",
    assessment_scope: "shift_interval",
    intervals: [],
    available_intervals: [],
    unavailable_intervals: [],
    unknown_intervals: [],
    reasons: [],
    fingerprint: "a".repeat(64),
    policy_revision: 1,
    fold_resolution: null,
    assessment_minutes: 360,
    can_override: false,
  });
  vi.mocked(getScheduleReadModel).mockReset();
  vi.mocked(getScheduleReadModel).mockResolvedValue(scheduleFixture);
  vi.mocked(listScheduleDrafts).mockReset();
  vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([]));
  vi.mocked(fetchScheduleDraftShifts).mockReset();
  vi.mocked(fetchScheduleDraftShifts).mockResolvedValue({
    shifts: scheduleFixture.shifts.map((shift) => ({
      ...shift,
      revision: 1,
    })),
  });
  vi.mocked(fetchPendingOps).mockReset();
  vi.mocked(fetchPendingOps).mockResolvedValue({ pending_ops: [] });
  vi.mocked(fetchSchedulePublicationStatus).mockReset();
  vi.mocked(fetchSchedulePublicationStatus).mockResolvedValue({
    week_start: scheduleFixture.week_start,
    week_end: "2026-08-23",
    week_start_day: "monday",
    schedule_deadline_day: "sunday",
    is_anchor_only: false,
    locations: [
      {
        id: scheduleFixture.locations[0]!.id,
        name: scheduleFixture.locations[0]!.name,
        color: "#2563EB",
        timezone: "America/Los_Angeles",
        status: "published",
        reason: "active_publication_and_shifts",
        publication_includes_location: true,
        published_shift_count: 1,
        draft_shift_count: 0,
        published_at: "2026-08-17T12:00:00Z",
        published_by_name: "Development Owner",
        source_draft_id: null,
        source_draft_name: null,
      },
    ],
  });
  vi.mocked(acquireScheduleEditSession).mockReset();
  vi.mocked(acquireScheduleEditSession).mockResolvedValue(
    makeDefaultEditAcquireResult(),
  );
  vi.mocked(createScheduleShift).mockReset();
  vi.mocked(createScheduleShifts).mockReset();
  vi.mocked(createScheduleShifts).mockResolvedValue({
    ...makeDefaultEditAcquireResult().session,
    revision: 2,
    dirty: true,
  });
  vi.mocked(updateScheduleShift).mockReset();
  vi.mocked(deleteScheduleShift).mockReset();
  vi.mocked(restoreScheduleShift).mockReset();
  vi.mocked(saveScheduleDraft).mockReset();
  vi.mocked(previewSchedulePublication).mockReset();
  vi.mocked(publishScheduleDraft).mockReset();
  vi.mocked(previewScheduleUnpublish).mockReset();
  vi.mocked(unpublishSchedule).mockReset();
  vi.mocked(listScheduleTemplates).mockReset();
  vi.mocked(listScheduleTemplates).mockResolvedValue({ templates: [] });
  vi.mocked(previewScheduleAutoFill).mockReset();
  vi.mocked(applyScheduleAutoFill).mockReset();
  vi.mocked(listScheduleExportPresets).mockReset();
  vi.mocked(listScheduleExportPresets).mockResolvedValue({
    presets: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        workspace_id: scheduleFixture.workspace_id,
        name: "Manager CSV",
        settings: {
          format: "csv",
          layout: "weekly",
          time_format: "12h",
          include_unassigned: true,
          include_notes: false,
          include_scheduled_hours: true,
          csv_delimiter: ",",
        },
        created_by: "88888888-8888-4888-8888-888888888888",
        updated_at: "2026-08-17T12:00:00Z",
      },
    ],
  });
  vi.mocked(listScheduleExportSchedules).mockReset();
  vi.mocked(listScheduleExportSchedules).mockResolvedValue({
    schedules: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        workspace_id: scheduleFixture.workspace_id,
        preset_id: "99999999-9999-4999-8999-999999999999",
        preset_name: "Manager CSV",
        name: "Monday managers",
        recipients: ["manager@example.test"],
        location_ids: [scheduleFixture.locations[0]!.id],
        day_of_week: 1,
        send_hour: 8,
        timezone: "America/Los_Angeles",
        enabled: true,
        last_sent_at: null,
        consecutive_failures: 0,
        last_error: null,
        auto_disabled_at: null,
        created_at: "2026-08-17T12:00:00Z",
        updated_at: "2026-08-17T12:00:00Z",
      },
    ],
  });
  vi.mocked(listScheduleRecentExports).mockReset();
  vi.mocked(listScheduleRecentExports).mockResolvedValue({
    events: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        workspace_id: scheduleFixture.workspace_id,
        surface: "schedule",
        format: "csv",
        params: {
          week_start: "2026-09-21",
          layout: "weekly",
          location_ids: [scheduleFixture.locations[0]!.id],
        },
        actor_user_id: "88888888-8888-4888-8888-888888888888",
        created_at: "2026-08-17T12:00:00Z",
      },
    ],
  });
  vi.mocked(createScheduleExportSchedule).mockReset();
  vi.mocked(createScheduleExportSchedule).mockImplementation(
    (_workspaceId, input) =>
      Promise.resolve({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        workspace_id: scheduleFixture.workspace_id,
        preset_name: "Manager CSV",
        enabled: true,
        last_sent_at: null,
        consecutive_failures: 0,
        last_error: null,
        auto_disabled_at: null,
        created_at: "2026-08-17T12:00:00Z",
        updated_at: "2026-08-17T12:00:00Z",
        ...input,
      }),
  );
  vi.mocked(updateScheduleExportSchedule).mockReset();
  vi.mocked(updateScheduleExportSchedule).mockImplementation(
    (_workspaceId, scheduleId, input) =>
      Promise.resolve({
        id: scheduleId,
        workspace_id: scheduleFixture.workspace_id,
        preset_id: "99999999-9999-4999-8999-999999999999",
        preset_name: "Manager CSV",
        name: "Monday managers",
        recipients: ["manager@example.test"],
        location_ids: [scheduleFixture.locations[0]!.id],
        day_of_week: 1,
        send_hour: 8,
        timezone: "America/Los_Angeles",
        enabled: input.enabled ?? true,
        last_sent_at: null,
        consecutive_failures: 0,
        last_error: null,
        auto_disabled_at: null,
        created_at: "2026-08-17T12:00:00Z",
        updated_at: "2026-08-17T12:00:00Z",
      }),
  );
  vi.mocked(deleteScheduleExportSchedule).mockReset();
  vi.mocked(deleteScheduleExportSchedule).mockResolvedValue(undefined);
}

vi.mock("./availability/availability-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./availability/availability-data")>()),
  loadShiftAvailability: vi.fn(),
}));

// Every /app page first asks whether documents restrict the member.
vi.mock("./documents/document-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./documents/document-data")>()),
  getDocumentAccess: vi.fn(async () => ({ restricted: false })),
}));

// Query keys and the error class come from the real module so the cache keys
// the page writes and invalidates match production exactly (U12).
vi.mock("./schedule/schedule-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./schedule/schedule-data")>();
  return {
  ScheduleRequestError: actual.ScheduleRequestError,
  isNothingToUndo: actual.isNothingToUndo,
  isEditSessionStale: actual.isEditSessionStale,
  undoRefusedText: actual.undoRefusedText,
  isEditLeaseExpired: actual.isEditLeaseExpired,
  isEditSessionClosed: actual.isEditSessionClosed,
  getScheduleReadModel: vi.fn().mockResolvedValue(scheduleFixture),
  authorizeScheduleExportV2: vi.fn().mockResolvedValue(undefined),
  listScheduleDrafts: vi.fn().mockResolvedValue({ drafts: [], published: { shift_count: 0, paid_minutes: 0, open_shift_count: 0 } }),
  fetchScheduleDraftShifts: vi.fn().mockResolvedValue({
    shifts: scheduleFixture.shifts.map((shift) => ({
      ...shift,
      revision: 1,
    })),
  }),
  fetchPendingOps: vi.fn().mockResolvedValue({ pending_ops: [] }),
  draftsKey: actual.draftsKey,
  scheduleReadKey: actual.scheduleReadKey,
  scheduleReadScopeKey: actual.scheduleReadScopeKey,
  pendingOpsKey: actual.pendingOpsKey,
  fetchSchedulePublicationStatus: vi.fn().mockResolvedValue({
    week_start: scheduleFixture.week_start,
    locations: [
      {
        location_id: scheduleFixture.locations[0]!.id,
        status: "published",
        draft_id: null,
        published_at: "2026-08-17T12:00:00Z",
        unpublished_at: null,
        revision: 1,
        has_pending_ops: false,
      },
    ],
  }),
  acquireScheduleEditSession: vi.fn().mockImplementation(() =>
    Promise.resolve({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777777",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        location_ids: ["11111111-1111-4111-8111-111111111111"],
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: scheduleFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    }),
  ),
  heartbeatScheduleEditSession: vi.fn(),
  createScheduleShift: vi.fn(),
  createScheduleShifts: vi.fn(),
  bulkDeleteShifts: vi.fn(),
  updateScheduleShift: vi.fn(),
  deleteScheduleShift: vi.fn(),
  restoreScheduleShift: vi.fn(),
  saveScheduleDraft: vi.fn(),
  discardScheduleEditSession: vi.fn().mockResolvedValue(undefined),
  autosaveScheduleEditSession: vi.fn().mockResolvedValue({ status: "nothing_to_save", draft_id: null, draft_name: null }),
  undoScheduleEditSessionStep: vi.fn(),
  previewSchedulePublication: vi.fn(),
  publishScheduleDraft: vi.fn(),
  previewScheduleUnpublish: vi.fn(),
  unpublishSchedule: vi.fn(),
  listScheduleTemplates: vi.fn().mockResolvedValue({ templates: [] }),
  createScheduleTemplate: vi.fn(),
  renameScheduleTemplate: vi.fn(),
  deleteScheduleTemplate: vi.fn(),
  applyScheduleTemplate: vi.fn(),
  previewScheduleTemplateApply: vi.fn(),
  previewScheduleAutoFill: vi.fn(),
  applyScheduleAutoFill: vi.fn(),
  listScheduleExportPresets: vi.fn().mockResolvedValue({
    presets: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        workspace_id: scheduleFixture.workspace_id,
        name: "Manager CSV",
        settings: {
          format: "csv",
          layout: "weekly",
          time_format: "12h",
          include_unassigned: true,
          include_notes: false,
          include_scheduled_hours: true,
          csv_delimiter: ",",
        },
        created_by: "88888888-8888-4888-8888-888888888888",
        updated_at: "2026-08-17T12:00:00Z",
      },
    ],
  }),
  listScheduleExportSchedules: vi.fn().mockResolvedValue({
    schedules: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        workspace_id: scheduleFixture.workspace_id,
        preset_id: "99999999-9999-4999-8999-999999999999",
        preset_name: "Manager CSV",
        name: "Monday managers",
        recipients: ["manager@example.test"],
        day_of_week: 1,
        send_hour: 8,
        timezone: "America/Los_Angeles",
        enabled: true,
        last_sent_at: null,
        consecutive_failures: 0,
        last_error: null,
        auto_disabled_at: null,
        created_at: "2026-08-17T12:00:00Z",
        updated_at: "2026-08-17T12:00:00Z",
      },
    ],
  }),
  listScheduleRecentExports: vi.fn().mockResolvedValue({
    events: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        workspace_id: scheduleFixture.workspace_id,
        surface: "schedule",
        format: "csv",
        params: {
          week_start: "2026-09-21",
          layout: "weekly",
          location_ids: [scheduleFixture.locations[0]!.id],
        },
        actor_user_id: "88888888-8888-4888-8888-888888888888",
        created_at: "2026-08-17T12:00:00Z",
      },
    ],
  }),
  createScheduleExportPreset: vi.fn(),
  createScheduleExportSchedule: vi
    .fn()
    .mockImplementation((_workspaceId, input) =>
      Promise.resolve({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        workspace_id: scheduleFixture.workspace_id,
        preset_name: "Manager CSV",
        enabled: true,
        last_sent_at: null,
        consecutive_failures: 0,
        last_error: null,
        auto_disabled_at: null,
        created_at: "2026-08-17T12:00:00Z",
        updated_at: "2026-08-17T12:00:00Z",
        ...input,
      }),
    ),
  updateScheduleExportSchedule: vi
    .fn()
    .mockImplementation((_workspaceId, scheduleId, input) =>
      Promise.resolve({
        id: scheduleId,
        workspace_id: scheduleFixture.workspace_id,
        preset_id: "99999999-9999-4999-8999-999999999999",
        preset_name: "Manager CSV",
        name: "Monday managers",
        recipients: ["manager@example.test"],
        day_of_week: 1,
        send_hour: 8,
        timezone: "America/Los_Angeles",
        enabled: input.enabled ?? true,
        last_sent_at: null,
        consecutive_failures: 0,
        last_error: null,
        auto_disabled_at: null,
        created_at: "2026-08-17T12:00:00Z",
        updated_at: "2026-08-17T12:00:00Z",
      }),
    ),
  deleteScheduleExportSchedule: vi.fn().mockResolvedValue(undefined),
  deleteScheduleExportPreset: vi.fn(),
  };
});

vi.mock("./schedule/hooks/useScheduleViewerPresence", () => ({
  useScheduleViewerPresence: () => [],
}));

vi.mock("./communications/communications-data", () => ({
  getWorkspaceDashboard: vi.fn().mockResolvedValue({
    workspace_id: scheduleFixture.workspace_id,
    display_name: "Development user",
    metrics: {
      today_shift_count: 1,
      today_open_shift_count: 0,
      pending_time_off_count: 0,
    },
    today_ends_at: null,
    announcements: [],
    todos: [],
    layout: {
      widget_order: [
        "operations",
        "pending_requests",
        "open_shifts",
        "announcements",
        "todos",
        "quick_actions",
      ],
      hidden_widget_ids: [],
    },
  }),
  // The managers' Home (YONETICI-HOME): one location whose next days are not
  // published and that has an open shift, so every way toward Schedule is drawn.
  getManagerHome: vi.fn().mockResolvedValue({
    workspace_id: scheduleFixture.workspace_id,
    now: "2026-10-20T12:00:00Z",
    locations: [
      {
        id: "11000000-0000-4000-8000-000000000001",
        name: "Kadikoy",
        timezone: "Europe/Istanbul",
        today: "2026-10-20",
        today_shifts: [],
        floor_managers: [],
        week: Array.from({ length: 7 }, (_, index) => ({
          date: `2026-10-${String(20 + index).padStart(2, "0")}`,
          shifts: 1,
          open: 1,
          published: index < 3,
        })),
        open_shifts: [
          { date: "2026-10-21", starts_at: "2026-10-21T14:00:00Z", ends_at: "2026-10-21T20:00:00Z", job_name: "Server" },
        ],
        missing_documents: [],
      },
    ],
    time_off: [],
  }),
  saveWorkspaceLayout: vi.fn().mockResolvedValue({ status: "saved" }),
  createWorkspaceTodo: vi.fn(),
  resolveWorkspaceTodo: vi.fn(),
  getAnnouncements: vi.fn(),
  saveAnnouncement: vi.fn(),
  transitionAnnouncement: vi.fn(),
}));

describe("App", () => {
  it("protects workspace routes and opens the authenticated shell", async () => {
    // An owner who also works shifts: the Employee view row is theirs (ROL-CIFT 6.2).
    testAuth.employeeAccess = true;
    window.history.pushState({}, "", "/app/schedule?date=2026-08-24");
    const { container } = render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeTruthy();
    await signInAs("owner");

    expect(
      await screen.findByRole(
        "heading",
        { name: "Schedule" },
        { timeout: 25000 },
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    ).toBeTruthy();
    // BL-449 (WCAG 2.5.3): the week button is called what it says.
    const weeklyViewButton = screen.getByRole("button", {
      name: "Aug 17 – Aug 23, 2026",
    });
    expect(weeklyViewButton.getAttribute("aria-label")).toBeNull();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Hide Unscheduled" }),
    ).toBeTruthy();
    // Export and Templates are tabs of the New Schedule window, not top bar buttons (Mert, 2026-10-12).
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Templates" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Draft selector: New Schedule" })
        .className,
    ).toContain("schedule-action-button");
    expect(
      screen.getByRole("columnheader", {
        name: "Published - Live Main Dining",
      }),
    ).toBeTruthy();
    const locationFilter = container.querySelector(
      '.schedule-topbar-filter[data-filter-id="locations"]',
    );
    const shiftTypeFilter = container.querySelector(
      '.schedule-topbar-filter[data-filter-id="shiftTypes"]',
    );
    expect(locationFilter).toBeTruthy();
    expect(shiftTypeFilter).toBeTruthy();
    fireEvent.click(locationFilter!.querySelector("summary")!);
    expect(locationFilter?.hasAttribute("open")).toBe(true);
    fireEvent.click(shiftTypeFilter!.querySelector("summary")!);
    expect(locationFilter?.hasAttribute("open")).toBe(false);
    expect(shiftTypeFilter?.hasAttribute("open")).toBe(true);
    fireEvent.pointerDown(document.body);
    expect(shiftTypeFilter?.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(screen.getByRole("button", { name: "Show Total hours" }));
    expect(
      screen.getByRole("columnheader", { name: "Total hours" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("grid", { name: "Weekly published schedule" })
        .getAttribute("style"),
    ).toContain(
      "grid-template-columns: minmax(144px, 200px) repeat(7, minmax(0, 1fr)) minmax(72px, 120px)",
    );
    expect(
      screen.getByRole("gridcell", { name: "Alex Rivera total hours 6h 30m" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("gridcell", { name: "Week total hours 6h 30m" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Alex Rivera")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Dinner-Server, 4:00 PM - 10:30 PM/ }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Hide Labels in badges" }),
    );
    expect(
      screen.getByRole("button", { name: /Dinner-Server, 4:00 PM - 10:30 PM/ }),
    ).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(sidebar().getByRole("link", { name: "Employees" })).toBeTruthy();
    const footerLinks = Array.from(
      container.querySelectorAll(".sidebar-footer .nav-item"),
    ).map(
      (item) =>
        // FB-6.2.8: the Employee view row ends with a hint icon; read the label.
        Array.from(item.children)
          .filter((child) => child.tagName.toLowerCase() !== "svg")
          .at(-1)?.textContent,
    );
    // The workspace switcher is the first footer row (Mert 2026-10-13).
    expect(footerLinks).toEqual([
      "Meyhouse",
      "Settings",
      "Employee view",
      "Account",
      "Sign out",
    ]);
  }, 40000);

  // Each first visit to a lazy route transforms its module graph; under a
  // loaded machine that alone can pass the file-wide 5 s async timeout
  // (BL-120), so route headings get their own bound.
  it("opens Employees, Settings and Account from the sidebar", async () => {
    const lazyRoute = { timeout: 15000 };
    window.history.pushState({}, "", "/app/employees");
    testAuth.role = "owner";
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Employees" }, lazyRoute),
    ).toBeTruthy();
    fireEvent.click(sidebar().getByRole("link", { name: "Settings" }));
    expect(
      await screen.findByRole("heading", { name: "General" }, lazyRoute),
    ).toBeTruthy();
    const settingsNav = within(
      screen.getByRole("navigation", { name: "Workspace settings" }),
    );
    expect(settingsNav.getByRole("link", { name: "Schedule rules" })).toBeTruthy();
    expect(settingsNav.getByRole("link", { name: "Shift catalog" })).toBeTruthy();
    expect(
      settingsNav.getByRole("link", { name: "Roles & permissions" }),
    ).toBeTruthy();
    expect(settingsNav.getByRole("link", { name: "Documents" })).toBeTruthy();
    expect(settingsNav.getByRole("link", { name: "Acknowledgements" })).toBeTruthy();
    expect(settingsNav.getByRole("link", { name: "Support" })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Acknowledgements" }));
    expect(
      await screen.findByRole("heading", { name: "Acknowledgements" }, lazyRoute),
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Templates" })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Retention" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Roles & permissions" }));
    expect(
      await screen.findByRole("heading", { name: "Roles & permissions" }, lazyRoute),
    ).toBeTruthy();
    fireEvent.click(sidebar().getByRole("link", { name: "Account" }));
    expect(
      await screen.findByRole("heading", { name: "Profile" }, lazyRoute),
    ).toBeTruthy();
  }, 60000);

  it("shows reference-style visible and total hour comparison when filters hide assigned shifts", async () => {
    const prepType = {
      ...scheduleFixture.shift_types[0]!,
      id: "44444444-4444-4444-8444-444444444446",
      name: "Prep",
      color: "#0F766E",
      sort_order: 1,
    };
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce({
      ...scheduleFixture,
      shift_types: [...scheduleFixture.shift_types, prepType],
      shifts: [
        ...scheduleFixture.shifts,
        {
          ...scheduleFixture.shifts[0]!,
          id: "77777777-7777-4777-8777-777777777783",
          shift_type_id: prepType.id,
          scheduled_date: "2026-08-18",
          start_time: "10:00",
          end_time: "14:00",
        },
        {
          ...scheduleFixture.shifts[0]!,
          id: "77777777-7777-4777-8777-777777777784",
          employee_id: null,
          shift_type_id: prepType.id,
          scheduled_date: "2026-08-19",
          start_time: "10:00",
          end_time: "18:00",
        },
      ],
    });
    window.history.pushState(
      {},
      "",
      `/app/schedule?date=2026-09-02&shiftTypes=${scheduleFixture.shift_types[0]!.id}`,
    );
    testAuth.role = "owner";
    render(<App />);
    await screen.findByRole("heading", { name: "Schedule" });
    fireEvent.click(await screen.findByRole("button", { name: /Settings/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Show Total hours" }),
    );

    expect(
      await screen.findByRole("gridcell", {
        name: "Alex Rivera total hours 6h 30m / 10h 30m",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("gridcell", {
        name: "Week total hours 6h 30m / 10h 30m",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("gridcell", { name: /Unassigned total hours/ }),
    ).toBeNull();
  });

  // BL-714: a mouse press on the logo in another week opens the logo window;
  // it used to jump the week back to today and swallow the click.
  it("opens the logo window from another week without jumping to today", async () => {
    vi.mocked(getScheduleReadModel).mockResolvedValue(scheduleFixtureForWeek("2026-08-24"));
    window.history.pushState({}, "", "/app/schedule?date=2026-08-24");
    testAuth.role = "owner";
    render(<App />);
    const logo = await screen.findByRole("button", { name: "Manage schedule logo" }, { timeout: 5000 });

    fireEvent.pointerDown(logo);
    fireEvent.click(logo);

    expect(await screen.findByRole("dialog", { name: "Schedule logo" })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("date")).toBe("2026-08-24");
  });

  // BL-714 (review): like every grid control, the logo first closes an open top
  // menu; the next press opens the logo window (that press used to be eaten too).
  it("closes an open draft menu before the logo opens its window", async () => {
    window.history.pushState({}, "", "/app/schedule");
    testAuth.role = "owner";
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Draft selector: New Schedule" }, { timeout: 5000 }),
    );
    expect(await screen.findByRole("button", { name: "Edit live schedule" })).toBeTruthy();

    const logo = screen.getByRole("button", { name: "Manage schedule logo" });
    fireEvent.pointerDown(logo);
    fireEvent.click(logo);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Edit live schedule" })).toBeNull());
    expect(screen.queryByRole("dialog", { name: "Schedule logo" })).toBeNull();

    const logoAgain = screen.getByRole("button", { name: "Manage schedule logo" });
    fireEvent.pointerDown(logoAgain);
    fireEvent.click(logoAgain);
    expect(await screen.findByRole("dialog", { name: "Schedule logo" })).toBeTruthy();
  });

  // BL-1025 (BL-683): the call to publish soon is for whoever can publish.
  describe("an unpublished week that starts today", () => {
    const unpublishedThisWeek = () => {
      vi.mocked(getScheduleReadModel).mockResolvedValue({
        ...scheduleFixture,
        locations: scheduleFixture.locations.map((location) => ({
          ...location,
          publication_status: "unpublished" as const,
          published_at: null,
        })),
      });
      window.history.pushState({}, "", `/app/schedule?date=${scheduleFixture.week_start}`);
    };

    it("tells someone who can publish to publish it soon", async () => {
      unpublishedThisWeek();
      testAuth.role = "owner";
      render(<App />);

      expect(
        (await screen.findAllByRole("img", { name: /as soon as possible/ })).length,
      ).toBeGreaterThan(0);
    });

    // Settings → Scheduling → Publish by (Sunday here) sets the date the dot names.
    it("names the Publish by date from the workspace's settings", async () => {
      unpublishedThisWeek();
      testAuth.role = "owner";
      render(<App />);

      expect(
        (await screen.findAllByRole("img", { name: /^Publish deadline passed on Sun, Aug 16\./ })).length,
      ).toBeGreaterThan(0);
    });

    // A role whose publish permission was taken away (the core lists no schedule.publish).
    it("does not tell someone who cannot publish to publish it", async () => {
      unpublishedThisWeek();
      testAuth.withoutActions = ["schedule.publish"];
      testAuth.role = "owner";
      render(<App />);

      expect((await screen.findAllByRole("img", { name: "Unpublished" })).length).toBeGreaterThan(0);
      expect(screen.queryByRole("img", { name: /as soon as possible/ })).toBeNull();
    });
  });

  function mockUnpublishedPastWeek(
    drafts: readonly ScheduleDraftSummary[] = [],
  ) {
    const pastWeekStart = "2020-01-06";
    const pastFixture = scheduleFixtureForWeek(pastWeekStart);
    vi.mocked(getScheduleReadModel).mockResolvedValue({
      ...pastFixture,
      locations: pastFixture.locations.map((location) => ({
        ...location,
        publication_status: "unpublished" as const,
        published_at: null,
      })),
      shifts: [],
    });
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList(drafts));
    vi.mocked(fetchSchedulePublicationStatus).mockResolvedValue({
      week_start: pastWeekStart,
      week_end: "2020-01-12",
      week_start_day: "monday",
      schedule_deadline_day: "sunday",
      is_anchor_only: false,
      locations: pastFixture.locations.map((location) => ({
        id: location.id,
        name: location.name,
        color: "#2563EB",
        timezone: location.timezone,
        status: "unpublished" as const,
        reason: "missing_publication" as const,
        publication_includes_location: false,
        published_shift_count: 0,
        draft_shift_count: 0,
        published_at: null,
        published_by_name: null,
        source_draft_id: null,
        source_draft_name: null,
      })),
    });

    return pastWeekStart;
  }

  it("keeps an unpublished past schedule week read-only", async () => {
    const pastWeekStart = mockUnpublishedPastWeek();
    window.history.pushState({}, "", `/app/schedule?date=${pastWeekStart}`);
    testAuth.role = "owner";
    render(<App />);

    const draftSelector = await screen.findByRole(
      "button",
      { name: "Draft selector: New Schedule" },
      { timeout: 5000 },
    );
    // The window still opens (Export and Templates live there), but nothing in it starts an edit.
    fireEvent.click(draftSelector);
    const windowRoot = await screen.findByRole("dialog", { name: /^Schedules for / });
    expect(within(windowRoot).getByText("Past week: you can view it, not edit it.")).toBeTruthy();
    expect(within(windowRoot).queryByRole("button", { name: "Blank schedule" })).toBeNull();
    expect(within(windowRoot).queryByRole("button", { name: "Edit live schedule" })).toBeNull();
    expect(acquireScheduleEditSession).not.toHaveBeenCalled();
  });

  // BL-723 (2), Mert's pick A: a past week's saved draft says why it cannot be edited.
  it("marks a past week's saved draft read-only in the New Schedule menu", async () => {
    const pastWeekStart = "2020-01-06";
    const draft = { id: "99999999-9999-4999-8999-999999999995", workspace_id: scheduleFixture.workspace_id,
      week_start: pastWeekStart, name: "Last week plan", revision: 2,
      created_by: "88888888-8888-4888-8888-888888888888", updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2020-01-06T12:00:00Z", updated_at: "2020-01-06T12:00:00Z" };
    mockUnpublishedPastWeek([draft]);

    window.history.pushState({}, "", `/app/schedule?date=${pastWeekStart}`);
    testAuth.role = "owner";
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Draft selector: New Schedule" }, { timeout: 5000 }),
    );
    const view = await screen.findByRole("button", { name: `View ${draft.name}` });
    const row = view.closest("li")!;
    expect(within(row).queryByRole("button", { name: `Edit ${draft.name}` })).toBeNull();
    expect(within(row).queryByRole("button", { name: `Delete ${draft.name}` })).toBeNull();
    expect(screen.getByText("Past week: you can view it, not edit it.")).toBeTruthy();
  });

  // TEL-KAPALI (KARARLAR "Schedule telefonda tamamen kapalı"): below 768 px a manager or owner has no Schedule.
  function emulatePhone() {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query.includes("max-width"), addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
  }

  it("keeps Schedule out of the phone menu and says it is for a computer when opened by address", async () => {
    emulatePhone();
    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    await signInAs("owner");

    expect(await screen.findByText("Schedule is available on a computer.")).toBeTruthy();
    expect(getScheduleReadModel).not.toHaveBeenCalled();
    for (const nav of screen.getAllByRole("navigation", { name: "Main navigation" })) {
      expect(within(nav).queryByRole("link", { name: "Schedule" })).toBeNull();
    }
    expect(screen.getAllByRole("link", { name: "Requests" }).length).toBeGreaterThan(0);
  });

  it("offers no way into Schedule from Home on a phone (TEL-KAPALI-2)", async () => {
    emulatePhone();
    window.history.pushState({}, "", "/app/workspace");
    render(<App />);
    await signInAs("owner");
    await screen.findByText("Publish from a computer");
    expect(screen.queryAllByRole("link", { name: /Open Schedule|First schedule view|Full schedule/ })).toHaveLength(0);
    // Not one link on the page leads into Schedule's grid: its days and open shifts go to Lineup.
    const intoSchedule = [...document.querySelectorAll("a[href]")]
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => /^\/app\/schedule(\?|\/?$)/.test(href));
    expect(intoSchedule).toEqual([]);
    expect(screen.getByText("See in Lineup").closest("a")?.getAttribute("href")).toBe("/app/schedule/lineup");
  });

  it("keeps Schedule's export and templates addresses closed on a phone too", async () => {
    emulatePhone();
    window.history.pushState({}, "", "/app/schedule/templates");
    render(<App />);
    await signInAs("owner");
    expect(await screen.findByText("Schedule is available on a computer.")).toBeTruthy();
  });

  it("shows the no-access card, not the raw error, when the API refuses the schedule", async () => {
    vi.mocked(getScheduleReadModel).mockRejectedValue(
      new ScheduleRequestError("Forbidden by authz.out_of_scope", 403, {
        reason: "authz.out_of_scope",
      }),
    );
    window.history.pushState({}, "", "/app/schedule?date=2026-08-24");
    testAuth.role = "owner";
    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: "You don't have access to Schedule",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to Home" }).getAttribute("href"),
    ).toBe("/app/workspace");
    expect(screen.queryByText("We couldn't load Schedule")).toBeNull();
    expect(screen.queryByText(/authz\./)).toBeNull();
    // BL-392: a refusal shows the card alone, no week navigation.
    expect(screen.queryByRole("button", { name: "Previous week" })).toBeNull();
  });

  // BL-308: Publish cannot start with no draft open and nothing live. It looks
  // unavailable, stays reachable, and says what to do first.
  it.each([
    ["no saved draft", 0, "Save a named draft before publishing this week."],
    ["a saved draft not opened", 1, "Open a saved draft from New Schedule before publishing this week."],
  ])("says why Publish is unavailable on a blank week with %s", async (_case, draftCount, reason) => {
    const weekStart = "2026-10-26";
    const unpublishedFixture = scheduleFixtureForWeek(weekStart);
    vi.mocked(getScheduleReadModel).mockResolvedValue({
      ...unpublishedFixture,
      locations: unpublishedFixture.locations.map((location) => ({
        ...location,
        publication_status: "unpublished" as const,
        published_at: null,
      })),
      shifts: [],
    });
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList(
      Array.from({ length: draftCount }, () => ({
        id: "99999999-9999-4999-8999-999999999991",
        workspace_id: unpublishedFixture.workspace_id,
        week_start: weekStart,
        name: "Service week",
        revision: 1,
        created_by: "88888888-8888-4888-8888-888888888888",
        updated_by: "88888888-8888-4888-8888-888888888888",
        created_at: "2026-10-20T12:00:00Z",
        updated_at: "2026-10-20T12:00:00Z",
      })),
    ));
    vi.mocked(fetchSchedulePublicationStatus).mockResolvedValue({
      week_start: weekStart,
      week_end: "2026-11-01",
      week_start_day: "monday",
      schedule_deadline_day: "sunday",
      is_anchor_only: false,
      locations: unpublishedFixture.locations.map((location) => ({
        id: location.id,
        name: location.name,
        color: "#2563EB",
        timezone: location.timezone,
        status: "unpublished" as const,
        reason: "missing_publication" as const,
        publication_includes_location: false,
        published_shift_count: 0,
        draft_shift_count: 0,
        published_at: null,
        published_by_name: null,
        source_draft_id: null,
        source_draft_name: null,
      })),
    });

    window.history.pushState({}, "", `/app/schedule?date=${weekStart}`);
    render(<App />);
    await signInAs("owner");

    await screen.findByRole("button", {
      name: "Draft selector: New Schedule",
    });
    const draftLookupCount = vi.mocked(listScheduleDrafts).mock.calls.length;
    const publishButton = await screen.findByRole("button", {
      name: "Publish",
    });
    await waitFor(() =>
      expect(publishButton.getAttribute("aria-disabled")).toBe("true"),
    );
    // Reachable by keyboard, and described before any bubble opens.
    expect(publishButton).toHaveProperty("disabled", false);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Publish", description: reason }),
      ).toBe(publishButton),
    );

    fireEvent.click(publishButton);

    expect(vi.mocked(listScheduleDrafts).mock.calls.length).toBe(
      draftLookupCount,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector(".schedule-operation-error")).toBeNull();
    // The click shows the reason instead of starting a publish.
    expect(screen.getByRole("tooltip").textContent).toBe(reason);
  });

  it("honors per-shift hidden clock time badges from the reference model", async () => {
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce({
      ...scheduleFixture,
      shifts: [
        {
          ...scheduleFixture.shifts[0]!,
          hide_time_on_badge: true,
        },
      ],
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-03");
    render(<App />);
    await signInAs("owner");

    expect(
      await screen.findByRole("button", { name: "Dinner-Server" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: /Dinner-Server, 4:00 PM - 10:30 PM/,
      }),
    ).toBeNull();
  });

  it("shows shift label names in badges only while label badges are enabled", async () => {
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce({
      ...scheduleFixture,
      shifts: [
        {
          ...scheduleFixture.shifts[0]!,
          label_names: ["Trainer", "Close"],
        },
      ],
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-11");
    render(<App />);
    await signInAs("owner");

    expect(
      await screen.findByRole("button", {
        name: /Dinner-Server, Trainer · Close, 4:00 PM - 10:30 PM/,
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Hide Labels in badges" }),
    );

    expect(
      screen.queryByRole("button", { name: /Trainer · Close/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /Dinner-Server, 4:00 PM - 10:30 PM/ }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Hide Shift type in badges" }),
    );

    expect(
      JSON.parse(window.localStorage.getItem("organizer-schedule-ui")!).state
        .showShiftType,
    ).toBe(false);
    expect(screen.queryByRole("button", { name: /Dinner-Server/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Server, 4:00 PM - 10:30 PM/ }),
    ).toBeTruthy();
  });

  it("saves the selected reference-style shift label from the quick editor", async () => {
    const label = {
      id: "99999999-9999-4999-8999-999999999991",
      name: "Trainer",
      color: "#0F766E",
      sort_order: 0,
    };
    const labeledFixture = {
      ...scheduleFixtureForWeek("2026-09-07"),
      shift_labels: [label],
    };
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce(labeledFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777777",
        workspace_id: labeledFixture.workspace_id,
        week_start: labeledFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        location_ids: ["11111111-1111-4111-8111-111111111111"],
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: labeledFixture.shifts.map((shift) => ({
          ...shift,
          revision: 1,
        })),
      },
    });
    const updateMock = vi.mocked(updateScheduleShift);
    updateMock.mockClear();
    updateMock.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      workspace_id: labeledFixture.workspace_id,
      week_start: labeledFixture.week_start,
      source_kind: "published",
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      location_ids: ["11111111-1111-4111-8111-111111111111"],
      holder_name: "Development Owner",
      revision: 2,
      dirty: true,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: labeledFixture.shifts.map((shift) => ({
        ...shift,
        label_ids: [label.id],
        label_names: [label.name],
        revision: 2,
      })),
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-12");
    const { container } = render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    const shiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      expect(badge).toBeTruthy();
      return badge;
    });
    fireEvent.doubleClick(shiftBadge!);
    const dialog = await screen.findByRole("dialog", { name: "Edit shift" });

    fireEvent.click(within(dialog).getByRole("combobox", { name: "Labels" }));
    fireEvent.click(within(dialog).getByRole("option", { name: label.name }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save" }),
    );

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0]?.[4]).toEqual(
      expect.objectContaining({
        label_ids: [label.id],
        label_names: [label.name],
      }),
    );
  });

  it("opens the New Schedule window at Export from the export address; closing it leaves the address", async () => {
    window.history.pushState({}, "", "/app/schedule/export?date=2026-08-17");
    render(<App />);
    await signInAs("owner");
    const panel = await screen.findByRole("region", { name: "Export settings" });
    const windowRoot = panel.closest("[role='dialog']") as HTMLElement;
    expect(windowRoot.getAttribute("aria-label")).toMatch(/^Schedules for /);
    expect(within(windowRoot).getByRole("tab", { name: "Export" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("Scheduled emails")).toBeNull();
    expect(listScheduleExportPresets).not.toHaveBeenCalled();
    expect(listScheduleExportSchedules).not.toHaveBeenCalled();
    fireEvent.click(within(windowRoot).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Export settings" })).toBeNull();
    await waitFor(() => expect(window.location.pathname).toBe("/app/schedule"));
  });

  it("opens the New Schedule window at Templates from the templates address", async () => {
    window.history.pushState({}, "", "/app/schedule/templates?date=2026-08-24");
    testAuth.role = "owner";
    render(<App />);
    const tab = await screen.findByRole("tab", { name: /^Templates/ }, { timeout: 5000 });
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText(/^No templates yet\./)).toBeTruthy();
    expect(listScheduleTemplates).toHaveBeenCalledWith(scheduleFixture.workspace_id);
  });

  // S18 (review): a role that may read templates but not manage them sees the
  // list from the templates address, with nothing it cannot do.
  it("shows a templates reader the list with no Save template, Use or row menu", async () => {
    vi.mocked(listScheduleTemplates).mockResolvedValue({
      templates: [{
        id: "99999999-9999-4999-8999-999999999982",
        workspace_id: scheduleFixture.workspace_id,
        name: "Lunch week",
        revision: 1,
        shift_count: 1,
        open_slot_count: 0,
        created_by_name: "Development Owner",
        updated_at: "2026-08-17T12:00:00Z",
      }],
    });
    testAuth.withoutActions = ["schedule.templates"];
    window.history.pushState({}, "", "/app/schedule/templates?date=2026-08-24");
    testAuth.role = "owner";
    render(<App />);
    const tab = await screen.findByRole("tab", { name: /^Templates/ }, { timeout: 5000 });
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText("Lunch week")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save template" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Use template Lunch week" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More for Lunch week" })).toBeNull();
  });

  it("opens Schedule editing from an explicit working-copy source", async () => {
    const workingFixture = scheduleFixtureForWeek("2026-09-07");
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce(workingFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: workingFixture.week_start,
        shifts: workingFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07");
    testAuth.role = "owner";
    render(<App />);
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("mode")).toBe(
      "edit",
    );
    await waitFor(() =>
      expect(fetchPendingOps).toHaveBeenCalledWith(
        workingFixture.workspace_id,
        {
          location_id: workingFixture.locations[0]!.id,
          week_start: workingFixture.week_start,
          draft_id: null,
        },
      ),
    );
    expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Add shift for Alex Rivera at Main Dining on 2026-09-07",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Add shift" }),
    ).toBeTruthy();
  });

  it("clears active preview filters when entering schedule edit mode", async () => {
    const workingFixture = scheduleFixtureForWeek("2026-09-07");
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce(workingFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: workingFixture.week_start,
        shifts: workingFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    window.history.pushState(
      {},
      "",
      `/app/schedule?date=2026-09-07&locations=${workingFixture.locations[0]!.id}&shiftTypes=${workingFixture.shift_types[0]!.id}&jobs=${workingFixture.jobs[0]!.id}&employees=${workingFixture.employees[0]!.id}&hideUnscheduled=true&layout=unified`,
    );
    testAuth.role = "owner";
    render(<App />);

    await openPublishedScheduleEditor();

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("mode")).toBe(
        "edit",
      ),
    );
    const params = new URLSearchParams(window.location.search);
    expect(params.get("locations")).toBeNull();
    expect(params.get("shiftTypes")).toBeNull();
    expect(params.get("jobs")).toBeNull();
    expect(params.get("employees")).toBeNull();
    expect(params.get("hideUnscheduled")).toBeNull();
    expect(params.get("layout")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Hide Unscheduled" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  }, 20000);

  it("locks grid editing when an active edit session navigates back to a past week", async () => {
    const workingFixture = scheduleFixtureForWeek("2026-09-07");
    vi.mocked(getScheduleReadModel)
      .mockResolvedValueOnce(workingFixture)
      .mockResolvedValue(scheduleFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: workingFixture.week_start,
        shifts: workingFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07");
    testAuth.role = "owner";
    const { container } = render(<App />);

    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Add shift for Alex Rivera at Main Dining on 2026-09-07",
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("date")).toBe(
        "2026-08-31",
      ),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Hide Unscheduled" }),
    );
    expect(
      new URLSearchParams(window.location.search).get("hideUnscheduled"),
    ).toBe("true");

    expect(
      screen.queryByRole("button", {
        name: "Add shift for Alex Rivera at Main Dining on 2026-08-17",
      }),
    ).toBeNull();
    const shiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      expect(badge).toBeTruthy();
      expect(badge?.getAttribute("draggable")).toBeNull();
      return badge;
    });
    fireEvent.doubleClick(shiftBadge!);
    expect(screen.queryByRole("dialog", { name: "Edit shift" })).toBeNull();

    const pastCell = container.querySelector<HTMLElement>(
      '[data-testid="schedule-cell-body"][data-date="2026-08-17"]',
    );
    expect(pastCell).toBeTruthy();
    fireEvent.doubleClick(pastCell!);
    expect(screen.queryByRole("dialog", { name: "Add shift" })).toBeNull();
  }, 20000);

  it("keeps active edit filters while navigating schedule weeks", async () => {
    const workingFixture = scheduleFixtureForWeek("2026-09-07");
    vi.mocked(getScheduleReadModel)
      .mockResolvedValueOnce(workingFixture)
      .mockResolvedValue(scheduleFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: workingFixture.week_start,
        shifts: workingFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07");
    testAuth.role = "owner";
    render(<App />);

    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide Unscheduled" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("date")).toBe(
        "2026-08-31",
      ),
    );
    expect(
      new URLSearchParams(window.location.search).get("hideUnscheduled"),
    ).toBe("true");

    fireEvent.click(await screen.findByRole("button", { name: "Next week" }));

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("date")).toBe(
        "2026-09-07",
      ),
    );
    expect(
      new URLSearchParams(window.location.search).get("hideUnscheduled"),
    ).toBe("true");
  }, 20000);

  // BL-278 (5): the previous week's publication status, answering late, must
  // not replace the status of the week now on screen.
  it("keeps the publication status of the week on screen when an older week answers late", async () => {
    const statusFor = (weekStart: string, status: "published" | "unpublished") => ({
      week_start: weekStart,
      week_end: weekStart,
      week_start_day: "monday" as const,
      schedule_deadline_day: "sunday" as const,
      is_anchor_only: false,
      locations: scheduleFixture.locations.map((location) => ({
        id: location.id,
        name: location.name,
        color: "#2563EB",
        timezone: location.timezone,
        status,
        reason: status === "published" ? ("active_publication_and_shifts" as const) : ("missing_publication" as const),
        publication_includes_location: status === "published",
        published_shift_count: status === "published" ? 1 : 0,
        draft_shift_count: 0,
        published_at: status === "published" ? "2026-08-17T12:00:00Z" : null,
        published_by_name: status === "published" ? "Development Owner" : null,
        source_draft_id: null,
        source_draft_name: null,
      })),
    });
    const lateAnswers: Array<() => void> = [];
    vi.mocked(getScheduleReadModel).mockImplementation(async (_workspace, date) =>
      scheduleFixtureForWeek(date >= "2026-08-24" ? "2026-08-24" : "2026-08-17"),
    );
    vi.mocked(fetchSchedulePublicationStatus).mockImplementation((_workspace, weekStart) =>
      weekStart === "2026-08-17"
        ? new Promise((resolve) => lateAnswers.push(() => resolve(statusFor("2026-08-17", "published"))))
        : Promise.resolve(statusFor("2026-08-24", "unpublished")),
    );
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    testAuth.role = "owner";
    render(<App />);

    await waitFor(() => expect(lateAnswers.length).toBeGreaterThan(0));
    fireEvent.click(await screen.findByRole("button", { name: "Next week" }));
    await waitFor(() =>
      expect(fetchSchedulePublicationStatus).toHaveBeenCalledWith(expect.anything(), "2026-08-24"),
    );
    const tones = () =>
      [...document.querySelectorAll("[data-publication-tone]")].map((node) => node.getAttribute("data-publication-tone"));
    await waitFor(() => expect(tones()).toContain("none"));

    await act(async () => {
      lateAnswers.forEach((answer) => answer());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(tones().every((tone) => tone === "none")).toBe(true);
  }, 20000);

  it("keeps active edit filters while navigating schedule days", async () => {
    const workingFixture = scheduleFixtureForWeek("2026-09-07");
    vi.mocked(getScheduleReadModel)
      .mockResolvedValueOnce(workingFixture)
      .mockResolvedValue(workingFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: workingFixture.week_start,
        shifts: workingFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07&view=day");
    testAuth.role = "owner";
    render(<App />);

    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide Unscheduled" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("date")).toBe(
        "2026-09-06",
      ),
    );
    expect(
      new URLSearchParams(window.location.search).get("hideUnscheduled"),
    ).toBe("true");

    fireEvent.click(await screen.findByRole("button", { name: "Next day" }));

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("date")).toBe(
        "2026-09-07",
      ),
    );
    expect(
      new URLSearchParams(window.location.search).get("hideUnscheduled"),
    ).toBe("true");
  }, 20000);

  it("clears stale draft preview params on past weeks instead of showing draft not found", async () => {
    const missingDraftId = "99999999-9999-4999-8999-999999999997";
    vi.mocked(fetchScheduleDraftShifts).mockRejectedValueOnce(
      new ScheduleRequestError("draft not found", 404, {
        error: "draft not found",
      }),
    );
    window.history.pushState(
      {},
      "",
      `/app/schedule?date=2026-08-17&draft=${missingDraftId}`,
    );
    testAuth.role = "owner";
    render(<App />);

    expect(
      await screen.findByRole("button", {
        name: "Draft selector: New Schedule",
      }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("draft")).toBe(
        null,
      ),
    );
    expect(screen.queryByText(/draft not found/i)).toBeNull();
    expect(fetchScheduleDraftShifts).not.toHaveBeenCalled();
  });

  it("uses an app-native confirmation before discarding schedule edits", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const discardMock = vi.mocked(discardScheduleEditSession);
    discardMock.mockClear();
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce(
      scheduleFixtureForWeek("2026-09-07"),
    );
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: "2026-09-07",
        dirty: true,
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07");
    render(<App />);

    await signInAs("owner");
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Discard" }).at(-1)!);
    const confirmDialog = await screen.findByRole("alertdialog", {
      name: "Discard unsaved changes?",
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "Keep editing" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", {
          name: "Discard unsaved changes?",
        }),
      ).toBeNull(),
    );
    expect(discardMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "Discard" }).at(-1)!);
    const secondConfirmDialog = await screen.findByRole("alertdialog", {
      name: "Discard unsaved changes?",
    });
    fireEvent.click(
      within(secondConfirmDialog).getByRole("button", { name: "Discard" }),
    );
    await waitFor(() =>
      expect(discardMock).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        "77777777-7777-4777-8777-777777777777",
      ),
    );
    await waitFor(() => expect(screen.queryByText("Editing draft")).toBeNull());
    confirmSpy.mockRestore();
  }, 20000);

  it("leaves an unchanged schedule edit without asking to discard", async () => {
    const discardMock = vi.mocked(discardScheduleEditSession);
    discardMock.mockClear();
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce(
      scheduleFixtureForWeek("2026-09-07"),
    );
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: "2026-09-07",
        dirty: false,
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07");
    render(<App />);

    await signInAs("owner");
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Discard" }).at(-1)!);
    await waitFor(() =>
      expect(discardMock).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        "77777777-7777-4777-8777-777777777777",
      ),
    );
    expect(
      screen.queryByRole("alertdialog", { name: "Discard unsaved changes?" }),
    ).toBeNull();
    await waitFor(() => expect(screen.queryByText("Editing draft")).toBeNull());
    // QA 42: leaving the edit keeps the week that was being edited on screen.
    expect(new URLSearchParams(window.location.search).get("date")).toBe(
      "2026-09-07",
    );
  }, 20000);

  it("confirms retroactive draft saves before acknowledging past edits", async () => {
    const savedDraft = {
      id: "99999999-9999-4999-8999-999999999999",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Schedule vrs.0.1",
      revision: 1,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const saveMock = vi.mocked(saveScheduleDraft);
    saveMock.mockClear();
    saveMock.mockRejectedValueOnce(
      new ScheduleRequestError("Past edit requires acknowledgement", 409, {
        status: "past_shift_edit_requires_ack",
        past_edits: [
          {
            op_type: "update",
            shift_id: scheduleFixture.shifts[0]!.id,
            scheduled_date: "2026-08-17",
            location_name: "Main Dining",
            employee_name: "Alex Rivera",
            reason: "shift_started",
            severity: "warning",
          },
        ],
        past_edit_messages: [
          "Alex Rivera already worked Main Dining on 2026-08-17.",
        ],
      }),
    );
    saveMock.mockResolvedValueOnce(savedDraft);

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save As" }));

    expect(
      await screen.findByRole("dialog", {
        name: "This changes shifts that already ran",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("Alex Rivera already worked Main Dining on 2026-08-17."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save anyway" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(saveMock.mock.calls[0]?.[4]).toBe(false);
    expect(saveMock.mock.calls[1]?.[4]).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Editing draft")).toBeNull();
  });

  // BL-440, visual QA: with the mouse, the first press inside the sheet was
  // taken by the page as a press on the blank schedule. It jumped back to this
  // week behind the sheet and swallowed the click.
  it("gives the first mouse press inside the save recovery sheet to the sheet", async () => {
    vi.mocked(saveScheduleDraft).mockRejectedValueOnce(new Error("Network dropped"));
    // A week ahead of today (the tests' clock reads 2026-08-17): a press on the
    // blank schedule there sends the page back to this week.
    const workingFixture = scheduleFixtureForWeek("2026-09-07");
    vi.mocked(getScheduleReadModel).mockResolvedValue(workingFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: workingFixture.week_start,
        shifts: workingFixture.shifts.map((shift) => ({ ...shift, unpaid_break_minutes: 30, revision: 1 })),
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save and publish" }));
    const sheet = await screen.findByRole("dialog", { name: "Schedule save failed" });
    const discard = within(sheet).getByRole("button", { name: "Discard" });
    // The failed save closes the Publish menu; wait until the page has taken that in.
    await waitFor(() =>
      expect(
        document.querySelector("[data-schedule-top-action-trigger='publish'], [data-schedule-top-action-trigger='save-draft']")?.getAttribute("aria-expanded"),
      ).toBe("false"),
    );

    // A mouse press is a pointerdown first; the page listens for that.
    const pressReachedTheButton = fireEvent.pointerDown(discard);
    fireEvent.click(discard);

    expect(pressReachedTheButton).toBe(true);
    expect(within(sheet).getByRole("button", { name: "Confirm discard" })).toBeTruthy();
    expect(window.location.search).toContain("date=2026-09-07");
    expect(window.location.search).toContain("mode=edit");
  });

  it("retries a failed save-and-publish as save-and-publish", async () => {
    const savedDraft = {
      id: "99999999-9999-4999-8999-999999999998",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Schedule vrs.0.1",
      revision: 1,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const saveMock = vi.mocked(saveScheduleDraft);
    saveMock.mockRejectedValueOnce(new Error("Network dropped"));
    saveMock.mockResolvedValueOnce(savedDraft);
    vi.mocked(previewSchedulePublication).mockResolvedValue({
      status: "publish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: savedDraft.id,
      draft_revision: savedDraft.revision,
      fingerprint: "b".repeat(64),
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          active_publication_id: null,
          active_version: null,
          current_shift_count: 0,
          next_shift_count: 1,
          added: 1,
          updated: 0,
          removed: 0,
          unchanged: 0,
          changed_since_start: null,
          affected_employee_ids: [scheduleFixture.employees[0]!.id],
        },
      ],
      findings: [],
    });

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save and publish" }));

    expect(
      await screen.findByRole("dialog", { name: "Schedule save failed" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("dialog", {
        name: "Select locations to publish",
      }),
    ).toBeTruthy();
    await clickReadyButton(screen, "Next");
    await waitFor(() =>
      expect(previewSchedulePublication).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        savedDraft.id,
        [scheduleFixture.locations[0]!.id],
        {},
      ),
    );
  }, 15_000);

  it("keeps the working copy usable after dismissing save failure recovery", async () => {
    const savedDraft = {
      id: "99999999-9999-4999-8999-999999999995",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Recovered after keep editing",
      revision: 1,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:05:00Z",
    };
    const saveMock = vi.mocked(saveScheduleDraft);
    saveMock.mockRejectedValueOnce(new Error("Network dropped"));
    saveMock.mockResolvedValueOnce(savedDraft);

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save and publish" }));

    expect(
      await screen.findByRole("dialog", { name: "Schedule save failed" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(
      screen.queryByRole("dialog", { name: "Schedule save failed" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
    // Save failures dismiss the save menu before opening native recovery.
    // Keep editing returns to the working copy; its Save menu remains usable.
    fireEvent.click(screen.getByRole("button", { name: /^(?:Save draft|Publish)$/ }));
    expect(screen.getByRole("dialog", { name: "Save draft" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Draft name"), {
      target: { value: savedDraft.name },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole("dialog", { name: "Schedule save failed" }),
    ).toBeNull();
    expect(screen.queryByText("Editing draft")).toBeNull();
  });

  it("saves after the edit lock lapsed by picking the same edit back up (D-Y3)", async () => {
    const savedDraft = {
      id: "99999999-9999-4999-8999-999999999994",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Saved after sleep",
      revision: 1,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:09:00Z",
    };
    const saveMock = vi.mocked(saveScheduleDraft);
    // The laptop slept past the 4-minute lock.
    saveMock.mockRejectedValueOnce(
      new ScheduleRequestError("edit lease expired", 409, { error: "edit lease expired", code: "edit_lease_expired" }),
    );
    saveMock.mockResolvedValueOnce(savedDraft);

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    // The server resumes the same person's own edit.
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(), status: "resumed",
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.change(screen.getByLabelText("Draft name"), {
      target: { value: savedDraft.name },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(acquireScheduleEditSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog", { name: "Schedule save failed" })).toBeNull();
    expect(screen.queryByText(/edit lease expired/i)).toBeNull();
    await waitFor(() => expect(screen.queryByText("Editing draft")).toBeNull());
  });

  // EKRAN-01 B3 (review O1): Ayşe's edit in this tab was set aside when she
  // opened the week in another; Save here does not open it again (that would
  // set the other aside in turn) and shows no raw "edit session closed".
  it("ends an edit closed elsewhere when Save finds it closed", async () => {
    const saveMock = vi.mocked(saveScheduleDraft);
    saveMock.mockRejectedValueOnce(
      new ScheduleRequestError("edit session closed", 409, { error: "edit session closed", code: "edit_session_closed" }),
    );

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    vi.mocked(acquireScheduleEditSession).mockClear();
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.change(screen.getByLabelText("Draft name"), {
      target: { value: "Closed elsewhere" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));

    expect(
      await screen.findByText("Your edit ended while you were away. Open the schedule again to keep editing."),
    ).toBeTruthy();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(acquireScheduleEditSession).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Schedule save failed" })).toBeNull();
    expect(screen.queryByText(/edit session closed/i)).toBeNull();
    await waitFor(() => expect(window.location.search).not.toContain("mode=edit"));
  });

  // BL-1052: another tab saved or changed this edit first; Save from the menu says
  // so plainly and offers a reload, never the raw "session revision stale". A
  // retry would send the same old revision, so no retry sheet opens.
  it("asks for a reload when Save finds the edit moved on in another tab", async () => {
    const saveMock = vi.mocked(saveScheduleDraft);
    saveMock.mockRejectedValueOnce(
      new ScheduleRequestError("session revision stale", 409, { error: "session revision stale", code: "edit_session_stale" }),
    );

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.change(screen.getByLabelText("Draft name"), {
      target: { value: "Moved on elsewhere" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert.textContent).toContain(
      "This schedule changed in another tab or window. Reload the page, then make the change again.",
    ));
    expect(within(alert).getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Schedule save failed" })).toBeNull();
    expect(screen.queryByText(/session revision stale/i)).toBeNull();
    // The edit is not ended here: the reload picks it back up (D-Y4).
    expect(window.location.search).toContain("mode=edit");
  });

  // BL-1052: the first save lost the network, and by the time of Retry another tab
  // moved the edit on; the retry sheet closes so the banner's Reload is in reach.
  it("closes the retry sheet when Retry finds the edit moved on in another tab", async () => {
    const saveMock = vi.mocked(saveScheduleDraft);
    saveMock.mockRejectedValueOnce(new Error("Network dropped"));
    saveMock.mockRejectedValueOnce(
      new ScheduleRequestError("session revision stale", 409, { error: "session revision stale", code: "edit_session_stale" }),
    );

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.change(screen.getByLabelText("Draft name"), {
      target: { value: "Retried after another tab" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));
    expect(await screen.findByRole("dialog", { name: "Schedule save failed" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Schedule save failed" })).toBeNull(),
    );
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert.textContent).toContain(
      "This schedule changed in another tab or window. Reload the page, then make the change again.",
    ));
    expect(within(alert).getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(screen.queryByText(/session revision stale/i)).toBeNull();
  });

  it("picks the edit back up after a page reload instead of showing an empty draft (D-Y4)", async () => {
    const draftId = "99999999-9999-4999-8999-999999999993";
    const acquired = makeDefaultEditAcquireResult();
    vi.mocked(acquireScheduleEditSession).mockResolvedValue({
      status: "resumed",
      session: { ...acquired.session, source_kind: "draft", source_draft_id: draftId },
    });

    window.history.pushState({}, "", `/app/schedule?date=2026-08-26&mode=edit&draft=${draftId}`);
    render(<App />);
    await signInAs("owner");

    await waitFor(() =>
      expect(acquireScheduleEditSession).toHaveBeenCalledWith(
        // A reload picks the edit back up (resume).
        scheduleFixture.workspace_id, scheduleFixture.week_start, "draft", draftId, null, true,
      ),
    );
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();
    expect(window.location.search).toContain(`draft=${draftId}`);
    expect(acquireScheduleEditSession).toHaveBeenCalledTimes(1);
  });

  // KK-164: another week opens in view mode; the edit stays open in its own week.
  it("opens another week in view mode while editing and picks the edit back up on return (KK-164)", async () => {
    vi.mocked(discardScheduleEditSession).mockClear();
    vi.mocked(getScheduleReadModel).mockImplementation(async (_workspace, date) =>
      scheduleFixtureForWeek(date >= "2026-08-24" ? "2026-08-24" : "2026-08-17"),
    );
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("date")).toBe("2026-08-24"));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("mode")).not.toBe("edit"));
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Previous week" }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("mode")).toBe("edit"));
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();
    expect(acquireScheduleEditSession).toHaveBeenCalledTimes(1);
    expect(discardScheduleEditSession).not.toHaveBeenCalled();
  }, 20000);

  // Mert 2026-10-12: leaving Schedule with unsaved edit work asks first.
  describe("leaving an edit for another page", () => {
    const dirtyEdit = () => {
      const acquired = makeDefaultEditAcquireResult();
      return { ...acquired, session: { ...acquired.session, dirty: true } };
    };
    const lazyRoute = { timeout: 15000 };

    it("asks before the sidebar leaves; Keep editing stays, Discard and leave closes the edit and goes", async () => {
      vi.mocked(discardScheduleEditSession).mockClear();
      vi.mocked(acquireScheduleEditSession).mockResolvedValue(dirtyEdit());
      window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
      render(<App />);
      await signInAs("owner");
      await openPublishedScheduleEditor();
      expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

      fireEvent.click(sidebar().getByRole("link", { name: "Employees" }));
      const question = await screen.findByRole("alertdialog", { name: "Save changes before leaving?" });
      expect(window.location.pathname).toBe("/app/schedule");
      fireEvent.click(within(question).getByRole("button", { name: "Keep editing" }));
      expect(screen.queryByRole("alertdialog", { name: "Save changes before leaving?" })).toBeNull();
      expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
      expect(discardScheduleEditSession).not.toHaveBeenCalled();

      fireEvent.click(sidebar().getByRole("link", { name: "Employees" }));
      fireEvent.click(within(
        await screen.findByRole("alertdialog", { name: "Save changes before leaving?" }),
      ).getByRole("button", { name: "Discard and leave" }));
      expect(await screen.findByRole("heading", { name: "Employees" }, lazyRoute)).toBeTruthy();
      expect(discardScheduleEditSession).toHaveBeenCalledWith(
        scheduleFixture.workspace_id, dirtyEdit().session.id,
      );
    }, 30000);

    it("saves the work as a draft, then opens the chosen page", async () => {
      const savedDraft = {
        id: "99999999-9999-4999-8999-999999999981",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        name: "Before leaving",
        revision: 1,
        created_by: "88888888-8888-4888-8888-888888888888",
        updated_by: "88888888-8888-4888-8888-888888888888",
        created_at: "2026-08-17T12:00:00Z",
        updated_at: "2026-08-17T12:09:00Z",
      };
      vi.mocked(saveScheduleDraft).mockResolvedValueOnce(savedDraft);
      vi.mocked(acquireScheduleEditSession).mockResolvedValue(dirtyEdit());
      window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
      render(<App />);
      await signInAs("owner");
      await openPublishedScheduleEditor();
      expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

      fireEvent.click(sidebar().getByRole("link", { name: "Employees" }));
      fireEvent.click(within(
        await screen.findByRole("alertdialog", { name: "Save changes before leaving?" }),
      ).getByRole("button", { name: "Save draft" }));
      const saveWindow = screen.getByRole("dialog", { name: "Save draft" });
      expect(window.location.pathname).toBe("/app/schedule");
      fireEvent.change(within(saveWindow).getByLabelText("Draft name"), { target: { value: savedDraft.name } });
      fireEvent.click(within(saveWindow).getByRole("button", { name: "Save draft" }));

      expect(await screen.findByRole("heading", { name: "Employees" }, lazyRoute)).toBeTruthy();
      expect(saveScheduleDraft).toHaveBeenCalledTimes(1);
    }, 30000);

    it("lets go of an edit with nothing unsaved without asking", async () => {
      vi.mocked(discardScheduleEditSession).mockClear();
      vi.mocked(autosaveScheduleEditSession).mockClear();
      window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
      render(<App />);
      await signInAs("owner");
      await openPublishedScheduleEditor();
      expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

      fireEvent.click(sidebar().getByRole("link", { name: "Employees" }));
      expect(await screen.findByRole("heading", { name: "Employees" }, lazyRoute)).toBeTruthy();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      // Its lock no longer keeps the week from other managers; work in another
      // tab of the same edit, if any, is kept, never thrown away.
      await waitFor(() => expect(autosaveScheduleEditSession).toHaveBeenCalledWith(
        scheduleFixture.workspace_id, makeDefaultEditAcquireResult().session.id,
      ));
      expect(discardScheduleEditSession).not.toHaveBeenCalled();
    }, 30000);
  });

  it("leaves edit mode for good on Discard; the reload resume does not take the lock again", async () => {
    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));

    await waitFor(() => expect(window.location.search).toContain("mode=preview"));
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 50)); });
    expect(acquireScheduleEditSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
  });

  it("says the edit could not be reconnected, never the raw lock text, when the lock lapses twice", async () => {
    const saveMock = vi.mocked(saveScheduleDraft);
    const lapsed = () => new ScheduleRequestError("edit lease expired", 409, { error: "edit lease expired", code: "edit_lease_expired" });
    saveMock.mockRejectedValueOnce(lapsed());
    saveMock.mockRejectedValueOnce(lapsed());

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(), status: "resumed",
    });
    fireEvent.click(await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }));
    fireEvent.change(screen.getByLabelText("Draft name"), { target: { value: "Twice lapsed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));

    expect(await screen.findByRole("dialog", { name: "Schedule save failed" })).toBeTruthy();
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/edit lease expired/i)).toBeNull();
    // BL-395: what the person reads instead is the reconnect sentence, not a generic one.
    expect(screen.getAllByText("Your edit could not be reconnected. Check your connection and try again.").length).toBeGreaterThan(0);
  });

  it("confirms backend draft name conflicts before overwriting the owned draft", async () => {
    const conflictingDraft = {
      id: "99999999-9999-4999-8999-999999999997",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Older shared copy",
      revision: 7,
      created_by: "77777777-7777-4777-8777-777777777777",
      updated_by: "77777777-7777-4777-8777-777777777777",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const savedDraft = {
      ...conflictingDraft,
      name: "Shared schedule",
      revision: 8,
      updated_by: "88888888-8888-4888-8888-888888888888",
      updated_at: "2026-08-17T12:05:00Z",
    };
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([conflictingDraft]));
    const confirmSpy = vi.spyOn(window, "confirm");
    const saveMock = vi.mocked(saveScheduleDraft);
    saveMock.mockRejectedValueOnce(
      new ScheduleRequestError("Name owned by another manager", 409, {
        status: "name_owned_by_other",
        draft_id: conflictingDraft.id,
        owner_name: "Sam Manager",
      }),
    );
    saveMock.mockResolvedValueOnce(savedDraft);

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.change(screen.getByLabelText("Draft name"), {
      target: { value: "Shared schedule" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));

    const overwrite = await screen.findByRole("alertdialog", {
      name: 'Overwrite "Shared schedule"?',
    });
    expect(overwrite.textContent).toContain(
      "This draft belongs to Sam Manager.",
    );
    fireEvent.click(within(overwrite).getByRole("button", { name: "Overwrite" }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(saveMock.mock.calls[1]?.[3]).toEqual(expect.objectContaining(conflictingDraft));
    expect(
      screen.queryByRole("dialog", { name: "Schedule save failed" }),
    ).toBeNull();
    expect(screen.queryByText("Editing draft")).toBeNull();
    confirmSpy.mockRestore();
  });

  it("keeps editing and retries when a draft save returns stale baseline", async () => {
    const savedDraft = {
      id: "99999999-9999-4999-8999-999999999996",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Schedule vrs.0.1",
      revision: 2,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:05:00Z",
    };
    const saveMock = vi.mocked(saveScheduleDraft);
    saveMock.mockRejectedValueOnce(
      new ScheduleRequestError("stale_baseline", 409, {
        status: "stale_baseline",
      }),
    );
    // The retry answers late, as it does on a loaded machine (BL-175).
    saveMock.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(savedDraft), 300)),
    );

    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: /^(?:Save draft|Publish)$/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save As" }));

    expect(
      await screen.findByRole("dialog", { name: "Schedule save failed" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "The schedule changed while this draft was being saved. Keep editing, review the latest changes, then retry.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Schedule save failed" }),
      ).toBeNull(),
    );
    expect(screen.queryByText("Editing draft")).toBeNull();
  });

  it("sorts schedule employees alphabetically and by job from Settings", async () => {
    const hostJob = {
      ...scheduleFixture.jobs[0]!,
      id: "33333333-3333-4333-8333-333333333334",
      name: "Host",
      sort_order: 0,
    };
    const serverJob = {
      ...scheduleFixture.jobs[0]!,
      name: "Server",
      sort_order: 1,
    };
    const invalidShiftType = {
      ...scheduleFixture.shift_types[0]!,
      id: "44444444-4444-4444-8444-444444444445",
      name: "Invalid",
      sort_order: 1,
      default_start_time: "09:00",
      default_end_time: "09:00",
    };
    const clockOffShiftType = {
      ...scheduleFixture.shift_types[0]!,
      id: "44444444-4444-4444-8444-444444444447",
      name: "Clock off",
      color: "#0F766E",
      sort_order: 2,
      default_start_time: null,
      default_end_time: null,
    };
    const sortedFixture = {
      ...scheduleFixture,
      jobs: [hostJob, serverJob],
      shift_types: [
        ...scheduleFixture.shift_types,
        invalidShiftType,
        clockOffShiftType,
      ],
      employees: [
        {
          ...scheduleFixture.employees[0]!,
          id: "55555555-5555-4555-8555-555555555557",
          employee_code: "NF-009",
          display_name: "Aaron Primary Server",
          job_ids: [hostJob.id, serverJob.id],
          primary_job_id: serverJob.id,
        },
        {
          ...scheduleFixture.employees[0]!,
          id: "55555555-5555-4555-8555-555555555558",
          employee_code: "NF-010",
          display_name: "Alice Server",
          job_ids: [serverJob.id],
          primary_job_id: serverJob.id,
        },
        {
          ...scheduleFixture.employees[0]!,
          id: "55555555-5555-4555-8555-555555555559",
          employee_code: "NF-011",
          display_name: "Zoe Host",
          job_ids: [hostJob.id],
          primary_job_id: hostJob.id,
        },
        {
          ...scheduleFixture.employees[0]!,
          id: "55555555-5555-4555-8555-555555555560",
          employee_code: "NF-012",
          display_name: "Morgan No Primary",
          job_ids: [hostJob.id],
          primary_job_id: null,
        },
      ],
      shifts: [],
    } satisfies ScheduleReadModel;
    vi.mocked(getScheduleReadModel).mockImplementation(
      async (_workspaceId, date) =>
        date === "2026-09-04" ? sortedFixture : scheduleFixture,
    );
    testAuth.role = "owner";
    window.localStorage.setItem(
      "organizer-schedule-ui",
      JSON.stringify({
        state: {
          showPresetShiftBadges: false,
          showRoleSeparators: false,
        },
      }),
    );
    window.history.pushState({}, "", "/app/schedule?date=2026-09-04");
    const { container } = render(<App />);
    const app = within(container);
    await app.findByRole("heading", { name: "Schedule" }, { timeout: 5000 });

    const employeeOrder = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          ".schedule-employee-cell strong",
        ),
      ).map((item) => item.textContent);
    const employeeFilterOrder = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          '[data-topbar-filter-content="employees"] .schedule-topbar-filter-label',
        ),
      )
        .map((item) => item.textContent)
        .filter((label) => label !== "All employees");
    const openEmployeeFilter = () => {
      const trigger = container.querySelector<HTMLElement>(
        '[data-filter-id="employees"] summary',
      );
      expect(trigger).toBeTruthy();
      fireEvent.click(trigger!);
    };

    expect(employeeOrder()).toEqual([
      "Aaron Primary Server",
      "Alice Server",
      "Morgan No Primary",
      "Zoe Host",
    ]);
    expect(app.queryByRole("button", { name: "Dinner-Host" })).toBeNull();

    fireEvent.click(app.getByRole("button", { name: /Settings/ }));
    expect(
      app.getByRole("button", { name: "Show Preset badges" }).getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      app.getByRole("button", { name: "Show Role Separators" }).getAttribute("aria-disabled"),
    ).toBe("true");
    fireEvent.click(app.getByRole("menuitemradio", { name: "Job/Position" }));
    expect(
      app.getByRole("button", { name: "Hide Preset badges" }).getAttribute("aria-disabled"),
    ).toBe(null);
    expect(
      app.getByRole("button", { name: "Hide Role Separators" }).getAttribute("aria-disabled"),
    ).toBe(null);

    expect(employeeOrder()).toEqual([
      "Morgan No Primary",
      "Zoe Host",
      "Aaron Primary Server",
      "Alice Server",
    ]);
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(
          ".schedule-preset-row-label strong, .schedule-employee-cell strong",
        ),
      ).map((item) => item.textContent),
    ).toEqual([
      "Host",
      "Morgan No Primary",
      "Zoe Host",
      "Server",
      "Aaron Primary Server",
      "Alice Server",
    ]);
    openEmployeeFilter();
    expect(employeeFilterOrder()).toEqual([
      "Morgan No Primary",
      "Zoe Host",
      "Aaron Primary Server",
      "Alice Server",
    ]);
    expect(
      JSON.parse(window.localStorage.getItem("organizer-schedule-ui")!).state
        .employeeSortMode,
    ).toBe("byJob");
    fireEvent.click(app.getByRole("button", { name: /Settings/ }));
    fireEvent.click(app.getByRole("button", { name: "Hide Role Separators" }));
    expect(
      JSON.parse(window.localStorage.getItem("organizer-schedule-ui")!).state
        .showRoleSeparators,
    ).toBe(false);
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(
          ".schedule-preset-row-label strong, .schedule-employee-cell strong",
        ),
      ).map((item) => item.textContent),
    ).toEqual([
      "Morgan No Primary",
      "Zoe Host",
      "Aaron Primary Server",
      "Alice Server",
    ]);
    fireEvent.click(app.getByRole("button", { name: "Show Role Separators" }));
    expect(
      JSON.parse(window.localStorage.getItem("organizer-schedule-ui")!).state
        .showRoleSeparators,
    ).toBe(true);
    // PRESET-SAAT (S-183): a preset always writes its picked time, shown on
    // the card, so the switch that hid it is gone.
    expect(
      app.queryByRole("button", { name: "Use default times for scheduling" }),
    ).toBeNull();
    fireEvent.click(app.getByRole("menuitemradio", { name: "A-Z" }));
    expect(employeeOrder()).toEqual([
      "Aaron Primary Server",
      "Alice Server",
      "Morgan No Primary",
      "Zoe Host",
    ]);
    openEmployeeFilter();
    expect(employeeFilterOrder()).toEqual([
      "Aaron Primary Server",
      "Alice Server",
      "Morgan No Primary",
      "Zoe Host",
    ]);
    fireEvent.click(app.getByRole("button", { name: /Settings/ }));
    fireEvent.click(app.getByRole("menuitemradio", { name: "Job/Position" }));
    expect(app.queryByRole("button", { name: "Dinner-Host" })).toBeNull();
    await openPublishedScheduleEditor(app);
    expect(await app.findByRole("button", { name: "Discard" })).toBeTruthy();
    expect(app.getAllByRole("button", { name: "Dinner-Host" })).toHaveLength(1);
    const hostPreset = app.getByRole("button", { name: "Dinner-Host" });
    expect(hostPreset.getAttribute("data-schedule-preset-chip")).toBe("true");
    expect(hostPreset.getAttribute("data-job-id")).toBe(hostJob.id);
    expect(hostPreset.getAttribute("data-shift-type-id")).toBe(
      scheduleFixture.shift_types[0]!.id,
    );
    expect(
      hostPreset.style.getPropertyValue("--schedule-preset-chip-border"),
    ).toBe(scheduleFixture.shift_types[0]!.color);
    expect(hostPreset.getAttribute("data-preset-has-default-times")).toBe(
      "true",
    );
    expect(hostPreset.getAttribute("data-preset-clock-off")).toBe("false");
    expect(hostPreset.getAttribute("style")).toContain(
      "background-color: color-mix",
    );
    expect(
      hostPreset
        .closest<HTMLElement>("[data-schedule-preset-cell='true']")
        ?.getAttribute("data-schedule-employee-group-boundary"),
    ).toBe(hostJob.id);
    expect(
      hostPreset
        .closest<HTMLElement>("[data-schedule-preset-cell='true']")
        ?.getAttribute("data-location-boundary"),
    ).toBeNull();
    const invalidPreset = app.getByRole("button", { name: "Invalid-Host" });
    expect(invalidPreset.getAttribute("data-preset-has-default-times")).toBe(
      "true",
    );
    expect(invalidPreset.getAttribute("data-preset-clock-off")).toBe("false");
    const clockOffPreset = app.getByRole("button", { name: "Clock off-Host" });
    expect(clockOffPreset.getAttribute("data-preset-has-default-times")).toBe(
      "false",
    );
    expect(clockOffPreset.getAttribute("data-preset-clock-off")).toBe("true");
    const presetDropTarget = container.querySelector<HTMLElement>(
      `[data-drop-cell='true'][data-employee-id='55555555-5555-4555-8555-555555555559'][data-date='2026-08-18']`,
    );
    expect(presetDropTarget).toBeTruthy();
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => presetDropTarget,
    });
    fireEvent.mouseDown(hostPreset, {
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 20,
    });
    fireEvent.mouseMove(window, {
      buttons: 1,
      clientX: 96,
      clientY: 96,
    });
    await waitFor(() => {
      expect(
        container.querySelector("[data-shift-type-preset-drag-preview='true']"),
      ).toBeTruthy();
      // Allowed, but flagged: the fixture has no weekly availability
      // evidence for the assigned target.
      expect(presetDropTarget?.getAttribute("data-drop-status")).toBe(
        "warning",
      );
    });
    fireEvent.pointerCancel(window);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint,
    });
    await waitFor(() => {
      expect(
        container.querySelector("[data-shift-type-preset-drag-preview='true']"),
      ).toBeNull();
    });
    const createMock = vi.mocked(createScheduleShift);
    createMock.mockClear();
    createMock.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      source_kind: "published",
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      location_ids: ["11111111-1111-4111-8111-111111111111"],
      holder_name: "Development Owner",
      revision: 2,
      dirty: true,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: [],
    });
    const clickableHostPreset = app.getByRole("button", {
      name: "Dinner-Host",
    });
    fireEvent.pointerDown(clickableHostPreset);
    await waitFor(() => {
      expect(
        container.querySelector(".schedule-topbar-dismiss-layer"),
      ).toBeNull();
    });
    fireEvent.click(app.getByRole("button", { name: "Dinner-Host" }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        employee_id: null,
        job_id: hostJob.id,
        shift_type_id: scheduleFixture.shift_types[0]!.id,
        scheduled_date: "2026-08-17",
        start_time: "16:00",
        end_time: "22:00",
        unpaid_break_minutes: 30,
        // PRESET-SAAT (S-183): a preset's time shows on its card.
        hide_time_on_badge: false,
        time_basis: "type_default",
      }),
    );
    expect(app.queryByRole("dialog", { name: "Add shift" })).toBeNull();

    createMock.mockClear();
    fireEvent.click(app.getByRole("button", { name: "Clock off-Host" }));
    expect(createMock).not.toHaveBeenCalled();
    const clockOffDialog = await app.findByRole("dialog", {
      name: "Add shift",
    });
    expect(clockOffDialog).toBeTruthy();
    expect(
      within(clockOffDialog)
        .getByRole("button", { name: "Clock off" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(
      within(clockOffDialog).getByRole("button", { name: "Cancel" }),
    );

    fireEvent.click(app.getAllByRole("button", { name: "Invalid-Host" })[0]!);
    // The toast lives in its own layer under <body>, outside the app container (BL-515).
    expect(await screen.findByText("Preset shift is unavailable")).toBeTruthy();
    expect(
      screen.getByText(/^Start and end time cannot be the same\./),
    ).toBeTruthy();
    expect(
      screen.getByText(/Invalid-Host \/ Open shift \/ Main Dining \/ 2026-08-18/),
    ).toBeTruthy();
    expect(app.queryByRole("dialog", { name: "Add shift" })).toBeNull();
    const gridLabels = Array.from(
      container.querySelectorAll<HTMLElement>(
        ".schedule-preset-row-label strong, .schedule-employee-cell strong",
      ),
    ).map((item) => item.textContent);
    expect(gridLabels).toEqual([
      "Unassigned",
      "Host",
      "Morgan No Primary",
      "Zoe Host",
      "Server",
      "Aaron Primary Server",
      "Alice Server",
    ]);
  }, 30000);

  it("hides excluded schedule employees unless they have a shift in the visible week", async () => {
    const coveredExcludedEmployee = {
      ...scheduleFixture.employees[0]!,
      id: "55555555-5555-4555-8555-555555555561",
      employee_code: "NF-013",
      display_name: "Covered Excluded",
      is_excluded_from_schedule: true,
    };
    const emptyExcludedEmployee = {
      ...scheduleFixture.employees[0]!,
      id: "55555555-5555-4555-8555-555555555562",
      employee_code: "NF-014",
      display_name: "Empty Excluded",
      is_excluded_from_schedule: true,
    };
    const excludedFixture = {
      ...scheduleFixture,
      employees: [
        ...scheduleFixture.employees,
        coveredExcludedEmployee,
        emptyExcludedEmployee,
      ],
      shifts: [
        ...scheduleFixture.shifts,
        {
          ...scheduleFixture.shifts[0]!,
          id: "66666666-6666-4666-8666-666666666667",
          employee_id: coveredExcludedEmployee.id,
          scheduled_date: "2026-08-19",
        },
      ],
    } satisfies ScheduleReadModel;
    vi.mocked(getScheduleReadModel).mockImplementation(
      async (_workspaceId, date) =>
        date === "2026-09-05" ? excludedFixture : scheduleFixture,
    );

    window.history.pushState({}, "", "/app/schedule?date=2026-09-05");
    const { container } = render(<App />);
    const app = within(container);
    await signInAs("owner", app);
    await app.findByRole("heading", { name: "Schedule" }, { timeout: 5000 });

    const employeeOrder = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          ".schedule-employee-cell strong",
        ),
      ).map((item) => item.textContent);

    expect(employeeOrder()).toContain("Alex Rivera");
    expect(employeeOrder()).toContain("Covered Excluded");
    expect(employeeOrder()).not.toContain("Empty Excluded");
    vi.mocked(getScheduleReadModel).mockResolvedValue(scheduleFixture);
  });

  it("sizes schedule day columns from intrinsic shift and preset badge width", async () => {
    const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollWidth",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return this instanceof HTMLElement &&
          this.getAttribute("data-schedule-badge-width-measure") === "true"
          ? 190
          : 0;
      },
    });
    try {
      window.history.pushState({}, "", "/app/schedule?date=2026-08-24");
      render(<App />);
      await signInAs("owner");

      const grid = await screen.findByRole("grid", {
        name: "Weekly published schedule",
      });
      await waitFor(() =>
        expect(grid.style.getPropertyValue("--schedule-day-column-min")).toBe(
          "193px",
        ),
      );
    } finally {
      if (scrollWidthDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollWidth",
          scrollWidthDescriptor,
        );
      } else {
        delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
      }
    }
  });

  it("blocks preset shift badges when the location's short hours leave out the preset's hours", async () => {
    const partialClosedFixture = {
      ...scheduleFixture,
      settings: {
        ...scheduleFixture.settings,
        conflict_rules: {
          ...scheduleFixture.settings.conflict_rules!,
          closed_location: "block",
        },
      },
      week_start: "2026-08-17",
      shifts: [],
      closures: [
        {
          id: "aaaaaaaa-0000-4000-8000-000000000001",
          location_id: scheduleFixture.locations[0]!.id,
          closed_date: "2026-08-17",
          title: "Inventory day",
          is_all_day: false,
          kind: "short",
          opens: "10:00",
          closes: "15:00",
        },
      ],
    } satisfies ScheduleReadModel;
    vi.mocked(getScheduleReadModel).mockResolvedValue(partialClosedFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        shifts: [],
      },
    });
    vi.mocked(createScheduleShift).mockClear();
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    testAuth.role = "owner";
    const { container } = render(<App />);
    const app = within(container);
    await app.findByRole("heading", { name: "Schedule" }, { timeout: 5000 });
    fireEvent.click(app.getByRole("button", { name: /Settings/ }));
    fireEvent.click(app.getByRole("menuitemradio", { name: "Job/Position" }));
    fireEvent.pointerDown(document.body);
    await openPublishedScheduleEditor(app);

    const blockedPreset = await app.findByRole("button", {
      name: "Dinner-Server",
    });
    fireEvent.pointerDown(blockedPreset, { clientX: 18, clientY: 18 });
    fireEvent.pointerUp(blockedPreset, { clientX: 18, clientY: 18 });
    fireEvent.click(blockedPreset, { clientX: 18, clientY: 18 });

    // The toast lives in its own layer under <body>, outside the app container (BL-515).
    expect(await screen.findByText("Preset shift is unavailable")).toBeTruthy();
    expect(
      screen.getByText(/Location has short hours for Inventory day: open 10a–3p only\./),
    ).toBeTruthy();
    expect(createScheduleShift).not.toHaveBeenCalled();
    expect(app.queryByRole("dialog", { name: "Add shift" })).toBeNull();
  });

  it("shows location context inside shift badges in unified schedule layout", async () => {
    window.history.pushState(
      {},
      "",
      "/app/schedule?date=2026-08-24&layout=unified",
    );
    const { container } = render(<App />);
    await signInAs("owner");

    expect(
      await screen.findByRole("grid", { name: "Weekly published schedule" }),
    ).toBeTruthy();
    const badge = container.querySelector<HTMLElement>(".schedule-shift-badge");
    expect(badge).toBeTruthy();
    expect(
      badge?.querySelector("[data-shift-badge-content='true']"),
    ).toBeTruthy();
    expect(
      badge?.querySelector("[data-shift-badge-location='true']")?.textContent,
    ).toBe("Main Dining");
  });

  it("uses reference-style day header clicks to step into daily location filters", async () => {
    const patioLocation = {
      ...scheduleFixture.locations[0]!,
      id: "77777777-7777-4777-8777-777777777777",
      name: "Patio",
      publication_status: "unpublished" as const,
      published_at: null,
      sort_order: 1,
    };
    vi.mocked(getScheduleReadModel).mockResolvedValue({
      ...scheduleFixture,
      locations: [...scheduleFixture.locations, patioLocation],
      employees: scheduleFixture.employees.map((employee) => ({
        ...employee,
        location_ids: [...employee.location_ids, patioLocation.id],
      })),
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    const { container } = render(<App />);
    const app = within(container);
    await signInAs("owner", app);
    await app.findByRole("heading", { name: "Schedule" }, { timeout: 5000 });

    fireEvent.click(
      await app.findByRole("columnheader", {
        name: "View Tue Aug 18, Patio",
      }),
    );
    await waitFor(() => {
      expect(window.location.search).toContain("view=day");
      expect(window.location.search).toContain("date=2026-08-18");
      expect(window.location.search).toContain(`locations=${patioLocation.id}`);
    });
  });

  it("marks the draft a week was published from in the New Schedule menu", async () => {
    const draft = (id: string, name: string) => ({
      id,
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name,
      revision: 1,
      created_by: "77777777-7777-4777-8777-777777777777",
      updated_by: "77777777-7777-4777-8777-777777777777",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    });
    const live = draft("99999999-9999-4999-8999-999999999981", "Week plan v1");
    const other = draft("99999999-9999-4999-8999-999999999982", "Week plan v2");
    vi.mocked(listScheduleDrafts).mockResolvedValue({
      ...draftList([live, other]),
      published: { shift_count: 12, paid_minutes: 5040, open_shift_count: 0 },
    });
    const status = await vi.mocked(fetchSchedulePublicationStatus)(
      scheduleFixture.workspace_id,
      scheduleFixture.week_start,
    );
    vi.mocked(fetchSchedulePublicationStatus).mockResolvedValue({
      ...status,
      locations: status.locations.map((location) => ({
        ...location,
        source_draft_id: live.id,
        source_draft_name: live.name,
      })),
    });
    window.history.pushState({}, "", "/app/schedule");
    render(<App />);
    await signInAs("owner");
    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "Draft selector: New Schedule" },
        { timeout: 5000 },
      ),
    );

    // The live schedule is the first row, named after its draft; the other drafts follow.
    const menu = await screen.findByRole("dialog", { name: /^Schedules for / });
    await waitFor(() =>
      expect(
        Array.from(menu.querySelectorAll("li .new-schedule-window-open b")).map((name) => name.textContent),
      ).toEqual(["Week plan v1", "Week plan v2"]),
    );
    const liveRow = menu.querySelector("[data-published-draft-row]");
    expect(liveRow?.querySelector("b")?.textContent).toBe("Week plan v1");
    expect(liveRow?.textContent).toContain("Live");
    // The live week's facts survive the window's own refresh of the drafts list (S18).
    await waitFor(() => expect(liveRow?.textContent).toContain("12 shifts"));
    expect(liveRow?.textContent).toContain("84 h");
    // A live schedule is unpublished, never deleted as a draft.
    expect(within(menu).queryByRole("button", { name: "Delete Week plan v1" })).toBeNull();
    expect(menu.querySelectorAll("[data-draft-row]")).toHaveLength(1);
  });

  it("says who is editing a draft somebody else has open", async () => {
    const acquireMock = vi.mocked(acquireScheduleEditSession);
    const kitchenPlan = {
      id: "99999999-9999-4999-8999-999999999995",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Kitchen plan",
      revision: 3,
      created_by: "77777777-7777-4777-8777-777777777777",
      updated_by: "77777777-7777-4777-8777-777777777777",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([kitchenPlan]));
    acquireMock.mockResolvedValueOnce({
      status: "conflict",
      session_id: "77777777-7777-4777-8777-777777777777",
      holder_name: "Morgan Lee",
      last_heartbeat: new Date().toISOString(),
      expires_at: "2026-08-17T12:04:00Z",
    });
    window.history.pushState({}, "", "/app/schedule");
    render(<App />);
    await signInAs("owner");
    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "Draft selector: New Schedule" },
        { timeout: 5000 },
      ),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit Kitchen plan" }),
    );

    await waitFor(() =>
      expect(acquireMock).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        scheduleFixture.week_start,
        "draft",
        kitchenPlan.id,
        null,
        // A new edit from the menu never brings back one that was left.
        false,
      ),
    );
    expect(
      await screen.findByRole("dialog", { name: "Draft is being edited" }),
    ).toBeTruthy();
    expect(screen.getByText(/Morgan Lee is editing "Kitchen plan"/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "View schedule" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Take over" })).toBeNull();
    acquireMock.mockResolvedValueOnce(makeDefaultEditAcquireResult());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(acquireMock).toHaveBeenCalledTimes(2));
    expect(acquireMock.mock.calls[1]?.[3]).toBe(kitchenPlan.id);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Draft is being edited" }),
      ).toBeNull(),
    );
  });

  // BL-055: the grid's shift cards follow the person's own 12h/24h choice too.
  it("shows shift times on the grid in the person's own 24-hour format in a 12-hour workspace", async () => {
    testAuth.timeFormat = "24h";
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    const { container } = render(<App />);
    await signInAs("owner");
    const badge = await waitFor(() => {
      const found = container.querySelector<HTMLElement>(".schedule-shift-badge");
      expect(found).toBeTruthy();
      return found!;
    });
    expect(badge.textContent).toContain("16:00");
    expect(badge.textContent).not.toContain("PM");
  });

  // BL-055: the shift editor's times follow the person's own 12h/24h choice
  // (Account → Preferences), not only the workspace's Schedule setting.
  it("types shift times in the person's own 24-hour format in a 12-hour workspace", async () => {
    testAuth.timeFormat = "24h";
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    const { container } = render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    const shiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(".schedule-shift-badge");
      expect(badge?.getAttribute("draggable")).toBeNull();
      return badge;
    });
    fireEvent.doubleClick(shiftBadge!);
    expect(await screen.findByRole("dialog", { name: "Edit shift" })).toBeTruthy();

    expect(screen.getByRole("textbox", { name: "Start time" })).toHaveProperty("value", "16:00");
    expect(screen.getByRole("textbox", { name: "End time" })).toHaveProperty("value", "22:30");
  });

  it("opens reference-style schedule context menus while editing", async () => {
    const deleteMock = vi.mocked(deleteScheduleShift);
    const createMock = vi.mocked(createScheduleShift);
    createMock.mockClear();
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777777",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        location_ids: ["11111111-1111-4111-8111-111111111111"],
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: scheduleFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    deleteMock.mockClear();
    deleteMock.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      source_kind: "published",
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      location_ids: ["11111111-1111-4111-8111-111111111111"],
      holder_name: "Development Owner",
      revision: 2,
      dirty: true,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: [],
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07");
    const { container } = render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    const shiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      expect(badge?.getAttribute("draggable")).toBeNull();
      return badge;
    });
    expect(shiftBadge).toBeTruthy();
    const closeShiftDrawer = async (
      name: "Add shift" | "Edit shift" | "Paste shift",
    ) => {
      fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
      const discardConfirm = screen.queryByRole("alertdialog", {
        name: "Discard unsaved shift changes?",
      });
      if (discardConfirm) {
        fireEvent.click(
          within(discardConfirm).getByRole("button", { name: "Discard" }),
        );
      }
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name })).toBeNull(),
      );
    };
    fireEvent.doubleClick(shiftBadge!);
    expect(
      await screen.findByRole("dialog", { name: "Edit shift" }),
    ).toBeTruthy();
    const startTimeInput = screen.getByRole("textbox", { name: "Start time" });
    fireEvent.change(startTimeInput, { target: { value: "630p" } });
    fireEvent.blur(startTimeInput);
    expect(startTimeInput).toHaveProperty("value", "06:30 PM");
    fireEvent.keyDown(startTimeInput, { key: "a" });
    expect(startTimeInput).toHaveProperty("value", "06:30 AM");
    fireEvent.keyDown(startTimeInput, { key: "p" });
    expect(startTimeInput).toHaveProperty("value", "06:30 PM");
    const endTimeInput = screen.getByRole("textbox", { name: "End time" });
    fireEvent.change(endTimeInput, { target: { value: "630p" } });
    fireEvent.blur(endTimeInput);
    expect(
      await screen.findByText("Start and end time cannot be the same."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.change(endTimeInput, { target: { value: "730p" } });
    fireEvent.blur(endTimeInput);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save" }),
      ).toHaveProperty("disabled", false),
    );
    expect(screen.getByRole("group", { name: "Unpaid break" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "30m" }).getAttribute("aria-pressed"),
    ).toBe("true");
    const actionButtons = within(
      screen.getByRole("dialog", { name: "Edit shift" }),
    )
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent);
    expect(actionButtons).toEqual([
      "Close editor",
      "Dinner",
      "None",
      "15m",
      "30m",
      "45m",
      "60m",
      "Delete shift",
      "Cancel",
      "Save",
    ]);
    await closeShiftDrawer("Edit shift");

    fireEvent.contextMenu(shiftBadge!, {
      clientX: 36,
      clientY: 48,
    });
    expect(screen.getByRole("menu", { name: "Shift actions" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy shift" }));
    expect(await screen.findByText("Shift copied")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Paste mode on" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("status", { name: "Paste status" })).toHaveProperty(
      "textContent",
      "Paste mode on",
    );

    const pasteCell = container.querySelector<HTMLElement>(
      `[data-drop-cell="true"][data-employee-id="${scheduleFixture.employees[0]!.id}"][data-location-id="${scheduleFixture.locations[0]!.id}"][data-date="${scheduleFixture.week_start}"]`,
    );
    expect(pasteCell).toBeTruthy();
    fireEvent.click(pasteCell!, { clientX: 58, clientY: 76 });
    expect(
      await screen.findByRole("dialog", { name: "Shift conflict" }),
    ).toBeTruthy();
    expect(screen.getAllByText(/Alex Rivera already has Dinner/)).toHaveLength(2);
    // Informational conflict sheets keep only the reason visible.
    expect(
      screen.queryByText(
        "This paste was not applied. Review the reason before scheduling the shift.",
      ),
    ).toBeNull();
    expect(screen.getByRole("status", { name: "Paste status" })).toHaveProperty(
      "textContent",
      "Alex Rivera already has Dinner 16:00-22:30 at Main Dining on 2026-08-17. Requested: Dinner / Server at Main Dining.",
    );
    expect(screen.queryByRole("dialog", { name: "Paste shift" })).toBeNull();
    expect(createMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ scheduled_date: "2026-08-17" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    const unassignedPasteCell = container.querySelector<HTMLElement>(
      `[data-unassigned-cell="true"][data-location-id="${scheduleFixture.locations[0]!.id}"][data-date="${scheduleFixture.week_start}"]`,
    );
    expect(unassignedPasteCell).toBeTruthy();
    fireEvent.click(unassignedPasteCell!, { clientX: 88, clientY: 96 });
    // An open shift has no employee assignment to conflict with.
    await waitFor(() => expect(createScheduleShifts).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createScheduleShifts).mock.calls[0]?.[2]).toEqual([
      expect.objectContaining({
        employee_id: null,
        scheduled_date: scheduleFixture.week_start,
      }),
    ]);
    expect(screen.queryByRole("dialog", { name: "Shift conflict" })).toBeNull();
    expect(createMock).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    expect(
      screen
        .getByRole("button", { name: "Paste mode off" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    fireEvent.contextMenu(pasteCell!, { clientX: 64, clientY: 82 });
    const pasteOnlyCellMenu = screen.getByRole("menu", {
      name: "Cell actions",
    });
    expect(pasteOnlyCellMenu).toBeTruthy();
    expect(
      within(pasteOnlyCellMenu).queryByRole("menuitem", { name: "Add shift" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Paste shift" }));
    expect(
      await screen.findByRole("dialog", { name: "Shift conflict" }),
    ).toBeTruthy();
    expect(container.querySelector(".schedule-quick-editor")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "Job/Position" }),
    );
    fireEvent.pointerDown(document.body);
    const employeePresetCell = container.querySelector<HTMLElement>(
      `.schedule-cell[data-employee-id="${scheduleFixture.employees[0]!.id}"][data-date="2026-08-18"]`,
    );
    expect(employeePresetCell).toBeTruthy();
    fireEvent.contextMenu(employeePresetCell!, { clientX: 72, clientY: 96 });
    const presetCellMenu = screen.getByRole("menu", { name: "Cell actions" });
    expect(presetCellMenu).toBeTruthy();
    expect(
      within(presetCellMenu).queryByRole("menuitem", { name: "Add shift" }),
    ).toBeNull();
    expect(
      within(presetCellMenu).getByRole("menuitem", { name: "Dinner-Server" }),
    ).toBeTruthy();
    fireEvent.pointerDown(document.body);
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Hide Preset badges" }),
    );
    fireEvent.pointerDown(document.body);
    fireEvent.contextMenu(employeePresetCell!, { clientX: 72, clientY: 96 });
    const presetToggleOffCellMenu = screen.getByRole("menu", {
      name: "Cell actions",
    });
    expect(
      within(presetToggleOffCellMenu).queryByRole("menuitem", {
        name: "Dinner-Server",
      }),
    ).toBeNull();
    fireEvent.pointerDown(document.body);
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Show Preset badges" }),
    );
    fireEvent.pointerDown(document.body);
    fireEvent.contextMenu(employeePresetCell!, { clientX: 72, clientY: 96 });
    createMock.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      source_kind: "published",
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      location_ids: ["11111111-1111-4111-8111-111111111111"],
      holder_name: "Development Owner",
      revision: 2,
      dirty: true,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: scheduleFixture.shifts.map((shift) => ({
        ...shift,
        unpaid_break_minutes: 30,
        revision: 1,
      })),
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Dinner-Server" }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        employee_id: scheduleFixture.employees[0]!.id,
        job_id: scheduleFixture.jobs[0]!.id,
        shift_type_id: scheduleFixture.shift_types[0]!.id,
        scheduled_date: "2026-08-18",
        start_time: "16:00",
        end_time: "22:00",
        unpaid_break_minutes: 30,
      }),
    );
    expect(screen.queryByRole("dialog", { name: "Add shift" })).toBeNull();

    const refreshedShiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      if (!badge) throw new Error("Expected schedule shift badge");
      return badge;
    });
    fireEvent.doubleClick(refreshedShiftBadge);
    expect(
      await screen.findByRole("dialog", { name: "Edit shift" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete shift" }));
    // BL-707 (UI-12): the first press only asks, as the strip's Delete does.
    expect(deleteMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalled());
    expect(deleteMock.mock.calls.at(-1)?.[2]).toBe(
      scheduleFixture.shifts[0]!.id,
    );
    expect(screen.queryByRole("dialog", { name: "Edit shift" })).toBeNull();
  }, 20000);

  it("dismisses dirty Add shift on sidebar navigation without blocking the link", async () => {
    window.history.pushState({}, "", "/app/schedule?date=2026-08-29");
    const { container } = render(<App />);
    const app = within(container);
    await signInAs("owner", app);
    await openPublishedScheduleEditor(app);
    fireEvent.click(
      app.getByRole("button", {
        name: "Add shift for unassigned at Main Dining on 2026-08-17",
      }),
    );
    const dialog = await app.findByRole("dialog", { name: "Add shift" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Increase count" }),
    );

    const employeesLink = sidebar().getByRole("link", { name: "Employees" });
    fireEvent.pointerDown(employeesLink);
    fireEvent.click(employeesLink);

    expect(
      app.queryByRole("alertdialog", {
        name: "Discard unsaved shift changes?",
      }),
    ).toBeNull();
    expect(app.queryByRole("dialog", { name: "Add shift" })).toBeNull();
    expect(await app.findByRole("heading", { name: "Employees" })).toBeTruthy();
  }, 20000);

  it("dismisses dirty Add shift on schedule clicks without activating the target", async () => {
    window.history.pushState({}, "", "/app/schedule?date=2026-08-29");
    const { container } = render(<App />);
    const app = within(container);
    await signInAs("owner", app);
    await openPublishedScheduleEditor(app);
    const scheduleAddButton = app.getByRole("button", {
      name: "Add shift for unassigned at Main Dining on 2026-08-17",
    });
    fireEvent.click(scheduleAddButton);
    const dialog = await app.findByRole("dialog", { name: "Add shift" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Increase count" }),
    );

    fireEvent.pointerDown(scheduleAddButton);
    fireEvent.click(scheduleAddButton);

    expect(
      app.queryByRole("alertdialog", {
        name: "Discard unsaved shift changes?",
      }),
    ).toBeNull();
    expect(app.queryByRole("dialog", { name: "Add shift" })).toBeNull();
  }, 20000);

  it("passes 24h schedule time format into the shift quick editor", async () => {
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce({
      ...scheduleFixture,
      settings: {
        time_format: "24h",
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    const { container } = render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();

    const shiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      if (!badge) throw new Error("Expected schedule shift badge");
      return badge;
    });
    fireEvent.doubleClick(shiftBadge);

    const dialog = await screen.findByRole("dialog", { name: "Edit shift" });
    const startTimeInput = within(dialog).getByRole("textbox", {
      name: "Start time",
    }) as HTMLInputElement;
    expect(startTimeInput.value).toBe("16:00");
    expect(
      startTimeInput.parentElement?.querySelector(
        '[data-time-segment="period"]',
      ),
    ).toBeNull();

    fireEvent.change(startTimeInput, { target: { value: "0715" } });
    fireEvent.blur(startTimeInput);
    expect(startTimeInput.value).toBe("07:15");
  });

  it("updates quick editor clock fields from selected shift type defaults", async () => {
    const brunchType = {
      ...scheduleFixture.shift_types[0]!,
      id: "44444444-4444-4444-8444-444444444447",
      name: "Brunch",
      color: "#0F766E",
      sort_order: 1,
      default_start_time: "10:00",
      default_end_time: "14:00",
    };
    const standbyType = {
      ...scheduleFixture.shift_types[0]!,
      id: "44444444-4444-4444-8444-444444444448",
      name: "Standby",
      color: "#B45309",
      sort_order: 2,
      default_start_time: null,
      default_end_time: null,
    };
    const editorFixture = {
      ...scheduleFixture,
      shift_types: [...scheduleFixture.shift_types, brunchType, standbyType],
    } satisfies ScheduleReadModel;
    const readModelMock = vi.mocked(getScheduleReadModel);
    const acquireMock = vi.mocked(acquireScheduleEditSession);
    readModelMock.mockResolvedValue(editorFixture);
    acquireMock.mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        shifts: editorFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    try {
      window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
      testAuth.role = "owner";
      render(<App />);
      await openPublishedScheduleEditor();
      fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
      fireEvent.click(screen.getByRole("menuitemradio", { name: "A-Z" }));
      fireEvent.pointerDown(document.body);
      const addShiftButton = await waitFor(() => {
        const button = document.querySelector<HTMLElement>(
          'button[aria-label="Add shift for Alex Rivera at Main Dining on 2026-08-18"]',
        );
        expect(button).toBeTruthy();
        return button!;
      });
      fireEvent.click(addShiftButton);
      const dialog = await screen.findByRole("dialog", { name: "Add shift" });
      const startTimeInput = within(dialog).getByRole("textbox", {
        name: "Start time",
      }) as HTMLInputElement;
      const endTimeInput = within(dialog).getByRole("textbox", {
        name: "End time",
      }) as HTMLInputElement;
      const clockBadgeToggle = within(dialog).getByRole("checkbox", {
        name: "Show times on badge",
      }) as HTMLInputElement;

      // A real click moves the cursor out of Start time, where the window put it.
      act(() => within(dialog).getByRole("button", { name: "Brunch" }).focus());
      fireEvent.click(within(dialog).getByRole("button", { name: "Brunch" }));

      await waitFor(() => expect(startTimeInput.value).toBe("10:00 AM"));
      expect(endTimeInput.value).toBe("02:00 PM");
      expect(clockBadgeToggle.checked).toBe(true);

      fireEvent.click(within(dialog).getByRole("button", { name: "Standby" }));

      expect(clockBadgeToggle.checked).toBe(false);
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      vi.mocked(createScheduleShift).mockClear();
      fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
      fireEvent.click(
        screen.getByRole("menuitemradio", { name: "Job/Position" }),
      );
      fireEvent.pointerDown(document.body);
      fireEvent.click(
        await screen.findByRole("button", { name: "Standby-Server" }),
      );
      const presetDialog = await screen.findByRole("dialog", {
        name: "Add shift",
      });
      expect(
        (
          within(presetDialog).getByRole("checkbox", {
            name: "Show times on badge",
          }) as HTMLInputElement
        ).checked,
      ).toBe(false);
      expect(createScheduleShift).not.toHaveBeenCalled();
      // A shift type without default hours leaves them to the manager.
      expect(within(presetDialog).getByRole("alert").textContent).toBe(
        "Enter start and end time.",
      );
      expect(
        within(presetDialog).getByRole("button", { name: "Add shift" }),
      ).toHaveProperty("disabled", true);
      fireEvent.change(
        within(presetDialog).getByRole("textbox", { name: "Start time" }),
        { target: { value: "13:00" } },
      );
      fireEvent.change(
        within(presetDialog).getByRole("textbox", { name: "End time" }),
        { target: { value: "17:00" } },
      );
      fireEvent.click(
        within(presetDialog).getByRole("button", { name: "Add shift" }),
      );
      await waitFor(() => expect(createScheduleShift).toHaveBeenCalledTimes(1));
      expect(vi.mocked(createScheduleShift).mock.calls[0]?.[2]).toEqual(
        expect.objectContaining({
          shift_type_id: standbyType.id,
          start_time: "13:00",
          end_time: "17:00",
          time_basis: "explicit",
        }),
      );
    } finally {
      readModelMock.mockResolvedValue(scheduleFixture);
    }
  });

  it("keeps edited shift hours when relabeling with a clock-off shift type", async () => {
    const standbyType = {
      ...scheduleFixture.shift_types[0]!,
      id: "44444444-4444-4444-8444-444444444449",
      name: "Standby",
      color: "#B45309",
      sort_order: 1,
      default_start_time: null,
      default_end_time: null,
    };
    const editorFixture = {
      ...scheduleFixtureForWeek("2026-09-18"),
      shift_types: [...scheduleFixture.shift_types, standbyType],
    } satisfies ScheduleReadModel;
    const readModelMock = vi.mocked(getScheduleReadModel);
    const acquireMock = vi.mocked(acquireScheduleEditSession);
    const updateMock = vi.mocked(updateScheduleShift);
    readModelMock.mockImplementation(async (_workspaceId, date) =>
      date === "2026-09-18" ? editorFixture : scheduleFixture,
    );
    acquireMock.mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777777",
        workspace_id: scheduleFixture.workspace_id,
        week_start: "2026-09-18",
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        location_ids: ["11111111-1111-4111-8111-111111111111"],
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: editorFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    updateMock.mockClear();
    updateMock.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      workspace_id: scheduleFixture.workspace_id,
      week_start: "2026-09-18",
      source_kind: "published",
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      location_ids: ["11111111-1111-4111-8111-111111111111"],
      holder_name: "Development Owner",
      revision: 2,
      dirty: true,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: [
        {
          ...scheduleFixture.shifts[0]!,
          scheduled_date: "2026-09-18",
          shift_type_id: standbyType.id,
          revision: 2,
        },
      ],
    });
    try {
      window.history.pushState({}, "", "/app/schedule?date=2026-09-18");
      const { container } = render(<App />);
      await signInAs("owner");
      await openPublishedScheduleEditor();
      const shiftBadge = await waitFor(() => {
        const badge = container.querySelector<HTMLElement>(
          ".schedule-shift-badge",
        );
        expect(badge).toBeTruthy();
        return badge;
      });
      fireEvent.doubleClick(shiftBadge!);
      const dialog = await screen.findByRole("dialog", { name: "Edit shift" });

      fireEvent.click(within(dialog).getByRole("button", { name: "Standby" }));
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Save" }),
      );

      await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
      expect(updateMock.mock.calls[0]?.[4]).toEqual(
        expect.objectContaining({
          shift_type_id: standbyType.id,
          start_time: "16:00",
          end_time: "22:30",
          hide_time_on_badge: false,
          time_basis: "explicit",
        }),
      );
    } finally {
      readModelMock.mockResolvedValue(scheduleFixture);
    }
  });

  it("uses reference-style live shift unpublish and restore menu actions", async () => {
    const liveWeekStart = "2026-09-14";
    const liveShift = {
      ...scheduleFixture.shifts[0]!,
      scheduled_date: liveWeekStart,
      revision: 1,
      source_published_shift_id: scheduleFixture.shifts[0]!.id,
      pending_op_type: null,
      locked: true,
    };
    const stagedRemovedShift = {
      ...liveShift,
      revision: 2,
      pending_op_type: "delete" as const,
      locked: true,
    };
    const deleteMock = vi.mocked(deleteScheduleShift);
    const restoreMock = vi.mocked(restoreScheduleShift);
    deleteMock.mockClear();
    restoreMock.mockClear();
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce({
      ...scheduleFixture,
      week_start: liveWeekStart,
      shifts: [liveShift],
    });
    deleteMock.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777781",
      workspace_id: scheduleFixture.workspace_id,
      week_start: liveWeekStart,
      source_kind: "published",
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      location_ids: ["11111111-1111-4111-8111-111111111111"],
      holder_name: "Development Owner",
      revision: 2,
      dirty: true,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: [stagedRemovedShift],
    });
    restoreMock.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777781",
      workspace_id: scheduleFixture.workspace_id,
      week_start: liveWeekStart,
      source_kind: "published",
      source_draft_id: null,
      source_revision: 1,
      holder_user_id: "88888888-8888-4888-8888-888888888888",
      location_ids: ["11111111-1111-4111-8111-111111111111"],
      holder_name: "Development Owner",
      revision: 3,
      dirty: true,
      last_heartbeat: "2026-08-17T12:00:00Z",
      expires_at: "2026-08-17T12:04:00Z",
      shifts: [{ ...liveShift, revision: 3 }],
    });
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777781",
        workspace_id: scheduleFixture.workspace_id,
        week_start: liveWeekStart,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        location_ids: ["11111111-1111-4111-8111-111111111111"],
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: [liveShift],
      },
    });

    window.history.pushState({}, "", `/app/schedule?date=${liveWeekStart}`);
    testAuth.role = "owner";
    const { container } = render(<App />);
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    const liveBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      if (!badge) throw new Error("Expected live shift badge");
      expect(badge.getAttribute("data-publication-state")).toBe("locked");
      return badge;
    });
    // While editing, a live shift says LIVE top right (Mert, 2026-10-12).
    expect(
      liveBadge.querySelector(".schedule-shift-live-mark")?.textContent,
    ).toBe("Live");
    expect(liveBadge.querySelector(".schedule-shift-new-mark")).toBeNull();
    fireEvent.contextMenu(liveBadge, { clientX: 44, clientY: 48 });
    expect(screen.queryByRole("menuitem", { name: "Delete shift" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Unpublish shift" }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));

    const stagedBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      if (!badge) throw new Error("Expected staged removed shift badge");
      expect(badge.getAttribute("data-publication-state")).toBe(
        "staged-removed",
      );
      return badge;
    });
    // A shift staged for removal carries no mark (Mert, 2026-10-12): it is
    // faded and struck through.
    expect(stagedBadge.querySelector(".schedule-shift-badge-markers")).toBeNull();
    expect(stagedBadge.querySelector(".schedule-shift-new-mark")).toBeNull();
    fireEvent.contextMenu(stagedBadge, { clientX: 54, clientY: 58 });
    expect(screen.queryByRole("menuitem", { name: "Edit shift" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Restore shift" }));
    await waitFor(() => expect(restoreMock).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(
        container
          .querySelector<HTMLElement>(".schedule-shift-badge")
          ?.getAttribute("data-publication-state"),
      ).toBe("locked"),
    );
    expect(await screen.findByText("Shift restored")).toBeTruthy();
  });

  it("keeps the shift quick editor open while scrolling its long form", async () => {
    window.history.pushState({}, "", "/app/schedule?date=2026-08-31");
    const { container } = render(<App />);
    const app = within(container);
    await signInAs("owner", app);
    await openPublishedScheduleEditor(app);
    expect(await app.findByRole("button", { name: "Discard" })).toBeTruthy();

    const shiftBadge = container.querySelector(".schedule-shift-badge");
    expect(shiftBadge).toBeTruthy();
    fireEvent.doubleClick(shiftBadge!);
    const dialog = await app.findByRole("dialog", { name: "Edit shift" });

    fireEvent.scroll(dialog);

    expect(app.getByRole("dialog", { name: "Edit shift" })).toBeTruthy();
  });

  it("dismisses schedule topbar menus and active filters one blank click at a time, newest first", async () => {
    window.history.pushState(
      {},
      "",
      `/app/schedule?date=2026-08-17&view=day&hideUnscheduled=true&locations=${scheduleFixture.locations[0]!.id}&shiftTypes=${scheduleFixture.shift_types[0]!.id}&jobs=${scheduleFixture.jobs[0]!.id}&employees=${scheduleFixture.employees[0]!.id}`,
    );
    testAuth.role = "owner";
    const { container } = render(<App />);
    const app = within(container);
    await app.findByRole(
      "grid",
      { name: "Daily published schedule" },
      { timeout: 5000 },
    );
    const page = container.querySelector(".schedule-page");
    expect(page).toBeTruthy();

    fireEvent.click(app.getByRole("button", { name: /Settings/ }));
    expect(await app.findByText("Shift Badge Settings")).toBeTruthy();
    fireEvent.pointerDown(page!);
    await waitFor(() =>
      expect(app.queryByText("Shift Badge Settings")).toBeNull(),
    );
    expect(window.location.search).toContain("hideUnscheduled=true");

    // Mert, 2026-10-12: one filter per press, the newest first.
    const filters = () =>
      ["hideUnscheduled", "locations", "shiftTypes", "jobs", "employees"].filter(
        (key) => new URLSearchParams(window.location.search).has(key),
      );
    for (const expected of [
      ["hideUnscheduled", "locations", "shiftTypes", "jobs"],
      ["hideUnscheduled", "locations", "shiftTypes"],
      ["hideUnscheduled", "locations"],
      ["hideUnscheduled"],
      [],
    ]) {
      fireEvent.pointerDown(page!);
      await waitFor(() => expect(filters()).toEqual(expected));
      expect(window.location.search).toContain("view=day");
    }

    fireEvent.pointerDown(page!);
    await waitFor(() => expect(window.location.search).toContain("view=week"));
  });

  it("uses the schedule edit banner blank area to dismiss active layers in order", async () => {
    const workingFixture = scheduleFixtureForWeek("2026-09-07");
    vi.mocked(getScheduleReadModel)
      .mockResolvedValueOnce(workingFixture)
      .mockResolvedValue(workingFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...makeDefaultEditAcquireResult(),
      session: {
        ...makeDefaultEditAcquireResult().session,
        week_start: workingFixture.week_start,
        shifts: workingFixture.shifts.map((shift) => ({
          ...shift,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-07&view=day");
    testAuth.role = "owner";
    const { container } = render(<App />);
    const app = within(container);

    await openPublishedScheduleEditor(app);
    expect(await app.findByRole("button", { name: "Discard" })).toBeTruthy();
    const editBanner = container.querySelector<HTMLElement>(
      ".schedule-edit-banner",
    );
    expect(editBanner).toBeTruthy();

    fireEvent.click(app.getByRole("button", { name: /Settings/ }));
    expect(await app.findByText("Shift Badge Settings")).toBeTruthy();
    fireEvent.pointerDown(editBanner!);
    await waitFor(() =>
      expect(app.queryByText("Shift Badge Settings")).toBeNull(),
    );
    expect(window.location.search).toContain("view=day");

    fireEvent.click(app.getByRole("button", { name: "Hide Unscheduled" }));
    expect(
      new URLSearchParams(window.location.search).get("hideUnscheduled"),
    ).toBe("true");
    fireEvent.pointerDown(editBanner!);
    expect(window.location.search).not.toContain("hideUnscheduled=true");
    expect(window.location.search).toContain("view=day");

    fireEvent.pointerDown(editBanner!);
    expect(window.location.search).toContain("view=week");
  }, 20000);

  it("pastes onto hours the employee marked unavailable: availability never blocks (BL-186)", async () => {
    const unavailableFixture = {
      ...scheduleFixture,
      employees: [
        {
          ...scheduleFixture.employees[0]!,
          // Unavailable all of Tuesday 2026-08-18 in Main Dining's time zone.
          weekly_availability: [
            {
              location_id: scheduleFixture.locations[0]!.id,
              location_name: "Main Dining",
              timezone: "America/Los_Angeles",
              week_start: scheduleFixture.week_start,
              status: "ready" as const,
              unavailable_intervals: [
                { start_at: "2026-08-18T07:00:00Z", end_at: "2026-08-19T07:00:00Z" },
              ],
              leave_intervals: [],
              clock_segments: [
                { start_at: "2026-08-17T07:00:00Z", end_at: "2026-08-24T07:00:00Z", offset_seconds: -25200 },
              ],
              days: Array.from({ length: 7 }, (_, index) => ({
                date: `2026-08-${17 + index}`,
                has_unavailable: index === 1,
                all_day: index === 1,
              })),
            },
          ],
        },
      ],
    } satisfies ScheduleReadModel;
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce(unavailableFixture);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777785",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        location_ids: ["11111111-1111-4111-8111-111111111111"],
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: unavailableFixture.shifts.map((shift) => ({
          ...shift,
          revision: 1,
        })),
      },
    });

    window.history.pushState({}, "", "/app/schedule?date=2026-08-25");
    const { container } = render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();

    const shiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge",
      );
      expect(badge).toBeTruthy();
      return badge;
    });
    fireEvent.contextMenu(shiftBadge!, { clientX: 36, clientY: 48 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy shift" }));
    expect(await screen.findByText("Shift copied")).toBeTruthy();

    const unavailableCell = container.querySelector<HTMLElement>(
      `[data-drop-cell="true"][data-employee-id="${scheduleFixture.employees[0]!.id}"][data-location-id="${scheduleFixture.locations[0]!.id}"][data-date="2026-08-18"]`,
    );
    expect(unavailableCell).toBeTruthy();
    vi.mocked(createScheduleShifts).mockClear();
    fireEvent.click(unavailableCell!, { clientX: 80, clientY: 96 });

    await waitFor(() => expect(createScheduleShifts).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createScheduleShifts).mock.calls[0]?.[2]).toEqual([
      expect.objectContaining({ employee_id: scheduleFixture.employees[0]!.id, scheduled_date: "2026-08-18" }),
    ]);
    expect(screen.queryByRole("dialog", { name: "Shift conflict" })).toBeNull();
    expect(screen.queryByText("Paste blocked")).toBeNull();
  });

  it("shows the reference-style stale quick editor state after edit conflicts", async () => {
    const updateMock = vi.mocked(updateScheduleShift);
    updateMock.mockClear();
    updateMock.mockRejectedValueOnce(new Error("stale shift revision"));
    window.history.pushState({}, "", "/app/schedule?date=2026-08-30");
    const { container } = render(<App />);
    const app = within(container);
    await signInAs("owner", app);
    await openPublishedScheduleEditor(app);
    expect(await app.findByRole("button", { name: "Discard" })).toBeTruthy();

    const shiftBadge = container.querySelector(".schedule-shift-badge");
    expect(shiftBadge).toBeTruthy();
    fireEvent.keyDown(shiftBadge!, { key: "Enter" });
    const dialog = await app.findByRole("dialog", { name: "Edit shift" });
    // Save stays disabled until the shift is edited.
    fireEvent.click(within(dialog).getByRole("button", { name: "15m" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save" }),
    );

    expect(await app.findByText("Shift changed")).toBeTruthy();
    expect(
      app.getByText(/This shift was changed by someone else/),
    ).toBeTruthy();
    expect(app.getByRole("button", { name: "Close & reload" })).toBeTruthy();
  });

  it("creates multiple unassigned shifts from the reference-style quick editor count stepper", async () => {
    const createMock = vi.mocked(createScheduleShift);
    createMock.mockClear();
    const unassignedShift = {
      ...scheduleFixture.shifts[0]!,
      id: "77777777-7777-4777-8777-777777777781",
      employee_id: null,
      scheduled_date: "2026-08-18",
    };
    const hostJob = {
      ...scheduleFixture.jobs[0]!,
      id: "33333333-3333-4333-8333-333333333334",
      name: "Host",
      sort_order: 1,
    };
    const hostEmployee = {
      ...scheduleFixture.employees[0]!,
      id: "55555555-5555-4555-8555-555555555557",
      employee_code: "NF-003",
      display_name: "Bailey Chen",
      job_ids: [hostJob.id],
    };
    const quickEditorModel = {
      ...scheduleFixture,
      jobs: [...scheduleFixture.jobs, hostJob],
      employees: [...scheduleFixture.employees, hostEmployee],
      shifts: [...scheduleFixture.shifts, unassignedShift],
    };
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock.mockReset();
    readModelMock.mockImplementation((_, date) =>
      Promise.resolve(
        date === "2026-08-29" ? quickEditorModel : scheduleFixture,
      ),
    );
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777782",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        location_ids: ["11111111-1111-4111-8111-111111111111"],
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: quickEditorModel.shifts.map((shift) => ({
          ...shift,
          revision: 1,
        })),
      },
    });
    const batchCreateMock = vi.mocked(createScheduleShifts);
    for (const revision of [2]) {
      batchCreateMock.mockResolvedValueOnce({
        id: "77777777-7777-4777-8777-777777777782",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        location_ids: ["11111111-1111-4111-8111-111111111111"],
        holder_name: "Development Owner",
        revision,
        dirty: true,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: quickEditorModel.shifts.map((shift) => ({
          ...shift,
          revision,
        })),
      });
    }

    window.history.pushState({}, "", "/app/schedule?date=2026-08-29");
    const { container } = render(<App />);
    const app = within(container);
    await signInAs("owner", app);
    await openPublishedScheduleEditor(app);
    expect(await app.findByRole("button", { name: "Discard" })).toBeTruthy();
    fireEvent.click(
      app.getByRole("button", {
        name: "Add shift for unassigned at Main Dining on 2026-08-17",
      }),
    );
    const dialog = await app.findByRole("dialog", { name: "Add shift" });
    const employeeSelect = within(dialog).getByRole("combobox", {
      name: "Employee",
    });
    expect(employeeSelect).toHaveProperty(
      "textContent",
      expect.stringContaining("Open"),
    );
    fireEvent.click(employeeSelect);
    expect(
      within(dialog).queryByRole("option", { name: "Alex Rivera" }),
    ).toBeNull();
    // Mert, 2026-10-12: the unassigned choice reads "Open".
    fireEvent.click(within(dialog).getByRole("option", { name: "Open" }));
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Job" }));
    fireEvent.click(within(dialog).getByRole("option", { name: "Host" }));
    await waitFor(() =>
      expect(
        within(dialog).getByRole("combobox", { name: "Job" }),
      ).toHaveProperty("textContent", expect.stringContaining("Host")),
    );
    expect(
      within(dialog).getByRole("combobox", { name: "Employee" }),
    ).toHaveProperty("textContent", expect.stringContaining("Open"));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Increase count" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Increase count" }),
    );
    expect(
      within(dialog).getByRole("textbox", { name: "Shift count" }),
    ).toHaveProperty("value", "3");
    expect(
      within(dialog).getByRole("combobox", { name: "Employee" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add 3 shifts" }),
    );

    // Multiple shifts are created in one idempotent batch request.
    await waitFor(() => expect(batchCreateMock).toHaveBeenCalledTimes(1));
    expect(createMock).not.toHaveBeenCalled();
    expect(batchCreateMock.mock.calls[0]?.[1].revision).toBe(1);
    const batchInputs = batchCreateMock.mock.calls[0]?.[2];
    expect(batchInputs).toHaveLength(3);
    expect(batchInputs?.[0]).toMatchObject({
      employee_id: null,
      scheduled_date: "2026-08-17",
      unpaid_break_minutes: 30,
    });
    readModelMock.mockResolvedValue(scheduleFixture);
  });

  it("keeps reference-style multi-select controls for shift badges", async () => {
    const secondShift = {
      ...scheduleFixture.shifts[0]!,
      id: "77777777-7777-4777-8777-777777777779",
      scheduled_date: "2026-08-18",
      start_time: "10:00",
      end_time: "14:00",
    };
    vi.mocked(getScheduleReadModel).mockResolvedValueOnce({
      ...scheduleFixture,
      shifts: [...scheduleFixture.shifts, secondShift],
    });
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: "77777777-7777-4777-8777-777777777780",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        location_ids: ["11111111-1111-4111-8111-111111111111"],
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: [...scheduleFixture.shifts, secondShift].map((shift) => ({
          ...shift,
          revision: 1,
        })),
      },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-25");
    const { container } = render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    const badges = container.querySelectorAll("button.schedule-shift-badge");
    expect(badges).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: /Server, .* - .*/ }),
    ).toHaveLength(2);
    fireEvent.click(badges[0]!);
    expect(screen.queryByRole("dialog", { name: "Edit shift" })).toBeNull();
    await waitFor(() =>
      expect(badges[0]?.getAttribute("data-focused")).toBe("true"),
    );
    expect(badges[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(window.location.search).toContain(
      `shiftTypes=${scheduleFixture.shift_types[0]!.id}`,
    );
    expect(window.location.search).toContain(
      `jobs=${scheduleFixture.jobs[0]!.id}`,
    );
    const schedulePage = container.querySelector<HTMLElement>(".schedule-page");
    expect(schedulePage).toBeTruthy();
    fireEvent.keyDown(schedulePage!, { key: "a", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Delete 2" })).toBeTruthy();
    fireEvent.pointerDown(schedulePage!);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Delete 2" })).toBeNull(),
    );
    expect(window.location.search).not.toContain("shiftTypes=");
    expect(window.location.search).not.toContain("jobs=");

    fireEvent.keyDown(schedulePage!, { key: "a", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Delete 2" })).toBeTruthy();
    expect(badges[0]?.getAttribute("data-selected")).toBe("true");
    expect(badges[1]?.getAttribute("data-selected")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Delete 2" })).toBeNull();

    const currentBadges = container.querySelectorAll(
      "button.schedule-shift-badge",
    );
    expect(currentBadges).toHaveLength(2);
    await act(async () => {
      fireEvent.mouseDown(currentBadges[0]!, { ctrlKey: true });
      fireEvent.click(currentBadges[0]!, { ctrlKey: true });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete 1" })).toBeTruthy(),
    );
    const refreshedBadges = container.querySelectorAll(
      "button.schedule-shift-badge",
    );
    expect(refreshedBadges).toHaveLength(2);
    await act(async () => {
      fireEvent.mouseDown(refreshedBadges[1]!, { ctrlKey: true });
      fireEvent.click(refreshedBadges[1]!, { ctrlKey: true });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete 2" })).toBeTruthy(),
    );
    const selectedBadges = container.querySelectorAll(
      "button.schedule-shift-badge",
    );
    expect(selectedBadges[0]?.getAttribute("data-selected")).toBe("true");
    expect(selectedBadges[1]?.getAttribute("data-selected")).toBe("true");
    expect(selectedBadges[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(selectedBadges[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelectorAll("[data-shift-selection-ring='true']"),
    ).toHaveLength(2);
    fireEvent.keyDown(selectedBadges[1]!, { key: "c", ctrlKey: true });
    // Copy is limited to a single shift; paste mode stays off.
    expect(await screen.findByText("Select one shift to copy")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Paste mode on" }),
    ).toBeNull();
    const editableBadges = container.querySelectorAll(
      "button.schedule-shift-badge",
    );
    expect(editableBadges).toHaveLength(2);
    await act(async () => {
      fireEvent.doubleClick(editableBadges[0]!);
      await Promise.resolve();
    });
    expect(
      await screen.findByRole("dialog", { name: "Edit shift" }),
    ).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole("textbox", { name: "Start time" }));
    expect(screen.getByRole("button", { name: "Delete 2" })).toBeTruthy();
  }, 15_000);

  // S2 (KK-171): with no step on the server to take back, Undo is faded and does nothing.
  it("keeps Undo faded until the edit has a step to take back", async () => {
    vi.mocked(undoScheduleEditSessionStep).mockReset();
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();

    const undo = await screen.findByRole("button", { name: "Undo" });
    expect((undo as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(undoScheduleEditSessionStep).not.toHaveBeenCalled();
  });

  // A step the rules no longer allow back reads as one plain sentence, and a held
  // Ctrl+Z sends one Undo at a time.
  it("says plainly when a step can no longer be undone, and sends one Undo at a time", async () => {
    const undoMock = vi.mocked(undoScheduleEditSessionStep);
    undoMock.mockReset();
    let refuse: (error: Error) => void = () => undefined;
    undoMock.mockImplementation(() => new Promise((_resolve, reject) => { refuse = reject; }));
    const acquired = makeDefaultEditAcquireResult();
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...acquired, session: { ...acquired.session, undo_depth: 1 },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();

    const undo = await screen.findByRole("button", { name: "Undo" });
    await waitFor(() => expect((undo as HTMLButtonElement).disabled).toBe(false));
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(undoMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      refuse(new ScheduleRequestError("employee document hard conflict", 400, { error: "employee document hard conflict" }));
    });
    expect((await screen.findAllByText("This step can no longer be undone.")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/employee document hard conflict/)).toBeNull();
  });

  // BL-976: another tab moved the edit on; the screen says so plainly and offers a
  // reload instead of the server's "session revision stale."
  it("says plainly that the page is out of date when another tab moved the edit on", async () => {
    const deleteMock = vi.mocked(deleteScheduleShift);
    deleteMock.mockReset();
    deleteMock.mockRejectedValueOnce(new ScheduleRequestError("session revision stale", 409, {
      error: "session revision stale", code: "edit_session_stale",
    }));
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    const { container } = render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();

    const badge = await waitFor(() => {
      const found = container.querySelector<HTMLElement>(".schedule-shift-badge");
      expect(found).toBeTruthy();
      return found!;
    });
    fireEvent.contextMenu(badge, { clientX: 36, clientY: 48 });
    fireEvent.click(screen.getByRole("menuitem", { name: /^(Delete|Unpublish) shift$/ }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert.textContent).toContain(
      "This schedule changed in another tab or window. Reload the page, then make the change again.",
    ));
    expect(within(alert).getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(screen.queryByText(/session revision stale/)).toBeNull();
  });

  // BL-1003: with the shift window open, Ctrl+Z, Delete and paste belong to the
  // window; nothing behind it is undone, deleted or armed.
  it("keeps the grid's shortcuts off while the shift window is open", async () => {
    const undoMock = vi.mocked(undoScheduleEditSessionStep);
    undoMock.mockReset();
    const acquired = makeDefaultEditAcquireResult();
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...acquired, session: { ...acquired.session, undo_depth: 1 },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    const { container } = render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();

    const undo = await screen.findByRole("button", { name: "Undo" });
    await waitFor(() => expect((undo as HTMLButtonElement).disabled).toBe(false));
    const badge = await waitFor(() => {
      const found = container.querySelector("button.schedule-shift-badge");
      expect(found).toBeTruthy();
      return found!;
    });
    await act(async () => {
      fireEvent.doubleClick(badge);
      await Promise.resolve();
    });
    const dialog = await screen.findByRole("dialog", { name: "Edit shift" });
    const close = within(dialog).getByRole("button", { name: "Close editor" });
    close.focus();

    fireEvent.keyDown(close, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    fireEvent.keyDown(close, { key: "Delete" });
    fireEvent.keyDown(close, { key: "v", ctrlKey: true });
    fireEvent.paste(close);
    fireEvent.paste(window);

    expect(undoMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Paste mode on" })).toBeNull();
    expect(screen.queryByText("Paste mode on")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Edit shift" })).toBeTruthy();
  });

  // BL-998: the server took a step that cannot come back off the list; the screen
  // says why, the button follows the new depth, and nothing reads as undone.
  it("says why a step was taken off the Undo list, and Undo stays usable for the step before it", async () => {
    const undoMock = vi.mocked(undoScheduleEditSessionStep);
    undoMock.mockReset();
    undoMock.mockImplementation(async (_workspaceId, currentSession) => ({
      ...currentSession,
      revision: currentSession.revision + 1,
      undo_depth: 1,
      undo_refused: { reason: "availability" as const },
    }));
    const acquired = makeDefaultEditAcquireResult();
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...acquired, session: { ...acquired.session, undo_depth: 2 },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();

    const undo = await screen.findByRole("button", { name: "Undo" });
    await waitFor(() => expect((undo as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(undo);

    expect(await screen.findByText("Last edit can't come back")).toBeTruthy();
    expect(screen.getByText(/approved time off or a shift-hours rule/)).toBeTruthy();
    expect(screen.queryByText("Last edit undone")).toBeNull();
    await waitFor(() => expect((undo as HTMLButtonElement).disabled).toBe(false));
  });

  // BL-1000: another tab moved the edit on; Undo asks for a reload instead of
  // blaming the step.
  it("asks for a reload when the edit moved on in another tab", async () => {
    const undoMock = vi.mocked(undoScheduleEditSessionStep);
    undoMock.mockReset();
    undoMock.mockRejectedValue(new ScheduleRequestError("session revision stale", 409, {
      error: "session revision stale", code: "edit_session_stale",
    }));
    const acquired = makeDefaultEditAcquireResult();
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      ...acquired, session: { ...acquired.session, undo_depth: 1 },
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();

    const undo = await screen.findByRole("button", { name: "Undo" });
    await waitFor(() => expect((undo as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(undo);

    expect((await screen.findAllByText("This page is out of date. Reload it, then press Undo again.")).length)
      .toBeGreaterThan(0);
    expect(screen.queryByText("This step can no longer be undone.")).toBeNull();
  });

  it("moves shifts with the reference-style pointer drag interaction", async () => {
    const updateMock = vi.mocked(updateScheduleShift);
    const createMock = vi.mocked(createScheduleShift);
    updateMock.mockClear();
    createMock.mockClear();
    // S2 (KK-171): every write is one step the server can take back.
    // Like the server, Undo puts back the shifts as they were before the last write.
    let beforeLastWrite: Awaited<ReturnType<typeof undoScheduleEditSessionStep>> | null = null;
    const undoMock = vi.mocked(undoScheduleEditSessionStep);
    undoMock.mockReset();
    undoMock.mockImplementation(async (_workspaceId, currentSession) => ({
      ...currentSession,
      shifts: beforeLastWrite?.shifts ?? currentSession.shifts,
      revision: currentSession.revision + 1,
      undo_depth: Math.max(0, (currentSession.undo_depth ?? 0) - 1),
    }));
    updateMock.mockImplementation(
      async (_workspaceId, currentSession, shiftId, _revision, input) => (beforeLastWrite = currentSession, {
        ...currentSession,
        dirty: true,
        revision: currentSession.revision + 1,
        undo_depth: (currentSession.undo_depth ?? 0) + 1,
        shifts: currentSession.shifts.map((shift) =>
          shift.id === shiftId
            ? { ...shift, ...input, revision: shift.revision + 1 }
            : shift,
        ),
      }),
    );
    createMock.mockImplementation(
      async (_workspaceId, currentSession, input) => (beforeLastWrite = currentSession, {
        ...currentSession,
        dirty: true,
        revision: currentSession.revision + 1,
        undo_depth: (currentSession.undo_depth ?? 0) + 1,
        shifts: [
          ...currentSession.shifts,
          {
            ...currentSession.shifts[0]!,
            ...input,
            id: "66666666-6666-4666-8666-666666666668",
            revision: 1,
            warning_codes: [],
          },
        ],
      }),
    );
    window.history.pushState({}, "", "/app/schedule?date=2026-08-26");
    const { container } = render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();

    const shiftBadge = container.querySelector(".schedule-shift-badge");
    expect(
      container.querySelector(
        `[data-schedule-employee-row="${scheduleFixture.employees[0]!.id}"]`,
      ),
    ).toBeTruthy();
    const targetCell = container.querySelector(
      '.schedule-cell[data-date="2026-08-18"]',
    );
    expect(shiftBadge).toBeTruthy();
    expect(targetCell).toBeTruthy();
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => targetCell as Element),
    });
    const dispatchPointer = (
      target: Window | Document | Node | Element,
      type: string,
      init: {
        readonly clientX: number;
        readonly clientY: number;
        readonly pointerId: number;
        readonly button?: number;
        readonly ctrlKey?: boolean;
        readonly metaKey?: boolean;
      },
    ) => {
      const eventInit = {
        button: init.button ?? 0,
        buttons: type === "pointerup" || type === "mouseup" ? 0 : 1,
        clientX: init.clientX,
        clientY: init.clientY,
        pointerId: init.pointerId,
        pointerType: "mouse",
        isPrimary: true,
        ctrlKey: init.ctrlKey ?? false,
        metaKey: init.metaKey ?? false,
      };
      if (type === "mousedown") {
        fireEvent.mouseDown(target, eventInit);
        return;
      }
      if (type === "mousemove") {
        fireEvent.mouseMove(target, eventInit);
        return;
      }
      if (type === "mouseup") {
        fireEvent.mouseUp(target, eventInit);
        return;
      }
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        button: { value: eventInit.button },
        buttons: { value: eventInit.buttons },
        clientX: { value: eventInit.clientX },
        clientY: { value: eventInit.clientY },
        pointerId: { value: eventInit.pointerId },
        pointerType: { value: eventInit.pointerType },
        isPrimary: { value: eventInit.isPrimary },
        ctrlKey: { value: eventInit.ctrlKey },
        metaKey: { value: eventInit.metaKey },
      });
      fireEvent(target, event);
    };

    const draggableShiftBadge = container.querySelector<HTMLElement>(
      ".schedule-shift-badge[data-shift-badge='true']",
    );
    expect(draggableShiftBadge).toBeTruthy();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await act(async () => {
      dispatchPointer(draggableShiftBadge!, "mousedown", {
        button: 0,
        clientX: 20,
        clientY: 20,
        pointerId: 1,
      });
      await Promise.resolve();
    });
    await act(async () => {
      dispatchPointer(document, "mousemove", {
        clientX: 96,
        clientY: 96,
        pointerId: 1,
      });
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });
    await waitFor(() => {
      expect(
        container.querySelector(".schedule-shift-drag-preview"),
      ).toBeTruthy();
      expect(targetCell?.getAttribute("data-drop-status")).toBe("allowed");
    });
    await act(async () => {
      dispatchPointer(document, "mouseup", {
        clientX: 96,
        clientY: 96,
        pointerId: 1,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateMock.mock.calls.at(-1)?.[4]).toMatchObject({
      scheduled_date: "2026-08-18",
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: "z", ctrlKey: true });
      await Promise.resolve();
    });
    expect(await screen.findByText("Last edit undone")).toBeTruthy();
    // The step goes back on the server, from the revision the drag left.
    expect(undoMock).toHaveBeenCalledTimes(1);
    expect(undoMock.mock.calls[0]?.[1]).toMatchObject({ undo_depth: 1 });

    const copyShiftBadge = await waitFor(() => {
      const badge = container.querySelector<HTMLElement>(
        ".schedule-shift-badge[data-shift-badge='true']",
      );
      expect(badge).toBeTruthy();
      return badge;
    });
    await act(async () => {
      dispatchPointer(copyShiftBadge!, "mousedown", {
        button: 0,
        clientX: 20,
        clientY: 20,
        pointerId: 8,
      });
      await Promise.resolve();
    });
    await act(async () => {
      dispatchPointer(document, "mousemove", {
        clientX: 112,
        clientY: 112,
        pointerId: 8,
        ctrlKey: true,
      });
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });
    await waitFor(() => {
      const preview = container.querySelector(".schedule-shift-drag-preview");
      expect(preview).toBeTruthy();
      expect(preview?.getAttribute("data-copy")).toBe("true");
      expect(screen.getByText("+ Paste")).toBeTruthy();
    });
    await act(async () => {
      dispatchPointer(document, "mouseup", {
        clientX: 112,
        clientY: 112,
        pointerId: 8,
        ctrlKey: true,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock.mock.calls.at(-1)?.[2]).toMatchObject({
      scheduled_date: "2026-08-18",
    });
    await waitFor(() =>
      expect(
        container.querySelectorAll(
          ".schedule-shift-badge[data-shift-badge='true']",
        ),
      ).toHaveLength(2),
    );
    await act(async () => {
      fireEvent.keyDown(window, { key: "z", ctrlKey: true });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        container.querySelectorAll(
          ".schedule-shift-badge[data-shift-badge='true']",
        ),
      ).toHaveLength(1),
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint,
    });
  });

  // QA 43: the gold outline belongs to the filters the click set; taking one
  // of them off takes the outline off too.
  it("drops the focused shift outline when its job filter is removed", async () => {
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock.mockReset();
    readModelMock.mockResolvedValue(scheduleFixture);
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    testAuth.role = "owner";
    const { container } = render(<App />);

    const badge = await waitFor(() => {
      const found = container.querySelector<HTMLElement>(
        `.schedule-shift-badge[data-shift-id="${scheduleFixture.shifts[0]!.id}"]`,
      );
      expect(found).toBeTruthy();
      return found!;
    });
    fireEvent.click(badge);
    await waitFor(() => expect(badge.getAttribute("data-focused")).toBe("true"));

    fireEvent.click(
      await screen.findByRole("button", {
        name: `Remove job filter ${scheduleFixture.jobs[0]!.name}`,
      }),
    );
    await waitFor(() => expect(window.location.search).not.toContain("jobs="));
    const after = container.querySelector<HTMLElement>(
      `.schedule-shift-badge[data-shift-id="${scheduleFixture.shifts[0]!.id}"]`,
    );
    expect(after?.getAttribute("data-focused")).toBe("false");
  });

  it("keeps the unassigned shifts row out of view mode and its settings passive, without hiding scheduled employees (BL-681)", async () => {
    const unassignedModel = {
      ...scheduleFixture,
      employees: [
        ...scheduleFixture.employees,
        {
          ...scheduleFixture.employees[0]!,
          id: "55555555-5555-4555-8555-555555555556",
          employee_code: "NF-002",
          display_name: "Bailey Chen",
        },
      ],
      shifts: [
        ...scheduleFixture.shifts,
        {
          ...scheduleFixture.shifts[0]!,
          id: "77777777-7777-4777-8777-777777777778",
          employee_id: null,
          scheduled_date: "2026-08-18",
        },
      ],
    };
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock.mockReset();
    readModelMock.mockImplementation((_, date) =>
      Promise.resolve(
        date === "2026-08-27" ? unassignedModel : scheduleFixture,
      ),
    );
    window.history.pushState({}, "", "/app/schedule?date=2026-08-27");
    testAuth.role = "owner";
    const { container } = render(<App />);

    const unassignedRow = () =>
      container.querySelector(".schedule-employee-cell[data-unassigned='true']");
    // KARARLAR Schedule 2026-10-05: view mode shows no open shifts row, even
    // with an open shift in the week; the row belongs to editing. Bailey is
    // only in this week's model, so the week with the open shift is on screen.
    expect((await screen.findAllByText("Bailey Chen")).length).toBeGreaterThan(0);
    expect(unassignedRow()).toBeNull();
    const viewOnlyBadge = container.querySelector<HTMLElement>(
      `.schedule-shift-badge[data-shift-id="${scheduleFixture.shifts[0]!.id}"]`,
    );
    expect(viewOnlyBadge).toBeTruthy();
    fireEvent.click(viewOnlyBadge!);
    expect(viewOnlyBadge!.getAttribute("data-focused")).toBe("true");
    expect(viewOnlyBadge!.getAttribute("aria-pressed")).toBe("false");
    expect(window.location.search).toContain(
      `shiftTypes=${scheduleFixture.shift_types[0]!.id}`,
    );
    expect(window.location.search).toContain(
      `jobs=${scheduleFixture.jobs[0]!.id}`,
    );
    fireEvent.click(viewOnlyBadge!);
    await waitFor(() =>
      expect(window.location.search).not.toContain("shiftTypes="),
    );
    expect(viewOnlyBadge!.getAttribute("data-focused")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    // KARARLAR > Schedule: the Unassigned Shifts Row settings only work while
    // editing (BL-332); in view mode they are passive and the row stays as is.
    const unfreeze = screen.getByRole("button", {
      name: "Unfreeze Unassigned Shifts Row",
    });
    expect(unfreeze.getAttribute("aria-disabled")).toBe("true");
    expect(
      screen.getByRole("button", { name: "Hide Unassigned Shifts Row" }).getAttribute("aria-disabled"),
    ).toBe("true");
    fireEvent.click(unfreeze);
    expect(unassignedRow()).toBeNull();
    expect(screen.getAllByText("Alex Rivera").length).toBeGreaterThan(0);
    const employeeRowLabels = () =>
      Array.from(
        container.querySelectorAll(".schedule-employee-cell strong"),
        (item) => item.textContent,
      );
    expect(employeeRowLabels()).toContain("Bailey Chen");
    fireEvent.click(screen.getByRole("button", { name: "Hide Unscheduled" }));

    expect(
      await screen.findByRole("button", { name: "Show Unscheduled" }),
    ).toBeTruthy();
    expect(employeeRowLabels()).not.toContain("Bailey Chen");
    expect(unassignedRow()).toBeNull();
    expect(screen.getAllByText("Alex Rivera").length).toBeGreaterThan(0);
    readModelMock.mockResolvedValue(scheduleFixture);
  });

  it("opens an employee drawer without dismissing day view or active filters", async () => {
    const query = new URLSearchParams({
      date: "2026-08-17",
      view: "day",
      locations: scheduleFixture.locations[0]!.id,
      shiftTypes: scheduleFixture.shift_types[0]!.id,
      jobs: scheduleFixture.jobs[0]!.id,
      employees: scheduleFixture.employees[0]!.id,
      hideUnscheduled: "true",
      layout: "unified",
    });
    window.history.pushState({}, "", `/app/schedule?${query.toString()}`);
    testAuth.role = "owner";
    const { container } = render(<App />);

    const trigger = await waitFor(() => {
      const candidate = container.querySelector<HTMLElement>(
        '[data-schedule-employee-card-trigger="true"]',
      );
      expect(candidate).toBeTruthy();
      return candidate;
    });
    expect(trigger).toBeTruthy();
    const searchBeforeClick = window.location.search;

    fireEvent.pointerDown(trigger!);
    fireEvent.click(trigger!);

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(window.location.search).toBe(searchBeforeClick);
  });

  // The row's header mode for several open shifts ("2 open shifts") is
  // ScheduleEmployeeCard's; on the page the row is an editing row (BL-681).
  it("shows a published week's open shifts in no Unassigned row in view mode (BL-681)", async () => {
    vi.mocked(getScheduleReadModel).mockResolvedValue({
      ...scheduleFixture,
      shifts: [
        ...scheduleFixture.shifts,
        {
          ...scheduleFixture.shifts[0]!,
          id: "77777777-7777-4777-8777-777777777781",
          employee_id: null,
          scheduled_date: "2026-08-18",
        },
        {
          ...scheduleFixture.shifts[0]!,
          id: "77777777-7777-4777-8777-777777777782",
          employee_id: null,
          scheduled_date: "2026-08-19",
        },
      ],
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-28");
    const { container } = render(<App />);
    await signInAs("owner");

    expect((await screen.findAllByText("Alex Rivera")).length).toBeGreaterThan(0);
    expect(
      container.querySelector(".schedule-employee-cell[data-unassigned='true']"),
    ).toBeNull();
    expect(screen.queryByText("2 open shifts")).toBeNull();
    vi.mocked(getScheduleReadModel).mockResolvedValue(scheduleFixture);
  });

  it("reviews soft publication findings and submits recorded confirmations", async () => {
    const draft = {
      id: "99999999-9999-4999-8999-999999999999",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Service week",
      revision: 2,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const publishEmployees = Array.from({ length: 15 }, (_, index) => ({
      ...scheduleFixture.employees[0]!,
      id: `55555555-5555-4555-8555-${String(600 + index).padStart(12, "0")}`,
      employee_code: `NF-${String(600 + index).padStart(3, "0")}`,
      display_name: `Employee ${String(index + 1).padStart(2, "0")}`,
    }));
    const affectedEmployeeIds = publishEmployees.map((employee) => employee.id);
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock.mockResolvedValue({
      ...scheduleFixtureForWeek("2026-10-19"),
      employees: publishEmployees,
    });
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([draft]));
    vi.mocked(previewSchedulePublication).mockResolvedValue({
      status: "override_required",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      fingerprint: "a".repeat(64),
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          active_publication_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          active_version: 1,
          current_shift_count: 1,
          next_shift_count: 1,
          added: 0,
          updated: 1,
          removed: 0,
          unchanged: 0,
          changed_since_start: null,
          affected_employee_ids: affectedEmployeeIds,
        },
      ],
      findings: [
        {
          id: "closed-location-finding",
          code: "closed_location",
          severity: "soft",
          overrideable: true,
          message: "Main Dining is closed during this shift.",
          location_id: scheduleFixture.locations[0]!.id,
          employee_id: affectedEmployeeIds[0]!,
          scheduled_date: scheduleFixture.week_start,
          shift_ids: [scheduleFixture.shifts[0]!.id],
        },
      ],
    });
    vi.mocked(publishScheduleDraft).mockResolvedValueOnce({
      status: "published",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      location_ids: [scheduleFixture.locations[0]!.id],
      publication_ids: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      published_shift_count: 1,
      published_at: "2026-08-17T12:05:00Z",
    });

    window.history.pushState({}, "", "/app/schedule?date=2026-10-19");
    const { container } = render(<App />);
    await signInAs("owner");
    fireEvent.click(
      within(
        await screen.findByRole("complementary", { name: "Application sidebar" }, { timeout: 5000 }),
      ).getByRole("link", { name: "Schedule" }),
    );
    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "Published" },
        { timeout: 5000 },
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Publish another draft" }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: "Select locations to publish",
      }),
    ).toBeTruthy();
    expect(
      container.querySelector(
        ".schedule-publication-steps span[data-active='true']",
      )?.textContent,
    ).toContain("Locations");
    await clickReadyButton(screen, "Next");
    expect((await screen.findAllByText("1 shift needs a fix before you can publish.")).length).toBeGreaterThan(0);
    expect(
      container.querySelector(
        ".schedule-publication-steps span[data-active='true']",
      )?.textContent,
    ).toContain("Pre-flight");
    expect(
      screen.getAllByText(
        "Every override is recorded with the published audit trail.",
      ).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByText("Warnings to review")).toBeTruthy();
    expect(screen.getByText("2026-08-17 · Main Dining")).toBeTruthy();
    // Soft findings are confirmed from the recap without a reason form.
    expect(screen.queryByRole("textbox", { name: "Reason" })).toBeNull();
    await clickReadyButton(screen, "Publish 1 location");

    await waitFor(() =>
      expect(publishScheduleDraft).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        expect.objectContaining({ fingerprint: "a".repeat(64) }),
        [
          {
            finding_id: "closed-location-finding",
          },
        ],
        {
          fingerprint: "a".repeat(64),
          decisions: [
            {
              finding_id: "closed-location-finding",
            },
          ],
        },
        {},
      ),
    );
    expect(
      await screen.findByText("Schedule published"),
    ).toBeTruthy();
    expect(screen.getByText("1 location and 1 change published.")).toBeTruthy();
    readModelMock.mockResolvedValue(scheduleFixture);
  });

  // BL-705 (KARARLAR Schedule: "Save as template" is on the draft screen too).
  it("saves the draft on screen as a template from New Schedule ▾ → Templates → Save template", async () => {
    const draft = {
      id: "99999999-9999-4999-8999-999999999990",
      workspace_id: scheduleFixture.workspace_id,
      week_start: "2026-10-26",
      name: "Holiday week",
      revision: 1,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const other = { ...draft, id: "99999999-9999-4999-8999-999999999991", name: "Plan B" };
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock.mockResolvedValue(scheduleFixtureForWeek("2026-10-26"));
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([other, draft]));
    window.history.pushState({}, "", `/app/schedule?date=2026-10-26&draft=${draft.id}`);
    render(<App />);
    await signInAs("owner");

    fireEvent.click(
      await screen.findByRole("button", { name: "Draft selector: Holiday week" }, { timeout: 5000 }),
    );
    fireEvent.click(await screen.findByRole("tab", { name: /^Templates/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Save template" }));

    const form = await screen.findByRole("region", { name: "Save a draft as a template" });
    expect(
      (within(form).getByRole("combobox", { name: "Draft" }) as HTMLSelectElement).value,
    ).toBe(draft.id);
    readModelMock.mockResolvedValue(scheduleFixture);
  });

  // BL-311: the toast counts in the singular ("1 location").
  it("returns to the live schedule after publishing a draft preview", async () => {
    const toastText = "1 location and 0 changes published.";
    const draft = {
      id: "99999999-9999-4999-8999-999999999997",
      workspace_id: scheduleFixture.workspace_id,
      week_start: "2026-10-26",
      name: "Ready publish week",
      revision: 1,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const readModelMock = vi.mocked(getScheduleReadModel);
    const unpublishedFixture = {
      ...scheduleFixtureForWeek("2026-10-26"),
      locations: scheduleFixture.locations.map((location) => ({
        ...location,
        publication_status: "unpublished" as const,
      })),
    };
    readModelMock.mockResolvedValue(unpublishedFixture);
    vi.mocked(fetchSchedulePublicationStatus).mockResolvedValue({
      week_start: draft.week_start,
      week_end: "2026-11-01",
      week_start_day: "monday",
      schedule_deadline_day: "sunday",
      is_anchor_only: false,
      locations: [
        {
          id: scheduleFixture.locations[0]!.id,
          name: scheduleFixture.locations[0]!.name,
          color: "#2563EB",
          timezone: "America/Los_Angeles",
          status: "unpublished",
          reason: "missing_publication",
          publication_includes_location: false,
          published_shift_count: 0,
          draft_shift_count: 0,
          published_at: null,
          published_by_name: null,
          source_draft_id: null,
          source_draft_name: null,
        },
      ],
    });
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([draft]));
    vi.mocked(previewSchedulePublication).mockResolvedValue({
      status: "publish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: draft.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      fingerprint: "c".repeat(64),
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          active_publication_id: null,
          active_version: null,
          current_shift_count: 0,
          next_shift_count: 0,
          added: 0,
          updated: 0,
          removed: 0,
          unchanged: 0,
          changed_since_start: null,
          affected_employee_ids: [],
        },
      ],
      findings: [],
    });
    vi.mocked(publishScheduleDraft).mockResolvedValueOnce({
      status: "published",
      workspace_id: scheduleFixture.workspace_id,
      week_start: draft.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      location_ids: [scheduleFixture.locations[0]!.id],
      publication_ids: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc"],
      // BL-614: the server counts every published shift; the toast counts changes.
      published_shift_count: 12,
      published_at: "2026-08-17T12:05:00Z",
    });

    window.history.pushState(
      {},
      "",
      `/app/schedule?date=2026-10-26&draft=${draft.id}`,
    );
    render(<App />);
    await signInAs("owner");
    expect(
      await screen.findByRole(
        "button",
        { name: "Draft selector: Ready publish week" },
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    expect(window.location.search).toContain(`draft=${draft.id}`);
    const publish = await screen.findByRole("button", { name: "Publish" }, { timeout: 5000 });
    // BL-308: with a draft open Publish is a plain button with nothing to explain.
    expect(publish.getAttribute("aria-disabled")).toBeNull();
    expect(publish.getAttribute("aria-describedby")).toBeNull();
    fireEvent.click(publish);
    const publishDialog = await screen.findByRole("dialog", {
      name: "Select locations to publish",
    });
    await clickReadyButton(within(publishDialog), "Next");
    fireEvent.click(
      within(publishDialog).getByRole("button", { name: "Publish 1 location" }),
    );

    expect(
      await screen.findByText(toastText),
    ).toBeTruthy();
    await waitFor(() => expect(window.location.search).not.toContain("draft="));
  }, 15_000);

  it("says a past week cannot be unpublished in its own words (BL-395)", async () => {
    const weekStart = "2026-11-16";
    vi.mocked(getScheduleReadModel).mockResolvedValue(scheduleFixtureForWeek(weekStart));
    vi.mocked(previewScheduleUnpublish).mockResolvedValueOnce({
      status: "past_week_closed",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      locations: [{
        location_id: scheduleFixture.locations[0]!.id,
        location_name: scheduleFixture.locations[0]!.name,
        publication_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        version: 1,
        shift_count: 1,
      }],
      fingerprint: "f".repeat(64),
    });
    window.history.pushState({}, "", `/app/schedule?date=${weekStart}`);
    testAuth.role = "owner";
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Draft selector: New Schedule" }, { timeout: 5000 }));
    fireEvent.click(screen.getByRole("button", { name: "Unpublish schedule" }));
    const dialog = await screen.findByRole("dialog", { name: "Unpublish schedule" });
    fireEvent.click(within(dialog).getByLabelText(/Main Dining/));
    fireEvent.click(within(dialog).getByRole("button", { name: "Unpublish 1 location" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm unpublish" }));

    expect(await within(dialog).findByText("Past schedule weeks cannot be unpublished.")).toBeTruthy();
    expect(unpublishSchedule).not.toHaveBeenCalled();
  });

  it("reopens the returned draft preview after unpublishing the live schedule", async () => {
    const weekStart = "2026-11-16";
    const draft = {
      id: "99999999-9999-4999-8999-999999999995",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      name: "Plan A",
      revision: 2,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const liveFixture = scheduleFixtureForWeek(weekStart);
    const unpublishedFixture = {
      ...liveFixture,
      locations: liveFixture.locations.map((location) => ({
        ...location,
        publication_status: "unpublished" as const,
        published_at: null,
      })),
      shifts: [],
    };
    const draftShift = {
      ...scheduleFixture.shifts[0]!,
      id: "66666666-6666-4666-8666-666666666995",
      scheduled_date: weekStart,
      start_time: "10:00",
      end_time: "14:00",
      revision: 2,
    };
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock
      .mockResolvedValueOnce(liveFixture)
      .mockResolvedValue(unpublishedFixture);
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([draft]));
    vi.mocked(fetchScheduleDraftShifts).mockResolvedValue({
      shifts: [draftShift],
    });
    vi.mocked(previewScheduleUnpublish).mockResolvedValueOnce({
      status: "unpublish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          publication_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          version: 1,
          shift_count: 1,
        },
      ],
      fingerprint: "f".repeat(64),
    });
    vi.mocked(unpublishSchedule).mockResolvedValueOnce({
      status: "unpublished",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      location_ids: [scheduleFixture.locations[0]!.id],
      publication_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      unpublished_at: "2026-08-17T12:05:00Z",
    });

    window.history.pushState({}, "", `/app/schedule?date=${weekStart}`);
    testAuth.role = "owner";
    const { container } = render(<App />);

    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "Draft selector: New Schedule" },
        { timeout: 5000 },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Unpublish schedule" }));
    const unpublishDialog = await screen.findByRole("dialog", {
      name: "Unpublish schedule",
    });
    fireEvent.click(within(unpublishDialog).getByLabelText(/Main Dining/));
    fireEvent.click(
      within(unpublishDialog).getByRole("button", {
        name: "Unpublish 1 location",
      }),
    );
    // BL-306: the first click only arms the button.
    expect(previewScheduleUnpublish).not.toHaveBeenCalled();
    fireEvent.click(
      within(unpublishDialog).getByRole("button", {
        name: "Confirm unpublish",
      }),
    );

    await waitFor(() =>
      expect(unpublishSchedule).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        expect.objectContaining({
          fingerprint: "f".repeat(64),
        }),
      ),
    );
    expect(
      await screen.findByText("1 location unpublished."),
    ).toBeTruthy();
    await waitFor(() =>
      expect(window.location.search).toContain(`draft=${draft.id}`),
    );
    expect(
      await screen.findByRole("button", { name: "Draft selector: Plan A" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(fetchScheduleDraftShifts).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        weekStart,
        draft.id,
        [scheduleFixture.locations[0]!.id],
      ),
    );
    await waitFor(() =>
      expect(
        container.querySelector(".schedule-shift-badge")?.textContent,
      ).toContain("10:00 AM - 2:00 PM"),
    );
  }, 15_000);

  it("shows a plain sentence and Retry when the schedule cannot be read, never the raw error (BL-193)", async () => {
    const raw =
      '[{"code":"invalid_type","path":["shifts",0,"conflict_severity"],"message":"Required"}]';
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getScheduleReadModel).mockRejectedValueOnce(new Error(raw));
    window.history.pushState({}, "", "/app/schedule");
    testAuth.role = "owner";
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "We couldn't load Schedule" }, { timeout: 5000 }),
    ).toBeTruthy();
    expect(screen.queryByText(/invalid_type/)).toBeNull();
    expect(consoleError).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole(
        "button",
        { name: "Draft selector: New Schedule" },
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "We couldn't load Schedule" })).toBeNull();
    consoleError.mockRestore();
  });

  it("says a plain sentence when Templates cannot open, never the raw error (BL-395)", async () => {
    const raw = '[{"code":"invalid_type","path":["templates",0,"name"],"message":"Required"}]';
    vi.mocked(listScheduleTemplates).mockRejectedValueOnce(new Error(raw));
    window.history.pushState({}, "", "/app/schedule");
    testAuth.role = "owner";
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Draft selector: New Schedule" }, { timeout: 5000 }));
    fireEvent.click(await screen.findByRole("tab", { name: /^Templates/ }));

    // The tab says it, with Try again, not "No templates yet" (S18).
    const heading = await screen.findByRole("heading", { name: "We couldn't load templates" });
    expect(
      within(heading.closest("[role='alert']") as HTMLElement).getByRole("button", { name: "Try again" }),
    ).toBeTruthy();
    expect(screen.queryByText(/No templates yet/)).toBeNull();
    expect(screen.queryByText(/invalid_type/)).toBeNull();
  });

  // BL-392: a week that cannot be read must not trap the manager on it.
  it("keeps week navigation when the schedule cannot be read, and opens the week it is sent to", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getScheduleReadModel).mockRejectedValueOnce(new Error("boom"));
    window.history.pushState({}, "", "/app/schedule?date=2026-09-09");
    testAuth.role = "owner";
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "We couldn't load Schedule" }, { timeout: 5000 }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next week" })).toBeTruthy();
    // The label comes from the address, not from the week that failed to load:
    // the week's first day, Monday while its settings are unread (BL-451); the
    // button is called what it says (BL-449) and is amber off this week (BL-457).
    const weekButton = screen.getByRole("button", { name: "Week of Sep 7, 2026" });
    expect(weekButton.getAttribute("data-return-cue")).toBe("true");
    const reads = vi.mocked(getScheduleReadModel).mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));

    await waitFor(() => expect(window.location.search).toContain("date=2026-09-02"));
    await waitFor(() =>
      expect(vi.mocked(getScheduleReadModel).mock.calls.length).toBeGreaterThan(reads),
    );
    expect(
      await screen.findByRole(
        "button",
        { name: "Draft selector: New Schedule" },
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "We couldn't load Schedule" })).toBeNull();
    consoleError.mockRestore();
  });

  it("jumps back to this week from the error state with the middle button", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getScheduleReadModel).mockRejectedValueOnce(new Error("boom"));
    window.history.pushState({}, "", "/app/schedule?date=2026-09-09");
    testAuth.role = "owner";
    render(<App />);
    await screen.findByRole("heading", { name: "We couldn't load Schedule" }, { timeout: 5000 });

    fireEvent.click(screen.getByRole("button", { name: "Week of Sep 7, 2026" }));

    const today = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    await waitFor(() => expect(window.location.search).toContain(`date=${today}`));
    expect(window.location.search).toContain("view=week");
    consoleError.mockRestore();
  });

  it("says in the grid's place when a draft's shifts cannot load, and retries (BL-324)", async () => {
    const weekStart = "2026-11-16";
    const draft = {
      id: "99999999-9999-4999-8999-999999999994",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      name: "Plan B",
      revision: 2,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const draftShift = {
      ...scheduleFixture.shifts[0]!,
      id: "66666666-6666-4666-8666-666666666994",
      scheduled_date: weekStart,
      start_time: "10:00",
      end_time: "14:00",
      revision: 2,
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getScheduleReadModel).mockResolvedValue(
      scheduleFixtureForWeek(weekStart),
    );
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([draft]));
    vi.mocked(fetchScheduleDraftShifts)
      .mockRejectedValueOnce(
        new ScheduleRequestError('relation "x" does not exist', 500, {
          error: 'relation "x" does not exist',
        }),
      )
      .mockResolvedValue({ shifts: [draftShift] });
    window.history.pushState(
      {},
      "",
      `/app/schedule?date=${weekStart}&draft=${draft.id}`,
    );
    testAuth.role = "owner";
    const { container } = render(<App />);

    const heading = await screen.findByRole(
      "heading",
      { name: "We couldn't load this draft" },
      { timeout: 5000 },
    );
    expect(screen.queryByText(/does not exist/)).toBeNull();
    // An unread draft is not an empty one: no grid until its shifts arrive.
    expect(container.querySelector(".schedule-shift-badge")).toBeNull();
    fireEvent.click(
      within(heading.closest("[role='alert']") as HTMLElement).getByRole("button", {
        name: "Try again",
      }),
    );

    await waitFor(() =>
      expect(
        container.querySelector(".schedule-shift-badge")?.textContent,
      ).toContain("10:00 AM - 2:00 PM"),
    );
    expect(
      screen.queryByRole("heading", { name: "We couldn't load this draft" }),
    ).toBeNull();
    consoleError.mockRestore();
  }, 15_000);

  it("keeps the last shifts with a refresh line when the week's read fails after an unpublish", async () => {
    const weekStart = "2026-11-16";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getScheduleReadModel).mockImplementation(async () => {
      if (vi.mocked(unpublishSchedule).mock.calls.length) {
        throw new ScheduleRequestError('relation "x" does not exist', 500, {
          error: 'relation "x" does not exist',
        });
      }
      return scheduleFixtureForWeek(weekStart);
    });
    vi.mocked(previewScheduleUnpublish).mockResolvedValueOnce({
      status: "unpublish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          publication_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
          version: 1,
          shift_count: 1,
        },
      ],
      fingerprint: "e".repeat(64),
    });
    vi.mocked(unpublishSchedule).mockResolvedValueOnce({
      status: "unpublished",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      location_ids: [scheduleFixture.locations[0]!.id],
      publication_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab"],
      unpublished_at: "2026-08-17T12:05:00Z",
    });
    window.history.pushState({}, "", `/app/schedule?date=${weekStart}`);
    testAuth.role = "owner";
    const { container } = render(<App />);

    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "Draft selector: New Schedule" },
        { timeout: 5000 },
      ),
    );
    const shiftsBefore = container.querySelectorAll(".schedule-shift-badge").length;
    expect(shiftsBefore).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Unpublish schedule" }));
    const unpublishDialog = await screen.findByRole("dialog", {
      name: "Unpublish schedule",
    });
    fireEvent.click(within(unpublishDialog).getByLabelText(/Main Dining/));
    fireEvent.click(
      within(unpublishDialog).getByRole("button", {
        name: "Unpublish 1 location",
      }),
    );
    fireEvent.click(
      within(unpublishDialog).getByRole("button", {
        name: "Confirm unpublish",
      }),
    );

    expect(
      await screen.findByText(
        "This week's schedule didn't refresh. These are the last shifts that loaded.",
        {},
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    // The grid stays; the page never drops to the error card.
    expect(screen.queryByRole("heading", { name: "We couldn't load Schedule" })).toBeNull();
    expect(container.querySelectorAll(".schedule-shift-badge").length).toBe(shiftsBefore);
    expect(screen.queryByText(/does not exist/)).toBeNull();
    consoleError.mockRestore();
  }, 15_000);

  it("shows the no-access card, not the last shifts, when a refresh is refused", async () => {
    const weekStart = "2026-11-16";
    vi.mocked(getScheduleReadModel).mockImplementation(async () => {
      if (vi.mocked(unpublishSchedule).mock.calls.length) {
        throw new ScheduleRequestError("Forbidden by authz.out_of_scope", 403, {
          reason: "authz.out_of_scope",
        });
      }
      return scheduleFixtureForWeek(weekStart);
    });
    vi.mocked(previewScheduleUnpublish).mockResolvedValueOnce({
      status: "unpublish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          publication_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
          version: 1,
          shift_count: 1,
        },
      ],
      fingerprint: "e".repeat(64),
    });
    vi.mocked(unpublishSchedule).mockResolvedValueOnce({
      status: "unpublished",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      location_ids: [scheduleFixture.locations[0]!.id],
      publication_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab"],
      unpublished_at: "2026-08-17T12:05:00Z",
    });
    window.history.pushState({}, "", `/app/schedule?date=${weekStart}`);
    testAuth.role = "owner";
    const { container } = render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Draft selector: New Schedule" }, { timeout: 5000 }),
    );
    expect(container.querySelectorAll(".schedule-shift-badge").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Unpublish schedule" }));
    const unpublishDialog = await screen.findByRole("dialog", { name: "Unpublish schedule" });
    fireEvent.click(within(unpublishDialog).getByLabelText(/Main Dining/));
    fireEvent.click(within(unpublishDialog).getByRole("button", { name: "Unpublish 1 location" }));
    fireEvent.click(within(unpublishDialog).getByRole("button", { name: "Confirm unpublish" }));

    expect(
      await screen.findByRole(
        "heading",
        { name: "You don't have access to Schedule" },
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    expect(container.querySelector(".schedule-shift-badge")).toBeNull();
    expect(
      screen.queryByText("This week's schedule didn't refresh. These are the last shifts that loaded."),
    ).toBeNull();
    expect(screen.queryByText(/authz\./)).toBeNull();
  }, 15_000);

  it("shows the error card, not last week's shifts, when the next week cannot be read", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getScheduleReadModel).mockImplementation(async (_workspaceId, date) => {
      if (date === "2026-09-16") throw new Error("boom");
      return scheduleFixtureForWeek("2026-09-07");
    });
    window.history.pushState({}, "", "/app/schedule?date=2026-09-09");
    testAuth.role = "owner";
    const { container } = render(<App />);
    await screen.findByRole("button", { name: "Draft selector: New Schedule" }, { timeout: 5000 });

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));

    expect(
      await screen.findByRole("heading", { name: "We couldn't load Schedule" }, { timeout: 5000 }),
    ).toBeTruthy();
    expect(container.querySelector(".schedule-shift-badge")).toBeNull();
    expect(
      screen.queryByText("This week's schedule didn't refresh. These are the last shifts that loaded."),
    ).toBeNull();
    consoleError.mockRestore();
  }, 15_000);

  it("shows the week in grey, not an empty draft, while a draft's shifts load", async () => {
    const weekStart = "2026-11-16";
    const draft = {
      id: "99999999-9999-4999-8999-999999999995",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      name: "Plan D",
      revision: 2,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    vi.mocked(getScheduleReadModel).mockResolvedValue(
      scheduleFixtureForWeek(weekStart),
    );
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([draft]));
    vi.mocked(fetchScheduleDraftShifts).mockImplementation(
      () => new Promise(() => {}),
    );
    window.history.pushState(
      {},
      "",
      `/app/schedule?date=${weekStart}&draft=${draft.id}`,
    );
    testAuth.role = "owner";
    const { container } = render(<App />);

    expect(
      await screen.findByText("Loading Schedule", {}, { timeout: 5000 }),
    ).toBeTruthy();
    expect(container.querySelector(".schedule-shift-badge")).toBeNull();
  }, 15_000);

  it("keeps a failed drafts refresh on menu open in the console, not as an unhandled rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new ScheduleRequestError("permission denied for table schedule_drafts", 500, {
      error: "permission denied for table schedule_drafts",
    });
    let failDraftList = false;
    vi.mocked(listScheduleDrafts).mockImplementation(async () => {
      if (failDraftList) throw failure;
      return draftList([]);
    });
    window.history.pushState({}, "", "/app/schedule");
    testAuth.role = "owner";
    render(<App />);

    const trigger = await screen.findByRole(
      "button",
      { name: "Draft selector: New Schedule" },
      { timeout: 5000 },
    );
    failDraftList = true;
    fireEvent.click(trigger);

    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(failure));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unhandled).not.toHaveBeenCalled();
    expect(screen.queryByText(/permission denied/)).toBeNull();
    process.off("unhandledRejection", unhandled);
    consoleError.mockRestore();
  });

  // Starting takes two requests; the window stays open and says so until the
  // edit is held, instead of closing on a screen that shows nothing.
  it("keeps New Schedule open with Starting… until the blank schedule is ready", async () => {
    const weekStart = "2026-11-16";
    vi.mocked(getScheduleReadModel).mockResolvedValue(scheduleFixtureForWeek(weekStart));
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([]));
    let release: (() => void) | null = null;
    vi.mocked(acquireScheduleEditSession).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(makeDefaultEditAcquireResult());
        }),
    );
    window.history.pushState({}, "", `/app/schedule?date=${weekStart}`);
    testAuth.role = "owner";
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Draft selector: New Schedule" }, { timeout: 5000 }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Blank schedule" }));

    const starting = await screen.findByRole("button", { name: "Starting…" });
    expect((starting as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(release).not.toBeNull());
    expect(screen.getByRole("dialog", { name: /^Schedules for/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Starting…" })).toBeTruthy();

    await act(async () => {
      release!();
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Schedules for/ })).toBeNull());
    expect(screen.queryByRole("button", { name: "Starting…" })).toBeNull();
  }, 15_000);

  it("says plainly when drafts cannot load before a new or edited draft, never unhandled (BL-394)", async () => {
    const weekStart = "2026-11-16";
    const draft = {
      id: "99999999-9999-4999-8999-999999999992",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      name: "Plan D",
      revision: 1,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new ScheduleRequestError("permission denied for table schedule_drafts", 500, {
      error: "permission denied for table schedule_drafts",
    });
    let failDraftList = false;
    vi.mocked(getScheduleReadModel).mockResolvedValue(
      scheduleFixtureForWeek(weekStart),
    );
    vi.mocked(listScheduleDrafts).mockImplementation(async () => {
      if (failDraftList) throw failure;
      return draftList([draft]);
    });
    const acquireMock = vi.mocked(acquireScheduleEditSession);
    acquireMock.mockClear();
    window.history.pushState({}, "", `/app/schedule?date=${weekStart}`);
    testAuth.role = "owner";
    render(<App />);

    const trigger = await screen.findByRole(
      "button",
      { name: "Draft selector: New Schedule" },
      { timeout: 5000 },
    );
    failDraftList = true;
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "Blank schedule" }));

    const notice = "The drafts didn't load, so editing didn't start. Nothing was changed.";
    expect(await screen.findByText(notice)).toBeTruthy();
    expect(screen.queryByText("Drafts could not be loaded. Try again.")).toBeNull();

    fireEvent.click(
      await screen.findByRole("button", { name: "Draft selector: New Schedule" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit Plan D" }));

    expect(await screen.findByText(notice)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(acquireMock).not.toHaveBeenCalled();

    // Try again repeats the last ask (edit Plan D) once the drafts read works.
    failDraftList = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(acquireMock).toHaveBeenCalled());
    expect(acquireMock.mock.calls[0]).toContain(draft.id);
    await waitFor(() => expect(screen.queryByText(notice)).toBeNull());
    expect(unhandled).not.toHaveBeenCalled();
    expect(screen.queryByText(/permission denied/)).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(failure);
    process.off("unhandledRejection", unhandled);
    consoleError.mockRestore();
  }, 15_000);

  it("drops the unread-drafts line when the week changes, so Try again never edits another week", async () => {
    const weekStart = "2026-11-16";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let failDraftList = false;
    vi.mocked(getScheduleReadModel).mockImplementation(async (_workspaceId, date) =>
      scheduleFixtureForWeek(String(date) >= "2026-11-23" ? "2026-11-23" : weekStart),
    );
    vi.mocked(listScheduleDrafts).mockImplementation(async () => {
      if (failDraftList) throw new Error("drafts unavailable");
      return draftList([]);
    });
    window.history.pushState({}, "", `/app/schedule?date=${weekStart}`);
    testAuth.role = "owner";
    render(<App />);

    const trigger = await screen.findByRole(
      "button",
      { name: "Draft selector: New Schedule" },
      { timeout: 5000 },
    );
    failDraftList = true;
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "Blank schedule" }));
    const notice = "The drafts didn't load, so editing didn't start. Nothing was changed.";
    expect(await screen.findByText(notice)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    await waitFor(() => expect(screen.queryByText(notice)).toBeNull());
    consoleError.mockRestore();
  }, 15_000);

  it("keeps a drafts read that fails after the week changed off the new week", async () => {
    const weekStart = "2026-11-16";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getScheduleReadModel).mockImplementation(async (_workspaceId, date) =>
      scheduleFixtureForWeek(String(date) >= "2026-11-23" ? "2026-11-23" : weekStart),
    );
    let failDraftList = false;
    let rejectHeld: ((error: Error) => void) | null = null;
    let holdNext = false;
    vi.mocked(listScheduleDrafts).mockImplementation(async () => {
      if (holdNext) {
        holdNext = false;
        return new Promise((_resolve, reject) => {
          rejectHeld = reject;
        });
      }
      if (failDraftList) throw new Error("drafts unavailable");
      return draftList([]);
    });
    window.history.pushState({}, "", `/app/schedule?date=${weekStart}`);
    testAuth.role = "owner";
    render(<App />);

    const trigger = await screen.findByRole(
      "button",
      { name: "Draft selector: New Schedule" },
      { timeout: 5000 },
    );
    failDraftList = true;
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "Blank schedule" }));
    const notice = "The drafts didn't load, so editing didn't start. Nothing was changed.";
    expect(await screen.findByText(notice)).toBeTruthy();

    holdNext = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(rejectHeld).not.toBeNull());
    failDraftList = false;
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    await waitFor(() => expect(screen.queryByText(notice)).toBeNull());
    await act(async () => {
      rejectHeld!(new Error("drafts unavailable"));
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(notice)).toBeNull();
    consoleError.mockRestore();
  }, 15_000);

  it("says it plainly, with no Try again, when the drafts read is refused", async () => {
    const weekStart = "2026-11-16";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getScheduleReadModel).mockResolvedValue(scheduleFixtureForWeek(weekStart));
    let refuse = false;
    vi.mocked(listScheduleDrafts).mockImplementation(async () => {
      if (refuse) {
        throw new ScheduleRequestError("permission denied", 403, {
          error: "permission denied",
          reason: "authz.denied",
        });
      }
      return draftList([]);
    });
    window.history.pushState({}, "", `/app/schedule?date=${weekStart}`);
    testAuth.role = "owner";
    render(<App />);

    const trigger = await screen.findByRole(
      "button",
      { name: "Draft selector: New Schedule" },
      { timeout: 5000 },
    );
    refuse = true;
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "Blank schedule" }));
    expect(
      await screen.findByText("You don't have access to edit this schedule."),
    ).toBeTruthy();
    expect(
      screen.queryByText("The drafts didn't load, so editing didn't start. Nothing was changed."),
    ).toBeNull();
    expect(screen.queryByText(/permission denied/)).toBeNull();
    consoleError.mockRestore();
  }, 15_000);

  it("says plainly when the page cannot refresh after an unpublish, never the raw error", async () => {
    const weekStart = "2026-11-16";
    const draft = {
      id: "99999999-9999-4999-8999-999999999993",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      name: "Plan C",
      revision: 2,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getScheduleReadModel).mockResolvedValue(
      scheduleFixtureForWeek(weekStart),
    );
    vi.mocked(listScheduleDrafts).mockImplementation(async () => {
      if (vi.mocked(unpublishSchedule).mock.calls.length) {
        throw new ScheduleRequestError(
          "permission denied for table schedule_drafts",
          500,
          { error: "permission denied for table schedule_drafts" },
        );
      }
      return draftList([draft]);
    });
    vi.mocked(previewScheduleUnpublish).mockResolvedValueOnce({
      status: "unpublish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          publication_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
          version: 1,
          shift_count: 1,
        },
      ],
      fingerprint: "e".repeat(64),
    });
    vi.mocked(unpublishSchedule).mockResolvedValueOnce({
      status: "unpublished",
      workspace_id: scheduleFixture.workspace_id,
      week_start: weekStart,
      location_ids: [scheduleFixture.locations[0]!.id],
      publication_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab"],
      unpublished_at: "2026-08-17T12:05:00Z",
    });
    window.history.pushState({}, "", `/app/schedule?date=${weekStart}`);
    testAuth.role = "owner";
    render(<App />);

    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "Draft selector: New Schedule" },
        { timeout: 5000 },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Unpublish schedule" }));
    const unpublishDialog = await screen.findByRole("dialog", {
      name: "Unpublish schedule",
    });
    fireEvent.click(within(unpublishDialog).getByLabelText(/Main Dining/));
    fireEvent.click(
      within(unpublishDialog).getByRole("button", {
        name: "Unpublish 1 location",
      }),
    );
    fireEvent.click(
      within(unpublishDialog).getByRole("button", {
        name: "Confirm unpublish",
      }),
    );

    expect(
      await screen.findByText(
        "Schedule unpublished, but this page could not refresh. Reload to see the latest schedule.",
        {},
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/permission denied/)).toBeNull();
    consoleError.mockRestore();
  }, 15_000);

  it("keeps a failed publication status read out of unhandled rejections (BL-391)", async () => {
    const draft = {
      id: "99999999-9999-4999-8999-999999999992", workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start, name: "Status down week", revision: 1,
      created_by: "88888888-8888-4888-8888-888888888888", updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z", updated_at: "2026-08-17T12:00:00Z",
    };
    vi.mocked(getScheduleReadModel).mockResolvedValue(scheduleFixtureForWeek("2026-10-26"));
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([draft]));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      window.history.pushState({}, "", "/app/schedule?date=2026-10-26");
      render(<App />);
      await signInAs("owner");
      const published = await screen.findByRole("button", { name: "Published" });
      vi.mocked(fetchSchedulePublicationStatus).mockRejectedValue(new Error("status down"));
      fireEvent.click(published);
      fireEvent.click(screen.getByRole("button", { name: "Publish another draft" }));
      await waitFor(() => expect(fetchSchedulePublicationStatus).toHaveBeenCalledTimes(2));
      await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 20)); });
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("records confirmation when publishing schedule risks", async () => {
    const draft = {
      id: "99999999-9999-4999-8999-999999999998",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Risk review week",
      revision: 3,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock.mockResolvedValue(scheduleFixtureForWeek("2026-10-26"));
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([draft]));
    vi.mocked(previewSchedulePublication).mockResolvedValue({
      status: "publish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      fingerprint: "b".repeat(64),
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          active_publication_id: null,
          active_version: null,
          current_shift_count: 0,
          next_shift_count: 1,
          added: 1,
          updated: 0,
          removed: 0,
          unchanged: 0,
          changed_since_start: null,
          affected_employee_ids: [scheduleFixture.employees[0]!.id],
        },
      ],
      findings: [
        {
          id: "risk-advance-notice",
          code: "availability",
          severity: "soft",
          overrideable: true,
          message: "Alex Rivera has limited advance notice.",
          location_id: scheduleFixture.locations[0]!.id,
          employee_id: scheduleFixture.employees[0]!.id,
          scheduled_date: scheduleFixture.week_start,
          shift_ids: [scheduleFixture.shifts[0]!.id],
          tier: "risk",
          projected: true,
          fix_hint: "Confirm the employee can still cover the shift.",
        },
      ],
    } as unknown as Awaited<ReturnType<typeof previewSchedulePublication>>);
    vi.mocked(publishScheduleDraft).mockResolvedValueOnce({
      status: "published",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      location_ids: [scheduleFixture.locations[0]!.id],
      publication_ids: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc"],
      published_shift_count: 1,
      published_at: "2026-08-17T12:05:00Z",
    });

    window.history.pushState({}, "", "/app/schedule?date=2026-10-26");
    render(<App />);
    await signInAs("owner");
    fireEvent.click(await screen.findByRole("button", { name: "Published" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Publish another draft" }),
    );
    await clickReadyButton(screen, "Next");

    expect(await screen.findByText("Risks")).toBeTruthy();
    expect(screen.getAllByText("1 shift to review before you publish.").length).toBeGreaterThan(0);
    expect(screen.getByText("Projected")).toBeTruthy();
    expect(
      screen.getByText("Confirm the employee can still cover the shift."),
    ).toBeTruthy();
    // Risks are confirmed from the recap; there is no extra checkbox.
    expect(within(screen.getByRole("dialog")).queryByRole("checkbox")).toBeNull();
    const publishButton = screen.getByRole("button", {
      name: "Publish 1 location",
    });
    expect(publishButton).toHaveProperty("disabled", false);
    fireEvent.click(publishButton);

    await waitFor(() =>
      expect(publishScheduleDraft).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        expect.objectContaining({ fingerprint: "b".repeat(64) }),
        [
          {
            finding_id: "risk-advance-notice",
          },
        ],
        {
          fingerprint: "b".repeat(64),
          decisions: [
            {
              finding_id: "risk-advance-notice",
            },
          ],
        },
        {},
      ),
    );
    readModelMock.mockResolvedValue(scheduleFixture);
  }, 15_000);

  it("returns to preflight review when publish reports a stale preflight", async () => {
    const draft = {
      id: "99999999-9999-4999-8999-999999999997",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Stale preflight week",
      revision: 4,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock.mockResolvedValue(scheduleFixtureForWeek("2026-11-02"));
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([draft]));
    vi.mocked(previewSchedulePublication).mockResolvedValue({
      status: "publish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      fingerprint: "c".repeat(64),
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          active_publication_id: null,
          active_version: null,
          current_shift_count: 0,
          next_shift_count: 1,
          added: 1,
          updated: 0,
          removed: 0,
          unchanged: 0,
          changed_since_start: null,
          affected_employee_ids: [scheduleFixture.employees[0]!.id],
        },
      ],
      findings: [],
    });
    const stalePreview = {
      status: "override_required" as const,
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      fingerprint: "d".repeat(64),
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          active_publication_id: null,
          active_version: null,
          current_shift_count: 0,
          next_shift_count: 1,
          added: 1,
          updated: 0,
          removed: 0,
          unchanged: 0,
          changed_since_start: null,
          affected_employee_ids: [scheduleFixture.employees[0]!.id],
        },
      ],
      findings: [
        {
          id: "stale-availability-finding",
          code: "availability" as const,
          severity: "soft" as const,
          overrideable: true,
          message: "Alex Rivera is outside availability after a fresh check.",
          location_id: scheduleFixture.locations[0]!.id,
          employee_id: scheduleFixture.employees[0]!.id,
          scheduled_date: scheduleFixture.week_start,
          shift_ids: [scheduleFixture.shifts[0]!.id],
        },
      ],
    };
    vi.mocked(publishScheduleDraft)
      .mockRejectedValueOnce(
        new ScheduleRequestError("preflight review required", 409, {
          status: "preflight",
          preflight: stalePreview,
          preflight_block_reason: "stale_fingerprint",
        }),
      )
      .mockResolvedValueOnce({
        status: "published",
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        draft_id: draft.id,
        draft_revision: draft.revision,
        location_ids: [scheduleFixture.locations[0]!.id],
        publication_ids: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd"],
        published_shift_count: 1,
        published_at: "2026-08-17T12:05:00Z",
      });

    window.history.pushState({}, "", "/app/schedule?date=2026-11-02");
    const { container } = render(<App />);
    await signInAs("owner");
    fireEvent.click(await screen.findByRole("button", { name: "Published" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Publish another draft" }),
    );
    await clickReadyButton(screen, "Next");
    await clickReadyButton(screen, "Publish 1 location");

    expect(
      await screen.findByText(
        "The schedule changed while this dialog was open. The findings below are refreshed — review them again.",
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        ".schedule-publication-steps span[data-active='true']",
      )?.textContent,
    ).toContain("Pre-flight");
    await clickReadyButton(screen, "Publish 1 location");

    await waitFor(() =>
      expect(publishScheduleDraft).toHaveBeenLastCalledWith(
        scheduleFixture.workspace_id,
        expect.objectContaining({ fingerprint: "d".repeat(64) }),
        [
          {
            finding_id: "stale-availability-finding",
          },
        ],
        {
          fingerprint: "d".repeat(64),
          decisions: [
            {
              finding_id: "stale-availability-finding",
            },
          ],
        },
        {},
      ),
    );
    readModelMock.mockResolvedValue(scheduleFixture);
  });

  it("blocks publish review when publish reports schedule conflicts", async () => {
    const draft = {
      id: "99999999-9999-4999-8999-999999999996",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      name: "Conflict publish week",
      revision: 5,
      created_by: "88888888-8888-4888-8888-888888888888",
      updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z",
      updated_at: "2026-08-17T12:00:00Z",
    };
    const readModelMock = vi.mocked(getScheduleReadModel);
    readModelMock.mockResolvedValue(scheduleFixtureForWeek("2026-11-09"));
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([draft]));
    vi.mocked(previewSchedulePublication).mockResolvedValue({
      status: "publish_ready",
      workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start,
      draft_id: draft.id,
      draft_revision: draft.revision,
      fingerprint: "e".repeat(64),
      locations: [
        {
          location_id: scheduleFixture.locations[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          active_publication_id: null,
          active_version: null,
          current_shift_count: 0,
          next_shift_count: 1,
          added: 1,
          updated: 0,
          removed: 0,
          unchanged: 0,
          changed_since_start: null,
          affected_employee_ids: [scheduleFixture.employees[0]!.id],
        },
      ],
      findings: [],
    });
    vi.mocked(publishScheduleDraft).mockRejectedValueOnce(
      new ScheduleRequestError("schedule conflicts", 409, {
        status: "schedule_conflicts",
        schedule_conflicts: [
          {
            employee_id: scheduleFixture.employees[0]!.id,
            employee_name: scheduleFixture.employees[0]!.display_name,
            date: scheduleFixture.week_start,
            reason: "time_overlap",
            first: {
              shift_id: scheduleFixture.shifts[0]!.id,
              location_id: scheduleFixture.locations[0]!.id,
              location_name: scheduleFixture.locations[0]!.name,
              time_range: "4:00 PM - 7:00 PM",
              shift_type: "Dinner",
            },
            second: {
              shift_id: "66666666-6666-4666-8666-666666666667",
              location_id: scheduleFixture.locations[0]!.id,
              location_name: scheduleFixture.locations[0]!.name,
              time_range: "6:00 PM - 10:00 PM",
              shift_type: "Dinner",
            },
            introduced: true,
          },
        ],
      }),
    );

    window.history.pushState({}, "", "/app/schedule?date=2026-11-09");
    const { container } = render(<App />);
    await signInAs("owner");
    fireEvent.click(await screen.findByRole("button", { name: "Published" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Publish another draft" }),
    );
    await clickReadyButton(screen, "Next");
    await clickReadyButton(screen, "Publish 1 location");

    expect(
      await screen.findByText(
        "Schedule conflicts must be fixed before publishing",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Alex Rivera: 2026-08-17, 4:00 PM - 7:00 PM and 6:00 PM - 10:00 PM",
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        ".schedule-publication-steps span[data-active='true']",
      )?.textContent,
    ).toContain("Locations");
    expect(screen.getByText("1 conflict must be fixed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty(
      "disabled",
      true,
    );

    const drawerPanel = document.createElement("div");
    drawerPanel.setAttribute("data-employee-drawer-panel", "true");
    document.body.appendChild(drawerPanel);
    fireEvent.pointerDown(drawerPanel);
    expect(
      screen.getByRole("dialog", { name: "Select locations to publish" }),
    ).toBeTruthy();
    drawerPanel.remove();

    readModelMock.mockResolvedValue(scheduleFixture);
  });

  it("downloads the active Export v2 preview after server authorization without the legacy engine", async () => {
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    render(<App />);
    await signInAs("owner");
    await openNewScheduleTab("Export");
    const panel = await screen.findByRole("region", { name: "Export settings" });
    await clickReadyButton(within(panel), "Download PDF");
    await waitFor(() => expect(downloadExportFile).toHaveBeenCalledOnce());
    expect(authorizeScheduleExportV2).toHaveBeenCalledTimes(2);
    expect(renderExportFiles).toHaveBeenCalledWith(expect.objectContaining({
      weekStart: scheduleFixture.week_start, source: { kind: "published" },
      filename: "MAIN_2026-08-17_2026-08-23",
      shifts: expect.arrayContaining([expect.objectContaining({ id: scheduleFixture.shifts[0]!.id })]),
    }), expect.objectContaining({ format: "pdf", destination: "download" }));
    expect(screen.getByRole("region", { name: "Export settings" })).toBeTruthy();
  });

  // Mert 2026-10-12: Export never asks for a save; while editing it exports the grid as it is now.
  it("opens Export straight from an open edit, exports it unsaved and keeps editing", async () => {
    // The unsaved change is on the server as the edit's own pending step, as in the browser:
    // Export takes it as part of the grid, it does not wait for it to be saved.
    const changed = makeDefaultEditAcquireResult().session.shifts[0]!;
    vi.mocked(acquireScheduleEditSession).mockResolvedValue(unsavedEdit());
    vi.mocked(fetchPendingOps).mockResolvedValue({ pending_ops: [{
      id: changed.id, location_id: changed.location_id, week_start: scheduleFixture.week_start, op_type: "update",
      target_shift_id: changed.id, target_draft_id: null, payload: { note: "Not saved yet" },
      created_by: "88888888-8888-4888-8888-888888888888", created_at: "2026-08-17T12:00:00Z", updated_at: "2026-08-17T12:01:00Z",
    }] });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    await openNewScheduleTab("Export");
    const panel = await screen.findByRole("region", { name: "Export settings" });
    expect(screen.queryByRole("dialog", { name: "Save draft" })).toBeNull();
    await waitFor(() => expect(within(panel).getByText("Editing · not saved")).toBeTruthy());
    await clickReadyButton(within(panel), "Download PDF");
    await waitFor(() => expect(downloadExportFile).toHaveBeenCalledOnce());
    const session = makeDefaultEditAcquireResult().session;
    expect(authorizeScheduleExportV2).toHaveBeenCalledWith(scheduleFixture.workspace_id,
      expect.objectContaining({ source: { kind: "edit_session", id: session.id, revision: session.revision } }), expect.anything());
    expect(saveScheduleDraft).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
    expect(window.location.search).toContain("mode=edit");
  });

  it("exports a shift added in the open edit once, with its real id (S18)", async () => {
    // The added shift is a row of the edit; the server also lists it as the edit's pending "create".
    const acquired = unsavedEdit();
    const base = acquired.session.shifts[0]!;
    const added = { ...base, id: "abababab-abab-4bab-8bab-abababababab", scheduled_date: "2026-08-18", pending_op_type: "create" as const };
    vi.mocked(acquireScheduleEditSession).mockResolvedValue({ ...acquired, session: { ...acquired.session, shifts: [...acquired.session.shifts, added] } });
    vi.mocked(fetchPendingOps).mockResolvedValue({ pending_ops: [{
      id: added.id, location_id: added.location_id, week_start: scheduleFixture.week_start, op_type: "create",
      target_shift_id: null, target_draft_id: null,
      payload: { location_id: added.location_id, employee_id: added.employee_id, job_id: added.job_id, shift_type_id: added.shift_type_id,
        scheduled_date: added.scheduled_date, start_time: added.start_time, end_time: added.end_time },
      created_by: "88888888-8888-4888-8888-888888888888", created_at: "2026-08-17T12:00:00Z", updated_at: "2026-08-17T12:01:00Z",
    }] });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    await waitFor(() => expect(fetchPendingOps).toHaveBeenCalled());
    await openNewScheduleTab("Export");
    const panel = await screen.findByRole("region", { name: "Export settings" });
    await clickReadyButton(within(panel), "Download PDF");
    await waitFor(() => expect(downloadExportFile).toHaveBeenCalledOnce());
    const exported = vi.mocked(renderExportFiles).mock.calls.at(-1)![0].shifts.map((shift) => shift.id);
    expect(exported.filter((id) => id === added.id)).toHaveLength(1);
    expect(exported.some((id) => id.startsWith("pending:"))).toBe(false);
    const scope = vi.mocked(authorizeScheduleExportV2).mock.calls.at(-1)![1];
    expect(scope.shift_ids).toContain(added.id);
    expect(scope.shift_ids.some((id) => id.startsWith("pending:"))).toBe(false);
  });

  // Mert 2026-10-12: Export has no source choice; it takes the schedule on screen, picked in Schedules first.
  it("exports the draft on screen, picked in the Schedules tab before Export opens", async () => {
    const draft = { id: "99999999-9999-4999-8999-999999999996", workspace_id: scheduleFixture.workspace_id,
      week_start: scheduleFixture.week_start, name: "Alternate export draft", revision: 2,
      created_by: "88888888-8888-4888-8888-888888888888", updated_by: "88888888-8888-4888-8888-888888888888",
      created_at: "2026-08-17T12:00:00Z", updated_at: "2026-08-17T12:00:00Z" };
    vi.mocked(listScheduleDrafts).mockResolvedValue(draftList([draft]));
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17"); render(<App />);
    await signInAs("owner");
    const windowRoot = await openNewScheduleTab("Schedules");
    const row = (await within(windowRoot).findByText(draft.name)).closest("[data-draft-row]");
    if (!row) throw new Error("Draft row missing"); fireEvent.click(row);
    await screen.findByRole("button", { name: `Draft selector: ${draft.name}` });
    await openNewScheduleTab("Export");
    const panel = await screen.findByRole("region", { name: "Export settings" });
    await waitFor(() => expect(within(panel).getByText(`Draft · ${draft.name}`)).toBeTruthy());
    expect(within(panel).queryByRole("radio", { name: /Published/ })).toBeNull();
    fireEvent.click(within(panel).getByRole("radio", { name: /^Excel/ }));
    await clickReadyButton(within(panel), "Download Excel");
    await waitFor(() => expect(renderExportFiles).toHaveBeenCalledWith(expect.objectContaining({ source: { kind: "draft", id: draft.id, revision: 2, name: draft.name } }), expect.objectContaining({ format: "xlsx" })));
  });

  it("keeps the edit open after a failed Save draft", async () => {
    vi.mocked(saveScheduleDraft).mockRejectedValueOnce(new Error("Network dropped"));
    vi.mocked(acquireScheduleEditSession).mockResolvedValue(unsavedEdit());
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17"); render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor(); await openSaveDraftWindow();
    const dialog = await screen.findByRole("dialog", { name: "Save draft" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Draft name" }), { target: { value: "Failed draft" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft" }));
    await screen.findByRole("dialog", { name: "Schedule save failed" });
    expect(window.location.search).toContain("mode=edit");
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
  });

  // BL-1052: the Save draft window closes on a stale edit, so the banner's Reload is in reach.
  it("closes the Save draft window and asks for a reload when another tab moved the edit on", async () => {
    vi.mocked(saveScheduleDraft).mockRejectedValueOnce(new ScheduleRequestError("session revision stale", 409, {
      error: "session revision stale", code: "edit_session_stale",
    }));
    vi.mocked(acquireScheduleEditSession).mockResolvedValue(unsavedEdit());
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17"); render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor(); await openSaveDraftWindow();
    const dialog = await screen.findByRole("dialog", { name: "Save draft" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Draft name" }), { target: { value: "Stale draft" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft" }));
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert.textContent).toContain(
      "This schedule changed in another tab or window. Reload the page, then make the change again.",
    ));
    expect(within(alert).getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Save draft" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Schedule save failed" })).toBeNull();
    expect(screen.queryByText(/session revision stale/i)).toBeNull();
  });

  it.each(["network", "retroactive"] as const)("ignores a late %s Save draft error after the edit session expires", async kind => {
    let rejectSave!: (error: Error) => void;
    vi.mocked(saveScheduleDraft).mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject; }));
    vi.mocked(acquireScheduleEditSession).mockResolvedValue(unsavedEdit());
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17"); render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor(); await openSaveDraftWindow();
    const dialog = await screen.findByRole("dialog", { name: "Save draft" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Draft name" }), { target: { value: "Expired draft" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saveScheduleDraft).toHaveBeenCalledOnce());
    expect(exportSaveIdleHarness.expire).toBeTypeOf("function");
    await act(async () => { exportSaveIdleHarness.expire!(); });
    expect(window.location.search).not.toContain("mode=edit");
    expect(screen.queryByRole("dialog", { name: "Save draft" })).toBeNull();
    await act(async () => rejectSave(kind === "network" ? new Error("Late failed save") :
      new ScheduleRequestError("Late retroactive edit", 409, {
        status: "past_shift_edit_requires_ack", past_edits: [{ op_type: "update", shift_id: scheduleFixture.shifts[0]!.id,
          scheduled_date: "2026-08-17", location_name: "Main Dining", employee_name: "Alex Rivera", reason: "shift_started", severity: "warning" }],
        past_edit_messages: ["Late retroactive edit"],
      })));
    expect(screen.queryByRole("dialog", { name: "Schedule save failed" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "This changes shifts that already ran" })).toBeNull();
    expect(saveScheduleDraft).toHaveBeenCalledOnce();
  });

  it("does not let an expired save unlock or replace a newer pending save", async () => {
    let rejectOld!: (error: Error) => void, rejectNew!: (error: Error) => void;
    vi.mocked(saveScheduleDraft)
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }))
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectNew = reject; }));
    vi.mocked(acquireScheduleEditSession).mockResolvedValue(unsavedEdit());
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17"); render(<App />);
    await signInAs("owner");
    for (const name of ["Expired draft", "Current draft"]) {
      // The fixture deliberately resumes the same session id/revision: an old
      // operation must still be stale after the intervening preview state.
      await openPublishedScheduleEditor(); await openSaveDraftWindow();
      const dialog = await screen.findByRole("dialog", { name: "Save draft" });
      fireEvent.change(within(dialog).getByRole("textbox", { name: "Draft name" }), { target: { value: name } });
      await clickReadyButton(within(dialog), "Save draft");
      if (name === "Expired draft") await act(async () => { exportSaveIdleHarness.expire!(); });
    }
    await waitFor(() => expect(saveScheduleDraft).toHaveBeenCalledTimes(2));
    await act(async () => rejectOld(new Error("Expired request error")));
    const currentDialog = screen.getByRole("dialog", { name: "Save draft" });
    expect(within(currentDialog).getByRole("textbox", { name: "Draft name" })).toHaveProperty("value", "Current draft");
    expect(within(currentDialog).getByRole("button", { name: "Saving…" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("dialog", { name: "Schedule save failed" })).toBeNull();
    await act(async () => rejectNew(new Error("Current request error")));
    expect(screen.getByRole("dialog", { name: "Schedule save failed" })).toBeTruthy();
    expect(screen.queryByText("Expired request error")).toBeNull();
  });

  it("lands manager sign-ins on Home by default", async () => {
    window.history.pushState({}, "", "/sign-in");
    render(<App />);

    await signInAs("manager");

    await waitFor(() =>
      expect(window.location.pathname).toBe("/app/workspace"),
    );
    expect(
      await screen.findByRole("heading", { name: /, Development\.$/ }),
    ).toBeTruthy();
  });

  it(
    "keeps Account Workspaces on the switcher after manager sign-in",
    async () => {
      window.history.pushState({}, "", "/account/workspaces");
      render(<App />);

      await signInAs("manager");

      await waitFor(() =>
        expect(window.location.pathname).toBe("/account/workspaces"),
      );
      expect(
        await screen.findByRole("heading", { name: "Workspaces" }),
      ).toBeTruthy();
      expect(
        await screen.findByRole("button", { name: "Open Meyhouse" }),
      ).toBeTruthy();
    },
    15000,
  );

  it("opens the default-hours review from the schedule edit toolbar", async () => {
    window.history.pushState({}, "", "/app/schedule");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    fireEvent.click(
      await screen.findByRole("button", { name: "Review default hours" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Review current default hours" }),
    ).toBeTruthy();
  });

  it("reviews and applies deterministic auto-fill assignments", async () => {
    const preview = {
      status: "review_ready" as const,
      workspace_id: scheduleFixture.workspace_id,
      session_id: "77777777-7777-4777-8777-777777777777",
      session_revision: 1,
      fingerprint: "f".repeat(64),
      proposals: [
        {
          shift_id: scheduleFixture.shifts[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          job_name: scheduleFixture.jobs[0]!.name,
          scheduled_date: scheduleFixture.week_start,
          start_time: "16:00",
          end_time: "22:00",
          recommended_employee_id: scheduleFixture.employees[0]!.id,
          candidates: [
            {
              employee_id: scheduleFixture.employees[0]!.id,
              employee_name: scheduleFixture.employees[0]!.display_name,
              scheduled_minutes: 360,
              primary_job: true,
              reasons: ["Primary job"],
            },
          ],
        },
      ],
      unfilled: [],
    };
    vi.mocked(previewScheduleAutoFill).mockResolvedValueOnce(preview);
    vi.mocked(applyScheduleAutoFill).mockImplementationOnce(
      (_workspaceId, session) =>
        Promise.resolve({
          status: "applied",
          applied: [
            {
              shift_id: scheduleFixture.shifts[0]!.id,
              employee_id: scheduleFixture.employees[0]!.id,
            },
          ],
          rejected: [],
          session,
        }),
    );
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired",
      session: {
        id: preview.session_id,
        workspace_id: scheduleFixture.workspace_id,
        week_start: scheduleFixture.week_start,
        source_kind: "published",
        source_draft_id: null,
        source_revision: 1,
        holder_user_id: "88888888-8888-4888-8888-888888888888",
        location_ids: ["11111111-1111-4111-8111-111111111111"],
        holder_name: "Development Owner",
        revision: 1,
        dirty: false,
        last_heartbeat: "2026-08-17T12:00:00Z",
        expires_at: "2026-08-17T12:04:00Z",
        shifts: scheduleFixture.shifts.map((shift) => ({
          ...shift,
          employee_id: null,
          unpaid_break_minutes: 30,
          revision: 1,
        })),
      },
    });
    window.history.pushState({}, "", "/app/schedule");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /Auto-fill/ }));
    expect(
      await screen.findByRole("dialog", { name: "Review auto-fill" }),
    ).toBeTruthy();
    expect(screen.getByText("Primary job")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: `Reject ${scheduleFixture.jobs[0]!.name} on Mon, Aug 17`,
      }),
    );
    expect(
      screen.getByRole("button", {
        name: `Undo reject ${scheduleFixture.jobs[0]!.name} on Mon, Aug 17`,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Apply 0 assignments" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(
      screen.getByRole("button", {
        name: `Undo reject ${scheduleFixture.jobs[0]!.name} on Mon, Aug 17`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apply 1 assignment" }),
    );

    await waitFor(() =>
      expect(applyScheduleAutoFill).toHaveBeenCalledWith(
        scheduleFixture.workspace_id,
        expect.objectContaining({
          id: preview.session_id,
          revision: preview.session_revision,
        }),
        preview,
        [
          {
            shift_id: scheduleFixture.shifts[0]!.id,
            employee_id: scheduleFixture.employees[0]!.id,
          },
        ],
      ),
    );
    expect(await screen.findByText("Applied 1 shift.")).toBeTruthy();
  });

  // BL-975: the lock lapsed while the review was open (the laptop slept); Apply
  // picks the same edit back up and goes through, with no raw lock text.
  it("picks the edit back up when the lock lapsed before auto-fill is applied", async () => {
    const acquired = makeDefaultEditAcquireResult();
    const preview = {
      status: "review_ready" as const,
      workspace_id: scheduleFixture.workspace_id,
      session_id: acquired.session.id,
      session_revision: acquired.session.revision,
      fingerprint: "f".repeat(64),
      proposals: [
        {
          shift_id: scheduleFixture.shifts[0]!.id,
          location_name: scheduleFixture.locations[0]!.name,
          job_name: scheduleFixture.jobs[0]!.name,
          scheduled_date: scheduleFixture.week_start,
          start_time: "16:00",
          end_time: "22:00",
          recommended_employee_id: scheduleFixture.employees[0]!.id,
          candidates: [
            {
              employee_id: scheduleFixture.employees[0]!.id,
              employee_name: scheduleFixture.employees[0]!.display_name,
              scheduled_minutes: 360,
              primary_job: true,
              reasons: ["Primary job"],
            },
          ],
        },
      ],
      unfilled: [],
    };
    const lapsed = () => new ScheduleRequestError("edit lease expired", 409, {
      error: "edit lease expired", code: "edit_lease_expired",
    });
    vi.mocked(previewScheduleAutoFill).mockRejectedValueOnce(lapsed()).mockResolvedValueOnce(preview);
    vi.mocked(applyScheduleAutoFill)
      .mockRejectedValueOnce(lapsed())
      .mockImplementationOnce((_workspaceId, session) =>
        Promise.resolve({
          status: "applied",
          applied: [{ shift_id: scheduleFixture.shifts[0]!.id, employee_id: scheduleFixture.employees[0]!.id }],
          rejected: [],
          session,
        }),
      );
    vi.mocked(acquireScheduleEditSession)
      .mockResolvedValueOnce(acquired)
      .mockResolvedValueOnce({ ...acquired, status: "resumed" })
      .mockResolvedValueOnce({ ...acquired, status: "resumed" });
    window.history.pushState({}, "", "/app/schedule");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    fireEvent.click(await screen.findByRole("button", { name: /Auto-fill/ }));
    expect(await screen.findByRole("dialog", { name: "Review auto-fill" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply 1 assignment" }));

    expect(await screen.findByText("Applied 1 shift.")).toBeTruthy();
    expect(applyScheduleAutoFill).toHaveBeenCalledTimes(2);
    expect(acquireScheduleEditSession).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(/edit lease expired/)).toBeNull();
  });

  // BL-975 (review): applying a template after the lock lapsed picks the same
  // edit back up and applies once more.
  it("picks the edit back up when the lock lapsed before a template is applied", async () => {
    const acquired = makeDefaultEditAcquireResult();
    const template = {
      id: "99999999-9999-4999-8999-999999999980",
      workspace_id: scheduleFixture.workspace_id,
      name: "Base week",
      revision: 1,
      shift_count: 1,
      open_slot_count: 0,
      created_by_name: "Development Owner",
      updated_at: "2026-08-17T12:00:00Z",
    };
    vi.mocked(listScheduleTemplates).mockResolvedValue({ templates: [template] });
    vi.mocked(applyScheduleTemplate)
      .mockRejectedValueOnce(new ScheduleRequestError("edit lease expired", 409, {
        error: "edit lease expired", code: "edit_lease_expired",
      }))
      .mockImplementationOnce(async (_workspaceId, session) => ({
        session, applied_count: 1, skipped: [],
      }) as never);
    vi.mocked(acquireScheduleEditSession)
      .mockResolvedValueOnce(acquired)
      .mockResolvedValueOnce({ ...acquired, status: "resumed" });
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    const dialog = await openNewScheduleTab("Templates");
    fireEvent.click(await within(dialog).findByRole("button", { name: "Use template Base week" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /^(Add to current shifts|Apply template)$/ }));

    await waitFor(() => expect(applyScheduleTemplate).toHaveBeenCalledTimes(2));
    expect(acquireScheduleEditSession).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Schedules for / })).toBeNull());
    expect(screen.queryByText(/edit lease expired/)).toBeNull();
  });

  // KK-162 (BL-694): Replace's first click shows the database's count of what
  // goes, not the number of shifts in the edit.
  it("asks the server how many shifts a template replace removes", async () => {
    const template = {
      id: "99999999-9999-4999-8999-999999999981",
      workspace_id: scheduleFixture.workspace_id,
      name: "Lunch week",
      revision: 1,
      shift_count: 1,
      open_slot_count: 0,
      created_by_name: "Development Owner",
      updated_at: "2026-08-17T12:00:00Z",
    };
    vi.mocked(listScheduleTemplates).mockResolvedValue({ templates: [template] });
    vi.mocked(previewScheduleTemplateApply).mockResolvedValue({ removed_shift_count: 7 });
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce(makeDefaultEditAcquireResult());
    window.history.pushState({}, "", "/app/schedule?date=2026-08-17");
    render(<App />);
    await signInAs("owner");
    await openPublishedScheduleEditor();
    const dialog = await openNewScheduleTab("Templates");
    fireEvent.click(await within(dialog).findByRole("button", { name: "Use template Lunch week" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace current shifts" }));

    expect(await within(dialog).findByText("7 shifts will be removed. Draft only, not published.")).toBeTruthy();
    const [workspaceId, sessionId, templateId, departmentKeys] =
      vi.mocked(previewScheduleTemplateApply).mock.calls.at(-1)!;
    expect([workspaceId, templateId, departmentKeys]).toEqual([
      scheduleFixture.workspace_id,
      template.id,
      null,
    ]);
    expect(sessionId).toBe(makeDefaultEditAcquireResult().session.id);
    expect(within(dialog).getByRole("button", { name: "Confirm replace" })).toBeTruthy();
  });

  it("keeps organization settings unavailable to managers", async () => {
    window.history.pushState({}, "", "/app/settings/general");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeTruthy();
    await signInAs("manager");

    // The card in place, not a silent trip home (Mert 2026-10-14).
    expect(
      await screen.findByRole("heading", { name: "You don't have access to Settings" }),
    ).toBeTruthy();
    expect(window.location.pathname).toBe("/app/settings/general");
    expect(
      screen.getByRole("link", { name: "Back to Home" }).getAttribute("href"),
    ).toBe("/app/workspace");
    expect(screen.queryByRole("navigation", { name: "Workspace settings" })).toBeNull();
    expect(sidebar().getByRole("link", { name: "Employees" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Settings", hidden: true })).toBeNull();
  });

  it("shows employee-only users the no-access card at the manager Schedule route", async () => {
    window.history.pushState({}, "", "/app/schedule");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeTruthy();
    await signInAs("employee");

    // The card in place, not a silent trip home (Mert 2026-10-14).
    expect(
      await screen.findByRole("heading", { name: "You don't have access to Schedule" }),
    ).toBeTruthy();
    expect(window.location.pathname).toBe("/app/schedule");
    expect(
      screen.getByRole("link", { name: "Back to Home" }).getAttribute("href"),
    ).toBe("/app/employee-hub");
    expect(screen.queryByRole("heading", { name: "Schedule" })).toBeNull();
  });

  // FB-6.2 .7b (KK-35 S4): the employee view opens for whoever the core lets
  // read their own hub, not for one role name: an owner or a manager who also
  // holds the employee access (ROL-CIFT 6.2).
  it.each(["owner", "manager"] as const)("opens the employee view for a signed-in %s who also works shifts", async (role) => {
    testAuth.employeeAccess = true;
    window.history.pushState({}, "", "/app/employee-hub");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeTruthy();
    await signInAs(role);

    await waitFor(() =>
      expect(window.location.pathname).toBe("/app/employee-hub"),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(window.location.pathname).toBe("/app/employee-hub");
  });

  // ROL-CIFT 6.2 (design §4.1): somebody who only manages has no employee
  // interface. An old link to it takes them to Workspace, never a no-access card,
  // and the menu offers no Employee view.
  it.each(["owner", "manager"] as const)("takes a %s who only manages from an employee address to Workspace", async (role) => {
    window.history.pushState({}, "", "/app/employee-hub/schedule");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    await signInAs(role);

    await waitFor(() => expect(window.location.pathname).toBe("/app/workspace"));
    expect(screen.queryByRole("heading", { name: /You don't have access/ })).toBeNull();
    expect(screen.queryByText("Employee view")).toBeNull();
  });

  // BILDIRIM-02 (KARARLAR S-123, S-96): the old notification screens are gone;
  // their addresses fall through to the landing page. Account > Notifications and
  // Settings > Notifications are back (BILDIRIM-11); /app/notifications is the
  // new list's page (BILDIRIM-10).
  it.each([
    ["owner", "/account/inbox", "/app/workspace"],
    ["employee", "/account/inbox", "/app/employee-hub"],
    ["employee", "/app/account/documents?kind=document", "/app/employee-hub"],
  ] as const)("sends a %s from the retired notification address %s to %s", async (role, address, landing) => {
    window.history.pushState({}, "", address);
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    await signInAs(role);

    await waitFor(() => expect(window.location.pathname).toBe(landing));
    expect(screen.queryByRole("heading", { name: /Notifications|Inbox/ })).toBeNull();
  });

  // MY-DOCUMENTS (Mert 2026-10-19): Account → Documents is a page of its own in
  // the app. Its old address, still in notifications, opens it in the person's
  // own interface with the same query; My documents is management's address.
  it.each([
    ["employee", "/account/documents?workspace=w&kind=acknowledgement", "/app/employee-hub/documents"],
    ["owner", "/account/documents?workspace=w&kind=acknowledgement", "/app/my-documents"],
    ["employee", "/app/my-documents?kind=acknowledgement", "/app/employee-hub/documents"],
  ] as const)("opens a %s's own documents from %s at %s", async (role, address, page) => {
    window.history.pushState({}, "", address);
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    await signInAs(role);

    await waitFor(() => expect(window.location.pathname).toBe(page));
    expect(new URLSearchParams(window.location.search).get("kind")).toBe("acknowledgement");
    expect(await screen.findByRole("heading", { level: 1, name: /Documents|My documents/ })).toBeTruthy();
  });

  // BILDIRIM-10: /app/notifications is the list's own page, behind notifications.read_own.
  it.each(["owner", "employee"] as const)("opens the notification page for a %s who may read their own list", async (role) => {
    window.history.pushState({}, "", "/app/notifications");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    await signInAs(role);

    expect(await screen.findByRole("heading", { level: 1, name: "Notifications" })).toBeTruthy();
    expect(window.location.pathname).toBe("/app/notifications");
  });

  it("takes the notification page's Settings to the person's own notification choices", async () => {
    window.history.pushState({}, "", "/app/notifications");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    await signInAs("employee");

    fireEvent.click(await screen.findByRole("link", { name: /Settings/ }));
    await waitFor(() => expect(window.location.pathname).toBe("/account/preferences/notifications"));
    // The choices page is lazy: its own heading, not the list page's, once it has loaded.
    await waitFor(() => expect(document.getElementById("notification-preferences-title")?.textContent).toContain("Notifications"), { timeout: 5000 });
    expect(document.getElementById("notifications-title")).toBeNull();
  });

  it("shows the no-access card at the notification page to someone the core does not let read their list", async () => {
    testAuth.withoutActions = ["notifications.read_own"];
    window.history.pushState({}, "", "/app/notifications");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    await signInAs("employee");

    expect(await screen.findByRole("heading", { name: "You don't have access to Notifications" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1, name: "Notifications" })).toBeNull();
    // Nor does the menu offer it.
    expect(screen.queryByRole("button", { name: /^Notifications/ })).toBeNull();
  });

  it("shows employee-only users the no-access card at the managers' Home route", async () => {
    window.history.pushState({}, "", "/app/workspace");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeTruthy();
    await signInAs("employee");

    // The card in place, not a silent trip home (Mert 2026-10-14).
    expect(
      await screen.findByRole("heading", { name: "You don't have access to Home" }),
    ).toBeTruthy();
    expect(window.location.pathname).toBe("/app/workspace");
    expect(
      screen.getByRole("link", { name: "Back to Home" }).getAttribute("href"),
    ).toBe("/app/employee-hub");
    expect(screen.queryByRole("heading", { name: /, Development\.$/ })).toBeNull();
  });
});
