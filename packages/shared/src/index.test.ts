import { describe, expect, it } from "vitest";
import {
  activeWorkspaceContextSchema,
  activeWorkspaceContextFromRow,
  accountProfileSchema,
  accountPendingInvitationSchema,
  announcementListSchema,
  appActionUrlSchema,
  canAccessWorkspace,
  departmentInputSchema,
  documentTypeInputSchema,
  employeeOnboardingSchema,
  employeeOnboardingProfileSchema,
  healthResponseSchema,
  importantDateInputSchema,
  jobInputSchema,
  locationInputSchema,
  notificationInboxSchema,
  normalizeAccountPhone,
  permissionsForRole,
  scheduleReadModelSchema,
  schedulePublishFindingSchema,
  schedulePublicationPreflightAckSchema,
  schedulePublicationOverrideInputSchema,
  schedulePublicationPreviewSchema,
  schedulePublishResultSchema,
  scheduleUnpublishResultSchema,
  scheduleShiftMutationInputSchema,
  scheduleAutoFillPreviewSchema,
  scheduleExportPreviewSchema,
  scheduleExportRequestSchema,
  schedulePendingOpPayloadSchema,
  scheduleTemplateDetailSchema,
  workspaceDashboardSchema,
  workspaceManualTodoInputSchema,
  workspaceRoleInputSchema,
  workspaceTodoSchema,
  productBoundary,
  schedulingSettingsInputSchema,
  shiftTypeInputSchema,
  signatureRetentionPolicyInputSchema,
  signatureTemplateDraftInputSchema,
} from "./index";

const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

describe("account schemas", () => {
  it("normalizes optional account phone and defaults personal formats", () => {
    expect(normalizeAccountPhone("(310) 555-0100", "1")).toBe(
      "+13105550100",
    );
    expect(normalizeAccountPhone("+44 20 7946 0958", "44")).toBe(
      "+442079460958",
    );
    expect(normalizeAccountPhone("", "1")).toBeNull();
    expect(
      accountProfileSchema.parse({
        userId,
        email: "alex@example.test",
        displayName: "Alex Kim",
        phone: "+13105550100",
        theme: "system",
      }),
    ).toMatchObject({
      phone: "+13105550100",
      avatarObjectPath: null,
      avatarUrl: null,
      timeFormat: "system",
      dateFormat: "system",
    });
  });

  it("rejects legacy phone input and an avatar path owned by another account", () => {
    expect(() =>
      accountProfileSchema.parse({
        userId,
        email: "alex@example.test",
        displayName: "Alex Kim",
        phone: "3105550100",
        avatarObjectPath:
          "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/profile/fe201916-aa0e-480b-9144-1e1c8da20a31.jpg",
        theme: "system",
      }),
    ).toThrow();
  });
});

describe("workspace communication schemas", () => {
  const announcement = {
    id: "a8200000-0000-4000-8000-000000000001",
    workspace_id: workspaceId,
    title: "Service briefing",
    body: "Doors open at four.",
    category: "operations",
    status: "published",
    audience_roles: ["employee"],
    location_ids: [],
    location_names: [],
    publish_at: null,
    published_at: "2026-09-05T12:00:00.000Z",
    expires_at: null,
    action_url: "/app/announcements/a8200000-0000-4000-8000-000000000001",
    author_name: "Taylor",
    revision: 1,
    created_at: "2026-09-05T12:00:00.000Z",
    updated_at: "2026-09-05T12:00:00.000Z",
    read_at: null,
    can_edit: false,
    can_publish: false,
    can_cancel: false,
  } as const;

  const notification = {
    id: "a8300000-0000-4000-8000-000000000001",
    workspace_id: workspaceId,
    category: "announcement",
    type_key: "communications.announcement.available",
    severity: "info",
    safe_preview: "Service briefing",
    title: "Service briefing",
    body: "Doors open at four.",
    action_url: "/app/announcements/a8200000-0000-4000-8000-000000000001",
    group_key: null,
    source_type: "announcement",
    source_id: "a8200000-0000-4000-8000-000000000001",
    created_at: "2026-09-05T12:00:00.000Z",
    seen_at: null,
    read_at: null,
    visibility_state: "visible",
  } as const;

  const todo = {
    id: "a9700000-0000-4000-8000-000000000011",
    workspace_id: workspaceId,
    title: "Follow up",
    body: "",
    severity: "info",
    status: "open",
    system_generated: false,
    source_type: "manual",
    source_id: "a9700000-0000-4000-8000-000000000012",
    source_key: "manual:a9700000-0000-4000-8000-000000000012",
    employee_id: null,
    due_at: null,
    action_url: "/app/employees",
    created_at: "2026-09-05T12:00:00.000Z",
  } as const;

  it("keeps communication action URLs app-local across projections", () => {
    expect(appActionUrlSchema.parse("/app")).toBe("/app");
    expect(appActionUrlSchema.parse("/app?tab=notifications")).toBe(
      "/app?tab=notifications",
    );
    expect(appActionUrlSchema.parse("/app/notifications#today")).toBe(
      "/app/notifications#today",
    );
    for (const actionUrl of [
      "https://outside.example/todo",
      "//outside.example/app",
      "/application/settings",
      "/welcome/profile",
    ]) {
      expect(() => appActionUrlSchema.parse(actionUrl)).toThrow(
        "Action URL must stay inside the app",
      );
    }
  });

  it("rejects unsafe announcement and notification action links", () => {
    expect(
      announcementListSchema.parse({
        workspace_id: workspaceId,
        can_manage: false,
        locations: [],
        announcements: [announcement],
      }).announcements[0]!.action_url,
    ).toBe(announcement.action_url);
    expect(
      notificationInboxSchema.parse({
        workspace_id: workspaceId,
        unread_count: 1,
        next_cursor: null,
        notifications: [notification],
      }).notifications[0]!.action_url,
    ).toBe(notification.action_url);

    expect(() =>
      announcementListSchema.parse({
        workspace_id: workspaceId,
        can_manage: false,
        locations: [],
        announcements: [
          {
            ...announcement,
            action_url: "https://outside.example/announcement",
          },
        ],
      }),
    ).toThrow("Action URL must stay inside the app");
    expect(() =>
      notificationInboxSchema.parse({
        workspace_id: workspaceId,
        unread_count: 1,
        next_cursor: null,
        notifications: [
          {
            ...notification,
            action_url: "https://outside.example/notification",
          },
        ],
      }),
    ).toThrow("Action URL must stay inside the app");
  });

  it("validates Workspace Todo projections and keeps action links app-local", () => {
    expect(workspaceTodoSchema.parse(todo).action_url).toBe("/app/employees");
    expect(() =>
      workspaceTodoSchema.parse({
        ...todo,
        action_url: "https://outside.example/todo",
      }),
    ).toThrow();
  });

  it("normalizes manual Workspace Todo input", () => {
    expect(
      workspaceManualTodoInputSchema.parse({
        title: "  Call Alex  ",
        body: "  Bring paperwork  ",
      }),
    ).toEqual({
      title: "Call Alex",
      body: "Bring paperwork",
      employee_id: null,
      due_at: null,
    });
  });

  it("accepts Workspace dashboard projections with Todos in the widget layout", () => {
    expect(
      workspaceDashboardSchema.parse({
        workspace_id: workspaceId,
        display_name: "Local Owner",
        metrics: {
          today_shift_count: 1,
          today_open_shift_count: 0,
          pending_time_off_count: 0,
          pending_shift_change_count: 0,
          unread_notification_count: 0,
        },
        announcements: [],
        notifications: [],
        todos: [todo],
        layout: {
          widget_order: [
            "operations",
            "pending_requests",
            "open_shifts",
            "announcements",
            "todos",
            "notifications",
            "quick_actions",
          ],
          hidden_widget_ids: [],
        },
      }).todos,
    ).toHaveLength(1);
  });
});

