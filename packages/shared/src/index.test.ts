import { describe, expect, it } from "vitest";
import {
  accessClass,
  accessRank,
  activeWorkspaceContextSchema,
  workspaceMembershipSchema,
  activeWorkspaceContextFromRow,
  accountProfileSchema,
  accountPendingInvitationSchema,
  avatarChoiceSchema,
  avatarReasons,
  avatarSchema,
  avatarUploadRequestSchema,
  lastAvatarResponseSchema,
  ownAvatarResponseSchema,
  announcementListSchema,
  appActionUrlSchema,
  canAccessWorkspace,
  departmentInputSchema,
  departmentSchema,
  scheduleDepartmentSchema,
  scheduleJobSchema,
  scheduleShiftLabelSchema,
  documentTypeInputSchema,
  employeeDetailSchema,
  employeeInputSchema,
  employmentContactRecordFromRow,
  employeeReferenceDataSchema,
  employeeOnboardingSchema,
  employeeOnboardingProfileSchema,
  healthResponseSchema,
  announcementDetailSchema,
  announcementDraftSchema,
  announcementPreviewSchema,
  jobDetailsChangesSchema,
  jobInputSchema,
  jobSchema,
  maxJobLineupIcons,
  departmentJobsInputSchema,
  departmentWithJobsInputSchema,
  locationInputSchema,
  locationSchema,
  ownerLegalNameResponseSchema,
  ownerLegalNameSchema,
  managementAndOwnerRefusals,
  managementAndOwnerSentence,
  managerLocationRefusal,
  managementJobIds,
  normalizeAccountPhone,
  permissionsForRole,
  scheduleReadModelSchema,
  scheduleClosureCoversShift,
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
  workspaceNameInputSchema,
  workspaceRoleInputSchema,
  workspaceTodoSchema,
  productBoundary,
  schedulingSettingsInputSchema,
  shiftTypeInputSchema,
  shiftTypeTimesRefusal,
  scheduleShiftTypeSchema,
  signatureRetentionPolicyInputSchema,
  signatureTemplateDraftInputSchema,
  announcementStateActionSchema,
  workspaceLayoutInputSchema,
} from "./index";

const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

describe("account schemas", () => {
  it("normalizes optional account phone and defaults personal formats", () => {
    expect(normalizeAccountPhone("(310) 555-0100")).toBe(
      "+13105550100",
    );
    // A US product: one country, +1 (KARARLAR "Form ve girdi kuralları").
    expect(() => normalizeAccountPhone("+44 20 7946 0958")).toThrow();
    expect(normalizeAccountPhone("")).toBeNull();
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
      avatarUrl: null,
      timeFormat: "system",
      dateFormat: "system",
    });
  });

  // AVATAR-IKON: the account keeps no avatar path; a person's avatar belongs to each workspace.
  it("keeps no avatar path on the account", () => {
    const parsed = accountProfileSchema.parse({
      userId,
      email: "alex@example.test",
      displayName: "Alex Kim",
      phone: "+13105550100",
      avatarObjectPath: `${userId}/profile/fe201916-aa0e-480b-9144-1e1c8da20a31.jpg`,
      theme: "system",
    });
    expect(parsed).not.toHaveProperty("avatarObjectPath");
  });
});

describe("avatar schemas (AVATAR-IKON)", () => {
  it("reads an avatar as a photo by its signed address or a drawing by its archive key", () => {
    expect(avatarSchema.parse({ kind: "photo", url: "https://example.test/signed" })).toEqual({
      kind: "photo",
      url: "https://example.test/signed",
    });
    expect(avatarSchema.parse({ kind: "photo", url: null })).toEqual({ kind: "photo", url: null });
    expect(avatarSchema.parse({ kind: "art", art_key: "001-server" })).toEqual({ kind: "art", art_key: "001-server" });
    expect(avatarSchema.safeParse({ kind: "art", art_key: "no-such-drawing" }).success).toBe(false);
    expect(avatarSchema.safeParse({ kind: "photo", path: "a/b/c.jpg" }).success).toBe(false);
  });

  it("keeps present and url beside the avatar and its suggestions", () => {
    expect(
      ownAvatarResponseSchema.parse({
        present: true,
        url: null,
        avatar: { kind: "art", art_key: "003-bartender" },
        suggested: ["001-server"],
      }),
    ).toEqual({ present: true, url: null, avatar: { kind: "art", art_key: "003-bartender" }, suggested: ["001-server"] });
    expect(ownAvatarResponseSchema.safeParse({ present: false, url: null, avatar: null, suggested: ["nope"] }).success).toBe(false);
  });

  it("takes a drawing, an uploaded photo's path or the last avatar as a choice", () => {
    expect(avatarChoiceSchema.parse({ art_key: "001-server" })).toEqual({ art_key: "001-server" });
    expect(avatarChoiceSchema.parse({ photo_path: "w/m/p.jpg" })).toEqual({ photo_path: "w/m/p.jpg" });
    expect(avatarChoiceSchema.parse({ use_last: true })).toEqual({ use_last: true });
    expect(avatarChoiceSchema.safeParse({ use_last: false }).success).toBe(false);
    expect(avatarChoiceSchema.safeParse({ art_key: "no-such-drawing" }).success).toBe(false);
    expect(avatarChoiceSchema.safeParse({}).success).toBe(false);
  });

  it("names where a last avatar came from", () => {
    expect(lastAvatarResponseSchema.parse({ avatar: null, from_workspace_name: null })).toEqual({
      avatar: null,
      from_workspace_name: null,
    });
    expect(
      lastAvatarResponseSchema.parse({ avatar: { kind: "art", art_key: "001-server" }, from_workspace_name: "Meyhouse" }),
    ).toEqual({ avatar: { kind: "art", art_key: "001-server" }, from_workspace_name: "Meyhouse" });
  });

  it("names the avatar refusals by the keys the screens read", () => {
    expect(avatarReasons).toEqual({
      photoInvalid: "avatar.photo_invalid",
      noLastAvatar: "avatar.no_last_avatar",
      notPhoto: "avatar.not_photo",
    });
  });

  it("uploads only JPG, PNG or WebP", () => {
    expect(avatarUploadRequestSchema.parse({ content_type: "image/png" })).toEqual({ content_type: "image/png" });
    expect(avatarUploadRequestSchema.safeParse({ content_type: "image/gif" }).success).toBe(false);
  });
});

