// The workspace hub (/workspaces) and the status pages behind it, in the demo
// backend: every workspace the signed-in account belongs to or used to, the
// invitations waiting for it, and the setups it started. Routes follow
// apps/api/src/account/workspace-account-routes.ts and the invitation routes
// in apps/api/src/app.ts; the list follows list_account_workspaces_service.
import * as shared from "@newfork/shared";
import { domainStore } from "./store";
import { uuid } from "./time";
import { viewerRole } from "./viewer";
import { registerTable, viewer } from "./world";
import { employeeCaseRoutes, invitedCase, type EmployeeCase } from "./hub-onboarding-employee";
import {
  contextIn, daysFromNow, fail, HARBOR, noContext, OTHER, tabWorkspaceId,
  type Role, type Route,
} from "./hub-onboarding-shared";

interface HubWorkspace {
  id: string;
  name: string;
  role: Role;
  status: "active" | "pending" | "suspended" | "removed";
  isActive: boolean;
  onboarding: { status: "complete" | "incomplete"; currentStep: number; revision: number };
  lifecycleStatus: "draft" | "active" | "suspended" | "closure_scheduled" | "closed" | "deleted";
  accessRemoved?: boolean;
  closureEffectiveAt?: string | null;
  lastUsedAt: string | null;
  otherMemberCount?: number;
  pendingInvitationCount?: number;
}
interface HubInvitation {
  id: string;
  workspaceId: string;
  workspaceName: string;
  expiresAt: string;
  /** What the case behind it will hold once accepted. */
  location: string;
  jobs: string[];
}
interface HubState {
  workspaces: HubWorkspace[];
  invitations: HubInvitation[];
  cases: Record<string, EmployeeCase>;
  /** PAGES: the account was never linked to a workspace ("Welcome to Newfork"). */
  neverLinked?: boolean;
  /** PAGES: the code the server answers "Join" with instead of accepting. */
  refuseAccept?: string;
}

const done = { status: "complete" as const, currentStep: 4, revision: 3 };
const ago = (days: number) => daysFromNow(-days);

const emailHint = () => {
  const [local, domain] = viewer.email.split("@");
  return `${local![0]}${"*".repeat(Math.max(local!.length - 1, 2))}@${domain}`;
};

/** Each viewer's account: its workspaces, one invitation, and one way a workspace ended. */
function seed(): HubState {
  const harbor: HubWorkspace = {
    ...HARBOR, role: viewerRole, status: "active", isActive: true, onboarding: done,
    lifecycleStatus: "active", lastUsedAt: ago(0), otherMemberCount: 17, pendingInvitationCount: 2,
  };
  const cedar = (days: number, location: string, jobs: string[]): HubInvitation => ({
    id: "1c3d5e7f-9a0b-4c2d-8e4f-6a8b0c2d4e6f", workspaceId: OTHER.cedar.id, workspaceName: OTHER.cedar.name,
    expiresAt: daysFromNow(days), location, jobs,
  });
  if (viewerRole === "owner")
    return {
      workspaces: [
        harbor,
        {
          ...OTHER.saltline, role: "admin", status: "active", isActive: false, onboarding: done,
          lifecycleStatus: "active", lastUsedAt: ago(4), otherMemberCount: 11, pendingInvitationCount: 0,
        },
        {
          ...OTHER.pier9, role: "owner", status: "suspended", isActive: false, onboarding: done,
          lifecycleStatus: "deleted", closureEffectiveAt: ago(23), lastUsedAt: ago(30),
        },
      ],
      invitations: [cedar(5, "Cedar & Smoke Midtown", ["General Manager"])],
      cases: {},
    };
  if (viewerRole === "manager")
    return {
      workspaces: [
        harbor,
        {
          ...OTHER.bayside, role: "employee", status: "suspended", isActive: false, onboarding: done,
          lifecycleStatus: "active", lastUsedAt: ago(40),
        },
      ],
      invitations: [cedar(2, "Cedar & Smoke Midtown", ["Shift Lead"])],
      cases: {},
    };
  return {
    workspaces: [
      harbor,
      {
        ...OTHER.corner, role: "employee", status: "removed", isActive: false, onboarding: done,
        lifecycleStatus: "active", accessRemoved: true, lastUsedAt: ago(62),
      },
    ],
    invitations: [cedar(6, "Cedar & Smoke Midtown", ["Server"])],
    cases: {},
  };
}

// One account per role, so switching roles never shows another person's list.
const store = domainStore<HubState>(`workspace-hub.${viewerRole}`, seed);
const state = () => store.data;

