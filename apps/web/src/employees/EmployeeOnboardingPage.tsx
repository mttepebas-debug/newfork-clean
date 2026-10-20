import { todayIn } from "../lib/today";
import {
  emergencyIsOwnPhoneMessage,
  employeeOnboardingProfileSchema,
  phoneInUseMessage,
  sameUsPhone,
  toUsPhone,
  type Avatar,
  type EmployeeOnboarding,
  type EmployeeOnboardingProfile,
  type EmployeeOnboardingRequirement,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@newfork/ui";
import { ArrowRight, Camera, Check, CircleAlert, UserRound } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router";
import { OnboardingDocumentStep } from "./OnboardingDocumentStep";
import { WeeklyPreferencesPanel } from "../availability/WeeklyPreferencesPanel";
import { requestAppNavigation } from "../shell/leave-guard";
import { useListPhoneWidth } from "../lib/usePhoneWidth";
import { useAuth } from "../auth/AuthContext";
import { appLandingPath, hubPath } from "../auth/resolveLanding";
import { clearTenantQueriesForOrganizationSwitch } from "../auth/tenant-query-cache";
import { setTabWorkspaceId } from "../lib/supabase";
import { RequestError } from "../lib/request-error";
import { FieldNote, fieldNoteId } from "../shell/FieldNote";
import { UsPhoneInput } from "../shell/UsPhoneInput";
import {
  AccountBlock,
  BusinessRow,
  PreBizFrame,
  Section,
  StatusBadge,
  WizardBar,
  type BadgeTone,
} from "../shell/prebiz/PreBiz";
import {
  getMyOnboarding,
  isMyOnboardingPhoneInUse,
  saveMyOnboardingProfile,
  submitMyOnboarding,
} from "./onboarding-data";
import { letterRuleError } from "../shell/us-text";
import { AvatarPicker } from "../avatar/AvatarPicker";
import { MemberAvatar } from "../avatar/MemberAvatar";
import {
  useLastAvatar,
  useOwnAvatar,
  useRemoveAvatar,
  useSaveAvatar,
} from "../avatar/avatar-data";

export default function EmployeeOnboardingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaceId = "" } = useParams();
  // Pre-workspace links ("/welcome/profile") land here with a non-id segment.
  const validWorkspaceId = /^[0-9a-f-]{36}$/i.test(workspaceId);
  const at = (path: string) => workspacePath(workspaceId, path);
  // Route-relative path in the database's "/welcome/..." form.
  const pathname = `/welcome${location.pathname.slice(`/welcome/${workspaceId}`.length)}`;
  // Moving between steps asks first while the availability step holds unsaved hours (P26).
  const navigateRequirement = (path: string) =>
    requestAppNavigation(() => navigate(at(path)));
  const queryClient = useQueryClient();
  const { refresh } = useAuth();
  const onboarding = useQuery({
    queryKey: ["my-employee-onboarding", workspaceId],
    queryFn: () => getMyOnboarding(workspaceId),
    enabled: validWorkspaceId,
  });

  const finalizeActivation = useCallback(async () => {
    await clearTenantQueriesForOrganizationSwitch(queryClient);
    await queryClient.cancelQueries({ queryKey: ["my-employee-onboarding"] });
    queryClient.removeQueries({ queryKey: ["my-employee-onboarding"] });
    void queryClient.invalidateQueries({ queryKey: ["account-workspaces"] });
    // Land in the organization that was just activated, not the default one.
    setTabWorkspaceId(workspaceId);
    // The page the accesses open: Employee Hub, or Workspace for somebody who
    // also or only manages (ROL-CIFT 6.2).
    const next = await refresh();
    navigate(appLandingPath(next), { replace: true });
  }, [navigate, queryClient, refresh, workspaceId]);

  const continueAfterSave = async () => {
    const refreshed = await onboarding.refetch();
    if (refreshed.isError || !refreshed.data) return;
    if (refreshed.data.case_status === "approved") {
      await finalizeActivation();
      return;
    }
    navigate(at(refreshed.data.first_actionable_path));
  };
  useEffect(() => {
    if (onboarding.data?.case_status !== "approved") return;
    void finalizeActivation();
  }, [finalizeActivation, onboarding.data?.case_status]);

  if (!validWorkspaceId) return <Navigate to="/welcome" replace />;
  // Loading, failure and activation keep the frame, so Sign out never disappears.
  if (onboarding.isLoading)
    return (
      <PreBizFrame
        titleId="onboarding-status-title"
        title="Loading your onboarding"
      />
    );
  if (onboarding.error || !onboarding.data)
    return (
      <PreBizFrame
        titleId="onboarding-status-title"
        title="Your onboarding didn't load"
        description="Try again, or ask your manager to check your invitation."
      >
        <div className="pb-footer">
          <button
            className="pb-btn pb-btn-primary"
            type="button"
            onClick={() => onboarding.refetch()}
          >
            Try again
          </button>
        </div>
      </PreBizFrame>
    );

  const model = onboarding.data;
  if (model.case_status === "approved")
    return (
      <PreBizFrame titleId="onboarding-status-title" title="Finishing up" />
    );
  const requirementId = location.pathname.split("/").at(-1) ?? "";
  const requirement = model.requirements.find(
    (item) => item.id === requirementId,
  );
  const steps = stepsFor(model.requirements);
  const groupIndex = steps.find((step) => step.title && step.path === pathname);
  const groupOf = steps.find(
    (step) => requirement && step.items.includes(requirement),
  );
  const back = groupOf && {
    label: groupOf.label,
    go: () => navigateRequirement(groupOf.path),
  };

  const stage =
    pathname === "/welcome" ? (
      <WelcomeStep
        model={model}
        onContinue={() => navigate(at(model.first_actionable_path))}
      />
    ) : pathname === "/welcome/profile" ||
      pathname === profilePagePath.emergency ? (
      // One step, two pages. Both render the same component at the same spot, so
      // the draft survives the move; the server only accepts a whole profile.
      <ProfileStep
        model={model}
        onSaved={continueAfterSave}
        page={pathname === profilePagePath.emergency ? "emergency" : "personal"}
        onPage={(next) => navigateRequirement(profilePagePath[next])}
      />
    ) : pathname === "/welcome/availability" &&
      // M13: only an employee has the step; anybody else goes to the first one.
      model.requirements.some((item) => item.kind === "availability") ? (
      <AvailabilityStep
        key={`${model.workspace_id}:${model.employee_id}`}
        model={model}
        onSaved={continueAfterSave}
      />
    ) : pathname === "/welcome/review" ? (
      <ReviewStep
        model={model}
        onSaved={continueAfterSave}
        steps={steps}
        onOpen={navigateRequirement}
      />
    ) : requirement &&
      back &&
      (requirement.kind === "document" ||
        requirement.kind === "acknowledgement") &&
      pathname === requirementPath(requirement) ? (
      <DocumentStep
        model={model}
        requirement={requirement}
        onSaved={continueAfterSave}
        back={back}
      />
    ) : groupIndex ? (
      <GroupStep
        step={groupIndex}
        onOpen={navigateRequirement}
        nextPath={model.first_actionable_path}
      />
    ) : (
      <Navigate to={at(model.first_actionable_path)} replace />
    );

  return (
    <OnboardingShell
      model={model}
      steps={steps}
      pathname={pathname}
      onOpen={navigateRequirement}
      onExit={() => requestAppNavigation(() => navigate(hubPath))}
    >
      {stage}
    </OnboardingShell>
  );
}

