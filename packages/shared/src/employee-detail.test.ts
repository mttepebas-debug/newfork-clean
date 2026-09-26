import { describe, expect, it } from "vitest";
import { employeeDetailSchema } from "./index";

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
    jobs: [],
    invitation: null,
    onboarding: { status: "not_requested", required_documents: 0, completed_documents: 0 },
    events: [],
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