const membershipId = "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4";

describe("shared contracts", () => {
  it("accepts trimmed schedule shift conflict override notes", () => {
    const parsed = scheduleShiftMutationInputSchema.parse({
      location_id: "11111111-1111-4111-8111-111111111111",
      employee_id: "22222222-2222-4222-8222-222222222222",
      job_id: "33333333-3333-4333-8333-333333333333",
      shift_type_id: "44444444-4444-4444-8444-444444444444",
      scheduled_date: "2026-08-17",
      start_time: "16:00",
      end_time: "22:00",
      unpaid_break_minutes: 30,
      hide_time_on_badge: false,
      label_ids: [],
      label_names: [],
      note: "",
      conflict_override_note: "  Employee volunteered for closure coverage.  ",
    });

    expect(parsed.conflict_override_note).toBe(
      "Employee volunteered for closure coverage.",
    );
    expect(() =>
      scheduleShiftMutationInputSchema.parse({
        ...parsed,
        conflict_override_note: "too short",
      }),
    ).toThrow();
  });

  it("validates the current phase health response", () => {
    expect(
      healthResponseSchema.parse({
        ok: true,
        service: "newfork-api",
        phase: "phase-10",
      }),
    ).toEqual({
      ok: true,
      service: "newfork-api",
      phase: "phase-10",
    });
  });

  it("validates Schedule template, auto-fill, and schedule-only export contracts", () => {
    const template = scheduleTemplateDetailSchema.parse({
      template: {
        id: "91000000-0000-4000-8000-000000000001",
        workspace_id: workspaceId,
        name: "Standard week",
        revision: 1,
        shift_count: 1,
        open_slot_count: 1,
        created_by_name: "Local Owner",
        updated_at: "2026-08-17T12:00:00.000Z",
      },
      shifts: [
        {
          id: "92000000-0000-4000-8000-000000000001",
          location_id: "11000000-0000-4000-8000-000000000001",
          employee_id: null,
          job_id: "13000000-0000-4000-8000-000000000001",
          shift_type_id: null,
          day_offset: 2,
          start_time: "09:00",
          end_time: "17:00",
          crosses_midnight: false,
          note: "Opening",
        },
      ],
    });
    expect(template.shifts[0]?.day_offset).toBe(2);
    expect(
      scheduleAutoFillPreviewSchema.parse({
        status: "review_ready",
        workspace_id: workspaceId,
        session_id: "93000000-0000-4000-8000-000000000001",
        session_revision: 2,
        fingerprint: "a".repeat(64),
        proposals: [],
        unfilled: [],
      }).status,
    ).toBe("review_ready");
    const request = scheduleExportRequestSchema.parse({
      week_start: "2026-08-17",
      source: { type: "published" },
      location_ids: ["11000000-0000-4000-8000-000000000001"],
      settings: {
        format: "csv",
        layout: "weekly",
        locale: "tr",
        time_format: "12h",
        paper_size: "letter",
        orientation: "landscape",
        fit_mode: "fit_to_page",
        include_unassigned: true,
        include_notes: false,
        include_scheduled_hours: true,
        csv_delimiter: ",",
      },
    });
    expect(request).not.toHaveProperty("payroll");
    expect(request.settings).toMatchObject({
      paper_size: "letter",
      orientation: "landscape",
      fit_mode: "fit_to_page",
      locale: "tr",
    });
    expect(
      scheduleExportRequestSchema.parse({
        ...request,
        settings: { ...request.settings, format: "pdf" },
      }).settings.format,
    ).toBe("pdf");
    expect(
      scheduleExportRequestSchema.parse({
        ...request,
        settings: { ...request.settings, format: "xlsx" },
      }).settings.format,
    ).toBe("xlsx");
    expect(
      scheduleExportRequestSchema.parse({
        ...request,
        settings: { ...request.settings, layout: "daily_roster" },
      }).settings.layout,
    ).toBe("daily_roster");
    const exportPreview = scheduleExportPreviewSchema.parse({
      status: "export_ready",
      workspace_id: workspaceId,
      workspace_name: "North Store",
      week_start: "2026-08-17",
      source: { type: "published" },
      source_revision: 1,
      fingerprint: "a".repeat(64),
      locations: [{ id: "11000000-0000-4000-8000-000000000001", name: "Main" }],
      rows: [],
      summary: {
        shift_count: 0,
        employee_count: 0,
        scheduled_minutes: 0,
      },
      warnings: [
        {
          code: "pdf_fit_to_page_readability",
          severity: "warning",
          message: "One-page PDF exports can be hard to read.",
        },
      ],
    });
    expect(exportPreview.warnings?.[0]?.code).toBe(
      "pdf_fit_to_page_readability",
    );
  });

  it("validates canonical Schedule publication preview and override contracts", () => {
    const findingId = "availability-1234567890abcdef";
    const preview = schedulePublicationPreviewSchema.parse({
      status: "override_required",
      workspace_id: workspaceId,
      week_start: "2026-08-17",
      draft_id: "87000000-0000-4000-8000-000000000001",
      draft_revision: 2,
      fingerprint: "a".repeat(64),
      locations: [
        {
          location_id: "11000000-0000-4000-8000-000000000001",
          location_name: "Main Dining",
          active_publication_id: null,
          active_version: null,
          current_shift_count: 0,
          next_shift_count: 1,
          added: 1,
          updated: 0,
          removed: 0,
          unchanged: 0,
          changed_since_start: null,
        },
      ],
      findings: [
        {
          id: findingId,
          code: "time_off",
          severity: "soft",
          overrideable: true,
          tier: "blocker",
          projected: false,
          introduced: true,
          fix_hint: "Approve the time-off exception or reassign the shift.",
          message: "Alex is unavailable for this shift.",
          location_id: "11000000-0000-4000-8000-000000000001",
          location_name: "Main Dining",
          employee_id: "51000000-0000-4000-8000-000000000001",
          employee_name: "Alex Rivera",
          scheduled_date: "2026-08-17",
          date: "2026-08-17",
          shift_ids: ["71000000-0000-4000-8000-000000000001"],
        },
      ],
    });
    expect(preview.status).toBe("override_required");
    expect(preview.findings[0]).toMatchObject({
      code: "time_off",
      tier: "blocker",
      introduced: true,
      location_name: "Main Dining",
      employee_name: "Alex Rivera",
    });
    expect(
      schedulePublicationOverrideInputSchema.parse({ finding_id: findingId }),
    ).toEqual({ finding_id: findingId });
    expect(
      schedulePublicationPreflightAckSchema.parse({
        fingerprint: preview.fingerprint,
        decisions: [{ finding_id: findingId }],
      }),
    ).toEqual({
      fingerprint: preview.fingerprint,
      decisions: [{ finding_id: findingId }],
    });
    const published = schedulePublishResultSchema.parse({
      status: "published",
      workspace_id: workspaceId,
      week_start: "2026-08-17",
      draft_id: "85000000-0000-4000-8000-000000000001",
      draft_revision: 2,
      location_ids: ["11000000-0000-4000-8000-000000000001"],
      publication_ids: ["86000000-0000-4000-8000-000000000001"],
      published_shift_count: 4,
      notification_count: 0,
      notification_warning: {
        code: "notification_enqueue_unavailable",
        message:
          "Schedule published, but employee notifications could not be created.",
      },
      published_at: "2026-08-17T12:00:00.000Z",
    });
    expect(published.status).toBe("published");
    if (published.status !== "published") throw new Error("Expected published");
    expect(published.notification_warning?.code).toBe(
      "notification_enqueue_unavailable",
    );
    const conflictResult = schedulePublishResultSchema.parse({
      status: "schedule_conflicts",
      schedule_conflicts: [
        {
          employee_id: "51000000-0000-4000-8000-000000000001",
          employee_name: "Alex Rivera",
          date: "2026-08-17",
          reason: "time_overlap",
          first: {
            shift_id: "71000000-0000-4000-8000-000000000001",
            location_id: "11000000-0000-4000-8000-000000000001",
            location_name: "Main Dining",
            time_range: "4:00 PM - 7:00 PM",
            shift_type: "Dinner",
          },
          second: {
            shift_id: "71000000-0000-4000-8000-000000000002",
            location_id: "11000000-0000-4000-8000-000000000001",
            location_name: "Main Dining",
            time_range: "6:00 PM - 10:00 PM",
            shift_type: "Dinner",
          },
          introduced: true,
        },
        {
          employee_id: "51000000-0000-4000-8000-000000000002",
          employee_name: "Kim Nguyen",
          shift_id: "71000000-0000-4000-8000-000000000003",
          location_id: "11000000-0000-4000-8000-000000000001",
          location_name: "Main Dining",
          date: "2026-08-18",
          start_time: "10:00",
          end_time: "14:00",
          document_type_id: "72000000-0000-4000-8000-000000000001",
          requirement_id: "72000000-0000-4000-8000-000000000002",
          document_id: "72000000-0000-4000-8000-000000000003",
          document_title: "Food handler card",
          expiry_date: "2026-08-17",
          expiry_policy_version: 2,
          pending_document_id: "72000000-0000-4000-8000-000000000004",
          review_action: "review_document",
          severity: "soft",
          overrideable: true,
          warning_text: "Food handler card is expired.",
          conflict_fingerprint: "document-fingerprint",
        },
      ],
    });
    expect(conflictResult.status).toBe("schedule_conflicts");
    if (conflictResult.status !== "schedule_conflicts") {
      throw new Error("Expected schedule conflicts");
    }
    const documentConflict = conflictResult.schedule_conflicts[1];
    expect(documentConflict && "document_title" in documentConflict).toBe(true);
    if (!documentConflict || !("document_title" in documentConflict)) {
      throw new Error("Expected document conflict");
    }
    expect(documentConflict.kind).toBe("document_expiry");
    expect(
      schedulePublishResultSchema.parse({
        status: "preflight",
        preflight: preview,
        preflight_block_reason: "stale_fingerprint",
        fingerprint: preview.fingerprint,
      }).status,
    ).toBe("preflight");
    expect(
      scheduleUnpublishResultSchema.parse({
        status: "unpublished",
        workspace_id: workspaceId,
        week_start: "2026-08-17",
        location_ids: ["11000000-0000-4000-8000-000000000001"],
        publication_ids: ["86000000-0000-4000-8000-000000000001"],
        unpublished_at: "2026-08-17T12:00:00.000Z",
      }).status,
    ).toBe("unpublished");
  });

  it("validates a location-scoped published schedule read model", () => {
    const locationId = "10000000-0000-4000-8000-000000000001";
    const jobId = "20000000-0000-4000-8000-000000000001";
    const employeeId = "30000000-0000-4000-8000-000000000001";
    const labelId = "50000000-0000-4000-8000-000000000001";
    const parsed = scheduleReadModelSchema.parse({
      workspace_id: workspaceId,
      week_start: "2026-08-17",
      week_start_day: "monday",
      locations: [
        {
          id: locationId,
          name: "Main Room",
          timezone: "America/Los_Angeles",
          sort_order: 0,
          publication_status: "published",
          published_at: "2026-08-16T18:00:00.000Z",
        },
      ],
      departments: [],
      jobs: [
        {
          id: jobId,
          name: "Server",
          color: "#4478A8",
          sort_order: 0,
          department_id: null,
        },
      ],
      shift_types: [],
      shift_labels: [
        {
          id: labelId,
          name: "Training",
          color: "#A855F7",
          sort_order: 0,
          is_active: true,
        },
      ],
      employees: [
        {
          id: employeeId,
          employee_code: "E-0002",
          display_name: "Alex Kim",
          location_ids: [locationId],
          job_ids: [jobId],
        },
      ],
      shifts: [
        {
          id: "40000000-0000-4000-8000-000000000001",
          location_id: locationId,
          employee_id: employeeId,
          job_id: jobId,
          shift_type_id: null,
          scheduled_date: "2026-08-17",
          start_time: "09:00",
          end_time: "17:00",
          crosses_midnight: false,
          label_ids: [labelId],
          label_names: ["Training"],
          note: "",
          warning_codes: [],
        },
      ],
      closures: [
        {
          id: "60000000-0000-4000-8000-000000000001",
          location_id: locationId,
          closed_date: "2026-08-18",
          end_date: "2026-08-19",
          title: "Renovation",
          is_all_day: true,
          shift_type_ids: [],
        },
      ],
      important_dates: [
        {
          id: "70000000-0000-4000-8000-000000000001",
          location_id: locationId,
          title: "Anniversary",
          type: "event",
          starts_on: "2026-08-18",
          ends_on: "2026-08-18",
          recurrence: "annual",
        },
      ],
      ghost_shifts: [
        {
          id: "80000000-0000-4000-8000-000000000001",
          employee_id: employeeId,
          location_id: "10000000-0000-4000-8000-000000000009",
          location_name: "Besiktas",
          scheduled_date: "2026-08-17",
          start_time: "18:00",
          end_time: "02:00",
          crosses_midnight: true,
          job_id: "20000000-0000-4000-8000-000000000009",
          job_name: "Bartender",
          shift_type_id: null,
          shift_type_name: null,
          label_ids: ["30000000-0000-4000-8000-000000000009"],
          label_names: ["On call"],
          note: "Private note",
        },
      ],
    });
    expect(parsed.ghost_shifts).toEqual([
      expect.objectContaining({
        location_name: "Besiktas",
        crosses_midnight: true,
        job_name: "Bartender",
        shift_type_name: null,
        label_names: ["On call"],
      }),
    ]);
    // The ghost never carries the shift's free-text note, even if one is sent.
    expect(parsed.ghost_shifts?.[0]).not.toHaveProperty("note");
    expect(parsed.locations[0]?.publication_status).toBe("published");
    expect(parsed.settings.time_format).toBe("12h");
    expect(parsed.employees[0]?.shift_type_ids ?? []).toEqual([]);
    expect(parsed.employees[0]?.is_excluded_from_schedule ?? false).toBe(false);
    expect(parsed.shifts[0]?.unpaid_break_minutes).toBe(0);
    expect(parsed.shifts[0]?.label_names).toEqual(["Training"]);
    expect(parsed.shift_labels?.[0]?.name).toBe("Training");
    expect(parsed.closures[0]?.end_date).toBe("2026-08-19");
    expect(parsed.closures[0]?.shift_type_ids).toEqual([]);
    expect(parsed.important_dates[0]?.title).toBe("Anniversary");
    expect(parsed.important_dates[0]?.recurrence).toBe("annual");
  });

  it("validates partial schedule closures scoped to shift types", () => {
    const shiftTypeId = "40000000-0000-4000-8000-000000000002";
    const parsed = scheduleReadModelSchema.parse({
      workspace_id: workspaceId,
      week_start: "2026-08-17",
      week_start_day: "monday",
      locations: [],
      departments: [],
      jobs: [],
      shift_types: [],
      employees: [],
      shifts: [],
      closures: [
        {
          id: "60000000-0000-4000-8000-000000000002",
          location_id: "10000000-0000-4000-8000-000000000001",
          closed_date: "2026-08-18",
          title: "No dinner",
          is_all_day: false,
          shift_type_ids: [shiftTypeId],
        },
      ],
    });

    expect(parsed.closures[0]?.shift_type_ids).toEqual([shiftTypeId]);
  });

  it("validates Schedule pending operation payload labels", () => {
    const parsed = schedulePendingOpPayloadSchema.parse({
      scheduled_date: "2026-08-17",
      start_time: "09:00",
      end_time: "17:00",
      label_ids: ["50000000-0000-4000-8000-000000000001"],
      label_names: ["Training"],
    });
    expect(parsed.label_names).toEqual(["Training"]);
  });

  it("validates Schedule export preview row labels", () => {
    const parsed = scheduleExportPreviewSchema.parse({
      status: "export_ready",
      workspace_id: workspaceId,
      workspace_name: "Meyhouse",
      week_start: "2026-08-17",
      source: { type: "published" },
      source_revision: 1,
      fingerprint: "a".repeat(64),
      locations: [],
      rows: [
        {
          shift_id: "82000000-0000-4000-8000-000000000001",
          scheduled_date: "2026-08-17",
          location_name: "Main",
          employee_name: "Alex Rivera",
          job_name: "Server",
          shift_type_name: "Dinner",
          label_names: ["Training"],
          start_time: "16:00",
          end_time: "22:00",
          crosses_midnight: false,
          note: "",
          scheduled_minutes: 360,
        },
      ],
      summary: {
        shift_count: 1,
        employee_count: 1,
        scheduled_minutes: 360,
      },
    });

    expect(parsed.rows[0]?.label_names).toEqual(["Training"]);
  });

  it("keeps legacy payroll and compliance domains outside the clean rebuild baseline", () => {
    expect(productBoundary.forbiddenLegacyDomains).toContain("payroll");
    expect(productBoundary.forbiddenLegacyDomains).toContain("compliance");
  });

  it("grants workspace access only inside the active tenant", () => {
    const context = activeWorkspaceContextSchema.parse({
      userId,
      workspace: { id: workspaceId, name: "Northstar" },
      membership: {
        id: membershipId,
        userId,
        workspaceId,
        role: "manager",
        status: "active",
      },
      permissions: permissionsForRole("manager"),
      onboarding: { status: "complete", currentStep: 2 },
      documentAccess: { restricted: false },
      locationScope: { allLocations: false, locationIds: [] },
    });

    expect(canAccessWorkspace(context, workspaceId, "schedule.manage")).toBe(
      true,
    );
    expect(
      canAccessWorkspace(
        context,
        "16fe2550-8960-480c-9874-cbc76a8e56a9",
        "schedule.manage",
      ),
    ).toBe(false);
    expect(canAccessWorkspace(context, workspaceId, "workspace.manage")).toBe(
      false,
    );
  });

  it("rejects a membership from another workspace", () => {
    expect(() =>
      activeWorkspaceContextSchema.parse({
        userId,
        workspace: { id: workspaceId, name: "Northstar" },
        membership: {
          id: membershipId,
          userId,
          workspaceId: "16fe2550-8960-480c-9874-cbc76a8e56a9",
          role: "employee",
          status: "active",
        },
        permissions: permissionsForRole("employee"),
        onboarding: { status: "complete", currentStep: 2 },
        documentAccess: { restricted: false },
        locationScope: { allLocations: false, locationIds: [] },
      }),
    ).toThrow("Membership workspace does not match context");
  });

  it("rejects a membership from another account", () => {
    expect(() =>
      activeWorkspaceContextSchema.parse({
        userId,
        workspace: { id: workspaceId, name: "Northstar" },
        membership: {
          id: membershipId,
          userId: "16fe2550-8960-480c-9874-cbc76a8e56a9",
          workspaceId,
          role: "employee",
          status: "active",
        },
        permissions: permissionsForRole("employee"),
        onboarding: { status: "complete", currentStep: 2 },
        documentAccess: { restricted: false },
        locationScope: { allLocations: false, locationIds: [] },
      }),
    ).toThrow("Membership user does not match context user");
  });

  it("rejects a context without onboarding, document access or location scope", () => {
    const context = {
      userId,
      workspace: { id: workspaceId, name: "Northstar" },
      membership: {
        id: membershipId,
        userId,
        workspaceId,
        role: "manager",
        status: "active",
      },
      permissions: permissionsForRole("manager"),
      onboarding: { status: "complete", currentStep: 2 },
      documentAccess: { restricted: false },
      locationScope: { allLocations: false, locationIds: [] },
    };
    expect(activeWorkspaceContextSchema.safeParse(context).success).toBe(true);

    for (const field of ["onboarding", "documentAccess", "locationScope"]) {
      const incomplete = Object.fromEntries(
        Object.entries(context).filter(([key]) => key !== field),
      );
      expect(
        () => activeWorkspaceContextSchema.parse(incomplete),
        field,
      ).toThrow();
    }
  });

  // The resolver's row, as resolve_workspace_context_service returns it.
  const resolverRow = {
    user_id: userId,
    workspace_id: workspaceId,
    workspace_name: "Northstar",
    membership_id: membershipId,
    workspace_role: "owner",
    permission_keys: [],
    all_locations: true,
    onboarding_status: "incomplete",
    onboarding_current_step: 3,
    onboarding_revision: 2,
    actions: [],
    location_ids: [],
    document_restricted: false,
  } as const;

  it("rejects a resolver row without its setup state or permission keys", () => {
    for (const field of [
      "onboarding_status",
      "onboarding_current_step",
      "onboarding_revision",
      "permission_keys",
    ]) {
      const incomplete = Object.fromEntries(
        Object.entries(resolverRow).filter(([key]) => key !== field),
      );
      expect(() => activeWorkspaceContextFromRow(incomplete), field).toThrow();
    }
  });

  it("always gives the RPC row's context onboarding, document access and location scope", () => {
    const context = activeWorkspaceContextFromRow(resolverRow);

    expect(context.onboarding).toEqual({
      status: "incomplete",
      currentStep: 3,
      revision: 2,
    });
    expect(context.documentAccess).toEqual({ restricted: false });
    expect(context.locationScope).toEqual({
      allLocations: true,
      locationIds: [],
    });
    // What the API sends is what the web parses: it survives the JSON trip.
    expect(
      activeWorkspaceContextSchema.parse(JSON.parse(JSON.stringify(context))),
    ).toEqual(context);
  });

  it("maps an active workspace RPC row into the shared authorization context", () => {
    const context = activeWorkspaceContextFromRow(
      {
        user_id: userId,
        workspace_id: workspaceId,
        workspace_name: "Northstar",
        membership_id: membershipId,
        workspace_role: "employee",
        membership_role_id: "49ea9eb6-11dd-4d09-8d9e-296bea0fd0c5",
        membership_role_name: "Host",
        permission_keys: ["workspace.read", "roles.read"],
        all_locations: false,
        onboarding_status: "complete",
        onboarding_current_step: 2,
        onboarding_revision: 1,
        actions: ["workspace.read", "employee_hub.read"],
        location_ids: ["f034b748-2dbc-4f2a-b581-cb24f91d6499"],
        document_restricted: true,
      },
    );

    expect(context.membership.role).toBe("employee");
    expect(context.actions).toEqual(["workspace.read", "employee_hub.read"]);
    expect(context.documentAccess).toEqual({ restricted: true });
    expect(context.membership.roleName).toBe("Host");
    expect(context.permissions).toEqual([
      "workspace.read",
      "notifications.read",
      "notifications.read_own",
      "notifications.preferences.write_own",
    ]); // Employee experience excludes management grants.
    expect(context.onboarding).toEqual({
      status: "complete",
      currentStep: 2,
      revision: 1,
    });
    expect(context.locationScope).toEqual({
      allLocations: false,
      locationIds: ["f034b748-2dbc-4f2a-b581-cb24f91d6499"],
    });
  });

  it("keeps an all-location context unlimited whatever locations come with it", () => {
    const context = activeWorkspaceContextFromRow({
      user_id: userId,
      workspace_id: workspaceId,
      workspace_name: "Northstar",
      membership_id: membershipId,
      workspace_role: "admin",
      permission_keys: [],
      all_locations: true,
      onboarding_status: "complete",
      onboarding_current_step: 4,
      onboarding_revision: 3,
      actions: [],
      location_ids: ["f034b748-2dbc-4f2a-b581-cb24f91d6499"],
      document_restricted: false,
    });

    expect(context.membership.allLocations).toBe(true);
    expect(context.onboarding.revision).toBe(3);
    expect(context.locationScope).toEqual({
      allLocations: true,
      locationIds: [],
    });
  });

  it("rejects malformed active workspace RPC projections", () => {
    expect(() =>
      activeWorkspaceContextFromRow({
        user_id: userId,
        workspace_id: workspaceId,
        workspace_name: "Northstar",
        membership_id: membershipId,
        workspace_role: "employee",
        permission_keys: ["workspace.read", "workspace.delete"],
        all_locations: true,
        onboarding_status: "complete",
        onboarding_current_step: 4,
        actions: [],
        location_ids: [],
        document_restricted: false,
      }),
    ).toThrow();

    expect(() =>
      activeWorkspaceContextFromRow({
        user_id: userId,
        workspace_id: workspaceId,
        workspace_name: "Northstar",
        membership_id: membershipId,
        workspace_role: "employee",
        all_locations: true,
        onboarding_status: "complete",
        onboarding_current_step: 5,
        actions: [],
        location_ids: [],
        document_restricted: false,
      }),
    ).toThrow();
  });

  it("maps an account workspace row without leaking tenant details", async () => {
    const { workspaceSummaryFromRow } = await import("./index");
    expect(
      workspaceSummaryFromRow({
        workspace_id: workspaceId,
        workspace_name: "Northstar",
        workspace_role: "owner",
        membership_status: "active",
        is_active: true,
        onboarding_status: "incomplete",
        onboarding_current_step: 1,
      }),
    ).toEqual({
      id: workspaceId,
      name: "Northstar",
      role: "owner",
      status: "active",
      isActive: true,
      onboarding: { status: "incomplete", currentStep: 1, revision: 1 },
      lifecycleStatus: "active",
      accessRemoved: false,
      // A row that carries no counts and no date says so rather than guessing.
      otherMemberCount: undefined,
      pendingInvitationCount: undefined,
      defaultClosureEffectiveAt: null,
      lastUsedAt: null,
      closureEffectiveAt: null,
      pendingOwnershipTransfer: null,
    });
    expect(
      workspaceSummaryFromRow({
        workspace_id: workspaceId,
        workspace_name: "Northstar",
        workspace_role: "admin",
        membership_status: "active",
        is_active: false,
        onboarding_status: "complete",
        onboarding_current_step: 4,
        pending_ownership_transfer_id: "81000000-0000-4000-8000-000000000001",
        pending_ownership_transfer_role: "target",
        pending_ownership_transfer_expires_at: "2026-09-12T12:00:00.000Z",
      }).pendingOwnershipTransfer,
    ).toEqual({
      id: "81000000-0000-4000-8000-000000000001",
      role: "target",
      expiresAt: "2026-09-12T12:00:00.000Z",
    });
    const incompleteTransferRows = [
      {
        pending_ownership_transfer_id: null,
        pending_ownership_transfer_role: "target",
        pending_ownership_transfer_expires_at: "2026-09-12T12:00:00.000Z",
      },
      {
        pending_ownership_transfer_id: "81000000-0000-4000-8000-000000000001",
        pending_ownership_transfer_role: null,
        pending_ownership_transfer_expires_at: "2026-09-12T12:00:00.000Z",
      },
      {
        pending_ownership_transfer_id: "81000000-0000-4000-8000-000000000001",
        pending_ownership_transfer_role: "target",
        pending_ownership_transfer_expires_at: null,
      },
    ] as const;

    for (const pendingTransfer of incompleteTransferRows) {
      expect(
        workspaceSummaryFromRow({
          workspace_id: workspaceId,
          workspace_name: "Northstar",
          workspace_role: "admin",
          membership_status: "active",
          is_active: false,
          onboarding_status: "complete",
          onboarding_current_step: 4,
          ...pendingTransfer,
        }).pendingOwnershipTransfer,
      ).toBeNull();
    }
  });

  it("maps non-active account workspace rows to safe switcher statuses", async () => {
    const { workspaceSummaryFromRow } = await import("./index");

    const cases = [
      ["active", "active", true],
      ["pending_activation", "pending", false],
      ["suspended", "suspended", false],
      ["removed", "removed", false],
    ] as const;

    for (const [membershipStatus, summaryStatus, expectedActive] of cases) {
      const summary = workspaceSummaryFromRow({
        workspace_id: workspaceId,
        workspace_name: "Northstar",
        workspace_role: "employee",
        membership_status: membershipStatus,
        is_active: true,
        onboarding_status:
          membershipStatus === "active" ? "complete" : "incomplete",
        onboarding_current_step: membershipStatus === "active" ? 4 : 1,
        workspace_lifecycle_status:
          membershipStatus === "active" ? "active" : "closure_scheduled",
        closure_effective_at:
          membershipStatus === "active" ? null : "2026-09-19T12:00:00.000Z",
        pending_ownership_transfer_id: "81000000-0000-4000-8000-000000000001",
        pending_ownership_transfer_role: "target",
        pending_ownership_transfer_expires_at: "2026-09-12T12:00:00.000Z",
      });

      expect(summary.status).toBe(summaryStatus);
      expect(summary.isActive).toBe(expectedActive);
      expect(summary.lifecycleStatus).toBe(
        membershipStatus === "active" ? "active" : "closure_scheduled",
      );
      if (summaryStatus !== "active") {
        expect(summary.pendingOwnershipTransfer).toBeNull();
      }
    }
  });

  it("maps account workspace lifecycle rows without inventing active access", async () => {
    const { workspaceSummaryFromRow } = await import("./index");

    expect(
      workspaceSummaryFromRow({
        workspace_id: workspaceId,
        workspace_name: "Northstar",
        workspace_role: "owner",
        membership_status: "active",
        is_active: false,
        onboarding_status: "complete",
        onboarding_current_step: 4,
        workspace_lifecycle_status: "closure_scheduled",
        closure_effective_at: "2026-09-19T12:00:00.000Z",
      }),
    ).toMatchObject({
      status: "active",
      isActive: false,
      lifecycleStatus: "closure_scheduled",
      closureEffectiveAt: "2026-09-19T12:00:00.000Z",
    });

    // A closed workspace is no longer a malformed row: the account is owed an
    // explanation for it, so the list carries it and says what it is.
    expect(
      workspaceSummaryFromRow({
        workspace_id: workspaceId,
        workspace_name: "Northstar",
        workspace_role: "owner",
        membership_status: "suspended",
        is_active: false,
        onboarding_status: "complete",
        onboarding_current_step: 4,
        workspace_lifecycle_status: "deleted",
      }),
    ).toMatchObject({ status: "suspended", lifecycleStatus: "deleted" });
  });

  it("rejects malformed account workspace rows instead of coercing them into switcher targets", async () => {
    const { workspaceSummaryFromRow } = await import("./index");

    expect(() =>
      workspaceSummaryFromRow({
        workspace_id: workspaceId,
        workspace_name: "Northstar",
        workspace_role: "employee",
        membership_status: "revoked",
        is_active: true,
        onboarding_status: "complete",
        onboarding_current_step: 4,
      }),
    ).toThrow();

    expect(() =>
      workspaceSummaryFromRow({
        workspace_id: workspaceId,
        workspace_name: "Northstar",
        workspace_role: "employee",
        membership_status: "active",
        is_active: true,
        onboarding_status: "complete",
        onboarding_current_step: 0,
      }),
    ).toThrow();
  });

  it("validates account pending invitation projections without a person name", () => {
    const projection = accountPendingInvitationSchema.parse({
      id: "46000000-0000-4000-8000-000000000001",
      workspaceId: "26000000-0000-4000-8000-000000000001",
      workspaceName: "Northstar",
      emailHint: "ne**********@example.test",
      expiresAt: "2026-09-12T12:00:00.000Z",
    });

    expect(projection).not.toHaveProperty("employeeName");
  });
});

