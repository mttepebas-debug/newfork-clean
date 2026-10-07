import { describe, expect, it } from "vitest";
import { employeeCreateReadiness } from "./employee-create-flow";

const draft = {
  first_name: "Taylor",
  middle_name: "",
  last_name: "Reed",
  preferred_name: "",
  invitation_email: "",
  role_id: null,
  location_ids: [],
  primary_location_id: null,
  department_ids: [],
  job_ids: [],
  primary_job_id: null,
  start_date: "",
  internal_note: "",
  is_remote: true,
  is_excluded_from_schedule: false,
  is_owner_record: false,
} as unknown as Parameters<typeof employeeCreateReadiness>[0];

// BL-503: a new person's names follow the US letter rule before Next.
describe("employeeCreateReadiness", () => {
  it("takes names with other Latin accents and hyphens", () => {
    expect(
      employeeCreateReadiness({ ...draft, first_name: "José", last_name: "Peña-Smith" }).namesReady,
    ).toBe(true);
  });

  it.each([["first_name"], ["middle_name"], ["last_name"]])(
    "holds Next while %s has a Turkish-only letter",
    (field) => {
      expect(employeeCreateReadiness({ ...draft, [field]: "Şule" }).namesReady).toBe(false);
    },
  );
});
