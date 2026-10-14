// Demo backend for the account-level pages: the workspace hub and its status
// pages, owner setup (/onboarding) and employee onboarding (/welcome). These
// pages speak for the account rather than for Harbor & Vine's day-to-day, so
// they answer /v1/context and /v1/account/workspaces their own way. The routes
// are registered only on these atlas pages; on every other page nothing here
// exists and the fallbacks in api.ts (and the other areas) answer as before.
import { ApiError, type Handler } from "./api";
import { currentPage } from "../pages";
import { domainStore, type Store } from "./store";
import { HARBOR, OTHER, acceptUploads, noContext, twinRoute } from "./hub-onboarding-shared";
import { employeeCaseRoutes, harborCase, invitedCase, type EmployeeCase } from "./hub-onboarding-employee";
import { hubRoutesForPage } from "./hub-onboarding-hub";
import { ownerSetupRoutes } from "./hub-onboarding-owner";

type Route = (method: string, path: string, handler: Handler) => void;

export function onboardingRoutes(plainRoute: Route): void {
  const page = currentPage().id;
  const route = twinRoute(plainRoute);
  // PAGES: every scenario opens fresh; a workspace an earlier scenario opened
  // in this tab (sessionStorage outlives the frame) must not carry over.
  if (["workspace-hub", "owner-onboarding", "employee-onboarding"].includes(page)) {
    try { window.sessionStorage.removeItem("newfork.tabWorkspaceId"); } catch { /* storage blocked */ }
  }
  if (page === "workspace-hub") {
    hubRoutesForPage(route);
    return;
  }
  if (page === "owner-onboarding") {
    ownerSetupRoutes(route);
    return;
  }
  if (page === "employee-onboarding") employeeWelcomeRoutes(route);
}

/**
 * Maria Lopez, invited to Harbor & Vine and not through onboarding yet: her
 * only membership is pending, so there is no workspace context to open.
 */
let welcomeStore: Store<{ cases: Record<string, EmployeeCase> }> | null = null;
let contextCalls = 0;

function employeeWelcomeRoutes(route: Route): void {
  const store = domainStore<{ cases: Record<string, EmployeeCase> }>("employee-welcome", () => ({
    cases: { [HARBOR.id]: harborCase() },
  }));
  welcomeStore = store;
  acceptUploads();
  // PAGES 1.4: the invitation link. The token's last word picks the state the
  // server would answer (valid, expired, revoked, replaced, declined, accepted,
  // workspace_unavailable); "missing" is a token no invitation carries, "fail"
  // a preview that breaks, and mismatch / unconfirmed / member a valid-looking
  // invitation the accept call then refuses.
  const lastWord = (token: unknown) => String(token ?? "").split("-").pop() ?? "";
  const inviteState = (token: unknown) => {
    const word = lastWord(token);
    return ["expired", "revoked", "replaced", "declined", "accepted", "workspace_unavailable"].includes(word) ? word : "valid";
  };
  const refusals: Record<string, string> = {
    mismatch: "invitation_email_mismatch", unconfirmed: "email_unconfirmed", member: "already_member",
  };
  route("POST", "/v1/invitations/preview", ({ body }) => {
    if (lastWord(body?.token) === "missing") throw new ApiError(404, { error: "Invitation not found" });
    if (lastWord(body?.token) === "fail") throw new ApiError(500, { error: "Internal server error" });
    return {
      state: inviteState(body?.token), workspaceName: HARBOR.name, emailHint: "m***@harborvine.test",
      expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    };
  });
  route("POST", "/v1/invitations/accept", ({ body }) => {
    const refusal = refusals[lastWord(body?.token)];
    if (refusal) throw new ApiError(409, { error: "Invitation could not be accepted", code: refusal });
    if (inviteState(body?.token) !== "valid") throw new ApiError(409, { code: "invitation_unavailable" });
    return { workspaceId: HARBOR.id };
  });
  route("GET", "/v1/context", () => {
    contextCalls += 1;
    // PAGES "approved": the screen says "Finishing up" while it opens the
    // workspace; the second context call (that opening) never answers, so the
    // step stays in view instead of leaving for the Employee hub page.
    const approved = Object.values(store.data.cases).some((one) => one.case_status === "approved");
    if (approved && contextCalls > 1) return new Promise(() => {});
    return noContext();
  });
  route("GET", "/v1/account/workspaces", () =>
    Object.values(store.data.cases).map((onboarding) => ({
      id: onboarding.workspace_id, name: onboarding.workspace_name, role: "employee",
      status: onboarding.case_status === "approved" ? "active" : "pending",
      isActive: false, onboarding: { status: "complete", currentStep: 4, revision: 1 },
      lifecycleStatus: "active", accessRemoved: false, lastUsedAt: null,
      closureEffectiveAt: null, defaultClosureEffectiveAt: null, pendingOwnershipTransfer: null,
    })));
  employeeCaseRoutes(route, {
    cases: () => store.data.cases,
    save: () => store.save(),
    // Leaving drops the case; the hub lists what is left.
    left: () => undefined,
  });
}

// ---------------------------------------------------------------------------
// PAGES setups for 1.8 Employee welcome (Maria Lopez's Harbor & Vine case).