type ProfilePage = "personal" | "emergency";

const profilePagePath: Record<ProfilePage, string> = {
  personal: "/welcome/profile",
  emergency: "/welcome/profile/emergency",
};

interface OnboardingStep {
  readonly label: string;
  readonly path: string;
  readonly items: readonly EmployeeOnboardingRequirement[];
  /** Only a group has an index page, so only a group has its heading. */
  readonly title?: string;
  readonly copy?: string;
}

function stepsFor(
  requirements: readonly EmployeeOnboardingRequirement[],
): OnboardingStep[] {
  const step = (
    label: string,
    path: string,
    kinds: readonly EmployeeOnboardingRequirement["kind"][],
    heading?: { readonly title: string; readonly copy: string },
  ): OnboardingStep => ({
    label,
    path,
    items: requirements.filter((item) => kinds.includes(item.kind)),
    ...heading,
  });
  return [
    step("Profile", "/welcome/profile", ["profile"]),
    ...[
      // Uploads and policies are one step: the user chose this over two.
      step("Documents", "/welcome/documents", ["document", "acknowledgement"], {
        title: "Your documents",
        copy: "Open each one to send a photo or file, or to read it and confirm.",
      }),
      step("Availability", "/welcome/availability", ["availability"]),
    ].filter((item) => item.items.length > 0),
    step("Review", "/welcome/review", []),
  ];
}

function requirementDone(item: EmployeeOnboardingRequirement): boolean {
  return item.status === "completed" || item.status === "awaiting_review";
}

/**
 * What the server counts: required items, and conditional documents. Those
 * arrive with required=false but still block "Submit for review".
 */
function counts(item: EmployeeOnboardingRequirement): boolean {
  return item.required || item.document_mode === "conditional";
}

/** A conditional document is also settled once the employee said why it comes later. */
function itemDone(item: EmployeeOnboardingRequirement): boolean {
  return (
    requirementDone(item) ||
    (item.document_mode === "conditional" &&
      Boolean(item.conditional_reason?.trim()) &&
      item.status !== "rejected")
  );
}

function stepOptional(step: OnboardingStep): boolean {
  return step.items.length > 0 && !step.items.some(counts);
}

/** Every listed step counts, so the number matches what the panel shows. */
function stepDone(step: OnboardingStep, submitted: boolean): boolean {
  if (step.path === "/welcome/review") return submitted;
  const counted = step.items.filter(counts);
  const pool = counted.length > 0 ? counted : step.items;
  return pool.length > 0 && pool.every(itemDone);
}

