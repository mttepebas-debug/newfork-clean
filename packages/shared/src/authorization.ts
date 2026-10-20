import type { WorkspaceRole } from "./index";

/**
 * The web side of the authorization contract.
 *
 * Every action the authorization core (app_private.authz_actions) answers for.
 * authorization.test.ts keeps this list equal to the core's.
 */
export const authzActionKeys = [
  "account.self",
  "announcement.acknowledge",
  "announcement.read",
  "announcement.write",
  "announcement.write_wide",
  "audit.read",
  "availability.note_read",
  "availability.own",
  "availability.team_read",
  "availability.team_write",
  // One's own avatar in a workspace (AVATAR-IKON).
  "avatar.self",
  "documents.read",
  "documents.review",
  "documents.self",
  "employee_hub.read",
  "employee_hub.self",
  "employee.archive",
  "employee.change_own_access",
  "employee.change_role",
  "employee.create",
  "employee.decide_preferred_name",
  "employee.invite",
  "employee.list",
  "employee.make_admin",
  "employee.read",
  "employee.references.read",
  "employee.remove_access",
  "employee.remove_from_location",
  "employee.request_preferred_name",
  "employee.save",
  "employee.save_own_contact",
  "employee.terminate",
  "exchange.apply_own",
  "exchange.approve",
  "exchange.offer_own",
  "exchange.read",
  "important_date.write",
  "important_date.write_wide",
  "lineup.acknowledge",
  "lineup.read",
  "lineup.share",
  "membership.read",
  // One's own notification list and choices (BILDIRIM-07).
  "notifications.read_own",
  "notifications.write_own",
  "onboarding.legal_name",
  "onboarding.review",
  "onboarding.self",
  "requests.read",
  "schedule.edit",
  "schedule.export",
  "schedule.publish",
  "schedule.read",
  "schedule.templates",
  "schedule.templates.read",
  "settings.availability.read",
  "settings.availability.write",
  "settings.catalog.read",
  "settings.conflict_rules.write",
  "settings.documents.read",
  "settings.documents.write",
  "settings.important_dates.read",
  "settings.jobs.read",
  "settings.jobs.write",
  "settings.locations.read",
  "settings.locations.write",
  "settings.organization.write",
  "settings.roles.read",
  "settings.roles.write",
  "settings.scheduling.write",
  "settings.shift_catalog.read",
  "settings.signature_templates.read",
  "time_off.decide",
  "time_off.decide_alone",
  "time_off.request_own",
  "time_off.revoke",
  "workspace.accept_ownership",
  "workspace.close",
  "workspace.create",
  "workspace.read",
  "workspace.setup",
  "workspace.todos",
  "workspace.transfer_ownership",
] as const;
export type AuthzAction = (typeof authzActionKeys)[number];

interface TargetedRule {
  /** The permission the action needs (app_private.authz_actions.permission_key). */
  readonly permission: string | null;
  readonly ownerOnly?: boolean;
  /** Any active member's own action, not management. */
  readonly own?: boolean;
  /** Still open to somebody who has not finished onboarding. */
  readonly restrictedOk?: boolean;
  /** Asked of one person's record, request or shift: without the person, no. */
  readonly person?: boolean;
  /** The employee side's: only somebody who holds the employee slot (M13; ROL-CIFT). */
  readonly employeeTarget?: boolean;
}

/**
 * The actions expected() answers for a particular target: exactly the ones the
 * SQL authorization matrix has cells for, and nothing else. A new one gets its
 * matrix cells first (docs/plan/REUSE.md, "Teknik sözleşmeler"), then a row
 * here; authorization.test.ts refuses a row without cells.
 */
