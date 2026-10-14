// The workspace directory: every person Harbor & Vine has a record for, with
// what the Employees page and drawer read (profile, private contact,
// assignments, membership, invitation, onboarding, history). The 16 staff
// are world.employees (same ids, codes, locations and jobs); the owner, the
// manager and the people in other states live only here.
import * as shared from "@newfork/shared";
import { domainStore } from "./store";
import { addDays, iso, todayIn } from "./time";
import { viewerClass } from "./viewer";
import { viewerPermissions } from "./access";
import {
  ADMIN_USER_ID, DEPT, EMPLOYEE_USER_ID, JOB, LOC, MANAGER_USER_ID, OWNER_USER_ID, WORKSPACE_ID, ZONE, viewer, world,
} from "./world";

const hex = (n: number, width: number) => n.toString(16).padStart(width, "0");
// Same shape as world.ts ids, so links stay stable across reloads.
export const fixedId = (n: number) => `${hex(n, 8)}-0000-4000-8000-${hex(n, 12)}`;
// The same user ids the Requests and Hub backends give these people (requests-people.ts userIdOf).
const userIdOf = (employeeId: string) => `${employeeId.slice(0, 9)}1111-4111-8111-${employeeId.slice(-12)}`;
const userId = (n: number) => userIdOf(fixedId(n));

/** Management comes with every workspace: the department, Manager and the Owner job. */
export const MGMT = { department: fixedId(0x204), manager: fixedId(0x309), owner: fixedId(0x30a) };

/** The workspace roles (system roles; Settings > Roles owns their editing). */
export const ROLE = {
  owner: fixedId(0xc01), admin: fixedId(0xc02), manager: fixedId(0xc03), employee: fixedId(0xc04),
  // Custom roles (Settings > Roles, settings-store.ts).
  shiftLead: fixedId(0xc05), kitchenLead: fixedId(0xc06),
};
export const workspaceRoles = [
  { id: ROLE.owner, name: "Owner", system_key: "owner", access_class: "owner", sort_order: 0 },
  { id: ROLE.admin, name: "Admin", system_key: "admin", access_class: "admin", sort_order: 1 },
  { id: ROLE.manager, name: "Manager", system_key: "manager", access_class: "manager", sort_order: 2 },
  { id: ROLE.employee, name: "Employee", system_key: "employee", access_class: "employee", sort_order: 3 },
  { id: ROLE.kitchenLead, name: "Kitchen Lead", system_key: null, access_class: "manager", sort_order: 100 },
  { id: ROLE.shiftLead, name: "Shift Lead", system_key: null, access_class: "manager", sort_order: 100 },
] as const;
export type RoleClass = "owner" | "admin" | "manager" | "employee";
export const roleById = (id: string | null | undefined) => workspaceRoles.find((role) => role.id === id);

/** Employee ids of the people who live only in this directory. */
export const PERSON = {
  owner: fixedId(0x6f0),
  manager: fixedId(0x6f1),
  hannah: fixedId(0x6e1), // invited
  kevin: fixedId(0x6e2), // invited, delivery failed
  jasmine: fixedId(0x6e3), // onboarding, not finished
  ryan: fixedId(0x6e4), // submitted: needs attention
  brian: fixedId(0x6e5), // terminated, archived
  megan: fixedId(0x6e6), // archived
  diego: fixedId(0x6e7), // record only, no email yet
  uptownManager: fixedId(0x6f2), // David Park (Requests' Uptown voter)
  admin: fixedId(0x6f3), // Daniel Brooks, the workspace admin (an atlas viewer)
};
/** Uptown's manager: votes on Uptown's requests (requests-people.ts UPTOWN_MANAGER). */
export const UPTOWN_MANAGER_USER_ID = "7b2d4e61-93a8-4c15-b0f2-5d6e7f8a9b0c";

export interface PrivateContact {
  legal_first_name: string;
  legal_last_name: string;
  preferred_name?: string;
  phone: string | null;
  street_address: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  date_of_birth: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_email: string;
  emergency_contact_phone: string | null;
  share_phone_with_teammates: boolean;
  share_email_with_teammates: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  role_id: string;
  status: "pending" | "accepted" | "revoked" | "expired" | "declined";
  expires_at: string;
  sent_at: string;
  delivery_status: "pending" | "sent" | "failed";
  delivery_attempted_at: string | null;
  delivery_failed_at: string | null;
  delivery_error: string | null;
  invited_by_user_id: string;
  token: string;
}

export interface OnboardingCase {
  id: string;
  status: "in_progress" | "submitted" | "changes_requested" | "approved" | "cancelled";
  revision: number;
  submitted_at: string | null;
  /** The legal name step (kind "profile"), the one a reviewer answers in the drawer. */
  profile: { id: string; status: "not_started" | "in_progress" | "awaiting_review" | "completed" | "rejected"; rejection_reason: string | null };
  /** Weekly availability step. */
  availability: { id: string; status: "not_started" | "completed" };
}