describe("employee onboarding schemas", () => {
  it("accepts employee hub as the first action after activation", () => {
    const parsed = employeeOnboardingSchema.parse({
      case_id: "26000000-0000-4000-8000-000000000001",
      workspace_id: "26000000-0000-4000-8000-000000000002",
      workspace_name: "Northstar",
      employee_id: "26000000-0000-4000-8000-000000000003",
      employee_name: "Taylor Reed",
      membership_id: "26000000-0000-4000-8000-000000000004",
      membership_status: "active",
      case_status: "approved",
      revision: 2,
      progress_completed: 1,
      progress_total: 1,
      first_actionable_path: "/app/employee-hub",
      ssn_status: { present: false, last_four: null },
      profile: null,
      assignments: { locations: ["Main"], jobs: ["Cook"] },
      requirements: [],
    });

    expect(parsed.first_actionable_path).toBe("/app/employee-hub");
  });

  it("accepts legacy incomplete address fields in the onboarding read model", () => {
    const parsed = employeeOnboardingSchema.parse({
      case_id: "26000000-0000-4000-8000-000000000001",
      workspace_id: "26000000-0000-4000-8000-000000000002",
      workspace_name: "Northstar",
      employee_id: "26000000-0000-4000-8000-000000000003",
      employee_name: "Taylor Reed",
      membership_id: "26000000-0000-4000-8000-000000000004",
      membership_status: "pending_activation",
      case_status: "in_progress",
      revision: 2,
      progress_completed: 0,
      progress_total: 1,
      first_actionable_path: "/welcome/profile",
      ssn_status: { present: false, last_four: null },
      profile: {
        legal_first_name: "Taylor",
        legal_last_name: "Reed",
        phone: "3105550100",
        street_address: null,
        city: null,
        region: null,
        postal_code: null,
        country_code: null,
        date_of_birth: null,
        emergency_contact_name: "Morgan Reed",
        emergency_contact_relationship: "Spouse",
        emergency_contact_email: "",
        emergency_contact_phone: "3105550101",
        share_phone_with_teammates: false,
        share_email_with_teammates: false,
      },
      assignments: { locations: ["Main"], jobs: ["Cook"] },
      requirements: [],
    });

    expect(parsed.profile?.street_address).toBeNull();
  });

  it("rejects employee onboarding action paths outside onboarding and employee hub", () => {
    const base = {
      case_id: "26000000-0000-4000-8000-000000000001",
      workspace_id: "26000000-0000-4000-8000-000000000002",
      workspace_name: "Northstar",
      employee_id: "26000000-0000-4000-8000-000000000003",
      employee_name: "Taylor Reed",
      membership_id: "26000000-0000-4000-8000-000000000004",
      membership_status: "pending_activation",
      case_status: "in_progress",
      revision: 2,
      progress_completed: 0,
      progress_total: 1,
      ssn_status: { present: false, last_four: null },
      profile: null,
      assignments: { locations: ["Main"], jobs: ["Cook"] },
      requirements: [],
    };

    for (const firstActionablePath of [
      "/welcome",
      "/welcome/profile",
      "/welcome/profile?step=documents",
      "/welcome/profile#documents",
      "/app/employee-hub",
      "/app/employee-hub/shift-hub",
      "/app/employee-hub?tab=shifts",
      "/app/employee-hub#today",
    ]) {
      expect(
        employeeOnboardingSchema.parse({
          ...base,
          first_actionable_path: firstActionablePath,
        }).first_actionable_path,
      ).toBe(firstActionablePath);
    }

    expect(() =>
      employeeOnboardingSchema.parse({
        ...base,
        first_actionable_path: "/app/employees",
      }),
    ).toThrow("Employee onboarding action path");

    expect(() =>
      employeeOnboardingSchema.parse({
        ...base,
        first_actionable_path: "https://outside.example/welcome",
      }),
    ).toThrow("Employee onboarding action path");

    expect(() =>
      employeeOnboardingSchema.parse({
        ...base,
        first_actionable_path: "/welcomebackdoor",
      }),
    ).toThrow("Employee onboarding action path");

    expect(() =>
      employeeOnboardingSchema.parse({
        ...base,
        first_actionable_path: "/app/employee-hubx",
      }),
    ).toThrow("Employee onboarding action path");
  });

  // The preferred name is asked now, and it is optional. The SSN still is not
  // part of this payload.
  it("keeps the SSN out of the private profile while accepting a preferred name", () => {
    const profile = employeeOnboardingProfileSchema.parse({
      legal_first_name: "Taylor",
      legal_last_name: "Reed",
      phone: "3105550100",
      street_address: "100 Main Street",
      city: "Los Angeles",
      region: "CA",
      postal_code: "90012",
      country_code: "US",
      date_of_birth: "1990-01-01",
      emergency_contact_name: "Morgan Reed",
      emergency_contact_relationship: "Spouse",
      emergency_contact_email: "",
      emergency_contact_phone: "3105550101",
      share_phone_with_teammates: false,
      share_email_with_teammates: false,
      preferred_name: "Tay",
      ssn: "123456789",
    });
    expect(profile).not.toHaveProperty("ssn");
    expect(profile.preferred_name).toBe("Tay");
  });

  it("accepts birthday only as a full date when provided", () => {
    expect(
      employeeOnboardingProfileSchema.parse({
        legal_first_name: "Taylor",
        legal_last_name: "Reed",
        phone: "3105550100",
        street_address: "100 Main Street",
        city: "Los Angeles",
        region: "CA",
        postal_code: "90012",
        country_code: "US",
        emergency_contact_name: "Morgan Reed",
        emergency_contact_relationship: "Spouse",
        emergency_contact_email: "",
        emergency_contact_phone: "3105550101",
        date_of_birth: "1990-01-01",
        share_phone_with_teammates: false,
        share_email_with_teammates: false,
      }).date_of_birth,
    ).toBe("1990-01-01");
    expect(() =>
      employeeOnboardingProfileSchema.parse({
        legal_first_name: "Taylor",
        legal_last_name: "Reed",
        phone: "3105550100",
        street_address: "100 Main Street",
        city: "Los Angeles",
        region: "CA",
        postal_code: "90012",
        country_code: "US",
        emergency_contact_name: "Morgan Reed",
        emergency_contact_relationship: "Spouse",
        emergency_contact_email: "",
        emergency_contact_phone: "3105550101",
        date_of_birth: "01/01",
        share_phone_with_teammates: false,
        share_email_with_teammates: false,
      }),
    ).toThrow();
  });

});