export const targetedAuthzActions = {
  "announcement.write": { permission: "announcements.manage" },
  "announcement.write_wide": { permission: "announcements.manage" },
  "audit.read": { permission: "workspace.manage" },
  "availability.note_read": { person: true, permission: "availability.read" },
  "availability.own": { person: true, permission: null, own: true, restrictedOk: true, employeeTarget: true },
  "availability.team_read": { person: true, permission: "availability.read" },
  "availability.team_write": { person: true, permission: "availability.manage" },
  "avatar.self": { permission: null, own: true, restrictedOk: true },
  "documents.read": { person: true, permission: "employee_documents.read" },
  "documents.review": { person: true, permission: "employee_documents.review" },
  "documents.self": { person: true, permission: null, own: true, restrictedOk: true },
  "employee.archive": { person: true, permission: "employees.archive" },
  // ROL-CIFT 4.1: the owner, with nobody above, on their own record (KARARLAR S-165).
  "employee.change_own_access": { person: true, permission: null, ownerOnly: true },
  "employee.change_role": { person: true, permission: "employees.manage" },
  "employee.create": { permission: "employees.manage" },
  "employee.decide_preferred_name": { person: true, permission: "employees.manage" },
  "employee.list": { person: true, permission: "employees.read" },
  "employee.make_admin": { person: true, permission: null, ownerOnly: true },
  "employee.read": { person: true, permission: "employees.read" },
  "employee.references.read": { permission: "employees.read" },
  "employee.remove_access": { person: true, permission: "employees.manage" },
  "employee.remove_from_location": { person: true, permission: "employees.manage" },
  "employee.save": { person: true, permission: "employees.manage" },
  "employee.save_own_contact": { person: true, permission: null, own: true, restrictedOk: true },
  "employee.terminate": { person: true, permission: "employees.archive" },
  "exchange.approve": { person: true, permission: "schedule.shift_change_requests.manage" },
  "exchange.offer_own": { person: true, permission: null, own: true, employeeTarget: true },
  "important_date.write": { permission: "important_dates.manage" },
  "important_date.write_wide": { permission: "important_dates.manage" },
  "lineup.read": { permission: "schedule.read" },
  "lineup.share": { permission: "schedule.publish" },
  "membership.read": { person: true, permission: null },
  "notifications.read_own": { permission: null, own: true, restrictedOk: true },
  "notifications.write_own": { permission: null, own: true, restrictedOk: true },
  "onboarding.legal_name": { person: true, permission: "employee_onboarding.review" },
  "onboarding.review": { person: true, permission: "employee_onboarding.review" },
  "onboarding.self": { permission: null, own: true, restrictedOk: true },
  "requests.read": { person: true, permission: "schedule.time_off_requests.manage" },
  "schedule.edit": { permission: "schedule.manage" },
  "schedule.export": { permission: "schedule.export" },
  "schedule.publish": { permission: "schedule.publish" },
  "schedule.read": { permission: "schedule.read" },
  "schedule.templates": { permission: "schedule.templates.manage" },
  "schedule.templates.read": { permission: "schedule.templates.read" },
  "settings.jobs.write": { permission: "settings.jobs.manage" },
  "settings.locations.write": { permission: "settings.locations.manage" },
  "settings.organization.write": { permission: "settings.general.manage" },
  "settings.roles.write": { permission: "roles.manage" },
  "settings.scheduling.write": { permission: "settings.schedule_rules.manage" },
  "settings.conflict_rules.write": { permission: "schedule.conflict_rules.manage" },
  "settings.locations.read": { permission: "settings.locations.read" },
  "settings.jobs.read": { permission: "settings.jobs.read" },
  "settings.shift_catalog.read": { permission: "settings.shift_catalog.read" },
  "settings.important_dates.read": { permission: "important_dates.read" },
  "settings.roles.read": { permission: "roles.read" },
  "settings.documents.read": { permission: "documents.read" },
  "settings.signature_templates.read": { permission: "documents.read" },
  "time_off.decide": { person: true, permission: "schedule.time_off_requests.manage" },
  "time_off.decide_alone": { person: true, permission: "schedule.time_off_requests.manage" },
  "time_off.request_own": { permission: null, own: true, employeeTarget: true },
  "time_off.revoke": { person: true, permission: "schedule.time_off_requests.manage" },
  "workspace.close": { permission: null, ownerOnly: true },
  // The managers' Home and its card layout (KARARLAR S-210, KK-36).
  "workspace.todos": { permission: "workspace.read" },
  "workspace.transfer_ownership": { permission: null, ownerOnly: true },
} as const satisfies Partial<Record<AuthzAction, TargetedRule>>;
export type TargetedAuthzAction = keyof typeof targetedAuthzActions;

/** The actions asked of one person's record, request or shift. */
export type PersonAuthzAction = {
  [K in TargetedAuthzAction]: (typeof targetedAuthzActions)[K] extends { person: true } ? K : never;
}[TargetedAuthzAction];

/** The target an action takes: a person action cannot be asked without its person. */
export type AuthzTargetArgs<A extends TargetedAuthzAction> = A extends PersonAuthzAction
  ? [target: AuthzTarget & { readonly person: NonNullable<AuthzTarget["person"]> }]
  : [target?: AuthzTarget];

/** Who is asking. */
export interface AuthzActor {
  readonly workspaceId: string;
  readonly role: WorkspaceRole;
  /**
   * Their membership of the workspace: restricted has not finished onboarding;
   * none is not a member at all.
   */
  readonly status: "active" | "restricted" | "suspended" | "invited" | "removed" | "none";
  /** Where they work. */
  readonly locationIds: readonly string[];
  readonly permissions: readonly string[];
  /**
   * They hold the employee slot (ROL-CIFT). Left out: somebody in the employee
   * role does, nobody else (the membership's two slots reach the web in 1.5).
   */
  readonly hasEmployee?: boolean;
  /**
   * A manager's Manages: their reach; an empty list reaches nowhere. Left out:
   * where they work.
   */
  readonly managedLocationIds?: readonly string[];
}