export interface PersonEvent {
  id: string;
  action: string;
  occurred_at: string;
  actor_user_id: string;
  summary: string;
}

export interface Person {
  id: string;
  employee_code: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  preferred_name: string;
  invitation_email: string | null;
  start_date: string | null;
  internal_note: string;
  location_ids: string[];
  primary_location_id: string | null;
  job_ids: string[];
  primary_job_id: string | null;
  is_remote: boolean;
  is_excluded_from_schedule: boolean;
  user_id: string | null;
  account_email: string | null;
  membership: { status: "active" | "pending_activation" | "suspended"; role_id: string } | null;
  /** The role held before termination suspended the membership. */
  snapshot_role_id: string | null;
  is_workspace_owner: boolean;
  private: PrivateContact | null;
  /** Oldest first; the last one is "the" invitation. */
  invitations: Invitation[];
  onboarding: OnboardingCase | null;
  events: PersonEvent[];
  archived_at: string | null;
  revision: number;
  /** A workspace profile photo (an inline SVG), or none. */
  avatar: string | null;
  preferred_request: { id: string; requested_name: string; requested_at: string } | null;
  terminations: { key: string; result: Record<string, unknown> }[];
}

export interface Directory {
  people: Person[];
  /** How a preferred name is answered (Settings > People). */
  approval: "auto" | "manager";
  /** Create commands already run, by request id (idempotent retries). */
  commands: Record<string, { id: string; invitation: { id: string; deliveryStatus: "pending" | "sent" | "failed" } | null }>;
}

// ---------- seed ----------

const at = (date: string, clock: string) => {
  // A wall-clock reading at the restaurant, as an instant.
  const wall = Date.parse(`${date}T${clock}:00Z`);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, timeZoneName: "longOffset" })
    .formatToParts(new Date(wall)).find((part) => part.type === "timeZoneName")?.value ?? "GMT-04:00";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offset);
  const minutes = match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : -240;
  return iso(wall - minutes * 60_000);
};

interface StaffExtra {
  first: string; last: string; middle?: string; preferred?: string;
  email: string; phone: string; started: number; dob: string;
  street: string; city: string; zip: string;
  contact: [name: string, relationship: string, phone: string, email?: string];
  note?: string; photo?: string;
}

