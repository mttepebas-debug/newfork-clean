import { describe, expect, it } from "vitest";
import { defaultDocumentLifecycleSettings, documentLifecycleSettingsSchema, documentMatchesStatus, documentReviewCommandSchema, matchesDocumentTarget } from "./document-lifecycle";

const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
describe("document lifecycle contracts", () => {
  it("matches global jobs across assigned locations while preserving the job department relation", () => {
    const target = { operator: "and" as const, location_ids: [a], department_ids: [b], job_ids: [], employee_ids: [] };
    const rows = { location_ids: [a], jobs: [{ department_id: a, job_id: a }] };
    expect(matchesDocumentTarget(target, a, rows)).toBe(false);
    expect(matchesDocumentTarget({ ...target, employee_ids: [a] }, a, rows)).toBe(true);
    expect(matchesDocumentTarget(target, a, { location_ids: [a], jobs: [{ department_id: b, job_id: a }] })).toBe(true);
    expect(matchesDocumentTarget(defaultDocumentLifecycleSettings.target, a, { location_ids: [], jobs: [] })).toBe(true);
  });
  it("OR ignores empty groups and deduplicates through its boolean result", () => {
    const target = { ...defaultDocumentLifecycleSettings.target, operator: "or" as const, location_ids: [a] };
    expect(matchesDocumentTarget(target, b, { location_ids: [b], jobs: [] })).toBe(false);
    expect(matchesDocumentTarget(target, b, { location_ids: [a], jobs: [] })).toBe(true);
  });
  it("does not allow optional suspension or suspension without a delivery period", () => {
    expect(documentLifecycleSettingsSchema.safeParse({ ...defaultDocumentLifecycleSettings, suspend_on_overdue: true }).success).toBe(false);
    expect(documentLifecycleSettingsSchema.safeParse({ ...defaultDocumentLifecycleSettings, mode: "required", suspend_on_overdue: true }).success).toBe(false);
    expect(documentLifecycleSettingsSchema.safeParse({ ...defaultDocumentLifecycleSettings, mode: "conditional", period_days: 7 }).success).toBe(true);
  });
  it("keeps rejection and grace visibly in Missing, pending reviews separate", () => {
    expect(documentMatchesStatus("rejected", "missing")).toBe(true);
    expect(documentMatchesStatus("grace", "missing")).toBe(true);
    expect(documentMatchesStatus("pending_review", "missing")).toBe(false);
    expect(documentMatchesStatus("removed", "all")).toBe(false);
  });
  it("requires rejection reason and a retained file for approval", () => {
    const command = { revision: 1, submission_id: a, decision: "reject", files: [{ id: b, decision: "keep" }] };
    expect(documentReviewCommandSchema.safeParse(command).success).toBe(false);
    expect(documentReviewCommandSchema.parse({ ...command, reason: "Unreadable" }).correction_period).toBe("full");
    expect(documentReviewCommandSchema.safeParse({ ...command, decision: "approve", files: [{ id: b, decision: "discard" }] }).success).toBe(false);
  });
});
