import { describe, expect, it } from "vitest";
import {
  buildEmployeeOnboardingDocumentPrefix,
  employeeOnboardingDocumentBucket,
  employeeOnboardingDocumentMaxBytes,
  employeeOnboardingDocumentSignedUrlTtlSeconds,
  employeeProfilePhotoBucket,
  employeeProfilePhotoSignedUrlTtlSeconds,
  isEmployeeOnboardingDocumentPath,
} from "./storage-access";

const workspaceId = "27000000-0000-4000-8000-000000000001";
const employeeId = "47000000-0000-4000-8000-000000000001";
const requirementId = "57000000-0000-4000-8000-000000000001";
const objectId = "67000000-0000-4000-8000-000000000001";

describe("private employee storage contract", () => {
  it("keeps sensitive employee storage in private buckets with short URL TTLs", () => {
    expect(employeeOnboardingDocumentBucket).toBe("employee-onboarding");
    expect(employeeProfilePhotoBucket).toBe("employee-profile-photos");
    expect(employeeOnboardingDocumentSignedUrlTtlSeconds).toBe(300);
    expect(employeeProfilePhotoSignedUrlTtlSeconds).toBe(300);
    expect(employeeOnboardingDocumentMaxBytes).toBe(10 * 1024 * 1024);
  });

  it("accepts only tenant-scoped onboarding document object paths", () => {
    expect(
      isEmployeeOnboardingDocumentPath(
        `${workspaceId}/${employeeId}/${requirementId}/${objectId}.pdf`,
      ),
    ).toBe(true);
    expect(
      isEmployeeOnboardingDocumentPath(
        `${workspaceId}/${employeeId}/${objectId}.pdf`,
      ),
    ).toBe(false);
    expect(
      isEmployeeOnboardingDocumentPath(
        `${workspaceId}/${employeeId}/${requirementId}/../../${objectId}.pdf`,
      ),
    ).toBe(false);
    expect(
      isEmployeeOnboardingDocumentPath(
        `${workspaceId}/${employeeId}/${requirementId}/${objectId}.html`,
      ),
    ).toBe(false);
  });

  it("builds the prefix used by signed upload paths", () => {
    expect(
      buildEmployeeOnboardingDocumentPrefix({
        workspaceId,
        employeeId,
        requirementId,
      }),
    ).toBe(`${workspaceId}/${employeeId}/${requirementId}`);
  });
});
