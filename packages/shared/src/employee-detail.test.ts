import { describe, expect, it } from "vitest";
import { employeeDetailSchema, employeeSummarySchema } from "./index";

// BL-080: the owner's private record is opened at setup with the legal name
// only, so the emergency contact is null until they give one. Team > the
// owner's panel must still read it (it answered 500 while the schema said no).
describe("employee detail private contact", () => {
  const owner = {
    id: "97f65b16-a7ad-4f50-990e-d89030ac4701",
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    employee_code: "NF-001",
    first_name: "Mert",
    last_name: "Tepebas",
    preferred_name: "",
    display_name: "Mert Tepebas",
    invitation_email: null,
    start_date: null,
    primary_location_id: null,
    primary_location_name: null,
    location_count: 0,
    primary_job_id: null,
    primary_job_name: null,
    job_count: 0,
    role_name: "Owner",
    is_workspace_owner: true,
    access: { employee: false, management: "owner" },
    display_status: "active",
    archived_at: null,
    revision: 1,
    user_id: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
    internal_note: "",
    locations: [],
    jobs: [],
    invitation: null,
    onboarding: { status: "not_requested", required_documents: 0, completed_documents: 0 },
    events: [],
    allowed: {
      save: true,
      terminate: false,
      archive: false,
      remove_access: false,
      change_role: false,
      make_admin: false,
      invite: false,
      onboarding_review: false,
    },
  };
  const legalNameOnly = {
    legal_first_name: "Mert",
    legal_middle_name: "",
    legal_last_name: "Tepebas",
    phone: null,
    date_of_birth: null,
    emergency_contact_name: null,
    emergency_contact_relationship: null,
    emergency_contact_email: "",
    emergency_contact_phone: null,
    share_phone_with_teammates: false,
    share_email_with_teammates: false,
  };

  it("reads an owner whose private record holds only a legal name", () => {
    const detail = employeeDetailSchema.parse({ ...owner, private_contact: legalNameOnly });
    expect(detail.private_contact?.legal_last_name).toBe("Tepebas");
    expect(detail.private_contact?.emergency_contact_name).toBeNull();
    expect(detail.private_contact?.emergency_contact_phone).toBeNull();
  });

  // FB-6.2 .7b visual QA: somebody who may read private fields, looking at a
  // person with no private record yet, gets this object; null means they may
  // not read them at all (KK-35 S3).
  it("reads the empty private contact of a person with no private record yet", () => {
    const detail = employeeDetailSchema.parse({
      ...owner,
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
    expect(detail.private_contact).not.toBeNull();
    expect(detail.private_contact?.legal_first_name).toBeUndefined();
  });

  it("still refuses an empty contact name where one is given", () => {
    expect(() =>
      employeeDetailSchema.parse({
        ...owner,
        private_contact: { ...legalNameOnly, emergency_contact_name: "", emergency_contact_phone: "4155550199" },
      }),
    ).toThrow();
  });
});

// FB-6.2 .7a: the drawer opens its buttons from what the server says the
// reader may do to this record (get_employee_detail_service `allowed`), not
// from the reader's role name.
describe("employee detail allowed actions", () => {
  const base = employeeDetailSchema.parse({
    id: "97f65b16-a7ad-4f50-990e-d89030ac4701",
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    employee_code: "NF-002",
    first_name: "Emre",
    last_name: "Kaya",
    preferred_name: "",
    display_name: "Emre Kaya",
    invitation_email: null,
    start_date: null,
    primary_location_id: null,
    primary_location_name: null,
    location_count: 0,
    primary_job_id: null,
    primary_job_name: null,
    job_count: 0,
    role_name: "Employee",
    is_workspace_owner: false,
    access: { employee: true, management: null },
    display_status: "active",
    archived_at: null,
    revision: 1,
    user_id: null,
    internal_note: "",
    locations: [],
    jobs: [],
    invitation: null,
    onboarding: { status: "not_requested", required_documents: 0, completed_documents: 0 },
    events: [],
    allowed: {
      save: true,
      terminate: true,
      archive: false,
      remove_access: true,
      change_role: false,
      make_admin: false,
      invite: true,
      onboarding_review: true,
    },
  });

  it("carries the server's answer for each record action", () => {
    expect(base.allowed).toEqual({
      save: true,
      terminate: true,
      archive: false,
      remove_access: true,
      change_role: false,
      make_admin: false,
      invite: true,
      onboarding_review: true,
    });
  });

  it("refuses a detail without the answer", () => {
    const { allowed: _allowed, ...withoutAllowed } = base;
    expect(() => employeeDetailSchema.parse(withoutAllowed)).toThrow();
  });

  // EMP-001 C (BL-421): whose record is the owner's is the server's answer,
  // never read off a role name.
  it("refuses a detail that does not say whether the record is the owner's", () => {
    const { is_workspace_owner: _owner, ...withoutOwner } = base;
    expect(() => employeeDetailSchema.parse(withoutOwner)).toThrow();
    expect(base.is_workspace_owner).toBe(false);
  });

  // ROL-CIFT 2.2: the record's two access slots are the server's answer; the
  // drawer offers "Exclude from schedule" from it.
  it("carries the record's two access slots and refuses a detail without them", () => {
    expect(employeeDetailSchema.parse({ ...base, access: { employee: false, management: "manager" } }).access)
      .toEqual({ employee: false, management: "manager" });
    const { access: _access, ...withoutAccess } = base;
    expect(() => employeeDetailSchema.parse(withoutAccess)).toThrow();
    expect(() => employeeDetailSchema.parse({ ...base, access: { employee: false, management: null } })).toThrow();
  });
});

// FB-6.2 .7b (KK-35): where the reader may take somebody off comes from the
// server. EMP-001: a manager manages only where they are assigned, so the
// record and the list row carry no "managed" locations.
describe("employee detail locations", () => {
  const kadikoy = "11000000-0000-4000-8000-000000000001";
  const besiktas = "11000000-0000-4000-8000-000000000002";
  const record = {
    id: "97f65b16-a7ad-4f50-990e-d89030ac4701",
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    employee_code: "NF-003",
    first_name: "Derya",
    last_name: "Ak",
    preferred_name: "",
    display_name: "Derya Ak",
    invitation_email: null,
    start_date: null,
    primary_location_id: kadikoy,
    primary_location_name: "Kadikoy",
    location_count: 1,
    primary_job_id: null,
    primary_job_name: null,
    job_count: 0,
    role_name: "Manager",
    is_workspace_owner: false,
    access: { employee: true, management: "manager" },
    display_status: "active",
    archived_at: null,
    revision: 1,
    user_id: null,
    internal_note: "",
    locations: [{ id: kadikoy, name: "Kadikoy", primary: true, archived: false, removable: false }],
    jobs: [],
    invitation: null,
    onboarding: { status: "not_requested", required_documents: 0, completed_documents: 0 },
    events: [],
    allowed: {
      save: false, terminate: false, archive: false, remove_access: false, change_role: false,
      make_admin: false, invite: false, onboarding_review: false,
    },
  };

  it("carries which location they may be taken off", () => {
    expect(employeeDetailSchema.parse(record).locations[0]?.removable).toBe(false);
  });

  it("refuses a location without the answer", () => {
    expect(() =>
      employeeDetailSchema.parse({ ...record, locations: [{ id: kadikoy, name: "Kadikoy", primary: true, archived: false }] }),
    ).toThrow();
  });

  // The same eight keys get_employee_detail_service answers with
  // (supabase/tests/employee_drawer_reads.test.sql keeps that list).
  it("answers for eight record actions, the ones the database sends", () => {
    expect(Object.keys(employeeDetailSchema.shape.allowed.shape).sort()).toEqual([
      "archive", "change_role", "invite", "make_admin", "onboarding_review", "remove_access", "save", "terminate",
    ]);
  });

  it("keeps jobs without a removal answer", () => {
    const job = { id: besiktas, name: "Server", primary: true, archived: false };
    expect(employeeDetailSchema.parse({ ...record, jobs: [job] }).jobs).toEqual([job]);
  });

  it("lists a row as the database sends it", () => {
    const {
      locations: _l, jobs: _j, invitation: _i, onboarding: _o, events: _e, allowed: _a, user_id: _u, internal_note: _n,
      primary_location_id: _pl, primary_location_name: _pn, location_count: _lc, role_name: _r, ...rest
    } = record;
    // BL-436: a list row names every location, the primary first; S-179: the two access slots, not a role.
    const row = { ...rest, management_access: true, employee_access: true,
      locations: [{ id: kadikoy, name: "Kadikoy", primary: true }] };
    expect(employeeSummarySchema.parse(row).display_name).toBe("Derya Ak");
    expect(employeeSummarySchema.parse(row).locations).toEqual(row.locations);
  });
});