function summary(workspace: HubWorkspace) {
  return {
    ...workspace,
    isActive: workspace.isActive && workspace.status === "active",
    accessRemoved: workspace.accessRemoved ?? false,
    closureEffectiveAt: workspace.closureEffectiveAt ?? null,
    defaultClosureEffectiveAt: null,
    pendingOwnershipTransfer: null,
  };
}

export function hubRoutesForPage(route: Route): void {
  route("GET", "/v1/account/workspaces", () => state().workspaces.map(summary));
  registerTable("account_organization_history", () => state().neverLinked ? [] : [{ user_id: viewer.userId }]);

  // The workspace the tab names, when the account can open it.
  route("GET", "/v1/context", () => {
    const wanted = tabWorkspaceId();
    const workspace = wanted
      ? state().workspaces.find((one) => one.id === wanted)
      : state().workspaces.find((one) => one.isActive) ?? state().workspaces[0];
    if (!workspace || workspace.status !== "active" || ["closed", "deleted"].includes(workspace.lifecycleStatus)) noContext();
    return contextIn(workspace, workspace.role, workspace.onboarding);
  });

  route("POST", "/v1/account/workspaces/:workspaceId/active", ({ params }) => {
    const target = state().workspaces.find((one) => one.id === params.workspaceId && one.status === "active");
    if (!target) fail(404, "Workspace not found");
    for (const one of state().workspaces) one.isActive = one === target;
    store.save();
    return undefined;
  });

  // "Create your workspace": a draft the owner sets up on /onboarding.
  route("POST", "/v1/account/workspaces", ({ body }) => {
    const name = shared.workspaceNameInputSchema.safeParse(body?.name);
    if (!name.success) fail(400, "Valid workspace name required");
    const id = uuid();
    state().workspaces.push({
      id, name: name.data, role: "owner", status: "active", isActive: false,
      onboarding: { status: "incomplete", currentStep: 1, revision: 1 },
      lifecycleStatus: "draft", lastUsedAt: new Date().toISOString(), otherMemberCount: 0, pendingInvitationCount: 0,
    });
    store.save();
    return { id };
  });

  // Discarding an unfinished setup closes (deletes) the draft; a live
  // workspace's closure asks for a password and is on the Account page.
  route("POST", "/v1/account/workspaces/:workspaceId/closure", ({ params, body }) => {
    const workspace = state().workspaces.find((one) => one.id === params.workspaceId);
    if (!workspace) fail(404, "Workspace not found");
    const draft = workspace.role === "owner" && workspace.status === "active" && workspace.onboarding.status !== "complete";
    if (!draft && !body?.password)
      fail(400, "Current password required", { reason: "session.password_required" });
    if (!draft) fail(403, "Closing a live workspace is on the Account page of the atlas", { reason: "demo.not_available" });
    if (String(body?.typedWorkspaceName ?? "").trim() !== workspace.name)
      fail(400, "Type the workspace name to confirm", { reason: "workspace.closure.name_mismatch" });
    state().workspaces = state().workspaces.filter((one) => one !== workspace);
    store.save();
    return { workspace_id: workspace.id, status: "deleted", effective_at: new Date().toISOString() };
  });

  route("GET", "/v1/invitations/pending", () =>
    state().invitations
      .filter((one) => Date.parse(one.expiresAt) > Date.now())
      .map(({ id, workspaceId, workspaceName, expiresAt }) => ({ id, workspaceId, workspaceName, emailHint: emailHint(), expiresAt })));

  route("POST", "/v1/invitations/:invitationId/accept", ({ params }) => {
    const invitation = state().invitations.find((one) => one.id === params.invitationId);
    if (!invitation) fail(404, "This invitation is no longer open", { code: "invitation_not_found" });
    if (state().refuseAccept) fail(409, "Invitation could not be accepted", { code: state().refuseAccept });
    if (state().workspaces.some((one) => one.id === invitation.workspaceId))
      fail(409, "You are already a member of this workspace", { code: "already_member" });
    state().invitations = state().invitations.filter((one) => one !== invitation);
    state().workspaces.push({
      id: invitation.workspaceId, name: invitation.workspaceName, role: "employee", status: "pending",
      isActive: false, onboarding: done, lifecycleStatus: "active", lastUsedAt: null,
    });
    const [first, ...rest] = viewer.name.split(" ");
    state().cases[invitation.workspaceId] = invitedCase(
      { id: invitation.workspaceId, name: invitation.workspaceName }, first!, rest.join(" "), invitation.location, invitation.jobs,
    );
    store.save();
    return { workspaceId: invitation.workspaceId, status: "accepted" };
  });

  route("POST", "/v1/invitations/:invitationId/decline", ({ params }) => {
    const invitation = state().invitations.find((one) => one.id === params.invitationId);
    if (!invitation) fail(404, "This invitation is no longer open", { code: "invitation_not_found" });
    state().invitations = state().invitations.filter((one) => one !== invitation);
    store.save();
    return undefined;
  });

  // Declining an onboarding the account had already started (UnfinishedSetupRow).
  employeeCaseRoutes(route, {
    cases: () => state().cases,
    save: () => store.save(),
    left: (workspaceId) => {
      state().workspaces = state().workspaces.filter((one) => one.id !== workspaceId);
    },
  });
}