// What the directory knows about each of world.employees beyond the Schedule's view.
const staff: Record<string, StaffExtra> = {
  "HV-001": { first: "Maria", last: "Lopez", middle: "Isabel", email: "maria@harborvine.test", phone: "+16175550142", started: -612, dob: "1996-04-18", street: "48 Sumner St", city: "Boston", zip: "02128", contact: ["Ana Lopez", "Mother", "+16175550188", "ana.lopez@example.com"], photo: "#2563EB" },
  "HV-002": { first: "Jake", last: "Thompson", email: "jake.thompson@harborvine.test", phone: "+16175550117", started: -880, dob: "1993-11-02", street: "212 Hanover St", city: "Boston", zip: "02113", contact: ["Lauren Thompson", "Spouse", "+16175550119"], note: "Covers Uptown bar on Sundays." },
  "HV-003": { first: "Priya", last: "Patel", email: "priya.patel@harborvine.test", phone: "+16175550163", started: -301, dob: "2001-07-23", street: "9 Prospect St", city: "Cambridge", zip: "02139", contact: ["Raj Patel", "Father", "+16175550164", "raj.patel@example.com"], note: "Studies on Monday mornings." },
  "HV-004": { first: "Ethan", last: "Brooks", email: "ethan.brooks@harborvine.test", phone: "+16175550175", started: -190, dob: "2003-01-30", street: "77 Dorchester Ave", city: "Boston", zip: "02127", contact: ["Karen Brooks", "Mother", "+16175550176"] },
  "HV-005": { first: "Sophie", last: "Martin", email: "sophie.martin@harborvine.test", phone: "+16175550121", started: -1040, dob: "1991-09-14", street: "15 Elm St", city: "Somerville", zip: "02143", contact: ["Luc Martin", "Brother", "+16175550122"], photo: "#7C3AED" },
  "HV-006": { first: "Daniel", last: "Kim", email: "daniel.kim@harborvine.test", phone: "+16175550186", started: -96, dob: "2002-05-05", street: "301 Columbus Ave", city: "Boston", zip: "02116", contact: ["Grace Kim", "Mother", "+16175550187", "grace.kim@example.com"] },
  "HV-007": { first: "Carlos", last: "Rivera", email: "carlos.rivera@harborvine.test", phone: "+16175550133", started: -1405, dob: "1988-02-11", street: "56 Bennington St", city: "Boston", zip: "02128", contact: ["Lucia Rivera", "Spouse", "+16175550134"], note: "Opening line cook; keys to the walk-in." },
  "HV-008": { first: "Aisha", last: "Johnson", email: "aisha.johnson@harborvine.test", phone: "+16175550148", started: -720, dob: "1994-12-19", street: "8 Pearl St", city: "Cambridge", zip: "02139", contact: ["Denise Johnson", "Sister", "+16175550149"], photo: "#DC2626" },
  "HV-009": { first: "Tom", last: "Becker", preferred: "", email: "tom.becker@harborvine.test", phone: "+16175550157", started: -455, dob: "1990-06-08", street: "120 Main St", city: "Charlestown", zip: "02129", contact: ["Julia Becker", "Spouse", "+16175550158"] },
  "HV-010": { first: "Luis", last: "Hernandez", email: "luis.hernandez@harborvine.test", phone: "+16175550191", started: -260, dob: "1999-03-27", street: "33 Meridian St", city: "Boston", zip: "02128", contact: ["Rosa Hernandez", "Mother", "+16175550192"] },
  "HV-011": { first: "Emma", last: "Wilson", email: "emma.wilson@harborvine.test", phone: "+16175550104", started: -142, dob: "2000-10-03", street: "5 Beacon St", city: "Boston", zip: "02108", contact: ["Mark Wilson", "Father", "+16175550105", "mark.wilson@example.com"] },
  "HV-012": { first: "Noah", last: "Garcia", email: "noah.garcia@harborvine.test", phone: "+16175550111", started: -58, dob: "2004-08-16", street: "410 Huntington Ave", city: "Boston", zip: "02115", contact: ["Elena Garcia", "Mother", "+16175550112"], note: "Evening classes on Thursdays." },
  "HV-013": { first: "Olivia", last: "Chen", email: "olivia.chen@harborvine.test", phone: "+16175550125", started: -333, dob: "1998-01-21", street: "88 Harrison Ave", city: "Boston", zip: "02111", contact: ["Wei Chen", "Father", "+16175550126"], photo: "#059669" },
  "HV-014": { first: "Marcus", last: "Reed", email: "marcus.reed@harborvine.test", phone: "+16175550138", started: -975, dob: "1987-04-29", street: "19 Centre St", city: "Jamaica Plain", zip: "02130", contact: ["Tanya Reed", "Spouse", "+16175550139"] },
  "HV-015": { first: "Grace", last: "Murphy", email: "grace.murphy@harborvine.test", phone: "+16175550152", started: -510, dob: "1995-03-17", street: "61 Broadway", city: "Somerville", zip: "02145", contact: ["Sean Murphy", "Brother", "+16175550153"] },
  "HV-016": { first: "Sam", last: "Okafor", email: "sam.okafor@harborvine.test", phone: "+16175550167", started: -73, dob: "2001-12-01", street: "240 Blue Hill Ave", city: "Boston", zip: "02119", contact: ["Ngozi Okafor", "Mother", "+16175550168"] },
};

function avatarSvg(initials: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${color}"/><text x="48" y="58" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="600" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function contact(extra: StaffExtra, today: string): PrivateContact {
  return {
    legal_first_name: extra.first,
    legal_last_name: extra.last,
    ...(extra.preferred ? { preferred_name: extra.preferred } : {}),
    phone: extra.phone,
    street_address: extra.street,
    city: extra.city,
    region: "MA",
    postal_code: extra.zip,
    country_code: "US",
    date_of_birth: extra.dob <= today ? extra.dob : null,
    emergency_contact_name: extra.contact[0],
    emergency_contact_relationship: extra.contact[1],
    emergency_contact_phone: extra.contact[2],
    emergency_contact_email: extra.contact[3] ?? "",
    share_phone_with_teammates: false,
    share_email_with_teammates: false,
  };
}

let tokenCounter = 0;
const token = () => `demo${(++tokenCounter).toString(16).padStart(4, "0")}${Math.random().toString(16).slice(2, 14)}`;

function invitation(n: number, email: string, roleId: string, sentDaysAgo: number, status: Invitation["status"], today: string, extra: Partial<Invitation> = {}): Invitation {
  const sent = at(addDays(today, -sentDaysAgo), "10:15");
  return {
    id: fixedId(0x1d00 + n),
    email,
    role_id: roleId,
    status,
    expires_at: iso(Date.parse(sent) + 7 * 86_400_000),
    sent_at: sent,
    delivery_status: "sent",
    delivery_attempted_at: sent,
    delivery_failed_at: null,
    delivery_error: null,
    invited_by_user_id: OWNER_USER_ID,
    token: token(),
    ...extra,
  };
}

let eventCounter = 0;
export function event(action: string, summary: string, occurredAt: string, actor = OWNER_USER_ID): PersonEvent {
  eventCounter += 1;
  return { id: fixedId(0xe0000 + eventCounter), action, occurred_at: occurredAt, actor_user_id: actor, summary };
}

