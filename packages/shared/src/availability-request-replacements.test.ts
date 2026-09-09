import { describe, expect, it } from "vitest";
import { availabilityCommandSchema, availabilityRequestSchema } from "./availability-lifecycle";

const id = "ae940000-0000-4000-8000-000000000001";
const replacement = "ae940000-0000-4000-8000-000000000002";
const proposal = {
  timezone: "UTC", effective_from: "2035-01-15", effective_until: "2035-01-17", kind: "temporary",
  days: Array.from({ length: 7 }, (_, day) => ({ day, mode: "unavailable", windows: [] })),
};
const stored = {
  id, workspace_id: id, employee_id: id, author_id: id, proposal,
  before_snapshot: [], base_revision: 3, policy_revision: 1, policy_snapshot: {}, source: "employee", confirmation: null,
  kind: "temporary", effective_from: "2035-01-15", effective_until: "2035-01-17", is_narrowing: true,
  status: "pending_review", capacity_notice_open: true, reviewer_id: null, decision_reason: "", revision: 1,
  created_at: "2035-01-01T00:00:00Z", updated_at: "2035-01-01T00:00:00Z", can_review: true, can_withdraw: false, can_confirm: false,
};

describe("persisted availability replacement selections", () => {
  it("preserves canonical selections when parsing a stored request for review", () => {
    const result = availabilityRequestSchema.parse({ ...stored, proposal: { ...proposal, replace_version_ids: [replacement] } });
    expect(result.proposal.replace_version_ids).toEqual([replacement]);
  });
  it("reads older requests with no replacement selection", () => {
    expect(availabilityRequestSchema.parse(stored).proposal.replace_version_ids).toBeUndefined();
  });
  it("rejects malformed persisted references and retains date validation", () => {
    expect(availabilityRequestSchema.safeParse({ ...stored, proposal: { ...proposal, replace_version_ids: ["not-a-version"] } }).success).toBe(false);
    expect(availabilityRequestSchema.safeParse({ ...stored, proposal: { ...proposal, effective_until: "2035-01-14", replace_version_ids: [replacement] } }).success).toBe(false);
  });
  it("keeps command selection at the canonical top-level boundary", () => {
    const command = availabilityCommandSchema.parse({ action: "submit", employee_id: id, expected_revision: 3,
      proposal: { ...proposal, replace_version_ids: [id] }, replace_version_ids: [replacement] });
    expect(command.action).toBe("submit");
    if (command.action !== "submit") throw new Error("Expected submit command");
    expect(command.replace_version_ids).toEqual([replacement]);
    expect(command.proposal).not.toHaveProperty("replace_version_ids");
  });
});