// ---------------------------------------------------------------------------
// PAGES setups for 1.5 Workspace hub, 1.6 Workspace status and the two
// waiting screens (1.10 Almost ready, 1.11 That workspace didn't load).

const DOCKSIDE = { id: "d0c5d1de-7a3b-4c1e-9f20-5b7d9e1f3a65", name: "Dockside Tavern" };

function hub(change: (data: HubState) => void): () => void {
  return () => { change(state()); store.save(); };
}
const harborOf = (data: HubState) => data.workspaces.find((one) => one.id === HARBOR.id)!;

export const hubSetups: Record<string, () => void> = {
  // An account with nothing yet: never linked, or linked before.
  "hub-empty": hub((data) => { data.workspaces = []; data.invitations = []; data.neverLinked = true; }),
  "hub-empty-returning": hub((data) => { data.workspaces = []; data.invitations = []; }),
  "hub-no-invites": hub((data) => { data.invitations = []; }),
  "hub-single": hub((data) => { data.invitations = []; data.workspaces = [harborOf(data)]; }),
  "hub-two-invites": hub((data) => {
    data.invitations.push({ id: "2d4e6f80-1b2c-4d3e-9f40-7a8b9c0d1e2f", workspaceId: DOCKSIDE.id, workspaceName: DOCKSIDE.name,
      expiresAt: daysFromNow(1), location: "Dockside Tavern", jobs: ["Bartender"] });
  }),
  // The owner's own setup, started and not finished.
  "hub-draft": hub((data) => {
    data.invitations = [];
    data.workspaces.push({
      id: "d7af7e5a-6b1c-4e3d-8f5a-2c4e6a8b0d96", name: "Harbor & Vine Seaport", role: "owner", status: "active", isActive: false,
      onboarding: { status: "incomplete", currentStep: 2, revision: 4 }, lifecycleStatus: "draft", lastUsedAt: ago(1),
      otherMemberCount: 0, pendingInvitationCount: 0,
    });
  }),
  // The Cedar & Smoke invitation already accepted: its onboarding is open.
  "hub-joined": hub((data) => {
    const invitation = data.invitations.find((one) => one.workspaceId === OTHER.cedar.id);
    if (!invitation) return;
    data.invitations = data.invitations.filter((one) => one !== invitation);
    data.workspaces.push({ id: invitation.workspaceId, name: invitation.workspaceName, role: "employee", status: "pending",
      isActive: false, onboarding: done, lifecycleStatus: "active", lastUsedAt: null });
    const [first, ...rest] = viewer.name.split(" ");
    data.cases[invitation.workspaceId] = invitedCase(OTHER.cedar, first!, rest.join(" "), invitation.location, invitation.jobs);
  }),
  "hub-unconfirmed": hub((data) => { data.refuseAccept = "email_unconfirmed"; }),
  // Every way a workspace stops being open, side by side.
  "hub-endings": hub((data) => {
    data.invitations = [];
    data.workspaces.push(
      { ...OTHER.bayside, role: "manager", status: "suspended", isActive: false, onboarding: done, lifecycleStatus: "active", lastUsedAt: ago(40) },
      { ...OTHER.corner, role: "employee", status: "removed", isActive: false, onboarding: done, lifecycleStatus: "active", accessRemoved: true, lastUsedAt: ago(62) },
    );
  }),
  // 1.6: a closed workspace with no closing date, and a planned closure whose day has passed.
  "status-closed-undated": hub((data) => {
    const pier9 = data.workspaces.find((one) => one.id === OTHER.pier9.id);
    if (pier9) pier9.closureEffectiveAt = null;
  }),
  "status-closure-passed": hub((data) => {
    data.workspaces.push({ ...DOCKSIDE, role: "owner", status: "active", isActive: false, onboarding: done,
      lifecycleStatus: "closure_scheduled", closureEffectiveAt: ago(2), lastUsedAt: ago(3) });
  }),
  // 1.10: Harbor & Vine's setup is not finished; the viewer is not its owner.
  "hub-setup-pending": hub((data) => { harborOf(data).onboarding = { status: "incomplete", currentStep: 3, revision: 5 }; }),
  "hub-setup-pending-single": hub((data) => {
    data.workspaces = [harborOf(data)];
    data.workspaces[0]!.onboarding = { status: "incomplete", currentStep: 3, revision: 5 };
  }),
};
