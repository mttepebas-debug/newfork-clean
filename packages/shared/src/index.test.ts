import { describe, expect, it } from "vitest";
import {
  activeWorkspaceContextSchema,
  activeWorkspaceContextFromRow,
  applyTimeAmendmentInputSchema,
  canAccessWorkspace,
  captureTimeEventInputSchema,
  departmentInputSchema,
  documentTypeInputSchema,
  employeeAvailabilityInputSchema,
  employeeOnboardingProfileSchema,
  healthResponseSchema,
  importantDateInputSchema,
  jobInputSchema,
  locationInputSchema,
  permissionsForRole,
  scheduleReadModelSchema,
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
  workspaceRoleInputSchema,
  productBoundary,
  schedulingSettingsInputSchema,
  shiftTypeInputSchema,
  signatureRetentionPolicyInputSchema,
  signatureTemplateDraftInputSchema,
  timeSessionSchema,
} from "./index";

const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
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
      locations: [
        { id: "11000000-0000-4000-8000-000000000001", name: "Main" },
      ],
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
      schedulePublicationOverrideInputSchema.parse({
        finding_id: findingId,
        reason: "Employee confirmed availability for this service.",
      }).reason,
    ).toContain("confirmed");
    expect(() =>
      schedulePublicationOverrideInputSchema.parse({
        finding_id: findingId,
        reason: "ok",
      }),
    ).toThrow();
    expect(
      schedulePublicationPreflightAckSchema.parse({
        fingerprint: preview.fingerprint,
        decisions: [
          {
            finding_id: findingId,
            reason: "Employee confirmed availability for this service.",
          },
        ],
      }),
    ).toEqual({
      fingerprint: preview.fingerprint,
      decisions: [
        {
          finding_id: findingId,
          reason: "Employee confirmed availability for this service.",
        },
      ],
    });
    expect(
      schedulePublishResultSchema.parse({
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
        ],
      }).status,
    ).toBe("schedule_conflicts");
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
      }).kept_worked_count,
    ).toBe(0);
    expect(
      scheduleUnpublishResultSchema.parse({
        status: "unpublished",
        workspace_id: workspaceId,
        week_start: "2026-08-17",
        location_ids: ["11000000-0000-4000-8000-000000000001"],
        publication_ids: ["86000000-0000-4000-8000-000000000001"],
        kept_worked_count: 2,
        unpublished_at: "2026-08-17T12:00:00.000Z",
      }).kept_worked_count,
    ).toBe(2);
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
            availability: null,
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
    });
    expect(parsed.locations[0]?.publication_status).toBe("published");
    expect(parsed.settings.time_format).toBe("12h");
    expect(parsed.employees[0]?.shift_type_ids ?? []).toEqual([]);
    expect(parsed.employees[0]?.is_excluded_from_schedule ?? false).toBe(
      false,
    );
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

  it("validates exact time capture without payroll or surveillance fields", () => {
    const input = captureTimeEventInputSchema.parse({
      employee_id: "15000000-0000-4000-8000-000000000001",
      location_id: "11000000-0000-4000-8000-000000000001",
      session_id: null,
      event_type: "clock_in",
      occurred_at: "2026-08-17T16:00:00.000Z",
      idempotency_key: "a1000000-0000-4000-8000-000000000001",
      source: "mobile_web",
    });
    expect(input).not.toHaveProperty("scheduled_at");
    expect(input).not.toHaveProperty("latitude");
    expect(input).not.toHaveProperty("payroll");
  });

  it("keeps session capture and review states independent", () => {
    expect(
      timeSessionSchema.parse({
        id: "a2000000-0000-4000-8000-000000000001",
        workspace_id: workspaceId,
        employee_id: "15000000-0000-4000-8000-000000000001",
        location_id: "11000000-0000-4000-8000-000000000001",
        capture_state: "complete",
        review_state: "reopened",
        started_at: "2026-08-17T16:00:00.000Z",
        ended_at: "2026-08-17T20:00:00.000Z",
        effective_started_at: "2026-08-17T16:00:00.000Z",
        effective_ended_at: "2026-08-17T20:00:00.000Z",
        last_event_at: "2026-08-17T20:00:00.000Z",
        revision: 3,
      }).review_state,
    ).toBe("reopened");
  });

  it("requires bounded amendments with an increasing interval", () => {
    expect(() =>
      applyTimeAmendmentInputSchema.parse({
        session_id: "a2000000-0000-4000-8000-000000000001",
        expected_revision: 3,
        effective_started_at: "2026-08-17T20:00:00.000Z",
        effective_ended_at: "2026-08-17T16:00:00.000Z",
        reason: "Corrected from employee report",
        idempotency_key: "a3000000-0000-4000-8000-000000000001",
      }),
    ).toThrow("Amended end must be after its start");
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
      }),
    ).toThrow("Membership workspace does not match context");
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
      },
      ["f034b748-2dbc-4f2a-b581-cb24f91d6499"],
    );

    expect(context.membership.role).toBe("employee");
    expect(context.membership.roleName).toBe("Host");
    expect(context.permissions).toEqual(["workspace.read", "roles.read"]);
    expect(context.onboarding).toEqual({ status: "complete", currentStep: 2 });
    expect(context.locationScope).toEqual({
      allLocations: false,
      locationIds: ["f034b748-2dbc-4f2a-b581-cb24f91d6499"],
    });
  });

  it("maps an account workspace row without leaking tenant details", async () => {
    const { workspaceSummaryFromRow } = await import("./index");
    expect(
      workspaceSummaryFromRow({
        workspace_id: workspaceId,
        workspace_name: "Northstar",
        workspace_role: "owner",
        is_active: true,
        onboarding_status: "incomplete",
        onboarding_current_step: 1,
      }),
    ).toEqual({
      id: workspaceId,
      name: "Northstar",
      role: "owner",
      isActive: true,
      onboarding: { status: "incomplete", currentStep: 1 },
    });
  });
});