describe("workspace communication schemas", () => {
  const announcement = {
    id: "a8200000-0000-4000-8000-000000000001",
    title: "Service briefing",
    body: "Doors open at four.",
    category: "staff_meeting",
    category_other: null,
    status: "published",
    display_status: "published",
    publish_error_code: null,
    starts_on: null,
    ends_on: null,
    event_from: null,
    event_until: null,
    recurrence: "none",
    on_important_dates: false,
    on_calendar: false,
    on_schedule: false,
    ask_ack: true,
    time_zone: "America/Los_Angeles",
    publish_at: null,
    published_at: "2026-09-05T12:00:00+00:00",
    unpublished_at: null,
    archived_at: null,
    starts_at: null,
    ends_at: null,
    locations: [],
    author_user_id: null,
    author_name: "Taylor",
    revision: 1,
    content_revision: 1,
    created_at: "2026-09-05T12:00:00+00:00",
    updated_at: "2026-09-05T12:00:00+00:00",
    repeats_from: null,
    can_edit: false,
    can_unschedule: false,
    can_unpublish: false,
    can_archive: false,
    asked_to_acknowledge: true,
    acknowledged_at: null,
    content_changed_since_acknowledged: false,
    respondent_count: null,
    acknowledged_count: null,
    recipient_count: null,
    shift_change_count: null,
    my_changes: [],
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

  it("reads an announcement as the list sends it", () => {
    const list = announcementListSchema.parse({
      workspace_id: workspaceId,
      can_manage: false,
      can_write_dates: false,
      can_read_dates: true,
      time_format: "12h",
      locations: [],
      people: [],
      departments: [],
      jobs: [],
      announcements: [announcement],
    });
    expect(list.announcements[0]).toMatchObject({ category: "staff_meeting", asked_to_acknowledge: true });
    expect(() =>
      announcementListSchema.parse({ ...list, announcements: [{ ...announcement, category: "operations" }] }),
    ).toThrow();
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
        },
        today_ends_at: null,
        announcements: [],
        todos: [todo],
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
      }).todos,
    ).toHaveLength(1);
  });
  // BILDIRIM-06 (KARARLAR S-123, S-124): the old notification system is gone, and with it the
  // Workspace home's Notifications card. Remind on an announcement came back on the new system
  // (BILDIRIM-U6, KARARLAR S-126 (2)).
  it("has six Workspace cards, none of them Notifications", () => {
    const six = ["operations", "pending_requests", "open_shifts", "announcements", "todos", "quick_actions"];
    expect(workspaceLayoutInputSchema.parse({ widget_order: six, hidden_widget_ids: [] }).widget_order).toEqual(six);
    expect(() =>
      workspaceLayoutInputSchema.parse({ widget_order: [...six, "notifications"], hidden_widget_ids: [] }),
    ).toThrow();
    expect(() =>
      workspaceLayoutInputSchema.parse({ widget_order: six, hidden_widget_ids: ["notifications"] }),
    ).toThrow();
  });

  it("has Remind among an announcement's actions again", () => {
    expect(announcementStateActionSchema.options).toEqual(["unschedule", "unpublish", "archive", "bring_back", "remind"]);
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
      published_at: "2026-08-17T12:00:00.000Z",
    });
    expect(published.status).toBe("published");
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
          department_id: null,
          system_key: null,
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
          title: "Renovation",
          is_all_day: true,
          kind: "closed",
          opens: null,
          closes: null,
        },
      ],
      important_dates: [
        {
          id: "70000000-0000-4000-8000-000000000001",
          location_id: locationId,
          title: "Anniversary",
          category: "celebration",
          category_other: null,
          starts_on: "2026-08-18",
          ends_on: "2026-08-18",
          status: "published",
          publish_at: null,
          day: "open",
          opens: null,
          closes: null,
          event_from: "18:00",
          event_until: "21:00",
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
      referenced_jobs: [],
      referenced_shift_types: [],
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
    expect(parsed.closures[0]?.kind).toBe("closed");
    expect(parsed.important_dates[0]?.title).toBe("Anniversary");
    expect(parsed.important_dates[0]?.event_from).toBe("18:00");
  });

  it("reads a location's short hours on an important date (EKRAN-08)", () => {
    const parsed = scheduleReadModelSchema.parse({
      workspace_id: workspaceId,
      week_start: "2026-12-21",
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
          closed_date: "2026-12-24",
          title: "Christmas Eve",
          is_all_day: false,
          kind: "short",
          opens: "10:00",
          closes: "15:00",
          status: "scheduled",
          publish_at: "2026-12-20T17:00:00+00:00",
          on_schedule: true,
          announcement_id: "70000000-0000-4000-8000-000000000003",
        },
      ],
      referenced_jobs: [],
      referenced_shift_types: [],
    });

    expect(parsed.closures[0]).toMatchObject({ kind: "short", opens: "10:00", closes: "15:00", status: "scheduled" });
  });

  it("finds the shifts a closed or short day reaches, as app_private.closure_covers does", () => {
    const closed = { kind: "closed" as const, opens: null, closes: null };
    const short = { kind: "short" as const, opens: "10:00", closes: "15:00" };
    const late = { kind: "short" as const, opens: "17:00", closes: "02:00" };

    // Closed reaches every shift that starts that day.
    expect(scheduleClosureCoversShift(closed, "09:00", "17:00")).toBe(true);
    expect(scheduleClosureCoversShift(closed, null, null)).toBe(true);
    // Short hours reach a shift with any part outside them.
    expect(scheduleClosureCoversShift(short, "10:00", "15:00")).toBe(false);
    expect(scheduleClosureCoversShift(short, "07:00", "09:00")).toBe(true);
    expect(scheduleClosureCoversShift(short, "12:00", "18:00")).toBe(true);
    expect(scheduleClosureCoversShift(short, "14:00", "01:00")).toBe(true);
    // Closing past midnight closes the next day.
    expect(scheduleClosureCoversShift(late, "18:00", "01:30")).toBe(false);
    expect(scheduleClosureCoversShift(late, "18:00", "03:00")).toBe(true);
  });

  // BL-959: public.schedule_closures names each closed day md5(...)::uuid, which
  // has no RFC version or variant; the week must still read.
  it("reads a closed day whose id is an md5 made into a uuid", () => {
    const parsed = scheduleReadModelSchema.parse({
      workspace_id: workspaceId,
      week_start: "2026-10-26",
      week_start_day: "monday",
      locations: [],
      departments: [],
      jobs: [],
      shift_types: [],
      employees: [],
      shifts: [],
      closures: [
        {
          id: "c6717f17-012c-8945-cc5c-fca50e875fae",
          location_id: "10000000-0000-4000-8000-000000000001",
          closed_date: "2026-10-28",
          title: "Staff training",
          is_all_day: true,
          kind: "closed",
          opens: null,
          closes: null,
        },
      ],
      referenced_jobs: [],
      referenced_shift_types: [],
    });

    expect(parsed.closures[0]?.id).toBe("c6717f17-012c-8945-cc5c-fca50e875fae");
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
        access: { employee: false, management: "manager" },
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

  it("a membership names its two accesses, at least one held (ROL-CIFT)", () => {
    const base = { id: membershipId, userId, workspaceId, status: "active" as const };
    expect(workspaceMembershipSchema.safeParse(base).success).toBe(false);
    expect(
      workspaceMembershipSchema.safeParse({ ...base, role: "manager" }).success,
    ).toBe(false);
    expect(
      workspaceMembershipSchema.safeParse({
        ...base,
        access: { employee: false, management: null },
      }).success,
    ).toBe(false);
    expect(
      workspaceMembershipSchema.parse({
        ...base,
        access: { employee: true, management: "manager" },
      }).access,
    ).toEqual({ employee: true, management: "manager" });
  });

  it("ranks an access by its management side; somebody who only works ranks as an employee", () => {
    expect(accessRank({ employee: true, management: null })).toBe(1);
    expect(accessRank({ employee: true, management: "manager" })).toBe(2);
    expect(accessRank({ employee: false, management: "admin" })).toBe(3);
    expect(accessRank({ employee: true, management: "owner" })).toBe(4);
    expect(accessClass({ employee: true, management: null })).toBe("employee");
    expect(accessClass({ employee: true, management: "owner" })).toBe("owner");
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
          access: { employee: true, management: null },
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
          access: { employee: true, management: null },
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
        access: { employee: false, management: "manager" },
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
    management_access: "owner",
    employee_access: false,
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
        management_access: null,
    employee_access: true,
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

    expect(context.membership.access).toEqual({ employee: true, management: null });
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
      management_access: "admin",
    employee_access: false,
      permission_keys: [],
      all_locations: true,
      onboarding_status: "complete",
      onboarding_current_step: 4,
      onboarding_revision: 3,
      actions: [],
      location_ids: ["f034b748-2dbc-4f2a-b581-cb24f91d6499"],
      document_restricted: false,
    });

    expect(context.membership.access).toEqual({ employee: false, management: "admin" });
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
        management_access: null,
    employee_access: true,
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
        management_access: null,
    employee_access: true,
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
        phone: "+13105550100",
        street_address: null,
        city: null,
        region: null,
        postal_code: null,
        country_code: null,
        date_of_birth: null,
        emergency_contact_name: "Morgan Reed",
        emergency_contact_relationship: "Spouse",
        emergency_contact_email: "",
        emergency_contact_phone: "+13105550101",
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
      phone: "+13105550100",
      street_address: "100 Main Street",
      city: "Los Angeles",
      region: "CA",
      postal_code: "90012",
      country_code: "US",
      date_of_birth: "1990-01-01",
      emergency_contact_name: "Morgan Reed",
      emergency_contact_relationship: "Spouse",
      emergency_contact_email: "",
      emergency_contact_phone: "+13105550101",
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
        phone: "+13105550100",
        street_address: "100 Main Street",
        city: "Los Angeles",
        region: "CA",
        postal_code: "90012",
        country_code: "US",
        emergency_contact_name: "Morgan Reed",
        emergency_contact_relationship: "Spouse",
        emergency_contact_email: "",
        emergency_contact_phone: "+13105550101",
        date_of_birth: "1990-01-01",
        share_phone_with_teammates: false,
        share_email_with_teammates: false,
      }).date_of_birth,
    ).toBe("1990-01-01");
    expect(() =>
      employeeOnboardingProfileSchema.parse({
        legal_first_name: "Taylor",
        legal_last_name: "Reed",
        phone: "+13105550100",
        street_address: "100 Main Street",
        city: "Los Angeles",
        region: "CA",
        postal_code: "90012",
        country_code: "US",
        emergency_contact_name: "Morgan Reed",
        emergency_contact_relationship: "Spouse",
        emergency_contact_email: "",
        emergency_contact_phone: "+13105550101",
        date_of_birth: "01/01",
        share_phone_with_teammates: false,
        share_email_with_teammates: false,
      }),
    ).toThrow();
  });

});