const PROFILE = {
  legal_first_name: "Maria", legal_last_name: "Lopez", preferred_name: "", phone: "+16175550142",
  street_address: "41 Sumner Street", city: "Boston", region: "MA", postal_code: "02128", country_code: "US",
  date_of_birth: "1998-04-17", emergency_contact_name: "Ana Lopez", emergency_contact_relationship: "Parent",
  emergency_contact_email: "", emergency_contact_phone: "+16175550199",
  share_phone_with_teammates: false, share_email_with_teammates: false,
};

function welcomeCase(change: (one: EmployeeCase) => void): () => void {
  return () => {
    const one = welcomeStore?.data.cases[HARBOR.id];
    if (!one) return;
    change(one);
    welcomeStore!.save();
  };
}
const item = (one: EmployeeCase, title: string) => one.requirements.find((req) => req.title === title || req.kind === title)!;
const profileDone = (one: EmployeeCase) => { one.profile = { ...PROFILE }; item(one, "profile").status = "completed"; };
function draftWith(one: EmployeeCase, title: string, filename: string, metadata: Record<string, string> = {}) {
  const req = item(one, title);
  const doc = one.docs[req.id]!;
  req.status = "in_progress";
  doc.submissions.unshift({
    id: `${req.id.slice(0, 8)}-d4af-4000-8000-${req.id.slice(-12)}`, version: 1, state: "draft", submitted_at: null, reviewed_at: null,
    expiry_date: null, metadata, rejection_reason: null,
    files: [{ id: `${req.id.slice(0, 8)}-f11e-4000-8000-${req.id.slice(-12)}`, filename, media_type: filename.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
      size_bytes: 482_311, decision: "keep", note: "", path: `${HARBOR.id}/${one.employee_id}/${req.id}/${filename}` }],
  });
  doc.revision += 1;
}
function sentForReview(one: EmployeeCase, title: string) {
  const req = item(one, title);
  const doc = one.docs[req.id]!;
  draftWith(one, title, `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
  doc.submissions[0]!.state = "pending_review";
  doc.submissions[0]!.submitted_at = new Date(Date.now() - 3_600_000).toISOString();
  doc.submitted_id = doc.submissions[0]!.id;
  req.status = "awaiting_review";
}
function handbookSigned(one: EmployeeCase) {
  const req = item(one, "acknowledgement");
  const doc = one.docs[req.id]!;
  const signature = { typed_name: one.employee_name, executed_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), content_digest: req.content_digest! };
  doc.evidence = { ...signature, intent_statement: req.intent_statement ?? "" };
  doc.signatures.unshift({ ...signature, withdrawn_at: null });
  doc.revision += 1;
  req.status = "completed";
}
function allDone(one: EmployeeCase) {
  profileDone(one);
  sentForReview(one, "Form W-4");
  sentForReview(one, "I-9 identity document");
  item(one, "Food handler card").conditional_reason = "My county class is on the 20th; I'll upload the card after it.";
  handbookSigned(one);
}

export const welcomeSetups: Record<string, () => void> = {
  "welcome-profile-done": welcomeCase(profileDone),
  "welcome-profile-filled": welcomeCase((one) => { one.profile = { ...PROFILE }; }),
  "welcome-w4-draft": welcomeCase((one) => { profileDone(one); draftWith(one, "Form W-4", "w4-2026-signed.pdf"); }),
  "welcome-i9-draft": welcomeCase((one) => { profileDone(one); draftWith(one, "I-9 identity document", "passport-photo-page.jpg"); }),
  "welcome-handbook-signed": welcomeCase((one) => { profileDone(one); handbookSigned(one); }),
  "welcome-rejected": welcomeCase((one) => {
    allDone(one);
    const w4 = item(one, "Form W-4");
    w4.status = "rejected";
    w4.rejection_reason = "Step 3 is blank and the form isn't signed. Fill in step 3, sign it and send it again.";
    one.case_status = "changes_requested";
  }),
  "welcome-profile-rejected": welcomeCase((one) => {
    allDone(one);
    const profile = item(one, "profile");
    profile.status = "rejected";
    profile.rejection_reason = "Your street address is missing the apartment number. Add it so your W-2 reaches you.";
    one.case_status = "changes_requested";
  }),
  "welcome-ready": welcomeCase(allDone),
  "welcome-submitted": welcomeCase((one) => { allDone(one); one.case_status = "submitted"; }),
  "welcome-approved": welcomeCase((one) => { allDone(one); one.case_status = "approved"; }),
  "welcome-deadline": welcomeCase((one) => {
    profileDone(one);
    const food = item(one, "Food handler card");
    food.deadline_at = new Date(Date.now() + 9 * 86_400_000).toISOString();
    food.no_timezone = true;
  }),
  "welcome-no-availability": welcomeCase((one) => {
    one.requirements = one.requirements.filter((req) => req.kind !== "availability");
  }),
  "welcome-two": () => {
    if (!welcomeStore) return;
    welcomeStore.data.cases[OTHER.cedar.id] = invitedCase(OTHER.cedar, "Maria", "Lopez", "Cedar & Smoke Midtown", ["Server"]);
    welcomeStore.save();
  },
};