describe("employee onboarding schemas", () => {
  it("requires a complete private profile without accepting an SSN field", () => {
    const profile = employeeOnboardingProfileSchema.parse({
      legal_first_name: "Taylor",
      legal_last_name: "Reed",
      preferred_name: "",
      phone: "3105550100",
      street_address: "1 Main St",
      city: "Los Angeles",
      region: "CA",
      postal_code: "90001",
      country_code: "US",
      date_of_birth: "1990-01-01",
      emergency_contact_name: "Morgan Reed",
      emergency_contact_phone: "3105550101",
      share_phone_with_teammates: false,
      share_email_with_teammates: false,
      ssn: "123456789",
    });
    expect(profile).not.toHaveProperty("ssn");
  });

  it("requires one explicit state for each weekday", () => {
    const days = Array.from({ length: 7 }, (_, day) => ({
      day,
      mode: "unrestricted" as const,
      windows: [],
    }));
    expect(
      employeeAvailabilityInputSchema.parse({
        timezone: "America/Los_Angeles",
        days,
      }).days,
    ).toHaveLength(7);
    expect(() =>
      employeeAvailabilityInputSchema.parse({
        timezone: "America/Los_Angeles",
        days: [...days.slice(0, 6), days[0]],
      }),
    ).toThrow("Each weekday must be provided once");
  });
});

describe("organization basics schemas", () => {
  it("normalizes valid location input", () => {
    expect(
      locationInputSchema.parse({
        name: "  Downtown  ",
        street_address: "1 Main St",
        city: "Los Angeles",
        region: "CA",
        postal_code: "90001",
        country_code: "US",
        timezone: "America/Los_Angeles",
      }).name,
    ).toBe("Downtown");
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
        conflict_policy: "block",
        availability_enforcement: "hard",
        time_format: "24h",
      }),
    ).toMatchObject({
      week_start_day: "sunday",
      conflict_policy: "block",
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
    ).toThrow("Schedule management requires schedule access");
  });

  it("requires document read access before document management", () => {
    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "Document manager",
        description: "",
        access_class: "manager",
        permission_keys: ["workspace.read", "documents.manage"],
      }),
    ).toThrow("Document management requires document access");
  });

  it("requires Schedule Requests read and manage dependencies", () => {
    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "Time off reviewer",
        description: "",
        access_class: "manager",
        permission_keys: ["workspace.read", "schedule.time_off_requests.read"],
      }),
    ).toThrow("Time off request access requires schedule access");
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
    ).toThrow("Shift change request management requires request access");
  });

  it("requires template read access before template management", () => {
    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "Policy manager",
        description: "",
        access_class: "manager",
        permission_keys: ["workspace.read", "signature_templates.manage"],
      }),
    ).toThrow("Acknowledgement template management requires template access");
  });

  it("requires employee read and role access for employee management", () => {
    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "People editor",
        description: "",
        access_class: "manager",
        permission_keys: ["workspace.read", "employees.manage"],
      }),
    ).toThrow("Employee management requires employee directory access");

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
    ).toThrow("Employee access management requires employee and role access");
  });

  it("requires time read permissions before capture or location management", () => {
    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "Clock only",
        description: "",
        access_class: "employee",
        permission_keys: ["workspace.read", "time.capture.own"],
      }),
    ).toThrow("Own time capture and corrections require own time access");
    expect(() =>
      workspaceRoleInputSchema.parse({
        name: "Time editor",
        description: "",
        access_class: "manager",
        permission_keys: ["workspace.read", "time.amend.location"],
      }),
    ).toThrow("Location time management requires location time access");
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
      }).tracks_expiry,
    ).toBe(true);
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