function onboardingCase(n: number, status: OnboardingCase["status"], profile: OnboardingCase["profile"]["status"], availability: OnboardingCase["availability"]["status"], submittedAt: string | null): OnboardingCase {
  return {
    id: fixedId(0x1f00 + n),
    status,
    revision: 3 + n,
    submitted_at: submittedAt,
    profile: { id: fixedId(0x1f40 + n), status: profile, rejection_reason: null },
    availability: { id: fixedId(0x1f80 + n), status: availability },
  };
}

function seed(): Directory {
  const today = todayIn(ZONE);
  eventCounter = 0;
  const people: Person[] = world.employees.map((employee, index) => {
    const extra = staff[employee.employee_code]!;
    const started = addDays(today, extra.started);
    const user = employee.id === viewerEmployeeIdFor("employee") ? EMPLOYEE_USER_ID : userIdOf(employee.id);
    const invite = invitation(index + 1, extra.email, ROLE.employee, -extra.started + 6, "accepted", today);
    return {
      id: employee.id,
      employee_code: employee.employee_code,
      first_name: extra.first,
      middle_name: extra.middle ?? "",
      last_name: extra.last,
      preferred_name: extra.preferred ?? "",
      invitation_email: extra.email,
      start_date: started,
      internal_note: extra.note ?? "",
      location_ids: [...employee.location_ids],
      primary_location_id: employee.location_ids[0] ?? null,
      job_ids: [...employee.job_ids],
      primary_job_id: employee.primary_job_id,
      is_remote: false,
      is_excluded_from_schedule: false,
      user_id: user,
      account_email: extra.email,
      membership: { status: "active", role_id: ROLE.employee },
      snapshot_role_id: null,
      is_workspace_owner: false,
      private: contact(extra, today),
      invitations: [invite],
      onboarding: onboardingCase(index + 1, "approved", "completed", "completed", at(addDays(started, -3), "19:40")),
      events: [
        event("employee.onboarding_approved", "Onboarding approved; workspace access active", at(addDays(started, -2), "09:05")),
        event("employee.invitation_accepted", `Invitation accepted by ${extra.email}`, at(addDays(started, -5), "18:22"), user),
        event("employee.invited", `Invited as Employee (${extra.email})`, invite.sent_at),
        event("employee.created", `Employee record created (${employee.employee_code})`, at(addDays(started, -6), "10:02")),
      ],
      archived_at: null,
      revision: 3,
      avatar: extra.photo ? avatarSvg(`${extra.first[0]}${extra.last[0]}`, extra.photo) : null,
      preferred_request: null,
      terminations: [],
    };
  });

  // Requests for a preferred name, waiting for an answer.
  const olivia = people.find((person) => person.employee_code === "HV-013")!;
  olivia.preferred_request = { id: fixedId(0xa71), requested_name: "Liv", requested_at: at(addDays(today, -1), "16:48") };
  const tom = people.find((person) => person.employee_code === "HV-009")!;
  tom.preferred_request = { id: fixedId(0xa72), requested_name: "Tommy", requested_at: at(addDays(today, -2), "11:03") };
  // One already approved earlier.
  const sophie = people.find((person) => person.employee_code === "HV-005")!;
  sophie.preferred_name = "Soph";
  sophie.private!.preferred_name = "Soph";
  sophie.events.unshift(event("employee.preferred_name_approved", "Preferred name \"Soph\" approved", at(addDays(today, -40), "13:12")));
  // Shift Leads (a custom manager-class role): one at each location.
  const carlos = people.find((person) => person.employee_code === "HV-007")!;
  const grace = people.find((person) => person.employee_code === "HV-015")!;
  for (const lead of [carlos, grace]) {
    lead.membership!.role_id = ROLE.shiftLead;
    lead.events.unshift(event("employee.role_changed", "Role changed from Employee to Shift Lead", at(addDays(today, lead === carlos ? -210 : -95), "11:20")));
  }
  carlos.events.unshift(event("employee.location_assigned", "Assigned to Harbor & Vine Downtown as Line Cook (primary)", at(addDays(today, -300), "08:30")));

  const ownerStart = addDays(today, -1460);
  people.push({
    id: PERSON.owner,
    employee_code: "HV-000",
    first_name: "Mert",
    middle_name: "",
    last_name: "Tepebas",
    preferred_name: "",
    invitation_email: null,
    start_date: ownerStart,
    internal_note: "",
    // The owner works at every location with no primary (as in the app).
    location_ids: [LOC.downtown, LOC.uptown],
    primary_location_id: null,
    job_ids: [MGMT.owner],
    primary_job_id: null,
    is_remote: false,
    is_excluded_from_schedule: false,
    user_id: OWNER_USER_ID,
    account_email: viewerEmail("owner"),
    membership: { status: "active", role_id: ROLE.owner },
    snapshot_role_id: null,
    is_workspace_owner: true,
    private: {
      legal_first_name: "Mert", legal_last_name: "Tepebas",
      phone: null, street_address: null, city: null, region: null, postal_code: null, country_code: null, date_of_birth: null,
      emergency_contact_name: null, emergency_contact_relationship: null, emergency_contact_email: "", emergency_contact_phone: null,
      share_phone_with_teammates: false, share_email_with_teammates: false,
    },
    invitations: [],
    onboarding: null,
    events: [event("employee.created", "Workspace owner record created at setup", at(ownerStart, "09:00"))],
    archived_at: null,
    revision: 2,
    avatar: avatarSvg("MT", "#111827"),
    preferred_request: null,
    terminations: [],
  });

  const rachelStart = addDays(today, -820);
  people.push({
    id: PERSON.manager,
    employee_code: "HV-017",
    first_name: "Rachel",
    middle_name: "",
    last_name: "Adams",
    preferred_name: "",
    invitation_email: viewerEmail("manager"),
    start_date: rachelStart,
    internal_note: "General manager, Downtown.",
    location_ids: [LOC.downtown],
    primary_location_id: LOC.downtown,
    job_ids: [MGMT.manager],
    primary_job_id: MGMT.manager,
    is_remote: false,
    is_excluded_from_schedule: true,
    user_id: MANAGER_USER_ID,
    account_email: viewerEmail("manager"),
    membership: { status: "active", role_id: ROLE.manager },
    snapshot_role_id: null,
    is_workspace_owner: false,
    private: contact({ first: "Rachel", last: "Adams", email: "", phone: "+16175550101", started: -820, dob: "1985-08-09", street: "27 Commercial Wharf", city: "Boston", zip: "02110", contact: ["Michael Adams", "Spouse", "+16175550102", "michael.adams@example.com"] }, today),
    invitations: [invitation(40, viewerEmail("manager"), ROLE.manager, 826, "accepted", today)],
    onboarding: onboardingCase(40, "approved", "completed", "completed", at(addDays(rachelStart, -3), "20:10")),
    events: [
      event("employee.role_changed", "Role changed from Employee to Manager", at(addDays(today, -500), "10:00")),
      event("employee.onboarding_approved", "Onboarding approved; workspace access active", at(addDays(rachelStart, -2), "09:30")),
      event("employee.invited", `Invited as Employee (${viewerEmail("manager")})`, at(addDays(rachelStart, -6), "10:15")),
      event("employee.created", "Employee record created (HV-017)", at(addDays(rachelStart, -6), "10:02")),
    ],
    archived_at: null,
    revision: 5,
    avatar: avatarSvg("RA", "#B45309"),
    preferred_request: null,
    terminations: [],
  });

  const davidStart = addDays(today, -640);
  people.push({
    id: PERSON.uptownManager,
    employee_code: "HV-025",
    first_name: "David",
    middle_name: "",
    last_name: "Park",
    preferred_name: "",
    invitation_email: "david.park@harborvine.test",
    start_date: davidStart,
    internal_note: "General manager, Uptown.",
    location_ids: [LOC.uptown],
    primary_location_id: LOC.uptown,
    job_ids: [MGMT.manager],
    primary_job_id: MGMT.manager,
    is_remote: false,
    is_excluded_from_schedule: true,
    user_id: UPTOWN_MANAGER_USER_ID,
    account_email: "david.park@harborvine.test",
    membership: { status: "active", role_id: ROLE.manager },
    snapshot_role_id: null,
    is_workspace_owner: false,
    private: contact({ first: "David", last: "Park", email: "", phone: "+16175550131", started: -640, dob: "1984-10-27", street: "410 Harvard St", city: "Brookline", zip: "02446", contact: ["Min-ji Park", "Spouse", "+16175550132", "minji.park@example.com"] }, today),
    invitations: [invitation(41, "david.park@harborvine.test", ROLE.manager, 646, "accepted", today)],
    onboarding: onboardingCase(41, "approved", "completed", "completed", at(addDays(davidStart, -3), "21:00")),
    events: [
      event("employee.onboarding_approved", "Onboarding approved; workspace access active", at(addDays(davidStart, -2), "09:30")),
      event("employee.invited", "Invited as Manager (david.park@harborvine.test)", at(addDays(davidStart, -6), "10:15")),
      event("employee.created", "Employee record created (HV-025)", at(addDays(davidStart, -6), "10:02")),
    ],
    archived_at: null,
    revision: 3,
    avatar: null,
    preferred_request: null,
    terminations: [],
  });

  const danielStart = addDays(today, -380);
  people.push({
    id: PERSON.admin,
    employee_code: "HV-026",
    first_name: "Daniel",
    middle_name: "",
    last_name: "Brooks",
    preferred_name: "",
    invitation_email: ADMIN_EMAIL,
    start_date: danielStart,
    internal_note: "Operations; runs the workspace with the owner.",
    location_ids: [LOC.downtown, LOC.uptown],
    primary_location_id: LOC.downtown,
    job_ids: [MGMT.manager],
    primary_job_id: MGMT.manager,
    is_remote: false,
    is_excluded_from_schedule: true,
    user_id: ADMIN_USER_ID,
    account_email: ADMIN_EMAIL,
    membership: { status: "active", role_id: ROLE.admin },
    snapshot_role_id: null,
    is_workspace_owner: false,
    private: contact({ first: "Daniel", last: "Brooks", email: "", phone: "+16175550171", started: -380, dob: "1986-06-02", street: "22 Prince St", city: "Boston", zip: "02113", contact: ["Laura Brooks", "Spouse", "+16175550172"] }, today),
    invitations: [invitation(42, ADMIN_EMAIL, ROLE.admin, 386, "accepted", today)],
    onboarding: onboardingCase(42, "approved", "completed", "completed", at(addDays(danielStart, -3), "20:10")),
    events: [
      event("employee.onboarding_approved", "Onboarding approved; workspace access active", at(addDays(danielStart, -2), "09:40")),
      event("employee.invited", `Invited as Admin (${ADMIN_EMAIL})`, at(addDays(danielStart, -6), "10:20")),
      event("employee.created", "Employee record created (HV-026)", at(addDays(danielStart, -6), "10:05")),
    ],
    archived_at: null,
    revision: 3,
    avatar: null,
    preferred_request: null,
    terminations: [],
  });

  const base = (fields: Partial<Person> & Pick<Person, "id" | "employee_code" | "first_name" | "last_name" | "location_ids" | "job_ids">): Person => ({
    middle_name: "",
    preferred_name: "",
    invitation_email: null,
    start_date: null,
    internal_note: "",
    primary_location_id: fields.location_ids[0] ?? null,
    primary_job_id: fields.job_ids[0] ?? null,
    is_remote: false,
    is_excluded_from_schedule: false,
    user_id: null,
    account_email: null,
    membership: null,
    snapshot_role_id: null,
    is_workspace_owner: false,
    private: null,
    invitations: [],
    onboarding: null,
    events: [],
    archived_at: null,
    revision: 1,
    avatar: null,
    preferred_request: null,
    terminations: [],
    ...fields,
  });

  // Invited, waiting for an answer.
  const hannahInvite = invitation(51, "hannah.scott@harborvine.test", ROLE.employee, 2, "pending", today);
  people.push(base({
    id: PERSON.hannah, employee_code: "HV-018", first_name: "Hannah", last_name: "Scott",
    invitation_email: "hannah.scott@harborvine.test", start_date: addDays(today, 6),
    location_ids: [LOC.uptown], job_ids: [JOB.server, JOB.host],
    invitations: [hannahInvite], revision: 2,
    events: [
      event("employee.invited", "Invited as Employee (hannah.scott@harborvine.test)", hannahInvite.sent_at),
      event("employee.created", "Employee record created (HV-018)", at(addDays(today, -2), "10:11")),
    ],
  }));
  // Invited, but the email bounced.
  const kevinInvite = invitation(52, "kevin.nguyen@harborvine.test", ROLE.employee, 1, "pending", today, {
    delivery_status: "failed",
    delivery_failed_at: at(addDays(today, -1), "10:16"),
    delivery_error: "The mail server rejected the address (mailbox unavailable).",
  });
  people.push(base({
    id: PERSON.kevin, employee_code: "HV-019", first_name: "Kevin", last_name: "Nguyen",
    invitation_email: "kevin.nguyen@harborvine.test", start_date: addDays(today, 9),
    location_ids: [LOC.downtown], job_ids: [JOB.line, JOB.prep], internal_note: "Trial shift went well; starts on the line.",
    invitations: [kevinInvite], revision: 2,
    events: [
      event("employee.invitation_failed", "Invitation could not be delivered to kevin.nguyen@harborvine.test", kevinInvite.delivery_failed_at!),
      event("employee.invited", "Invited as Employee (kevin.nguyen@harborvine.test)", kevinInvite.sent_at),
      event("employee.created", "Employee record created (HV-019)", at(addDays(today, -1), "10:09")),
    ],
  }));
  // Accepted, still working through onboarding.
  const jasmineInvite = invitation(53, "jasmine.torres@harborvine.test", ROLE.employee, 4, "accepted", today);
  people.push(base({
    id: PERSON.jasmine, employee_code: "HV-020", first_name: "Jasmine", last_name: "Torres",
    invitation_email: "jasmine.torres@harborvine.test", start_date: addDays(today, 3),
    location_ids: [LOC.downtown], job_ids: [JOB.host],
    user_id: userId(0x6e3), account_email: "jasmine.torres@harborvine.test",
    membership: { status: "pending_activation", role_id: ROLE.employee },
    private: {
      legal_first_name: "Jasmine", legal_last_name: "Torres",
      phone: "+16175550172", street_address: null, city: null, region: null, postal_code: null, country_code: null,
      date_of_birth: null, emergency_contact_name: null, emergency_contact_relationship: null,
      emergency_contact_email: "", emergency_contact_phone: null,
      share_phone_with_teammates: false, share_email_with_teammates: false,
    },
    invitations: [jasmineInvite],
    onboarding: onboardingCase(53, "in_progress", "in_progress", "not_started", null),
    revision: 3,
    events: [
      event("employee.invitation_accepted", "Invitation accepted by jasmine.torres@harborvine.test", at(addDays(today, -3), "21:05"), userId(0x6e3)),
      event("employee.invited", "Invited as Employee (jasmine.torres@harborvine.test)", jasmineInvite.sent_at),
      event("employee.created", "Employee record created (HV-020)", at(addDays(today, -4), "10:05")),
    ],
  }));
  // Submitted onboarding: legal name and documents wait for review.
  const ryanInvite = invitation(54, "ryan.mitchell@harborvine.test", ROLE.employee, 6, "accepted", today);
  people.push(base({
    id: PERSON.ryan, employee_code: "HV-021", first_name: "Ryan", middle_name: "James", last_name: "Mitchell",
    invitation_email: "ryan.mitchell@harborvine.test", start_date: addDays(today, 2),
    location_ids: [LOC.uptown], job_ids: [JOB.bartender, JOB.barback],
    user_id: userId(0x6e4), account_email: "ryan.mitchell@harborvine.test",
    membership: { status: "pending_activation", role_id: ROLE.employee },
    private: contact({ first: "Ryan", middle: "James", last: "Mitchell", email: "", phone: "+16175550181", started: 0, dob: "1997-06-12", street: "14 Union Sq", city: "Somerville", zip: "02143", contact: ["Kate Mitchell", "Sister", "+16175550182", "kate.mitchell@example.com"] }, today),
    invitations: [ryanInvite],
    onboarding: onboardingCase(54, "submitted", "awaiting_review", "completed", at(addDays(today, -1), "22:31")),
    revision: 4,
    events: [
      event("employee.onboarding_submitted", "Onboarding submitted for review", at(addDays(today, -1), "22:31"), userId(0x6e4)),
      event("employee.invitation_accepted", "Invitation accepted by ryan.mitchell@harborvine.test", at(addDays(today, -5), "19:47"), userId(0x6e4)),
      event("employee.invited", "Invited as Employee (ryan.mitchell@harborvine.test)", ryanInvite.sent_at),
      event("employee.created", "Employee record created (HV-021)", at(addDays(today, -6), "10:01")),
    ],
  }));
  // Terminated last month; the record and history stay.
  const brianEnd = at(addDays(today, -24), "23:00");
  const brianStart = addDays(today, -540);
  people.push(base({
    id: PERSON.brian, employee_code: "HV-022", first_name: "Brian", last_name: "Foster",
    invitation_email: "brian.foster@harborvine.test", start_date: brianStart,
    location_ids: [LOC.downtown], job_ids: [JOB.server],
    user_id: userId(0x6e5), account_email: "brian.foster@harborvine.test",
    membership: { status: "suspended", role_id: ROLE.employee }, snapshot_role_id: ROLE.employee,
    private: contact({ first: "Brian", last: "Foster", email: "", phone: "+16175550115", started: 0, dob: "1992-02-25", street: "3 Tremont St", city: "Boston", zip: "02108", contact: ["Laura Foster", "Mother", "+16175550116"] }, today),
    invitations: [invitation(55, "brian.foster@harborvine.test", ROLE.employee, 546, "accepted", today)],
    archived_at: brianEnd, revision: 6,
    events: [
      event("employee.terminated", "Terminated: Moved out of state. 2 published shifts released.", brianEnd),
      event("employee.onboarding_approved", "Onboarding approved; workspace access active", at(addDays(brianStart, -2), "09:00")),
      event("employee.created", "Employee record created (HV-022)", at(addDays(brianStart, -6), "10:00")),
    ],
  }));
  // Seasonal prep cook, archived after the summer.
  const meganEnd = at(addDays(today, -68), "17:00");
  people.push(base({
    id: PERSON.megan, employee_code: "HV-023", first_name: "Megan", last_name: "Ross",
    invitation_email: "megan.ross@harborvine.test", start_date: addDays(today, -190),
    location_ids: [LOC.uptown], job_ids: [JOB.prep],
    invitations: [invitation(56, "megan.ross@harborvine.test", ROLE.employee, 200, "revoked", today)],
    internal_note: "Seasonal (summer). Eligible for rehire.",
    archived_at: meganEnd, revision: 4,
    events: [
      event("employee.terminated", "Terminated: End of seasonal contract. 0 published shifts released.", meganEnd),
      event("employee.created", "Employee record created (HV-023)", at(addDays(today, -196), "10:00")),
    ],
  }));
  // On the books, no email yet.
  people.push(base({
    id: PERSON.diego, employee_code: "HV-024", first_name: "Diego", last_name: "Morales",
    start_date: addDays(today, 12), location_ids: [LOC.uptown], job_ids: [JOB.dish],
    internal_note: "Referred by Sam. Waiting for his email address.",
    events: [event("employee.created", "Employee record created (HV-024)", at(addDays(today, -1), "15:40"), viewerUserId("manager"))],
  }));

  return { people, approval: "manager", commands: {} };
}

