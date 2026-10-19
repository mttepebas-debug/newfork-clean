import { describe, expect, it } from "vitest";
import {
  buildEmployeeOnboardingDocumentPrefix,
  buildMemberAvatarPhotoPath,
  isMemberAvatarPhotoPath,
  memberAvatarPhotoContentType,
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

  // AVATAR-IKON: a person's avatar photo sits in their own membership's place in the workspace's
  // private bucket, <workspace>/<membership>/<uuid>.<jpg|png|webp>; the API builds the path, never the client.
  it("builds a member's avatar photo path from the workspace, the membership and the image type", () => {
    expect(buildMemberAvatarPhotoPath({ workspaceId, membershipId: employeeId, objectId, contentType: "image/jpeg" }))
      .toBe(`${workspaceId}/${employeeId}/${objectId}.jpg`);
    expect(buildMemberAvatarPhotoPath({ workspaceId, membershipId: employeeId, objectId, contentType: "image/png" }))
      .toBe(`${workspaceId}/${employeeId}/${objectId}.png`);
    expect(buildMemberAvatarPhotoPath({ workspaceId, membershipId: employeeId, objectId, contentType: "image/webp" }))
      .toBe(`${workspaceId}/${employeeId}/${objectId}.webp`);
  });

  it("accepts only a photo path in the member's own place", () => {
    const own = { workspaceId, membershipId: employeeId };
    expect(isMemberAvatarPhotoPath(`${workspaceId}/${employeeId}/${objectId}.webp`, own)).toBe(true);
    expect(isMemberAvatarPhotoPath(`${workspaceId}/${requirementId}/${objectId}.webp`, own)).toBe(false);
    expect(isMemberAvatarPhotoPath(`${requirementId}/${employeeId}/${objectId}.webp`, own)).toBe(false);
    expect(isMemberAvatarPhotoPath(`${workspaceId}/${employeeId}/../${requirementId}/${objectId}.jpg`, own)).toBe(false);
    expect(isMemberAvatarPhotoPath(`${workspaceId}/${employeeId}/extra/${objectId}.jpg`, own)).toBe(false);
    expect(isMemberAvatarPhotoPath(`${workspaceId}/${employeeId}/${objectId}.gif`, own)).toBe(false);
    expect(isMemberAvatarPhotoPath(`${workspaceId}/${employeeId}/photo.jpg`, own)).toBe(false);
  });

  it("reads an avatar photo's image type from its extension", () => {
    expect(memberAvatarPhotoContentType(`${workspaceId}/${employeeId}/${objectId}.jpg`)).toBe("image/jpeg");
    expect(memberAvatarPhotoContentType(`${workspaceId}/${employeeId}/${objectId}.png`)).toBe("image/png");
    expect(memberAvatarPhotoContentType(`${workspaceId}/${employeeId}/${objectId}.webp`)).toBe("image/webp");
    expect(memberAvatarPhotoContentType(`${workspaceId}/${employeeId}/${objectId}.gif`)).toBeNull();
  });
});
