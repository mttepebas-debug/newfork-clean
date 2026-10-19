import { describe, expect, it } from "vitest";
import { employeeAccessChangeInputSchema } from "./index";

// ROL-CIFT 4.1 (design §4.8): an access change names both slots and sends
// back the impact the reader was shown.
describe("employee access change", () => {
  const managerRole = "26000000-0000-4000-8000-000000000002";
  const kadikoy = "26000000-0000-4000-8000-000000000011";
  const generalManager = "26000000-0000-4000-8000-000000000021";
  const impact = {
    shifts_opened: 3,
    requests_closed: 1,
    applications_closed: 1,
    time_off_withdrawn: 1,
    availability_deleted: true,
  };

  it("takes a management access alone, with its places, jobs and the impact shown", () => {
    const change = {
      employee_role_id: null,
      management_role_id: managerRole,
      managed_location_ids: [kadikoy],
      management_job_ids: [generalManager],
      expected_impact: impact,
    };
    expect(employeeAccessChangeInputSchema.parse(change)).toEqual(change);
  });

  it("refuses a change that leaves a slot unsaid or the impact unshown", () => {
    expect(
      employeeAccessChangeInputSchema.safeParse({
        management_role_id: managerRole,
        managed_location_ids: [kadikoy],
        management_job_ids: [generalManager],
        expected_impact: impact,
      }).success,
    ).toBe(false);
    expect(
      employeeAccessChangeInputSchema.safeParse({
        employee_role_id: null,
        management_role_id: managerRole,
        managed_location_ids: [kadikoy],
        management_job_ids: [generalManager],
      }).success,
    ).toBe(false);
  });
});
