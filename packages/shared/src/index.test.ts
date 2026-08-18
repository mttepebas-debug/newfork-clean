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
  jobInputSchema,
  locationInputSchema,
  permissionsForRole,
  scheduleReadModelSchema,
  schedulePublicationOverrideInputSchema,
  schedulePublicationPreviewSchema,
  scheduleAutoFillPreviewSchema,
  scheduleExportRequestSchema,
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
        time_format: "12h",
        include_unassigned: true,
        include_notes: false,
        include_scheduled_hours: true,
        csv_delimiter: ",",
      },
    });
    expect(request).not.toHaveProperty("payroll");
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
          code: "availability",
          severity: "soft",
          overrideable: true,
          message: "Alex is unavailable for this shift.",
          location_id: "11000000-0000-4000-8000-000000000001",
          employee_id: "51000000-0000-4000-8000-000000000001",
          scheduled_date: "2026-08-17",
          shift_ids: ["71000000-0000-4000-8000-000000000001"],
        },
      ],
    });
    expect(preview.status).toBe("override_required");
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
  });

  it("validates a location-scoped published schedule read model", () => {
    const locationId = "10000000-0000-4000-8000-000000000001";
    const jobId = "20000000-0000-4000-8000-000000000001";
    const employeeId = "30000000-0000-4000-8000-000000000001";
    expect(
      scheduleReadModelSchema.parse({
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
            note: "",
            warning_codes: [],
          },
        ],
        closures: [],
      }).locations[0]?.publication_status,
    ).toBe("published");
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
      }),
    ).toMatchObject({ week_start_day: "sunday", conflict_policy: "block" });
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
