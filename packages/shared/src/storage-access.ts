export const employeeOnboardingDocumentBucket = "employee-onboarding";
export const employeeProfilePhotoBucket = "employee-profile-photos";

export const employeeOnboardingDocumentSignedUrlTtlSeconds = 5 * 60;
export const employeeProfilePhotoSignedUrlTtlSeconds = 5 * 60;

export const employeeOnboardingDocumentMaxBytes = 10 * 1024 * 1024;
export const employeeProfilePhotoMaxBytes = 5 * 1024 * 1024;

export const employeeOnboardingDocumentMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const employeeProfilePhotoMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const uuidPattern =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const employeeOnboardingDocumentPathPattern = new RegExp(
  `^${uuidPattern}/${uuidPattern}/${uuidPattern}/${uuidPattern}\\.(pdf|jpg|png|webp)$`,
  "i",
);

export function isEmployeeOnboardingDocumentPath(path: string): boolean {
  return employeeOnboardingDocumentPathPattern.test(path);
}

export function buildEmployeeOnboardingDocumentPrefix(input: {
  readonly workspaceId: string;
  readonly employeeId: string;
  readonly requirementId: string;
}): string {
  return `${input.workspaceId}/${input.employeeId}/${input.requirementId}`;
}