describe("organization basics schemas", () => {
  it("normalizes valid location input", () => {
    expect(
      locationInputSchema.parse({
        name: "  Downtown  ",
        short_name: " DT ",
        street_address: "1 Main St",
        city: "Los Angeles",
        region: "CA",
        postal_code: "90001",
        country_code: "US",
        timezone: "America/Los_Angeles",
      }).name,
    ).toBe("Downtown");
    expect(
      locationInputSchema.parse({
        name: "Patio",
        short_name: "PATIO",
        street_address: "",
        city: "",
        region: "",
        postal_code: "",
        country_code: "US",
        timezone: "America/Los_Angeles",
      }),
    ).toMatchObject({
      name: "Patio",
      street_address: "",
      city: "",
      region: "",
      postal_code: "",
    });
  });

  it("validates entity colors and optional job departments", () => {
    expect(() =>
      departmentInputSchema.parse({ name: "Kitchen", color: "green" }),
    ).toThrow();
    expect(
      jobInputSchema.parse({
        name: "Line Cook",
        color: "#4478A8",
        department_id: null,
      }),
    ).toEqual({
      name: "Line Cook",
      color: "#4478A8",
      department_id: null,
    });
  });
});

describe("scheduling settings schemas", () => {
  it("accepts the clean scheduling policy surface", () => {
    expect(
      schedulingSettingsInputSchema.parse({
        week_start_day: "sunday",
        schedule_deadline_day: "friday",
        time_format: "24h",
      }),
    ).toEqual({
      week_start_day: "sunday",
      schedule_deadline_day: "friday",
      time_format: "24h",
    });
  });

  it("requires paired, distinct shift-type times", () => {
    expect(
      shiftTypeInputSchema.parse({
        name: "Dinner",
        color: "#7B5EA7",
        default_start_time: "17:00",
        default_end_time: "01:00",
      }).name,
    ).toBe("Dinner");
    expect(() =>
      shiftTypeInputSchema.parse({
        name: "Invalid",
        color: "#7B5EA7",
        default_start_time: "09:00",
        default_end_time: "09:00",
      }),
    ).toThrow();
  });
});