function viewerEmployeeIdFor(role: "employee"): string {
  return role === "employee" ? "00000601-0000-4000-8000-000000000601" : "";
}
const ADMIN_EMAIL = "daniel@harborvine.test";
function viewerEmail(role: "owner" | "manager"): string {
  return role === "owner" ? "owner@harborvine.test" : "rachel@harborvine.test";
}
function viewerUserId(role: "owner" | "manager"): string {
  return role === "owner" ? OWNER_USER_ID : MANAGER_USER_ID;
}

export const directory = domainStore<Directory>("employees", seed);

// ---------- reading ----------

export const people = () => directory.data.people;
export const personById = (id: string) => directory.data.people.find((person) => person.id === id);
export const personByUser = (user: string) => directory.data.people.find((person) => person.user_id === user && !person.archived_at);
export const latestInvitation = (person: Person) => person.invitations[person.invitations.length - 1] ?? null;
export const fullName = (person: Person) => `${person.first_name} ${person.last_name}`;
export const displayName = (person: Person) => `${person.preferred_name || person.first_name} ${person.last_name}`;

/** Departments and jobs as the workspace has them: the catalog plus Management. */
export function catalog() {
  const departments: { id: string; name: string; color: string; system_key: string | null; archived_at: string | null }[] =
    world.departments.map((row) => ({ ...row, archived_at: null }));
  const jobs: { id: string; name: string; color: string; department_id: string | null; system_key: string | null; archived_at: string | null }[] =
    world.jobs.map((row) => ({ ...row, archived_at: null }));
  if (!departments.some((row) => row.system_key === "management" || row.id === MGMT.department)) {
    departments.push({ id: MGMT.department, name: "Management", color: "#475569", system_key: "management", archived_at: null });
  }
  if (!jobs.some((row) => row.id === MGMT.manager)) {
    jobs.push({ id: MGMT.manager, name: "Manager", color: "#64748B", department_id: MGMT.department, system_key: null, archived_at: null });
  }
  if (!jobs.some((row) => row.system_key === "owner" || row.id === MGMT.owner)) {
    jobs.push({ id: MGMT.owner, name: "Owner", color: "#334155", department_id: MGMT.department, system_key: "owner", archived_at: null });
  }
  return { departments, jobs };
}
export const locationName = (id: string) => world.locations.find((row) => row.id === id)?.name ?? "Location";
export const jobName = (id: string) => catalog().jobs.find((row) => row.id === id)?.name ?? "Job";
export { DEPT, WORKSPACE_ID };

