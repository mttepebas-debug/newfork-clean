// Who is who for Requests, Shift Hub and the Employee Hub: people, the managers
// who vote on their requests, and what the signed-in viewer may read or decide.
// Follows packages/shared authorization.ts (expected) and the time-off core.
import { ApiError } from "./api";
import { EMPLOYEE_USER_ID, LOC, MANAGER_NAME, MANAGER_USER_ID, OWNER_NAME, OWNER_USER_ID, ZONE, viewer, viewers, world } from "./world";
import { viewerRole } from "./viewer";

export { ZONE };

/** Uptown's location manager: votes on Uptown's requests (not a role the atlas signs in as). */
export const UPTOWN_MANAGER = { userId: "7b2d4e61-93a8-4c15-b0f2-5d6e7f8a9b0c", name: "David Park" };

/** The managers who vote at each location (time_off_location_voters). */
export const locationVoters: Record<string, { userId: string; name: string }[]> = {
  [LOC.downtown]: [{ userId: MANAGER_USER_ID, name: MANAGER_NAME }],
  [LOC.uptown]: [UPTOWN_MANAGER],
};

/** A fixed user id for each employee of the demo; Maria's is the employee viewer's. */
export function userIdOf(employeeId: string): string {
  if (employeeId === viewers.employee.employeeId) return EMPLOYEE_USER_ID;
  return `${employeeId.slice(0, 9)}1111-4111-8111-${employeeId.slice(-12)}`;
}

export function employee(employeeId: string) {
  return world.employees.find((item) => item.id === employeeId);
}

export function employeeName(employeeId: string | null | undefined): string {
  return (employeeId && employee(employeeId)?.display_name) || "Team member";
}

/** The name a user id goes by (user_profiles.display_name). */
export function userName(userId: string | null): string {
  if (!userId) return "System";
  if (userId === OWNER_USER_ID) return OWNER_NAME;
  if (userId === MANAGER_USER_ID) return MANAGER_NAME;
  if (userId === UPTOWN_MANAGER.userId) return UPTOWN_MANAGER.name;
  const person = world.employees.find((item) => userIdOf(item.id) === userId);
  return person?.display_name ?? "Team member";
}

export function locationName(locationId: string): string {
  return world.locations.find((item) => item.id === locationId)?.name ?? "Location";
}

export function jobName(jobId: string | null): string {
  return world.jobs.find((item) => item.id === jobId)?.name ?? "Unassigned position";
}

/** The employee profile of the viewer (only the employee viewer has one). */
export function viewerEmployeeId(): string | null {
  return viewer.employeeId;
}

export const actorUserId = () => viewer.userId;
export const isOwner = () => viewerRole === "owner";
export const isManager = () => viewerRole === "manager";

/** Locations whose schedule and requests the viewer manages (scope_set). */
export function managedLocations(): string[] {
  if (viewerRole === "owner") return world.locations.map((item) => item.id);
  if (viewerRole === "manager") return [LOC.downtown];
  return [];
}

/** requests.read / time_off.decide / time_off.revoke for a person: one rank up, sharing a location. */
export function reachesPerson(employeeId: string): boolean {
  if (viewerRole === "owner") return true;
  if (viewerRole !== "manager") return false;
  const person = employee(employeeId);
  return Boolean(person?.location_ids.some((place) => managedLocations().includes(place)));
}

export function refuse(reason: string, status = 403, error = "Not allowed"): never {
  throw new ApiError(status, { error, reason });
}

export function conflict(error: string): never {
  throw new ApiError(409, { error });
}

export function invalid(error: string): never {
  throw new ApiError(400, { error });
}

export function notFound(error = "Not found"): never {
  throw new ApiError(404, { error });
}