describe("important date schemas", () => {
  it("accepts annual events and requires closed days to block scheduling", () => {
    expect(
      importantDateInputSchema.parse({
        location_id: null,
        title: "New Year's Day",
        type: "holiday",
        starts_on: "2027-01-01",
        ends_on: "2027-01-01",
        recurrence: "annual",
        note: "",
        affects_scheduling: true,
      }),
    ).toMatchObject({ title: "New Year's Day", recurrence: "annual" });

    expect(() =>
      importantDateInputSchema.parse({
        location_id: null,
        title: "Closed for repairs",
        type: "closed_day",
        starts_on: "2027-02-01",
        ends_on: "2027-02-01",
        recurrence: "none",
        note: "",
        affects_scheduling: false,
      }),
    ).toThrow("Closed days must affect scheduling");
  });

  it("rejects inverted date ranges", () => {
    expect(() =>
      importantDateInputSchema.parse({
        location_id: null,
        title: "Festival weekend",
        type: "event",
        starts_on: "2027-05-03",
        ends_on: "2027-05-01",
        recurrence: "none",
        note: "",
        affects_scheduling: true,
      }),
    ).toThrow("End date must be on or after the start date");
  });
});

describe("roles and permissions schemas", () => {
  it("accepts a bounded custom role", () => {
    expect(
      workspaceRoleInputSchema.parse({
        name: "Floor lead",
        description: "Runs service",
        access_class: "manager",
        permission_keys: ["workspace.read", "schedule.read", "schedule.manage"],
      }).name,
    ).toBe("Floor lead");
  });

  it("rejects protected and incomplete grants", () => {
    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "Escalated",
        description: "",
        access_class: "manager",
        permission_keys: ["workspace.read", "roles.manage"],
      }),
    ).toThrow("Protected management permissions");
    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "Broken schedule",
        description: "",
        access_class: "employee",
        permission_keys: ["workspace.read", "schedule.manage"],
      }),
    ).toThrow("schedule.manage requires its read access");
  });

  it("requires document read access before document management", () => {
    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "Document manager",
        description: "",
        access_class: "manager",
        permission_keys: ["workspace.read", "documents.manage"],
      }),
    ).toThrow("documents.manage requires its read access");
  });

  it("requires Schedule Requests read and manage dependencies", () => {
    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "Time off reviewer",
        description: "",
        access_class: "manager",
        permission_keys: ["workspace.read", "schedule.time_off_requests.read"],
      }),
    ).toThrow("schedule.time_off_requests.read requires its read access");
    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "Shift reviewer",
        description: "",
        access_class: "manager",
        permission_keys: [
          "workspace.read",
          "schedule.read",
          "schedule.shift_change_requests.manage",
        ],
      }),
    ).toThrow("schedule.shift_change_requests.manage requires its read access");
  });

  it("requires template read access before template management", () => {
    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "Policy manager",
        description: "",
        access_class: "manager",
        permission_keys: ["workspace.read", "signature_templates.manage"],
      }),
    ).toThrow("signature_templates.manage requires its read access");
  });

  it("requires employee read and role access for employee management", () => {
    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "People editor",
        description: "",
        access_class: "manager",
        permission_keys: ["workspace.read", "employees.manage"],
      }),
    ).toThrow("employees.manage requires its read access");

    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "Access editor",
        description: "",
        access_class: "manager",
        permission_keys: [
          "workspace.read",
          "employees.read",
          "employee_access.manage",
        ],
      }),
    ).toThrow("employee_access.manage requires its read access");
  });
});

