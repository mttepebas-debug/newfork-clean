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
    display_status: "active",
    archived_at: null,
    revision: 1,
    user_id: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
    internal_note: "",
    locations: [],
    managed_locations: [],
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
      set_managed_locations: false,
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
    display_status: "active",
    archived_at: null,
    revision: 1,
    user_id: null,
    internal_note: "",
    locations: [],
    managed_locations: [],
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
      set_managed_locations: false,
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
      set_managed_locations: false,
      invite: true,
      onboarding_review: true,
    });
  });

  it("refuses a detail without the answer", () => {
    const { allowed: _allowed, ...withoutAllowed } = base;
    expect(() => employeeDetailSchema.parse(withoutAllowed)).toThrow();
  });
});

// FB-6.2 .7b (KK-35): where the reader may take somebody off, and the
// locations a manager manages without working there, come from the server.
describe("employee detail locations", () => {
  const kadikoy = "11000000-0000-4000-8000-000000000001";
  const besiktas = "11000000-0000-4000-8000-000000000002";
  const record = {
    id: "97f65b16-a7ad-4f50-990e-d89030ac4701",
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    employee_code: "NF-003",
    first_name: "Selin",
    last_name: "Ak",
    preferred_name: "",
    display_name: "Selin Ak",
    invitation_email: null,
    start_date: null,
    primary_location_id: kadikoy,
    primary_location_name: "Kadikoy",
    location_count: 1,
    primary_job_id: null,
    primary_job_name: null,
    job_count: 0,
    role_name: "Manager",
    display_status: "active",
    archived_at: null,
    revision: 1,
    user_id: null,
    internal_note: "",
    locations: [{ id: kadikoy, name: "Kadikoy", primary: true, archived: false, removable: false }],
    managed_locations: [{ id: besiktas, name: "Besiktas" }],
    jobs: [],
    invitation: null,
    onboarding: { status: "not_requested", required_documents: 0, completed_documents: 0 },
    events: [],
    allowed: {
      save: false, terminate: false, archive: false, remove_access: false, change_role: false,
      make_admin: false, set_managed_locations: true, invite: false, onboarding_review: false,
    },
  };

  it("carries which location they may be taken off and what they manage", () => {
    const detail = employeeDetailSchema.parse(record);
    expect(detail.locations[0]?.removable).toBe(false);
    expect(detail.managed_locations).toEqual([{ id: besiktas, name: "Besiktas" }]);
    expect(detail.allowed.set_managed_locations).toBe(true);
  });

  it("refuses a location without the answer, and a detail without managed locations", () => {
    expect(() =>
      employeeDetailSchema.parse({ ...record, locations: [{ id: kadikoy, name: "Kadikoy", primary: true, archived: false }] }),
    ).toThrow();
    const { managed_locations: _managed, ...withoutManaged } = record;
    expect(() => employeeDetailSchema.parse(withoutManaged)).toThrow();
  });

  it("keeps jobs without a removal answer", () => {
    const job = { id: besiktas, name: "Server", primary: true, archived: false };
    expect(employeeDetailSchema.parse({ ...record, jobs: [job] }).jobs).toEqual([job]);
  });

  it("lists a row with the names of the locations they only manage", () => {
    const { locations: _l, managed_locations: _m, jobs: _j, invitation: _i, onboarding: _o, events: _e, allowed: _a, user_id: _u, internal_note: _n, ...row } = record;
    expect(employeeSummarySchema.parse({ ...row, managed_location_names: ["Besiktas"] }).managed_location_names).toEqual(["Besiktas"]);
    expect(() => employeeSummarySchema.parse(row)).toThrow();
  });
});