describe("Management and Owner in the Schedule and drawer reads (BL-218)", () => {
  const managementId = "30000000-0000-4000-8000-000000000001";
  const kitchenId = "30000000-0000-4000-8000-000000000002";
  const ownerJobId = "40000000-0000-4000-8000-000000000001";
  const managerJobId = "40000000-0000-4000-8000-000000000002";
  const cookJobId = "40000000-0000-4000-8000-000000000003";
  const scheduleRead = (departments: unknown[], jobs: unknown[]) => ({
    workspace_id: workspaceId,
    week_start: "2026-08-17",
    week_start_day: "monday",
    locations: [],
    departments,
    jobs,
    shift_types: [],
    employees: [],
    shifts: [],
    closures: [],
    referenced_jobs: [],
    referenced_shift_types: [],
  });
  const scheduleDepartment = { id: managementId, name: "Leadership", color: "#4478A8" };
  const scheduleJob = { id: ownerJobId, name: "Owner", color: "#4478A8", department_id: managementId };

  it("reads the Schedule's system keys and refuses a read without them", () => {
    const parsed = scheduleReadModelSchema.parse(
      scheduleRead([{ ...scheduleDepartment, system_key: "management" }], [{ ...scheduleJob, system_key: "owner" }]),
    );
    expect(parsed.departments[0]?.system_key).toBe("management");
    expect(parsed.jobs[0]?.system_key).toBe("owner");
    expect(() => scheduleReadModelSchema.parse(scheduleRead([scheduleDepartment], []))).toThrow();
    expect(() => scheduleReadModelSchema.parse(scheduleRead([], [scheduleJob]))).toThrow();
  });

  it("reads the archived jobs and shift types the week's shifts name, and refuses a read without them", () => {
    const archived = { id: managementId, name: "Line Cook" };
    const parsed = scheduleReadModelSchema.parse({
      ...scheduleRead([], []),
      referenced_jobs: [archived],
      referenced_shift_types: [{ id: ownerJobId, name: "Brunch" }],
    });
    expect(parsed.referenced_jobs).toEqual([archived]);
    expect(parsed.referenced_shift_types).toEqual([{ id: ownerJobId, name: "Brunch" }]);
    const { referenced_jobs: _jobs, ...withoutJobs } = scheduleRead([], []);
    const { referenced_shift_types: _types, ...withoutTypes } = scheduleRead([], []);
    expect(() => scheduleReadModelSchema.parse(withoutJobs)).toThrow();
    expect(() => scheduleReadModelSchema.parse(withoutTypes)).toThrow();
    expect(() => scheduleReadModelSchema.parse({ ...scheduleRead([], []), referenced_jobs: null })).toThrow();
  });

  it("reads the drawer's departments and each job's department and system key", () => {
    const references = {
      locations: [],
      departments: [
        { id: managementId, name: "Leadership", archived_at: null, system_key: "management" },
        { id: kitchenId, name: "Kitchen", archived_at: null, system_key: null },
      ],
      jobs: [
        { id: ownerJobId, name: "Owner", archived_at: null, department_id: managementId, system_key: "owner" },
        { id: cookJobId, name: "Cook", archived_at: null, department_id: null, system_key: null },
      ],
      invite_roles: [],
    };
    expect(employeeReferenceDataSchema.parse(references)).toEqual(references);
    expect(() => employeeReferenceDataSchema.parse({ ...references, departments: undefined })).toThrow();
    expect(() =>
      employeeReferenceDataSchema.parse({ ...references, jobs: [{ id: cookJobId, name: "Cook", archived_at: null }] }),
    ).toThrow();
  });

  it("says only the Owner job is never primary, and asks for a primary job whatever its department", () => {
    expect(managementAndOwnerRefusals["employee.management_primary"]).toBe(
      "The Owner job can't be marked primary. Choose another job as primary, or leave it empty if they only hold the Owner job.",
    );
    expect(managementAndOwnerRefusals["employee.primary_job_required"]).toBe(
      "Mark one of the jobs as primary, or turn on Remote or Exclude from schedule.",
    );
  });

  it("finds the jobs under Management by its system key, whatever it is called", () => {
    const departments = [
      { id: kitchenId, system_key: null },
      { id: managementId, system_key: "management" as const },
    ];
    const jobs = [
      { id: ownerJobId, department_id: managementId },
      { id: managerJobId, department_id: managementId },
      { id: cookJobId, department_id: kitchenId },
      { id: "40000000-0000-4000-8000-000000000004", department_id: null },
    ];
    expect([...managementJobIds(departments, jobs)].sort()).toEqual([ownerJobId, managerJobId]);
    expect(managementJobIds([], jobs).size).toBe(0);
  });

  const locationId = "10000000-0000-4000-8000-000000000001";
  const managerOnly = {
    first_name: "Maya",
    last_name: "Reed",
    preferred_name: "",
    invitation_email: "",
    start_date: "",
    internal_note: "",
    location_ids: [locationId],
    primary_location_id: locationId,
    job_ids: [managerJobId],
    primary_job_id: null,
    expected_revision: null,
  };

  // EMP-001 C (S2): any job can be primary, a Management job too.
  it("takes a Management job as the primary, leaves a missing one to the database and words what it checks", () => {
    const complete = { ...managerOnly, primary_job_id: managerJobId };
    expect(employeeInputSchema.safeParse(complete).success).toBe(true);
    // No primary marked: the database asks for it (employee.primary_job_required).
    expect(employeeInputSchema.safeParse(managerOnly).success).toBe(true);
    const noLocation = employeeInputSchema.safeParse({ ...complete, location_ids: [], primary_location_id: null });
    expect(noLocation.error?.issues.map((issue) => issue.message)).toEqual([
      managementAndOwnerRefusals["employee.location_required"],
    ]);
    expect(employeeInputSchema.safeParse({ ...complete, primary_location_id: null }).error?.issues[0]?.message).toBe(
      managementAndOwnerRefusals["employee.location_required"],
    );
    expect(employeeInputSchema.safeParse({ ...managerOnly, job_ids: [] }).error?.issues[0]?.message).toBe(
      managementAndOwnerRefusals["employee.job_required"],
    );
  });

  // EMP-001 K4 (user decision 2026-09-30): a manager who is not Remote has at
  // least one location, excluded from the schedule or not. The role is not in
  // the payload, so the rule stands beside the schema: the database decides
  // (employee.manager_location_required), and a form that knows the role asks
  // the same rule first.
  describe("a manager needs a location (K4)", () => {
    const sentence = managementAndOwnerRefusals["employee.manager_location_required"];
    const nowhere = { location_ids: [], is_remote: false, is_excluded_from_schedule: true };

    it("has a sentence a person reads, which sends nobody to Exclude from schedule", () => {
      expect(managementAndOwnerSentence("employee.manager_location_required")).toBe(sentence);
      expect(sentence).toMatch(/manager/i);
      expect(sentence).not.toMatch(/Exclude from schedule/);
    });

    it("refuses a manager with no location, excluded from the schedule or not", () => {
      expect(managerLocationRefusal("manager", nowhere)).toBe(sentence);
      const onTheSchedule = { ...nowhere, is_excluded_from_schedule: false };
      expect(managerLocationRefusal("manager", onTheSchedule)).toBe(sentence);
    });

    it("lets a Remote manager and a manager with a location through", () => {
      expect(managerLocationRefusal("manager", { ...nowhere, is_remote: true })).toBeUndefined();
      expect(managerLocationRefusal("manager", { ...nowhere, location_ids: [locationId] })).toBeUndefined();
    });

    it("asks nothing of an employee, an admin, the owner or somebody with no role yet", () => {
      for (const role of ["employee", "admin", "owner", null, undefined] as const) {
        expect(managerLocationRefusal(role, nowhere)).toBeUndefined();
      }
    });

    it("stays out of the payload: the record parses the same whoever holds it", () => {
      const record = { ...managerOnly, location_ids: [], primary_location_id: null, job_ids: [], is_excluded_from_schedule: true };
      expect(employeeInputSchema.parse({ ...record, is_manager_record: true })).not.toHaveProperty("is_manager_record");
    });
  });
});