describe("document type schemas", () => {
  it("accepts bounded upload requirement metadata", () => {
    expect(
      documentTypeInputSchema.parse({
        title: "Food handler card",
        description: "Current certification",
        required_at_onboarding: true,
        requires_review: true,
        accepted_formats: ["pdf", "jpeg", "png"],
        tracks_expiry: true,
        expiry_warning_days: 30,
        expiry_schedule_impact: "warn",
      }).tracks_expiry,
    ).toBe(true);
  });

  it("rejects optional documents configured as hard schedule conflicts", () => {
    expect(() =>
      documentTypeInputSchema.parse({
        title: "Optional blocker",
        description: "",
        required_at_onboarding: false,
        requires_review: true,
        accepted_formats: ["pdf"],
        tracks_expiry: true,
        expiry_warning_days: 30,
        expiry_schedule_impact: "block",
      }),
    ).toThrow("Only required documents can create hard schedule conflicts");
  });

  it("rejects unsupported or duplicate formats", () => {
    expect(() =>
      documentTypeInputSchema.parse({
        title: "Invalid",
        description: "",
        required_at_onboarding: false,
        requires_review: false,
        accepted_formats: ["pdf", "pdf"],
        tracks_expiry: false,
        expiry_warning_days: 30,
      }),
    ).toThrow("Document formats must be unique");
    expect(() =>
      documentTypeInputSchema.parse({
        title: "Executable",
        description: "",
        required_at_onboarding: false,
        requires_review: false,
        accepted_formats: ["exe"],
        tracks_expiry: false,
        expiry_warning_days: 30,
      }),
    ).toThrow();
  });
});

