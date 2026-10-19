export const employeeOnboardingDocumentBucket = "employee-onboarding";
export const employeeProfilePhotoBucket = "employee-profile-photos";

export const employeeOnboardingDocumentSignedUrlTtlSeconds = 5 * 60;
export const employeeProfilePhotoSignedUrlTtlSeconds = 5 * 60;

export const employeeOnboardingDocumentMaxBytes = 10 * 1024 * 1024;
export const employeeProfilePhotoMaxBytes = 5 * 1024 * 1024;

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

// AVATAR-IKON: a person's avatar photo sits in the workspace's private employee-profile-photos bucket,
// in their own membership's place: <workspace_id>/<membership_id>/<uuid>.<jpg|png|webp>
// (member_avatars_photo_path_shape in the database). The API builds the path; the client never does.
export type EmployeeProfilePhotoMimeType = (typeof employeeProfilePhotoMimeTypes)[number];

const memberAvatarPhotoExtensions: Record<EmployeeProfilePhotoMimeType, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function buildMemberAvatarPhotoPath(input: {
  readonly workspaceId: string;
  readonly membershipId: string;
  readonly objectId: string;
  readonly contentType: EmployeeProfilePhotoMimeType;
}): string {
  return `${input.workspaceId}/${input.membershipId}/${input.objectId}.${memberAvatarPhotoExtensions[input.contentType]}`;
}

export function isMemberAvatarPhotoPath(
  path: string,
  owner: { readonly workspaceId: string; readonly membershipId: string },
): boolean {
  const prefix = `${owner.workspaceId}/${owner.membershipId}/`;
  return (
    path.startsWith(prefix) &&
    new RegExp(`^${uuidPattern}/${uuidPattern}/${uuidPattern}\.(jpg|png|webp)$`).test(path)
  );
}

/** The image type an avatar photo was stored as, read from its extension. */
export function memberAvatarPhotoContentType(path: string): EmployeeProfilePhotoMimeType | null {
  const extension = path.slice(path.lastIndexOf(".") + 1);
  const found = Object.entries(memberAvatarPhotoExtensions).find(([, value]) => value === extension);
  return found ? (found[0] as EmployeeProfilePhotoMimeType) : null;
}