// BL-503: the schemas follow KARARLAR "Form ve girdi kuralları (ABD)".
// BL-969: the data follows it too, so a read takes the schema a write takes.
// BL-969 review: the Employees drawer and Account > Profile read a person's
// contact with the rule the data keeps.
describe("a person's contact read with the rule the data keeps (BL-969)", () => {
  const contact = {
    legal_first_name: "Taylor",
    legal_last_name: "Reed",
    phone: "+13105559999",
    date_of_birth: null,
    emergency_contact_name: "Morgan Reed",
    emergency_contact_relationship: "Spouse",
    emergency_contact_email: "",
    emergency_contact_phone: "+13105550001",
    share_phone_with_teammates: false,
    share_email_with_teammates: false,
  };
  const privateContact = employeeDetailSchema.shape.private_contact;

  it("takes phones only in E.164 and names only under the letter rule", () => {
    expect(privateContact.safeParse(contact).success).toBe(true);
    expect(privateContact.safeParse({ ...contact, phone: null, emergency_contact_phone: null, emergency_contact_name: null, emergency_contact_relationship: null }).success).toBe(true);
    expect(privateContact.safeParse({ ...contact, phone: "3105559999" }).success).toBe(false);
    expect(privateContact.safeParse({ ...contact, emergency_contact_phone: "555-0100" }).success).toBe(false);
    for (const field of ["legal_first_name", "legal_last_name", "emergency_contact_name", "emergency_contact_relationship", "city"]) {
      expect(privateContact.safeParse({ ...contact, [field]: "Şişli" }).success, field).toBe(false);
    }
  });

  it("reads a person's own employment record the same way", () => {
    const row = {
      workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      workspace_name: "Meyhouse",
      employee_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe",
      preferred_name: "",
      phone: "+13105559999",
      emergency_contact_name: "",
      emergency_contact_relationship: "",
      emergency_contact_phone: "",
      emergency_contact_email: "",
    };
    expect(employmentContactRecordFromRow(row).emergencyContactPhone).toBe("");
    expect(employmentContactRecordFromRow({ ...row, emergency_contact_phone: "+14155550100" }).emergencyContactPhone).toBe("+14155550100");
    expect(() => employmentContactRecordFromRow({ ...row, emergency_contact_phone: "4155550100" })).toThrow();
    expect(() => employmentContactRecordFromRow({ ...row, phone: "+442079460958" })).toThrow();
  });
});