function OnboardingShell({
  model,
  steps,
  pathname,
  onOpen,
  onExit,
  children,
}: {
  readonly model: EmployeeOnboarding;
  readonly steps: readonly OnboardingStep[];
  readonly pathname: string;
  readonly onOpen: (path: string) => void;
  readonly onExit: () => void;
  readonly children: ReactNode;
}) {
  const submitted =
    model.case_status === "submitted" || model.case_status === "approved";
  const total = steps.length;
  const done = steps.filter((step) => stepDone(step, submitted)).length;
  // Mert 2026-10-17: on a phone the availability step fills the screen exactly;
  // the bar, the heading and the buttons stay, only the days scroll.
  const framed = useListPhoneWidth() && pathname === "/welcome/availability";
  return (
    <div className={`pb${framed ? " pb-frame-fixed" : ""}`}>
      <aside className="pb-side">
        <div className="pb-side-group">
          <span className="pb-brand">NEWFORK</span>
          <div className="pb-context">
            <strong title={model.workspace_name}>{model.workspace_name}</strong>
            <span>Employee onboarding</span>
          </div>
          <div className="pb-progress">
            <div
              role="progressbar"
              aria-label="Steps done"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
            >
              <span
                style={{ width: `${(done / Math.max(total, 1)) * 100}%` }}
              />
            </div>
            <p>
              {done} of {total} steps done
            </p>
          </div>
          <nav className="pb-steps" aria-label="Onboarding steps">
            {steps.map((step, index) => {
              const active =
                // startsWith, so a step's own sub-page (profile page two) keeps
                // the step marked; a requirement's page is matched separately.
                pathname.startsWith(step.path) ||
                step.items.some((item) => requirementPath(item) === pathname);
              const state = stepDone(step, submitted);
              return (
                <button
                  key={step.path}
                  type="button"
                  className={`pb-step${active ? " is-active" : ""}${state ? " is-done" : ""}`}
                  aria-current={active ? "step" : undefined}
                  onClick={() => onOpen(step.path)}
                >
                  <span className="pb-step-number" aria-hidden>
                    {state ? <Check size={13} /> : index + 1}
                  </span>
                  <span className="pb-step-label">
                    {step.label}
                    {stepOptional(step) ? " (optional)" : ""}
                    {/* The tick is decorative, so the done state is also said. */}
                    {state ? <span className="sr-only">, done</span> : null}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
        <div className="pb-side-group">
          {/* Leaves the wizard, not the account: the landing re-checks what is still open. */}
          <button
            type="button"
            className="pb-btn pb-btn-secondary"
            onClick={onExit}
          >
            Exit onboarding
          </button>
          <AccountBlock />
        </div>
      </aside>
      <main className="pb-stage pb-stage-wide">{children}</main>
    </div>
  );
}

const requirementBadge: Record<
  EmployeeOnboardingRequirement["status"],
  readonly [string, BadgeTone]
> = {
  not_started: ["To do", "neutral"],
  in_progress: ["In progress", "progress"],
  awaiting_review: ["In review", "progress"],
  completed: ["Done", "success"],
  rejected: ["Needs changes", "danger"],
  manual_follow_up: ["Follow-up needed", "danger"],
  superseded: ["Replaced", "neutral"],
};

function RequirementBadge({
  requirement,
}: {
  readonly requirement: EmployeeOnboardingRequirement;
}) {
  const [label, tone] = requirementBadge[requirement.status];
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

function GroupStep({
  step,
  onOpen,
  nextPath,
}: {
  readonly step: OnboardingStep;
  readonly onOpen: (path: string) => void;
  readonly nextPath: string;
}) {
  const next = step.items.find((item) => counts(item) && !itemDone(item));
  return (
    <>
      <StepHeading title={step.title ?? step.label} copy={step.copy ?? ""} />
      {(
        [
          ["document", "To upload"],
          ["acknowledgement", "To read"],
        ] as const
      ).map(([kind, title]) => {
        const items = step.items.filter((item) => item.kind === kind);
        return items.length > 0 ? (
          <Section key={kind} title={title}>
            {items.map((item) => (
              <BusinessRow
                key={item.id}
                name={item.title}
                role={
                  item.document_mode === "conditional"
                    ? "Only if it applies to you"
                    : item.required
                      ? "Required"
                      : "Optional"
                }
                badge={<RequirementBadge requirement={item} />}
              >
                <button
                  type="button"
                  className="pb-btn pb-btn-secondary"
                  aria-label={`Open ${item.title}`}
                  onClick={() => onOpen(requirementPath(item))}
                >
                  Open
                </button>
              </BusinessRow>
            ))}
          </Section>
        ) : null;
      })}
      <WizardBar>
        <button
          type="button"
          className="pb-btn pb-btn-primary"
          onClick={() => onOpen(next ? requirementPath(next) : nextPath)}
        >
          Continue
        </button>
      </WizardBar>
    </>
  );
}

function WelcomeStep({
  model,
  onContinue,
}: {
  readonly model: EmployeeOnboarding;
  readonly onContinue: () => void;
}) {
  return (
    <div className="onboarding-step">
      <span className="onboarding-step-icon">
        <UserRound size={24} aria-hidden />
      </span>
      <p className="onboarding-eyebrow">Welcome to {model.workspace_name}</p>
      <h1>Let's set up your employee account</h1>
      <p className="onboarding-lead">
        A few steps, then your manager checks them and opens your access.
      </p>
      <dl className="onboarding-assignment-summary">
        <div>
          <dt>Locations</dt>
          <dd>
            {model.assignments.locations.join(", ") || "Not assigned yet"}
          </dd>
        </div>
        <div>
          <dt>Jobs</dt>
          <dd>{model.assignments.jobs.join(", ") || "Not assigned yet"}</dd>
        </div>
      </dl>
      <WizardBar>
        <button
          type="button"
          className="pb-btn pb-btn-primary"
          onClick={onContinue}
        >
          Begin <ArrowRight size={17} aria-hidden />
        </button>
      </WizardBar>
    </div>
  );
}

/** The fields page one owns; a zod complaint about any other one belongs to page two. */
const personalFields = new Set([
  "legal_first_name",
  "legal_middle_name",
  "legal_last_name",
  "preferred_name",
  "phone",
  "street_address",
  "city",
  "region",
  "postal_code",
  "country_code",
  "date_of_birth",
]);

function ProfileStep({
  model,
  onSaved,
  page,
  onPage,
}: StepProps & {
  readonly page: ProfilePage;
  readonly onPage: (page: ProfilePage) => void;
}) {
  const { workspaceId = "" } = useParams();
  const { account } = useAuth();
  const accountPhone = account?.phone ?? "";
  const accountEmail = account?.email ?? "";
  // The account is the one source of the phone (BL-335): with one on the
  // account this step only shows it; without one, what is typed here becomes
  // the account's.
  const phoneOnAccount = accountPhone !== "";
  const profileRequirement = model.requirements.find(
    (item) => item.kind === "profile",
  );
  const initial = useMemo<EmployeeOnboardingProfile>(
    () => ({
      legal_first_name: model.profile?.legal_first_name ?? "",
      legal_middle_name: model.profile?.legal_middle_name ?? "",
      legal_last_name: model.profile?.legal_last_name ?? "",
      preferred_name: model.profile?.preferred_name ?? "",
      phone: phoneOnAccount ? accountPhone : (model.profile?.phone ?? ""),
      street_address: model.profile?.street_address ?? "",
      city: model.profile?.city ?? "",
      region: model.profile?.region ?? "",
      postal_code: model.profile?.postal_code ?? "",
      country_code: model.profile?.country_code ?? "US",
      date_of_birth: model.profile?.date_of_birth ?? "",
      emergency_contact_name: model.profile?.emergency_contact_name ?? "",
      emergency_contact_relationship:
        model.profile?.emergency_contact_relationship ?? "",
      emergency_contact_email: model.profile?.emergency_contact_email ?? "",
      emergency_contact_phone: model.profile?.emergency_contact_phone ?? "",
      share_phone_with_teammates:
        model.profile?.share_phone_with_teammates ?? false,
      share_email_with_teammates:
        model.profile?.share_email_with_teammates ?? false,
    }),
    [accountPhone, phoneOnAccount, model.profile],
  );
  const [profile, setProfile] = useState(initial);
  // What is checked and sent: the account's phone when it has one, even if the
  // account changed after this step opened; both numbers in E.164 (BL-503).
  const typed = phoneOnAccount ? { ...profile, phone: accountPhone } : profile;
  const draft = {
    ...typed,
    phone: toUsPhone(typed.phone) ?? typed.phone,
    emergency_contact_phone:
      toUsPhone(typed.emergency_contact_phone) ?? typed.emergency_contact_phone,
  };
  // TEL-2 (Mert, 2026-10-09): the number is nobody else's in this workspace,
  // asked once it is whole; the emergency contact is somebody else.
  const ownPhone = toUsPhone(typed.phone);
  const phoneCheck = useQuery({
    queryKey: ["my-onboarding-phone", workspaceId, ownPhone],
    queryFn: () => isMyOnboardingPhoneInUse(workspaceId, ownPhone ?? ""),
    // Only while the profile can still be saved; the server closes it after.
    enabled:
      ownPhone !== null &&
      workspaceId !== "" &&
      !["submitted", "approved", "cancelled"].includes(model.case_status),
    staleTime: 60_000,
  });
  const phoneInUse = ownPhone !== null && phoneCheck.data === true;
  const emergencyIsOwn = sameUsPhone(typed.phone, profile.emergency_contact_phone);
  const queryClient = useQueryClient();
  const [validationError, setValidationError] = useState<string | null>(null);
  const relationshipOptions = [
    "Spouse/partner",
    "Parent",
    "Sibling",
    "Child",
    "Friend",
  ] as const;
  const [relationshipMode, setRelationshipMode] = useState(() =>
    relationshipOptions.some(
      (option) => option === initial.emergency_contact_relationship,
    )
      ? initial.emergency_contact_relationship
      : initial.emergency_contact_relationship
        ? "Other"
        : "",
  );
  // AVATAR-IKON 5.1: the account's last avatar (another workspace's) is offered
  // while there is none here yet; a choice in the avatar window is saved at once.
  const own = useOwnAvatar(workspaceId);
  const last = useLastAvatar(workspaceId);
  const saveAvatar = useSaveAvatar(workspaceId);
  const offered =
    own.data && own.data.avatar === null ? (last.data?.avatar ?? null) : null;
  const mutation = useMutation({
    mutationFn: async () => {
      const saved = await saveMyOnboardingProfile(
        workspaceId,
        draft,
        model.revision,
      );
      // Kept here once the profile is saved. Never holds the onboarding up: the
      // avatar is optional and can be chosen any time in Account › Profile.
      if (offered)
        await saveAvatar
          .mutateAsync({ use_last: true })
          .catch(() => undefined);
      return saved;
    },
    onSuccess: onSaved,
    // Somebody may have taken the number since it was asked about.
    onError: (error) => {
      if (error instanceof RequestError && error.reason === "onboarding.phone_in_use")
        void queryClient.invalidateQueries({ queryKey: ["my-onboarding-phone"] });
      // What was typed stays; the next Save goes on the latest revision.
      if (onboardingChanged(error))
        void queryClient.invalidateQueries({ queryKey: ["my-employee-onboarding", workspaceId] });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = employeeOnboardingProfileSchema.safeParse(draft);
    // The server only ever stores a whole profile, so both pages are checked
    // against the same schema; each page shows only its own complaints.
    const issue = parsed.success
      ? undefined
      : parsed.error.issues.find(
          (item) =>
            personalFields.has(String(item.path[0])) === (page === "personal"),
        );
    // The field already says why, in red.
    if (page === "personal" ? phoneInUse : emergencyIsOwn) return;
    if (issue || (page === "emergency" && !parsed.success)) {
      setValidationError(issue?.message ?? "Complete all required fields.");
      return;
    }
    setValidationError(null);
    if (page === "personal") {
      onPage("emergency");
      return;
    }
    mutation.mutate();
  };
  // With the number on the account, it changes there.
  const phoneInUseNote = phoneOnAccount ? (
    <>
      {phoneInUseMessage} Change it in{" "}
      <Link to="/account/profile">Account › Profile</Link>.
    </>
  ) : (
    phoneInUseMessage
  );
  const rejection =
    profileRequirement?.status === "rejected" ? (
      <Attention
        text={
          profileRequirement.rejection_reason ??
          "Your manager asked for a change here before you save again."
        }
      />
    ) : null;
  if (page === "emergency")
    return (
      <form className="onboarding-step" onSubmit={submit}>
        <StepHeading
          title="Who we call in an emergency"
          copy="One person we can reach if something happens while you are at work."
        />
        {rejection}
        <div className="onboarding-form-grid">
          <TextField
            label="Full name"
            value={profile.emergency_contact_name}
            onChange={(value) =>
              setProfile({ ...profile, emergency_contact_name: value })
            }
          />
          <SelectField
            label="Relationship"
            value={relationshipMode}
            onChange={(value) => {
              setRelationshipMode(value);
              setProfile({
                ...profile,
                emergency_contact_relationship: value === "Other" ? "" : value,
              });
            }}
          >
            <option value="" disabled>
              Select relationship
            </option>
            {relationshipOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="Other">Other</option>
          </SelectField>
          {relationshipMode === "Other" ? (
            <TextField
              label="How you know them"
              value={profile.emergency_contact_relationship}
              onChange={(value) =>
                setProfile({
                  ...profile,
                  emergency_contact_relationship: value,
                })
              }
            />
          ) : null}
          <PhoneField
            label="Phone"
            value={profile.emergency_contact_phone}
            onChange={(value) =>
              setProfile({ ...profile, emergency_contact_phone: value })
            }
            error={emergencyIsOwn ? emergencyIsOwnPhoneMessage : null}
          />
          <TextField
            label="Email (optional)"
            type="email"
            value={profile.emergency_contact_email}
            onChange={(value) =>
              setProfile({ ...profile, emergency_contact_email: value })
            }
            required={false}
          />
        </div>
        <MutationFooter
          mutation={mutation}
          error={validationError}
          back={{ label: "Your details", onClick: () => onPage("personal") }}
        />
      </form>
    );
  return (
    <form className="onboarding-step" onSubmit={submit}>
      <StepHeading
        title="Your details"
        copy="Only your manager and whoever runs payroll can see these."
      />
      {rejection}
      {own.data && !last.isPending ? (
        <OnboardingAvatar
          workspaceId={workspaceId}
          workspaceName={model.workspace_name}
          personName={model.employee_name}
          avatar={own.data.avatar}
          suggested={own.data.suggested}
          offered={offered}
          offeredFrom={last.data?.from_workspace_name ?? null}
        />
      ) : null}
      <div className="onboarding-form-grid">
        {/*
          These are the names payroll and documents use, so they are asked as
          they appear on an ID rather than as the person is usually called.
        */}
        <TextField
          label="Legal first name"
          value={profile.legal_first_name}
          onChange={(value) =>
            setProfile({ ...profile, legal_first_name: value })
          }
        />
        <TextField
          label="Legal middle name"
          optional
          value={profile.legal_middle_name ?? ""}
          onChange={(value) =>
            setProfile({ ...profile, legal_middle_name: value })
          }
        />
        <TextField
          label="Legal last name"
          value={profile.legal_last_name}
          onChange={(value) =>
            setProfile({ ...profile, legal_last_name: value })
          }
        />
        {/* What the team calls you day to day; documents keep the legal name. */}
        <TextField
          label="Preferred name"
          optional
          value={profile.preferred_name ?? ""}
          onChange={(value) =>
            setProfile({ ...profile, preferred_name: value })
          }
        />
        <TextField
          label="E-mail"
          type="email"
          value={accountEmail}
          onChange={() => undefined}
          readOnly
          wide
          help="The address you signed in with. Change it in your account settings."
        />
        <PhoneField
          label="Phone"
          value={phoneOnAccount ? accountPhone : profile.phone}
          onChange={(value) => setProfile({ ...profile, phone: value })}
          readOnly={phoneOnAccount}
          help={
            phoneOnAccount ? (
              <>
                Change it in <Link to="/account/profile">Account › Profile</Link>.
              </>
            ) : (
              "The number this workspace can reach you on."
            )
          }
          error={phoneInUse ? phoneInUseNote : null}
        />
        <TextField
          label="Date of birth"
          type="date"
          value={profile.date_of_birth}
          onChange={(value) => setProfile({ ...profile, date_of_birth: value })}
          max={todayIn()}
        />
        <TextField
          label="Street address"
          value={profile.street_address}
          onChange={(value) =>
            setProfile({ ...profile, street_address: value })
          }
          wide
        />
        <TextField
          label="City"
          value={profile.city}
          onChange={(value) => setProfile({ ...profile, city: value })}
        />
        <TextField
          label="State"
          value={profile.region}
          onChange={(value) => setProfile({ ...profile, region: value })}
          maxLength={100}
        />
        <TextField
          label="ZIP code"
          value={profile.postal_code}
          onChange={(value) => setProfile({ ...profile, postal_code: value })}
          maxLength={20}
        />
      </div>
      <fieldset className="onboarding-privacy-options">
        <legend>Team visibility</legend>
        <Toggle
          label="Share my phone with teammates"
          checked={profile.share_phone_with_teammates}
          onChange={(checked) =>
            setProfile({ ...profile, share_phone_with_teammates: checked })
          }
        />
        <Toggle
          label="Share my account email with teammates"
          checked={profile.share_email_with_teammates}
          onChange={(checked) =>
            setProfile({ ...profile, share_email_with_teammates: checked })
          }
        />
      </fieldset>
      {/* Page one only moves on; the single save happens on page two, because the
          server rejects a profile that is missing its emergency contact. */}
      <MutationFooter mutation={mutation} error={validationError} label="Continue" />
    </form>
  );
}

/**
 * AVATAR-IKON 5.1 (Mert, 19 Oct: B): "Your avatar" on the first profile page.
 * Shows one's avatar here, else the offered last one, else the initials; Change
 * or Add avatar opens the same window as Account › Profile, which saves at once.
 */
function OnboardingAvatar({
  workspaceId,
  workspaceName,
  personName,
  avatar,
  suggested,
  offered,
  offeredFrom,
}: {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly personName: string;
  readonly avatar: Avatar | null;
  readonly suggested: readonly string[];
  readonly offered: Avatar | null;
  readonly offeredFrom: string | null;
}) {
  const phone = useListPhoneWidth();
  const labelId = useId();
  const named = useRef<HTMLButtonElement>(null);
  const save = useSaveAvatar(workspaceId);
  const remove = useRemoveAvatar(workspaceId);
  const [picking, setPicking] = useState(false);
  const shown = avatar ?? offered;
  const line = avatar
    ? `Your avatar in ${workspaceName}.`
    : offered
      ? `From your ${offeredFrom ?? "other"} profile. It will be your avatar here too, unless you change it.`
      : "Optional. Upload your photo or pick one of ours.";
  const choose = () => {
    // The window gives focus back to what had it: the named button, never the circle.
    named.current?.focus({ preventScroll: true });
    setPicking(true);
  };
  return (
    <div className="onboarding-avatar" role="group" aria-labelledby={labelId}>
      {/* The circle opens the window too, for a pointer; the named button is the one to tab to. */}
      <button
        type="button"
        className="onboarding-avatar-circle"
        tabIndex={-1}
        aria-hidden="true"
        onClick={choose}
      >
        <MemberAvatar avatar={shown} name={personName} size={phone ? 64 : 76} />
        <span className="onboarding-avatar-camera">
          <Camera size={14} />
        </span>
      </button>
      <div className="onboarding-avatar-text">
        <span className="onboarding-avatar-label">
          <span id={labelId}>Your avatar</span>
          {shown ? null : <span className="field-optional">optional</span>}
        </span>
        <p>{line}</p>
        <div>
          <button
            ref={named}
            type="button"
            className="pb-btn pb-btn-secondary"
            onClick={choose}
          >
            {shown ? "Change" : "Add avatar"}
          </button>
        </div>
      </div>
      {createPortal(
        <AvatarPicker
          open={picking}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          personName={personName}
          initial={shown}
          suggested={suggested}
          onSave={async (choice) => {
            await save.mutateAsync(choice);
          }}
          onRemove={
            avatar
              ? async () => {
                  await remove.mutateAsync();
                }
              : undefined
          }
          onClose={() => setPicking(false)}
        />,
        document.body,
      )}
    </div>
  );
}

function DocumentStep({
  model,
  requirement,
  onSaved,
  back,
}: StepProps & {
  readonly requirement: EmployeeOnboardingRequirement;
  /** The group this page belongs to; the only way back out of a sub-page. */
  readonly back: { readonly label: string; readonly go: () => void };
}) {
  const { account } = useAuth();
  if (!account) return null;
  return (
    <OnboardingDocumentStep
      workspaceId={model.workspace_id}
      userId={account.userId}
      requirement={requirement}
      badge={<RequirementBadge requirement={requirement} />}
      back={back}
      onDone={onSaved}
    />
  );
}

function AvailabilityStep({ model, onSaved }: StepProps) {
  const { workspaceId = "" } = useParams();
  const requirement = model.requirements.find(
    (item) => item.kind === "availability",
  );
  const completed = requirement?.status === "completed";
  return (
    <section className="onboarding-step">
      <StepHeading
        title="When do you prefer not to work?"
        // Tur 2 (Mert 2026-10-16); a workspace that requires the step is not "optional".
        copy={`${requirement?.required === false ? "Optional. " : ""}Mark the times you'd rather not work in a normal week.`}
      />
      <WeeklyPreferencesPanel
        workspaceId={workspaceId}
        employeeId={model.employee_id}
        audience="employee"
        onboarding
        onSaved={() => void onSaved()}
        // One action bar: the way on sits beside Save and continue.
        extraAction={completed || requirement?.required === false ? (
          <Button
            className={completed ? undefined : "secondary-button"}
            onClick={() => requestAppNavigation(() => void onSaved())}
          >
            {completed ? "Continue" : "Skip for now"}
            {completed && <ArrowRight size={14} aria-hidden />}
          </Button>
        ) : null}
      />
    </section>
  );
}

function ReviewStep({
  model,
  onSaved,
  steps,
  onOpen,
}: StepProps & {
  readonly steps: readonly OnboardingStep[];
  readonly onOpen: (path: string) => void;
}) {
  const { workspaceId = "" } = useParams();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => submitMyOnboarding(workspaceId, model.revision),
    onSuccess: onSaved,
    onError: (error) => {
      if (onboardingChanged(error))
        void queryClient.invalidateQueries({ queryKey: ["my-employee-onboarding", workspaceId] });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  const ready = model.requirements
    .filter((item) => item.required)
    .every(
      (item) =>
        item.status === "completed" || item.status === "awaiting_review",
    );
  // The same steps the panel lists, so the two never disagree on what is left.
  const listed = steps.filter((step) => step.path !== "/welcome/review");
  return (
    <form className="onboarding-step" onSubmit={submit}>
      <StepHeading
        title={
          model.case_status === "submitted"
            ? "Sent to your manager"
            : model.case_status === "changes_requested"
              ? "Your manager asked for a change"
              : "Check it over, then send it"
        }
        copy={
          model.case_status === "submitted"
            ? "You'll get access as soon as they approve it."
            : model.case_status === "changes_requested"
              ? "Open the step marked Needs changes, fix it, and send it again."
              : "Open anything you want to change. Your manager sees it after you send it."
        }
      />
      <Section title="Your steps">
        {listed.map((step) => {
          const done = stepDone(step, false);
          return (
            <BusinessRow
              key={step.path}
              name={step.label}
              role={stepOptional(step) ? "Optional" : "Required"}
              badge={
                <StatusBadge tone={done ? "success" : "neutral"}>
                  {done ? "Done" : "To do"}
                </StatusBadge>
              }
            >
              <button
                type="button"
                className="pb-btn pb-btn-secondary"
                aria-label={`Open ${step.label}`}
                onClick={() => onOpen(step.path)}
              >
                Open
              </button>
            </BusinessRow>
          );
        })}
      </Section>
      {model.case_status !== "submitted" ? (
        <MutationFooter
          mutation={mutation}
          disabled={!ready}
          label="Send for review"
        />
      ) : null}
    </form>
  );
}

interface StepProps {
  readonly model: EmployeeOnboarding;
  readonly onSaved: () => Promise<void>;
}

/**
 * The step's own heading. No eyebrow: the side panel already names the step and
 * marks it, so repeating it here read as three titles stacked on one page.
 */
function StepHeading({
  title,
  copy,
}: {
  readonly title: string;
  readonly copy: string;
}) {
  return (
    <header className="onboarding-step-heading">
      <h1>{title}</h1>
      <div>{copy}</div>
    </header>
  );
}

function MutationFooter({
  mutation,
  disabled = false,
  label = "Save and continue",
  back,
  error,
}: {
  readonly mutation: { isPending: boolean; error: unknown; mutate: () => void };
  readonly disabled?: boolean;
  readonly label?: string;
  readonly back?: { readonly label: string; readonly onClick: () => void };
  /** The form's own refusal before it is sent; said where a failed save is. */
  readonly error?: string | null;
}) {
  return (
    <WizardBar
      back={back}
      error={error || (mutation.error ? errorMessage(mutation.error) : null)}
    >
      <button
        type="submit"
        className="pb-btn pb-btn-primary"
        disabled={disabled || mutation.isPending}
      >
        {mutation.isPending ? "Saving" : label}
        <ArrowRight size={17} aria-hidden />
      </button>
    </WizardBar>
  );
}

/**
 * The help text sits outside the label: inside it, a screen reader read the whole
 * sentence as the field's name, and the extra line pushed the next field in the
 * row out of line.
 */
function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = true,
  wide = false,
  maxLength,
  minLength,
  readOnly = false,
  help,
  max,
  optional = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: string;
  readonly required?: boolean;
  readonly wide?: boolean;
  readonly maxLength?: number;
  readonly minLength?: number;
  readonly readOnly?: boolean;
  readonly help?: ReactNode;
  readonly max?: string;
  /** Says so beside the label, and stops the browser demanding a value. */
  readonly optional?: boolean;
}) {
  const id = useId();
  // The US letter rule (BL-503), said under the field as it is typed.
  // It takes the help's place in the field's one note line (UI-FIELDMSG).
  const error = type === "text" && !readOnly ? letterRuleError(value) : null;
  return (
    <div className={`onboarding-field${wide ? " wide" : ""}`}>
      <label htmlFor={id}>
        {label}
        {optional ? <span className="field-optional">optional</span> : null}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required && !optional}
        maxLength={maxLength}
        minLength={minLength}
        max={max}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldNoteId(id, error, help)}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldNote id={id} help={help} error={error} />
    </div>
  );
}

/** The one US phone field (BL-503) in this page's field frame. */
function PhoneField({
  label,
  value,
  onChange,
  readOnly = false,
  help,
  error,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly readOnly?: boolean;
  readonly help?: ReactNode;
  /** Said in red in the help line's place; the field turns red with it. */
  readonly error?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="onboarding-field">
      <label htmlFor={id}>{label}</label>
      <UsPhoneInput
        id={id}
        value={value}
        required
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldNoteId(id, error, help)}
        onChange={onChange}
      />
      <FieldNote id={id} help={help} error={error} />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="onboarding-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        required
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="onboarding-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden>
        <i />
      </span>
      <strong>{label}</strong>
    </label>
  );
}

function Attention({ text }: { readonly text: string }) {
  return (
    <p className="onboarding-attention">
      <CircleAlert size={17} aria-hidden />
      {text}
    </p>
  );
}

// Onboarding paths are stored as "/welcome/..."; the route carries the
// workspace: "/welcome/:workspaceId/...".
function workspacePath(workspaceId: string, path: string): string {
  return `/welcome/${workspaceId}${path.slice("/welcome".length)}`;
}

function requirementPath(requirement: EmployeeOnboardingRequirement): string {
  if (requirement.kind === "profile") return "/welcome/profile";
  if (requirement.kind === "ssn") return "/welcome/review";
  if (requirement.kind === "availability") return "/welcome/availability";
  if (requirement.kind === "document")
    return `/welcome/documents/${requirement.id}`;
  return `/welcome/acknowledgements/${requirement.id}`;
}

/**
 * The onboarding moved on since this page read it, in another tab or by the
 * manager's review (BL-1046): reload it, and the next try goes on the latest.
 */
function onboardingChanged(error: unknown): boolean {
  return (
    error instanceof RequestError &&
    error.status === 409 &&
    error.reason === "onboarding.changed"
  );
}

const onboardingChangedMessage =
  "Your onboarding changed meanwhile. You're seeing the latest version; check it and try again.";

function errorMessage(error: unknown): string {
  if (onboardingChanged(error)) return onboardingChangedMessage;
  if (error instanceof RequestError && error.reason === "onboarding.phone_in_use")
    return phoneInUseMessage;
  if (error instanceof RequestError && error.reason === "onboarding.emergency_is_own_phone")
    return emergencyIsOwnPhoneMessage;
  return error instanceof Error ? error.message : "Onboarding request failed";
}