describe("acknowledgement template schemas", () => {
  it("accepts bounded retention and acknowledgement drafts", () => {
    const policy = signatureRetentionPolicyInputSchema.parse({
      name: "Policy acknowledgements",
      retention_trigger: "employment_end",
      duration_days: 1095,
      jurisdiction_scope: "Workspace policy",
      authority_reference: "Approved internal records schedule v1",
    });
    expect(policy.duration_days).toBe(1095);

    expect(
      signatureTemplateDraftInputSchema.parse({
        title: "Team handbook acknowledgement",
        summary: "Confirms receipt of the handbook.",
        content_text: "I received the current team handbook.",
        intent_statement:
          "I acknowledge that I received and reviewed this policy.",
        locale: "en-US",
        effective_date: "2026-08-17",
        required_at_onboarding: true,
        blocks_activation: true,
        retention_policy_id: "24000000-0000-4000-8000-000000000001",
      }).locale,
    ).toBe("en-US");
  });

  it("rejects activation blocking for an optional acknowledgement", () => {
    expect(() =>
      signatureTemplateDraftInputSchema.parse({
        title: "Optional notice",
        summary: "",
        content_text: "Notice text",
        intent_statement: "I acknowledge receipt.",
        locale: "en-US",
        effective_date: "2026-08-17",
        required_at_onboarding: false,
        blocks_activation: true,
        retention_policy_id: "24000000-0000-4000-8000-000000000001",
      }),
    ).toThrow("Activation blocking requires onboarding assignment");
  });
});