describe("US form rules on the schemas (BL-503, BL-969)", () => {
  const profile = {
    legal_first_name: "Taylor",
    legal_last_name: "Reed",
    phone: "+13105550100",
    street_address: "100 Main Street",
    city: "Los Angeles",
    region: "CA",
    postal_code: "90012",
    country_code: "US" as const,
    date_of_birth: "1990-01-01",
    emergency_contact_name: "Morgan Reed",
    emergency_contact_relationship: "Spouse",
    emergency_contact_email: "",
    emergency_contact_phone: "+13105550101",
    share_phone_with_teammates: false,
    share_email_with_teammates: false,
  };
  const location = {
    name: "Downtown",
    short_name: "DT",
    street_address: "1 Main St",
    city: "Los Angeles",
    region: "CA",
    postal_code: "90001",
    country_code: "US",
    timezone: "America/Los_Angeles",
  };

  it("refuses Turkish-only letters in people's names", () => {
    expect(ownerLegalNameSchema.safeParse({ firstName: "Mert", middleName: "", lastName: "Tepebaş" }).success).toBe(false);
    expect(ownerLegalNameSchema.safeParse({ firstName: "José", middleName: "", lastName: "Peña" }).success).toBe(true);
    for (const field of ["legal_first_name", "legal_middle_name", "legal_last_name", "preferred_name", "emergency_contact_name", "emergency_contact_relationship"]) {
      expect(employeeOnboardingProfileSchema.safeParse({ ...profile, [field]: "Ayşe" }).success, field).toBe(false);
    }
  });

  it("refuses Turkish-only letters in addresses and places", () => {
    for (const field of ["street_address", "city", "region"]) {
      expect(employeeOnboardingProfileSchema.safeParse({ ...profile, [field]: "Kadıköy" }).success, field).toBe(false);
      expect(locationInputSchema.safeParse({ ...location, [field]: "Kadıköy" }).success, field).toBe(false);
    }
    expect(locationInputSchema.safeParse({ ...location, name: "Beşiktaş" }).success).toBe(false);
    // The same valid colour both ways, so only the letters decide.
    expect(departmentInputSchema.safeParse({ name: "Mutfak", color: "#4478A8" }).success).toBe(true);
    expect(departmentInputSchema.safeParse({ name: "Mutfak Ağı", color: "#4478A8" }).success).toBe(false);
    expect(jobInputSchema.safeParse({ name: "Garson", color: "#4478A8", department_id: null }).success).toBe(true);
    expect(jobInputSchema.safeParse({ name: "Garsonİ", color: "#4478A8", department_id: null }).success).toBe(false);
  });

  it("refuses the letters in a workspace name, the one schema owner setup and Create workspace use", () => {
    expect(workspaceNameInputSchema.safeParse("Rio Grill").success).toBe(true);
    expect(workspaceNameInputSchema.safeParse("Kadıköy Cafe").success).toBe(false);
  });

  // The drawer never writes it: the database keeps it for the employee's own
  // request (KK-205). A rule here only stopped every other change on the record.
  it("leaves the preferred name out of the manager's write", () => {
    const employee = {
      first_name: "Taylor",
      last_name: "Reed",
      preferred_name: "Ayşe",
      invitation_email: "",
      start_date: "",
      internal_note: "",
      location_ids: [],
      primary_location_id: null,
      job_ids: [],
      primary_job_id: null,
      is_remote: true,
      expected_revision: 1,
    };
    expect(employeeInputSchema.safeParse(employee).error?.issues).toBeUndefined();
    expect(employeeInputSchema.safeParse({ ...employee, first_name: "Ayşe" }).success).toBe(false);
  });

  // BL-969: one schema; the database refuses what the forms refuse.
  it("reads a department, a job and a location with the rule a write takes", () => {
    const department = {
      id: "12000000-0000-4000-8000-000000000001",
      workspace_id: workspaceId,
      color: "#4478A8",
      archived_at: null,
      system_key: null,
    };
    expect(departmentSchema.safeParse({ ...department, name: "Kitchen" }).success).toBe(true);
    expect(departmentSchema.safeParse({ ...department, name: "Mutfak Ağı" }).success).toBe(false);
    expect(jobSchema.safeParse({ ...department, department_id: null, system_key: null, name: "Aşçı" }).success).toBe(false);
    const saved = {
      ...location,
      id: "11000000-0000-4000-8000-000000000001",
      workspace_id: workspaceId,
      phone: null,
      sort_order: 0,
      archived_at: null,
    };
    expect(locationSchema.safeParse(saved).success).toBe(true);
    for (const field of ["name", "street_address", "city", "region"]) {
      expect(locationSchema.safeParse({ ...saved, [field]: "Kadıköy" }).success, field).toBe(false);
    }
    expect(
      jobDetailsChangesSchema.safeParse({
        job: { name: "Cook", color: "#4478A8", department_id: null },
        expected_job: { name: "Aşçı", color: "#4478A8", department_id: null },
      }).success,
    ).toBe(false);
  });

  it("reads an onboarding profile, an owner's legal name and an account phone with the rule a write takes", () => {
    const onboardingRead = (saved: Record<string, unknown>) =>
      employeeOnboardingSchema.shape.profile.safeParse(saved).success;
    expect(onboardingRead(profile)).toBe(true);
    expect(onboardingRead({ ...profile, city: "Kadıköy" })).toBe(false);
    expect(onboardingRead({ ...profile, emergency_contact_phone: "4155550100" })).toBe(false);
    expect(
      ownerLegalNameResponseSchema.safeParse({
        legalName: { firstName: "Mert", middleName: "", lastName: "Tepebaş" },
      }).success,
    ).toBe(false);
    const account = {
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      email: "owner@example.test",
      displayName: "Owner",
      theme: "system" as const,
    };
    expect(accountProfileSchema.safeParse({ ...account, phone: "+14155550100" }).success).toBe(true);
    expect(accountProfileSchema.safeParse({ ...account, phone: "+442079460958" }).success).toBe(false);
    expect(accountProfileSchema.safeParse({ ...account, phone: "4155550100" }).success).toBe(false);
  });

  it("takes phone numbers as a US number in E.164 only", () => {
    expect(employeeOnboardingProfileSchema.safeParse({ ...profile, phone: "3105550100" }).success).toBe(false);
    expect(employeeOnboardingProfileSchema.safeParse({ ...profile, emergency_contact_phone: "+442079460958" }).success).toBe(false);
    expect(normalizeAccountPhone("(310) 555-0100")).toBe("+13105550100");
    expect(() => normalizeAccountPhone("555 0100")).toThrow();
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

  it("orders departments and jobs by name, so no read carries a hand order (BL-496)", () => {
    const id = "30000000-0000-4000-8000-000000000009";
    const scheduleDepartment = { id, name: "Leadership", color: "#4478A8" };
    const scheduleJob = { ...scheduleDepartment, department_id: id };
    const base = { ...scheduleDepartment, workspace_id: workspaceId, archived_at: null, sort_order: 3 };
    expect(departmentSchema.parse({ ...base, system_key: null })).not.toHaveProperty("sort_order");
    expect(jobSchema.parse({ ...base, department_id: null, system_key: null, lineup_icons: [] })).not.toHaveProperty("sort_order");
    expect(scheduleDepartmentSchema.parse({ ...scheduleDepartment, sort_order: 3, system_key: null })).not.toHaveProperty("sort_order");
    expect(scheduleJobSchema.parse({ ...scheduleJob, sort_order: 3, system_key: null })).not.toHaveProperty("sort_order");
    // Shift types and labels keep the order a manager sets by hand.
    expect(scheduleShiftLabelSchema.parse({ id, name: "Training", color: "#A855F7", sort_order: 3 }).sort_order).toBe(3);
    expect(scheduleShiftLabelSchema.safeParse({ id, name: "Training", color: "#A855F7" }).success).toBe(false);
  });

  it("keeps the system key that tells Management and the Owner job apart (BL-218)", () => {
    const department = {
      id: "10000000-0000-4000-8000-000000000001",
      workspace_id: workspaceId,
      name: "Leadership",
      color: "#4478A8",
      archived_at: null,
    };
    const job = {
      ...department, id: "20000000-0000-4000-8000-000000000001", department_id: department.id, name: "Owner",
      lineup_icons: ["007-gm"],
    };
    expect(departmentSchema.parse({ ...department, system_key: "management" }).system_key).toBe("management");
    expect(jobSchema.parse({ ...job, system_key: "owner" }).system_key).toBe("owner");
    expect(jobSchema.parse({ ...job, system_key: null }).system_key).toBeNull();
    // A read that drops the key would let Settings → Jobs treat Management as an ordinary team.
    expect(() => departmentSchema.parse(department)).toThrow();
    expect(() => jobSchema.parse(job)).toThrow();
    expect(() => jobSchema.parse({ ...job, system_key: "management" })).toThrow();
  });
});

describe("job Lineup drawings (AVATAR-IKON)", () => {
  const job = {
    id: "20000000-0000-4000-8000-000000000002",
    workspace_id: workspaceId,
    department_id: null,
    name: "Server",
    color: "#4478A8",
    archived_at: null,
    system_key: null,
  };

  it("reads every job with its drawings, archive keys in order", () => {
    expect(jobSchema.parse({ ...job, lineup_icons: ["003-bartender", "001-server"] }).lineup_icons)
      .toEqual(["003-bartender", "001-server"]);
    expect(jobSchema.parse({ ...job, lineup_icons: [] }).lineup_icons).toEqual([]);
    // A read that drops the list would leave the Lineup with nothing to draw.
    expect(jobSchema.safeParse(job).success).toBe(false);
    expect(jobSchema.safeParse({ ...job, lineup_icons: ["999-unicorn"] }).success).toBe(false);
  });

  it("takes up to 24 archive drawings on a job's details, or none to leave the list to the database", () => {
    const details = { name: "Server", color: "#4478A8", department_id: null };
    expect(jobInputSchema.parse(details)).not.toHaveProperty("lineup_icons");
    expect(jobInputSchema.parse({ ...details, lineup_icons: ["001-server"] }).lineup_icons).toEqual(["001-server"]);
    expect(maxJobLineupIcons).toBe(24);
    expect(jobInputSchema.safeParse({ ...details, lineup_icons: Array(24).fill("001-server") }).success).toBe(true);
    expect(jobInputSchema.safeParse({ ...details, lineup_icons: Array(25).fill("001-server") }).success).toBe(false);
    expect(jobInputSchema.safeParse({ ...details, lineup_icons: ["999-unicorn"] }).success).toBe(false);
    expect(
      jobDetailsChangesSchema.parse({
        job: { ...details, lineup_icons: ["001-server"] },
        expected_job: { ...details, lineup_icons: [] },
      }).expected_job?.lineup_icons,
    ).toEqual([]);
  });

  it("leaves a department's new jobs to the database's suggestion", () => {
    const jobs = [{ name: "Server", color: "#4478A8", lineup_icons: ["001-server"] }];
    expect(departmentJobsInputSchema.parse({ jobs }).jobs[0]).not.toHaveProperty("lineup_icons");
    expect(
      departmentWithJobsInputSchema.parse({ department: { name: "Floor", color: "#4478A8" }, jobs }).jobs[0],
    ).not.toHaveProperty("lineup_icons");
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
  // BL-1031: Settings and the Schedule editor refuse equal hours in one sentence.
  it("refuses equal default hours in the Schedule editor's words", () => {
    const result = shiftTypeInputSchema.safeParse({
      name: "Invalid",
      color: "#7B5EA7",
      default_start_time: "09:00",
      default_end_time: "09:00",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Start and end time cannot be the same.",
    ]);
  });
  // PRESET-SAAT (S-183): Dinner 4:15–11:30 PM is primary; 5–11 PM and 6–11:30 PM are its options.
  it("keeps a type's time options beside its primary hours and refuses repeats", () => {
    const dinner = { name: "Dinner", color: "#7B5EA7", default_start_time: "16:15", default_end_time: "23:30" };
    expect(shiftTypeInputSchema.parse(dinner).time_options).toEqual([]);
    expect(
      shiftTypeInputSchema.parse({
        ...dinner,
        time_options: [{ start_time: "17:00", end_time: "23:00" }, { start_time: "18:00", end_time: "23:30" }],
      }).time_options,
    ).toHaveLength(2);
    expect(shiftTypeTimesRefusal({ ...dinner, time_options: [{ start_time: "16:15", end_time: "23:30" }] })).toEqual({
      index: 0,
      message: "This time is already in the list.",
    });
    expect(
      shiftTypeTimesRefusal({
        ...dinner,
        time_options: [{ start_time: "17:00", end_time: "23:00" }, { start_time: "17:00", end_time: "23:00" }],
      }),
    ).toEqual({ index: 1, message: "This time is already in the list." });
    expect(shiftTypeTimesRefusal({ ...dinner, time_options: [{ start_time: "17:00", end_time: "17:00" }] })?.message).toBe(
      "Start and end time cannot be the same.",
    );
    expect(shiftTypeInputSchema.safeParse({ ...dinner, time_options: [{ start_time: "16:15", end_time: "23:30" }] }).success).toBe(
      false,
    );
    const nine = Array.from({ length: 9 }, (_, n) => ({ start_time: `0${n}:30`, end_time: "12:00" }));
    expect(shiftTypeInputSchema.safeParse({ ...dinner, time_options: nine }).success).toBe(false);
  });
  it("reads a Schedule shift type without time options (an older reply) without failing", () => {
    expect(
      scheduleShiftTypeSchema.parse({
        id: "34000000-0000-4000-8000-000000000001",
        name: "Dinner",
        color: "#7B5EA7",
        sort_order: 0,
        default_start_time: "16:15",
        default_end_time: "23:30",
      }).time_options,
    ).toBeUndefined();
  });
});

describe("announcement draft schemas (EKRAN-08)", () => {
  const kadikoy = "34000000-0000-4000-8000-000000000001";
  const shift = "34000000-0000-4000-8000-000000000009";
  const base = {
    title: "Christmas Eve",
    body: "",
    category: "holiday",
    category_other: null,
    starts_on: "2027-12-24",
    ends_on: null,
    event_from: null,
    event_until: null,
    recurrence: "date",
    on_important_dates: true,
    on_calendar: false,
    on_schedule: true,
    ask_ack: false,
    publish_at: null,
    locations: [{ location_id: kadikoy, day: "short", opens: "10:00", closes: "15:00" }],
    people: [],
  };

  it("accepts a holiday with short hours at one location, and late closing the next day", () => {
    expect(announcementDraftSchema.parse(base)).toMatchObject({ choices: {}, bring_back: [] });
    expect(
      announcementDraftSchema.parse({ ...base, locations: [{ location_id: kadikoy, day: "short", opens: "17:00", closes: "02:00" }] })
        .locations[0],
    ).toMatchObject({ closes: "02:00" });
  });

  it("knows the eight categories and the four repeats", () => {
    expect(() => announcementDraftSchema.parse({ ...base, category: "closed_day" })).toThrow();
    expect(() => announcementDraftSchema.parse({ ...base, recurrence: "annual" })).toThrow();
  });

  it("takes new hours for a shift only with both times", () => {
    expect(
      announcementDraftSchema.parse({ ...base, choices: { [shift]: { choice: "edit", from: "10:00", until: "15:00" } } }).choices,
    ).toEqual({ [shift]: { choice: "edit", from: "10:00", until: "15:00" } });
    expect(() => announcementDraftSchema.parse({ ...base, choices: { [shift]: { choice: "edit", from: "10:00" } } })).toThrow();
    expect(() => announcementDraftSchema.parse({ ...base, choices: { [shift]: { choice: "close" } } })).toThrow();
  });

  it("reads the preview's problems and the shifts it would change", () => {
    const preview = announcementPreviewSchema.parse({
      problems: [{ tab: "where", field: `location:${kadikoy}`, code: "hours_taken", message: "Taken.", required: false }],
      fingerprint: "abc",
      shifts: [{
        id: shift, source_id: shift, location_id: kadikoy, location_name: "Kadikoy", scheduled_date: "2027-12-24",
        employee_id: null, employee_user_id: null, employee_name: null, job_id: null, job_name: "Unassigned position",
        start_time: "16:00", end_time: "22:00", day: "short", opens: "10:00", closes: "15:00", reason: "after_close",
        started: false, tied: false, changed_in_schedule: false, default: "remove", choice: "remove", from: null, until: null,
        outcome: "removed",
      }],
      hidden_count: 0,
      quiet_count: 0,
      counts: { removed: 1, edited: 0, opened: 0, kept: 0, quiet: 0 },
      bring_back: [],
      time_zone: "Europe/Istanbul",
      starts_at: "2027-12-23T21:00:00+00:00",
      ends_at: "2027-12-24T21:00:00+00:00",
      recipient_count: 3,
    });
    expect(preview.shifts[0]?.reason).toBe("after_close");
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

  it("requires document read access before document management", () => {
    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "Policy manager",
        description: "",
        access_class: "manager",
        permission_keys: ["workspace.read", "documents.manage"],
      }),
    ).toThrow("documents.manage requires its read access");
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

  it("takes a released shift and a draft that left the shift out", () => {
    const pickup = { ...undone, exchange_kind: "cover", draft_employee_id: null, draft_employee_name: null, shift_ids: [] };
    expect(schedulePublishFindingSchema.parse(pickup)).toEqual(pickup);
  });

  it("refuses the open pickup kind, which is gone (TAKAS-RELEASE)", () => {
    expect(schedulePublishFindingSchema.safeParse({ ...undone, exchange_kind: "open_pickup" }).success).toBe(false);
  });
});

describe("announcement history", () => {
  it("reads History newest on top, with who did it and what it told", () => {
    const parsed = announcementDetailSchema.parse({
      ...{
        id: "70000000-0000-4000-8000-000000000002", title: "Inspection", body: "", category: "inspection", category_other: null,
        status: "published", display_status: "published", publish_error_code: null, starts_on: "2027-03-02", ends_on: null,
        event_from: null, event_until: null, recurrence: "none", on_important_dates: true, on_calendar: false,
        on_schedule: false, ask_ack: false, time_zone: "America/Los_Angeles", publish_at: null,
        published_at: "2027-03-01T17:00:00+00:00", unpublished_at: null, archived_at: null,
        starts_at: "2027-03-02T08:00:00+00:00", ends_at: "2027-03-03T08:00:00+00:00", locations: [],
        author_user_id: null, author_name: "Workspace member", revision: 2, content_revision: 1,
        created_at: "2027-03-01T16:00:00+00:00", updated_at: "2027-03-01T17:00:00+00:00", repeats_from: null,
        can_edit: true, can_unschedule: false, can_unpublish: true, can_archive: false, asked_to_acknowledge: false,
        acknowledged_at: null, content_changed_since_acknowledged: false, respondent_count: null, acknowledged_count: null,
        recipient_count: 4, shift_change_count: 0, my_changes: [],
      },
      history: [
        { id: "70000000-0000-4000-8000-000000000005", action: "published", detail: { told: 4 },
          changed_at: "2027-03-01T17:00:00+00:00", actor_user_id: null, actor_name: "Taylor" },
        { id: "70000000-0000-4000-8000-000000000004", action: "created", detail: {},
          changed_at: "2027-03-01T16:00:00+00:00", actor_user_id: null, actor_name: null },
      ],
    });
    expect(parsed.history?.map((entry) => entry.action)).toEqual(["published", "created"]);
  });
});
