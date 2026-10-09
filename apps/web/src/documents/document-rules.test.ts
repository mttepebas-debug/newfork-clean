import { describe, expect, it } from "vitest";
import {
  acceptAttribute,
  acceptsUpload,
  isObligationClosed,
  isOnFile,
  sameSignerName,
  statusLabel,
} from "./document-rules";

describe("isObligationClosed", () => {
  it("closes removed, exempt and paused", () => {
    expect(isObligationClosed("removed")).toBe(true);
    expect(isObligationClosed("exempt")).toBe(true);
    expect(isObligationClosed("paused")).toBe(true);
  });
  it("leaves every other status open", () => {
    for (const status of [
      "missing",
      "grace",
      "pending_review",
      "rejected",
      "expired",
      "completed",
      "timezone_required",
    ] as const)
      expect(isObligationClosed(status)).toBe(false);
  });
});

describe("the owner's excused document (BL-118)", () => {
  const owner = { status: "exempt", exemption_locked: true, approved_id: null } as const;
  it("takes an upload although it is exempt", () => {
    expect(acceptsUpload(owner)).toBe(true);
  });
  it("keeps any other exemption closed to uploads", () => {
    expect(acceptsUpload({ ...owner, exemption_locked: false })).toBe(false);
    expect(acceptsUpload({ ...owner, exemption_locked: undefined })).toBe(false);
    expect(acceptsUpload({ ...owner, status: "removed" })).toBe(false);
    expect(acceptsUpload({ ...owner, status: "missing", exemption_locked: false })).toBe(true);
  });
  it("is on file once a copy was accepted, and only then", () => {
    expect(isOnFile(owner)).toBe(false);
    expect(isOnFile({ ...owner, approved_id: "copy" })).toBe(true);
    expect(isOnFile({ ...owner, approved_id: "copy", exemption_locked: false })).toBe(false);
  });
});

describe("statusLabel", () => {
  it("names each status for a person, and the owner's accepted copy On file", () => {
    const row = { status: "pending_review", exemption_locked: false, approved_id: null } as const;
    expect(statusLabel(row)).toBe("Needs review");
    expect(statusLabel({ ...row, status: "timezone_required" })).toBe("Time zone needed");
    expect(statusLabel({ ...row, status: "exempt", exemption_locked: true })).toBe("Exempt");
    expect(
      statusLabel({ ...row, status: "exempt", exemption_locked: true, approved_id: "copy" }),
    ).toBe("On file");
  });
});

describe("sameSignerName", () => {
  it("matches after trim, inner whitespace collapse and case fold", () => {
    expect(sameSignerName("  jane   DOE ", "Jane Doe")).toBe(true);
    expect(sameSignerName("Jane\tDoe", "Jane  Doe")).toBe(true);
  });
  it("rejects an empty, partial or joined name", () => {
    expect(sameSignerName("", "Jane Doe")).toBe(false);
    expect(sameSignerName("Jane Do", "Jane Doe")).toBe(false);
    expect(sameSignerName("JaneDoe", "Jane Doe")).toBe(false);
  });
});

describe("acceptAttribute", () => {
  it("expands jpeg to both spellings and dots every other format", () => {
    expect(acceptAttribute(["pdf", "jpeg", "png", "webp"])).toBe(
      ".pdf,.jpg,.jpeg,.png,.webp",
    );
  });
  it("is empty for no formats", () => {
    expect(acceptAttribute([])).toBe("");
  });
});