/** What they act on. Leave it out for an action on the workspace as a whole. */
export interface AuthzTarget {
  /** Omitted: the actor's own workspace. */
  readonly workspaceId?: string;
  /**
   * Where it is. [] is no location, which is never "everywhere";
   * "organization" is the whole organization.
   */
  readonly locations?: readonly string[] | "organization";
  /** Whose it is, when it belongs to a person (their record, request, shift). */
  readonly person?: {
    readonly role: WorkspaceRole;
    readonly isSelf: boolean;
    /** They hold the employee slot. Left out: somebody in the employee role does. */
    readonly hasEmployee?: boolean;
  };
}

const rankOf: Record<WorkspaceRole, number> = { owner: 4, admin: 3, manager: 2, employee: 1 };

/**
 * The product's permission rules as a pure function: the twin of
 * pg_temp.expected() in supabase/tests/authorization_matrix.test.sql, checked
 * cell by cell by authorization.test.ts. The SQL is the source; change a rule
 * there first.
 */
export function expected<A extends TargetedAuthzAction>(
  actor: AuthzActor,
  action: A,
  ...[target]: AuthzTargetArgs<A>
): boolean {
  // Unknown action: no (a cast or a stale key must not open anything).
  if (!Object.hasOwn(targetedAuthzActions, action)) return false;
  const rule: TargetedRule = targetedAuthzActions[action];
  const person = target?.person;
  // A person action with nobody named: no. Never "whoever it may be".
  if (rule.person && person === undefined) return false;
  const isSelf = person?.isSelf === true;

  // Nobody reaches into another workspace, and only active members act at all;
  // somebody who has not finished onboarding only finishes it.
  if (actor.status === "none") return false;
  if (target?.workspaceId !== undefined && target.workspaceId !== actor.workspaceId) return false;
  // Whoever has a membership, in whatever state, can read their own row.
  if (action === "membership.read" && isSelf) return actor.status !== "invited";
  // One's own action is never done on somebody else's, in whatever state.
  if (rule.own && person !== undefined && !isSelf) return false;
  // The employee side (M13; ROL-CIFT design §4.4, §4.10, §4.11): availability,
  // offering a shift and asking time off need the employee slot.
  if (rule.employeeTarget && !(actor.hasEmployee ?? actor.role === "employee")) return false;
  if (actor.status === "restricted" && rule.restrictedOk) return true;
  if (actor.status !== "active") return false;
  if (rule.own) return person === undefined || isSelf;
  if (rule.permission !== null && !actor.permissions.includes(rule.permission)) return false;
  if (rule.ownerOnly && actor.role !== "owner") return false;
  if (actor.role === "employee") return false;

  const high = actor.role === "owner" || actor.role === "admin";
  const places = target?.locations;
  const listed = Array.isArray(places) ? (places as readonly string[]) : null;
  // A manager's reach: their Manages (KARARLAR S-167).
  const reach = actor.managedLocationIds ?? actor.locationIds;
  const shares = listed !== null && listed.some((id) => reach.includes(id));
  const covers = listed !== null && listed.length > 0 && listed.every((id) => reach.includes(id));
  const targetRank = person ? rankOf[person.role] : 0;

  // One location, some locations or the whole organization: admin and owner
  // anywhere (the whole organization included), a manager where they work,
  // nobody at no location.
  const atPlace = () => (listed !== null && listed.length === 0 ? false : high || covers);

  switch (action) {
    case "employee.read":
    case "employee.list":
    case "membership.read":
    case "documents.read":
      // Documents under M2 like the person's record (FB-6.6).
      return high || shares;

    case "employee.save":
      // An admin edits neither the owner's record nor another admin's (KK-24);
      // a manager edits neither their own record nor a peer's or a senior's.
      if (actor.role === "owner") return true;
      if (actor.role === "admin") return person?.role !== "owner" && (isSelf || person?.role !== "admin");
      if (!shares || isSelf) return false;
      return targetRank < rankOf.manager;

    case "availability.team_read":
      // Whoever hears of a person's availability update reads it: owner and
      // admins everybody, a manager everybody who works at their locations.
      return high || shares;

    case "availability.team_write":
    case "availability.note_read":
      // The Manager note is about the employee side: about whoever holds the
      // employee slot, never about oneself (ROL-CIFT design §4.6, §4.11).
      if (!(person?.hasEmployee ?? person?.role === "employee") || isSelf) return false;
      return high || shares;

    case "employee.terminate":
    case "employee.archive":
    case "employee.remove_access":
      // Admin and owner only.
      if (isSelf) return false;
      if (actor.role === "owner") return true;
      return actor.role === "admin" && targetRank < rankOf.admin;

    case "employee.remove_from_location":
      // A manager takes an employee off a location they manage; the record
      // stays. Nobody removes themselves or a peer.
      if (isSelf) return false;
      if (actor.role === "owner") return true;
      if (actor.role === "admin") return targetRank < rankOf.admin;
      return person?.role === "employee" && covers;

    case "employee.decide_preferred_name":
      // A request goes one rank up and nobody answers their own.
      if (isSelf) return false;
      if (actor.role === "owner") return true;
      if (actor.role === "admin") return targetRank < rankOf.admin;
      return person?.role === "employee" && shares;

    case "employee.make_admin":
      return !isSelf && person?.role !== "owner";

    case "employee.change_own_access":
      return isSelf;

    case "employee.change_role":
      if (isSelf || person?.role === "owner") return false;
      if (actor.role === "owner") return true;
      if (actor.role === "admin") return person?.role !== "admin";
      // A manager moves somebody between employee roles at their own locations.
      return shares && person?.role === "employee";

    case "employee.create":
    case "schedule.read":
    case "lineup.read":
    case "schedule.publish":
    case "lineup.share":
      return atPlace();

    case "announcement.write":
    case "important_date.write":
      // A record at exactly one location (KARARLAR "Duyurular ve önemli
      // tarihler" K1); several, or the whole workspace, is *.write_wide.
      return listed !== null && listed.length === 1 && (high || covers);

    case "announcement.write_wide":
    case "important_date.write_wide":
      return high;

    case "schedule.edit":
    case "schedule.export":
    case "schedule.templates":
    case "schedule.templates.read":
      // With no place named: may they do it somewhere at all. With places (a
      // draft's or a template's locations, an export's): every one of them.
      if (places === undefined) return high || actor.locationIds.length > 0;
      return atPlace();

    case "settings.organization.write":
    case "settings.locations.write":
    case "settings.jobs.write":
    case "settings.roles.write":
    case "settings.scheduling.write":
    case "settings.conflict_rules.write":
    case "audit.read":
      // Managers read the catalog; they never write organization settings.
      return high;

    case "settings.locations.read":
    case "employee.references.read":
      // Owner and admins every location; the Employees drawer's pickers give
      // a manager where they work (BL-231). No manager role holds
      // settings.locations.read (Mert 2026-10-12, BL-176).
      return atPlace();

    case "settings.jobs.read":
    case "settings.shift_catalog.read":
    case "settings.important_dates.read":
    case "settings.documents.read":
    case "settings.signature_templates.read":
      // Managers read the catalog, as far as their role holds the permission.
      return true;

    case "settings.roles.read":
      // Roles are not shown to managers.
      return high;

    case "workspace.close":
    case "workspace.transfer_ownership":
      return true; // owner only, checked above

    case "workspace.todos":
      // The managers' Home is management's (S-210): the owner, an admin or a manager, wherever they
      // manage; whoever only works, or is not active, never (checked above).
      return true;

    case "time_off.decide":
    case "requests.read":
      // One decision chain (KARARLAR S-164, S-169): the managers of every
      // location the person works at vote, the person aside, whatever the
      // person's rank; an admin and the owner decide at every step (FB-6.3).
      // Only they read it in the Requests queue (FB-6.3.8c).
      if (isSelf) return false;
      return high || shares;

    case "time_off.revoke":
    case "documents.review":
    case "onboarding.review":
      // Management's, one rank up, nobody their own: the managers of every
      // location the person works at, an admin, the owner.
      if (isSelf) return false;
      if (actor.role === "owner") return true;
      if (actor.role === "admin") return targetRank < rankOf.admin;
      return person?.role === "employee" && shares;

    case "time_off.decide_alone":
      // At once and final: an admin or the owner, whatever the person's rank
      // (S-169); never their own.
      if (isSelf) return false;
      return high;

    case "onboarding.legal_name":
      // An admin or the owner, one rank up; a manager never (FB-6.6 S1).
      if (isSelf) return false;
      if (actor.role === "owner") return true;
      return actor.role === "admin" && targetRank < rankOf.admin;

    case "exchange.approve":
      // A pickup or cover is approved at the shift's location only, by its
      // manager, an admin or the owner, whatever the rank of whoever's case it
      // is (KARARLAR S-164, S-169); nobody approves their own (D3).
      if (isSelf) return false;
      return high || covers;

    case "employee.save_own_contact":
    case "documents.self":
    case "onboarding.self":
    case "availability.own":
    case "exchange.offer_own":
    case "notifications.read_own":
    case "notifications.write_own":
    case "avatar.self":
    case "time_off.request_own":
      return true; // own actions, answered above
  }
}