// ---------- who is asking ----------

export function actor() {
  const role: RoleClass = viewerClass;
  return {
    userId: viewer.userId,
    role: role as RoleClass,
    locationIds: role === "manager" ? [LOC.downtown] : role === "employee" ? [...(personByUser(viewer.userId)?.location_ids ?? [])] : [],
    permissions: viewerPermissions(),
  };
}

/** The rank a record holds: the owner, its member role, or employee. */
export function personRole(person: Person): RoleClass {
  if (person.is_workspace_owner) return "owner";
  const role = roleById(person.membership?.role_id ?? null);
  return (role?.access_class as RoleClass | undefined) ?? "employee";
}

/** The core's answer for one action on one person's record (shared expected()). */
export function may(action: string, person: Person, locations?: string[]): boolean {
  const me = actor();
  const ask = shared.expected as (actor: unknown, action: string, target: unknown) => boolean;
  return ask(
    { workspaceId: WORKSPACE_ID, role: me.role, status: "active", locationIds: me.locationIds, permissions: me.permissions },
    action,
    {
      person: { role: personRole(person), isSelf: person.user_id !== null && person.user_id === me.userId },
      locations: locations ?? person.location_ids,
    },
  );
}

/** May they invite with this role: below their own rank, and create at their places. */
export function mayInviteWith(roleId: string): boolean {
  const me = actor();
  const role = roleById(roleId);
  if (!role || !me.permissions.includes("employees.manage")) return false;
  const rank = { owner: 4, admin: 3, manager: 2, employee: 1 } as const;
  return rank[role.access_class] < rank[me.role];
}