describe("publish finding: an approved shift change the draft would undo (BL-198)", () => {
  // Verbatim from a real run of shift_exchange_draft_undoes() (nf-db bl198-fix ae3f31b9,
  // approved_exchange_survives_a_stale_draft green run): times arrive as HH:MM.
  const undone = {"id": "shift_exchange_undone:d766ef91-397b-4f46-af27-5bab6c044268", "code": "shift_exchange_undone", "tier": "blocker", "message": "This shift was swapped from Ali Person to Deniz Person after the schedule was last published, and this draft does not have it. Publishing would undo it.", "end_time": "15:00", "severity": "hard", "shift_ids": ["f60a3476-ba75-4532-a061-9b0c0672cc08"], "introduced": true, "start_time": "09:00", "employee_id": "51017f0c-a2f8-4fd0-8568-b49c88bd8a50", "location_id": "f1a169ae-0ac7-4cea-82aa-be9fc3ee3cb8", "overrideable": false, "employee_name": "Deniz Person", "exchange_kind": "swap", "location_name": "Kadikoy", "scheduled_date": "2028-08-29", "to_employee_id": "51017f0c-a2f8-4fd0-8568-b49c88bd8a50", "exchange_case_id": "b2df6d9b-eb62-41fa-802d-63290c32016e", "from_employee_id": "cbea0cee-6fc4-4ab3-ab2a-3289fb33ca2c", "to_employee_name": "Deniz Person", "draft_employee_id": "4cd03230-948b-45d6-846b-1f03931ff361", "from_employee_name": "Ali Person", "draft_employee_name": "Emre Person"};

  it("keeps the code and every exchange field", () => {
    expect(schedulePublishFindingSchema.parse(undone)).toEqual(undone);
  });

  it("takes an open pickup (no previous owner) and a draft that left the shift out", () => {
    const pickup = { ...undone, exchange_kind: "open_pickup", from_employee_id: null, from_employee_name: null,
      draft_employee_id: null, draft_employee_name: null, shift_ids: [] };
    expect(schedulePublishFindingSchema.parse(pickup)).toEqual(pickup);
  });
});
