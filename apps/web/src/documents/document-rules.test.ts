import { describe, expect, it } from "vitest";
import {
  acceptAttribute,
  acceptsUpload,
  fileDecisionLabel,
  formatsLabel,
  initials,
  isObligationClosed,
  isOnFile,
  sameSignerName,
  statusLabel,
  statusTone,
  statusWeight,
  versionStateLabel,
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

// K1 decision 4: the manager reads a sent-back document as Missing and an exempt one as Excused;
// the person keeps today's words.
describe("statusLabel by reader", () => {
  const row = { status: "rejected", exemption_locked: false, approved_id: null } as const;
  it("says Missing and Excused to a manager", () => {
    expect(statusLabel(row, "manager")).toBe("Missing");
    expect(statusLabel({ ...row, status: "exempt" }, "manager")).toBe("Excused");
    expect(statusLabel({ ...row, status: "pending_review" }, "manager")).toBe("Needs review");
    expect(statusLabel({ ...row, status: "missing" }, "manager")).toBe("Missing");
  });
  it("keeps Rejected and Exempt for the person, and On file for both", () => {
    expect(statusLabel(row)).toBe("Rejected");
    expect(statusLabel(row, "employee")).toBe("Rejected");
    expect(statusLabel({ ...row, status: "exempt" }, "employee")).toBe("Exempt");
    const onFile = { status: "exempt", exemption_locked: true, approved_id: "copy" } as const;
    expect(statusLabel(onFile, "manager")).toBe("On file");
    expect(statusLabel(onFile, "employee")).toBe("On file");
  });
});

// BL-831's order, read by who reads it: a manager reads a document sent back as Missing (K1 decision 4), so it
// sorts with the other Missing ones; the person keeps today's order.
describe("statusWeight by reader", () => {
  it("sorts a manager's Missing kinds together, before Expired", () => {
    expect(statusWeight("rejected", "manager")).toBe(statusWeight("missing", "manager"));
    expect(statusWeight("rejected", "manager")).toBeLessThan(statusWeight("expired", "manager"));
    expect(statusWeight("pending_review", "manager")).toBe(0);
  });
  it("keeps the person's order: Rejected after Expired", () => {
    expect(statusWeight("rejected")).toBe(4);
    expect(statusWeight("rejected", "employee")).toBeGreaterThan(statusWeight("expired", "employee"));
  });
});

describe("statusTone", () => {
  const row = { status: "completed", exemption_locked: false, approved_id: null } as const;
  it("colours done green, owed red, closed grey and the rest amber", () => {
    expect(statusTone(row)).toBe("ok");
    expect(statusTone({ ...row, status: "exempt", exemption_locked: true, approved_id: "copy" })).toBe("ok");
    for (const status of ["missing", "expired", "rejected"] as const) expect(statusTone({ ...row, status })).toBe("red");
    for (const status of ["exempt", "paused", "removed"] as const) expect(statusTone({ ...row, status })).toBe("grey");
    for (const status of ["pending_review", "grace", "timezone_required"] as const)
      expect(statusTone({ ...row, status })).toBe("warn");
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Maria Lopez")).toBe("ML");
    expect(initials("  ana  maría ruiz ")).toBe("AM");
    expect(initials("Cher")).toBe("C");
    expect(initials("Élodie Ünal")).toBe("ÉÜ");
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

// BL-830: the drawer's version heading and file decision, in the list's words.
describe("versionStateLabel and fileDecisionLabel", () => {
  it("words every version state", () => {
    expect(versionStateLabel("draft")).toBe("Draft");
    expect(versionStateLabel("pending_review")).toBe("Needs review");
    expect(versionStateLabel("accepted")).toBe("Approved");
    expect(versionStateLabel("rejected")).toBe("Rejected");
    expect(versionStateLabel("superseded")).toBe("Replaced");
  });
  it("words a file's decision", () => {
    expect(fileDecisionLabel("keep")).toBe("Kept");
    expect(fileDecisionLabel("discard")).toBe("Discarded");
  });
});

// BL-857: one spelling and one order for accepted formats everywhere.
describe("formatsLabel", () => {
  it("lists formats in one order with one spelling", () => {
    expect(formatsLabel(["webp", "png", "pdf", "jpeg"])).toBe("PDF, JPEG, PNG, WebP");
  });
});
