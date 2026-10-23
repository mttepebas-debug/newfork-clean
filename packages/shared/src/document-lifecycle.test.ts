import { describe, expect, it } from "vitest";
import { defaultDocumentLifecycleSettings, documentLifecycleSettingsSchema, documentMatchesStatus, documentReviewCommandSchema, documentStatusFilterFromLink, documentStatusFilterOf, documentStatusFilters, matchesDocumentTarget } from "./document-lifecycle";

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
  // KARARLAR S-255: three tabs by whose move it is; no All.
  it("groups every status under Needs review, To do or Completed, and removed under none", () => {
    expect(documentStatusFilters).toEqual(["needs_review", "to_do", "completed"]);
    const groups = {
      needs_review: ["pending_review", "timezone_required"],
      to_do: ["missing", "grace", "rejected", "expired"],
      completed: ["completed", "exempt", "paused"],
    } as const;
    const all = ["pending_review", "timezone_required", "missing", "grace", "rejected", "expired", "completed", "exempt", "paused", "removed"] as const;
    for (const filter of documentStatusFilters)
      expect(all.filter((status) => documentMatchesStatus(status, filter))).toEqual(groups[filter]);
    expect(documentStatusFilterOf("grace")).toBe("to_do");
    expect(documentStatusFilterOf("paused")).toBe("completed");
    expect(documentStatusFilterOf("removed")).toBeNull();
  });
  it("reads a link's status, the old tab names included", () => {
    expect(documentStatusFilterFromLink("missing")).toBe("to_do");
    expect(documentStatusFilterFromLink("expired")).toBe("to_do");
    expect(documentStatusFilterFromLink("pending_review")).toBe("needs_review");
    expect(documentStatusFilterFromLink("to_do")).toBe("to_do");
    expect(documentStatusFilterFromLink("completed")).toBe("completed");
    expect(documentStatusFilterFromLink("all")).toBeUndefined();
    expect(documentStatusFilterFromLink("nonsense")).toBeUndefined();
    expect(documentStatusFilterFromLink(null)).toBeUndefined();
  });
  it("requires rejection reason and a retained file for approval", () => {
    const command = { revision: 1, submission_id: a, decision: "reject", files: [{ id: b, decision: "keep" }] };
    expect(documentReviewCommandSchema.safeParse(command).success).toBe(false);
    expect(documentReviewCommandSchema.parse({ ...command, reason: "Unreadable" }).correction_period).toBe("full");
    expect(documentReviewCommandSchema.safeParse({ ...command, decision: "approve", files: [{ id: b, decision: "discard" }] }).success).toBe(false);
  });
});
