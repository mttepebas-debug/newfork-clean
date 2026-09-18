import {
  employeeOnboardingProfileSchema,
  type EmployeeOnboarding,
  type EmployeeOnboardingProfile,
  type EmployeeOnboardingRequirement,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Check,
  CircleAlert,
  FileCheck2,
  IdCard,
  LogOut,
  UserRound,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { DocumentReviewDrawer } from "../documents/DocumentReviewDrawer";
import { WeeklyPreferencesPanel } from "../availability/WeeklyPreferencesPanel";
import { useAuth } from "../auth/AuthContext";
import { accountLandingPath } from "../auth/routeDestinations";
import { clearTenantQueriesForOrganizationSwitch } from "../auth/tenant-query-cache";
import { setTabWorkspaceId } from "../lib/supabase";
import {
  AccountBlock,
  BusinessRow,
  Section,
  StatusBadge,
  type BadgeTone,
} from "../shell/prebiz/PreBiz";
import {
  getMyOnboarding,
  saveMyOnboardingProfile,
  submitMyOnboarding,
} from "./onboarding-data";

export default function EmployeeOnboardingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaceId = "" } = useParams();
  // Pre-workspace links ("/welcome/profile") land here with a non-id segment.
  const validWorkspaceId = /^[0-9a-f-]{36}$/i.test(workspaceId);
  const at = (path: string) => workspacePath(workspaceId, path);
  // Route-relative path in the database's "/welcome/..." form.
  const pathname = `/welcome${location.pathname.slice(`/welcome/${workspaceId}`.length)}`;
  const navigateRequirement = (path: string) => navigate(at(path));
  const queryClient = useQueryClient();
  const { refresh, signOut } = useAuth();
  const docsMode = useDevDocsMode();
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
    await refresh();
    navigate("/app/employee-hub", { replace: true });
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
  if (onboarding.isLoading)
    return (
      <main
        className="employee-onboarding-loading"
        aria-label="Loading onboarding"
      />
    );
  if (onboarding.error || !onboarding.data)
    return (
      <main className="employee-onboarding-error">
        <CircleAlert size={24} aria-hidden />
        <h1>Onboarding is unavailable</h1>
        <p>{errorMessage(onboarding.error)}</p>
        <Button type="button" onClick={() => onboarding.refetch()}>
          Try again
        </Button>
      </main>
    );

  const model = onboarding.data;
  if (model.case_status === "approved")
    return (
      <main
        className="employee-onboarding-loading"
        aria-label="Activating workspace"
      />
    );
  const requirementId = location.pathname.split("/").at(-1) ?? "";
  const requirement = model.requirements.find(
    (item) => item.id === requirementId,
  );
  // UI-PRE-001 mockup: without ?docs these stay empty/undefined, so the stage
  // below renders exactly what it did before.
  const docsSteps = docsMode ? docsStepsFor(docsMode, model.requirements) : [];
  const docsIndex = docsSteps.find(
    (step) => step.title && step.path === pathname,
  );
  const docsParent = docsSteps.find(
    (step) => requirement && step.items.includes(requirement),
  );
  const docsBack = docsParent && {
    label: docsParent.label,
    go: () => navigateRequirement(docsParent.path),
  };

  const stage =
    pathname === "/welcome" ? (
      <WelcomeStep
        model={model}
        onContinue={() => navigate(at(model.first_actionable_path))}
      />
    ) : pathname === "/welcome/profile" ? (
      <ProfileStep model={model} onSaved={continueAfterSave} />
    ) : pathname === "/welcome/availability" ? (
      <AvailabilityStep
        key={`${model.workspace_id}:${model.employee_id}`}
        model={model}
        onSaved={continueAfterSave}
      />
    ) : pathname === "/welcome/review" ? (
      <ReviewStep model={model} onSaved={continueAfterSave} />
    ) : pathname.includes("/documents/") && requirement?.kind === "document" ? (
      <DocumentStep
        model={model}
        requirement={requirement}
        onSaved={continueAfterSave}
        back={docsBack}
      />
    ) : pathname.includes("/acknowledgements/") &&
      requirement?.kind === "acknowledgement" ? (
      <DocumentStep
        model={model}
        requirement={requirement}
        onSaved={continueAfterSave}
        back={docsBack}
      />
    ) : docsIndex ? (
      <DocsGroupStep
        step={docsIndex}
        onOpen={navigateRequirement}
        nextPath={model.first_actionable_path}
      />
    ) : (
      <Navigate to={at(model.first_actionable_path)} replace />
    );

  if (docsMode)
    return (
      <DocsShell
        model={model}
        steps={docsSteps}
        pathname={pathname}
        onOpen={navigateRequirement}
        onExit={() => navigate(accountLandingPath)}
      >
        {stage}
      </DocsShell>
    );

  return (
    <main className="employee-onboarding-shell">
      <aside className="employee-onboarding-progress">
        <p className="product-mark">NEWFORK</p>
        <div>
          <span>{model.workspace_name}</span>
          <strong>{model.employee_name}</strong>
        </div>
        <progress
          value={model.progress_completed}
          max={Math.max(model.progress_total, 1)}
        />
        <p>
          {model.progress_completed} of {model.progress_total} complete
        </p>
        <nav aria-label="Onboarding requirements">
          {model.requirements
            .filter(
              (item) =>
                item.required ||
                item.kind === "availability" ||
                item.kind === "document",
            )
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  requirementPath(item) === pathname ? "active" : ""
                }
                onClick={() => navigateRequirement(requirementPath(item))}
              >
                <RequirementIcon requirement={item} />
                <span>
                  {item.title}
                  {item.document_mode === "conditional"
                    ? " (conditional)"
                    : !item.required
                      ? " (optional)"
                      : ""}
                </span>
              </button>
            ))}
          <button
            type="button"
            className={pathname === "/welcome/review" ? "active" : ""}
            onClick={() => navigateRequirement("/welcome/review")}
          >
            <FileCheck2 size={17} aria-hidden />
            <span>Review</span>
          </button>
        </nav>
        <div className="employee-onboarding-reset">
          {/* Back to the account landing, which re-checks what is still open. */}
          <button type="button" onClick={() => navigate(accountLandingPath)}>
            <Building2 size={16} aria-hidden />
            <span>Back</span>
          </button>
          <button type="button" onClick={() => void signOut()}>
            <LogOut size={16} aria-hidden />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <section className="employee-onboarding-stage">{stage}</section>
    </main>
  );
}

const docsModeKey = "ui-pre-001.docs";

/**
 * UI-PRE-001 Faz 1: how documents and policies are grouped, DEV only.
 * `?docs=1` one step, `?docs=2` two steps, `?docs=0` off. The choice is kept in
 * sessionStorage because every navigation here rebuilds a bare pathname and
 * ReviewStep does a full reload, so the param alone is gone after one click.
 */
function useDevDocsMode(): "1" | "2" | null {
  const [params] = useSearchParams();
  if (!import.meta.env.DEV) return null;
  const param = params.get("docs");
  const fromUrl = param === "1" || param === "2" ? param : null;
  try {
    if (fromUrl) sessionStorage.setItem(docsModeKey, fromUrl);
    else if (param === "0") sessionStorage.removeItem(docsModeKey);
    else {
      const stored = sessionStorage.getItem(docsModeKey);
      if (stored === "1" || stored === "2") return stored;
    }
  } catch {
    // Storage is blocked: the param still works for the page it is on.
  }
  return fromUrl;
}

interface OnboardingStep {
  readonly label: string;
  readonly path: string;
  readonly items: readonly EmployeeOnboardingRequirement[];
  /** Only a group has an index page, so only a group has its heading. */
  readonly title?: string;
  readonly copy?: string;
}

function docsStepsFor(
  mode: "1" | "2",
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
  const groups =
    mode === "1"
      ? [
          step("Documents", "/welcome/documents", ["document", "acknowledgement"], {
            title: "Your documents",
            copy: "Open each one to upload it or to read and acknowledge it.",
          }),
        ]
      : [
          step("Documents", "/welcome/documents", ["document"], {
            title: "Your documents",
            copy: "Open each document to upload it.",
          }),
          step("Policies", "/welcome/policies", ["acknowledgement"], {
            title: "Policies to read",
            copy: "Open each policy to read and acknowledge it.",
          }),
        ];
  return [
    step("Profile", "/welcome/profile", ["profile"]),
    ...[
      ...groups,
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

function DocsShell({
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
  return (
    <div className="pb">
      <aside className="pb-side">
        <div className="pb-side-group">
          <span className="pb-brand">NEWFORK</span>
          <div className="pb-context">
            <strong title={model.workspace_name}>{model.workspace_name}</strong>
            <span>{model.employee_name}</span>
          </div>
          <div className="pb-progress">
            <div
              role="progressbar"
              aria-label="Steps done"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
            >
              <span style={{ width: `${(done / Math.max(total, 1)) * 100}%` }} />
            </div>
            <p>
              {done} of {total} steps done
            </p>
          </div>
          <nav className="pb-steps" aria-label="Onboarding steps">
            {steps.map((step, index) => {
              const active =
                pathname === step.path ||
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

function DocsGroupStep({
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
      <StepHeading
        eyebrow={step.label}
        title={step.title ?? step.label}
        copy={step.copy ?? ""}
      />
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
      <div className="pb-footer">
        <button
          type="button"
          className="pb-btn pb-btn-primary"
          onClick={() => onOpen(next ? requirementPath(next) : nextPath)}
        >
          Continue
        </button>
      </div>
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
    <div className="onboarding-step onboarding-welcome">
      <span className="onboarding-step-icon">
        <UserRound size={24} aria-hidden />
      </span>
      <p className="onboarding-eyebrow">Welcome to {model.workspace_name}</p>
      <h1>Let's prepare your employee account</h1>
      <p className="onboarding-lead">
        Complete your information for manager review before your workspace
        access begins.
      </p>
      <dl className="onboarding-assignment-summary">
        <div>
          <dt>Locations</dt>
          <dd>{model.assignments.locations.join(", ") || "Not assigned"}</dd>
        </div>
        <div>
          <dt>Jobs</dt>
          <dd>{model.assignments.jobs.join(", ") || "Not assigned"}</dd>
        </div>
      </dl>
      <Button type="button" onClick={onContinue}>
        Begin <ArrowRight size={17} aria-hidden />
      </Button>
    </div>
  );
}

function ProfileStep({ model, onSaved }: StepProps) {
  const { workspaceId = "" } = useParams();
  const { account } = useAuth();
  const accountPhone = account?.phone ?? "";
  const accountEmail = account?.email ?? "";
  const profileRequirement = model.requirements.find(
    (item) => item.kind === "profile",
  );
  const initial = useMemo<EmployeeOnboardingProfile>(
    () => ({
      legal_first_name: model.profile?.legal_first_name ?? "",
      legal_last_name: model.profile?.legal_last_name ?? "",
      phone: model.profile?.phone || accountPhone || "",
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
    [accountPhone, model.profile],
  );
  const [profile, setProfile] = useState(initial);
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
  const mutation = useMutation({
    mutationFn: () => saveMyOnboardingProfile(workspaceId, profile, model.revision),
    onSuccess: onSaved,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = employeeOnboardingProfileSchema.safeParse(profile);
    if (!parsed.success) {
      setValidationError(
        parsed.error.issues[0]?.message ?? "Complete all required fields.",
      );
      return;
    }
    setValidationError(null);
    mutation.mutate();
  };
  return (
    <form className="onboarding-step" onSubmit={submit}>
      <StepHeading
        eyebrow="Profile and privacy"
        title="Your private employee details"
        copy="These details are restricted to authorized employee records."
      />
      {profileRequirement?.status === "rejected" ? (
        <Attention
          text={
            profileRequirement.rejection_reason ??
            "Review requested changes before saving again."
          }
        />
      ) : null}
      <section className="onboarding-profile-group">
        <header>
          <h2>Personal information</h2>
          <p>Your verified account and private employee details.</p>
        </header>
        <div className="onboarding-form-grid">
          <TextField
            label="First name"
            value={profile.legal_first_name}
            onChange={(value) =>
              setProfile({ ...profile, legal_first_name: value })
            }
          />
          <TextField
            label="Last name"
            value={profile.legal_last_name}
            onChange={(value) =>
              setProfile({ ...profile, legal_last_name: value })
            }
          />
          <TextField
            label="E-mail"
            type="email"
            value={accountEmail}
            onChange={() => undefined}
            readOnly
            wide
            help="This is the verified e-mail for your Newfork account."
          />
          <TextField
            label="Phone"
            type="tel"
            value={profile.phone}
            onChange={(value) => setProfile({ ...profile, phone: value })}
            help="Suggested from your account only when empty. This workspace phone can be different and stays independent."
          />
          <TextField
            label="Date of birth"
            type="date"
            value={profile.date_of_birth}
            onChange={(value) =>
              setProfile({ ...profile, date_of_birth: value })
            }
            max={new Date().toISOString().slice(0, 10)}
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
      </section>
      <section className="onboarding-profile-group">
        <header>
          <h2>Emergency contact</h2>
          <p>One person we can contact in an emergency.</p>
        </header>
        <div className="onboarding-form-grid">
          <TextField
            label="Emergency contact"
            value={profile.emergency_contact_name}
            onChange={(value) =>
              setProfile({ ...profile, emergency_contact_name: value })
            }
          />
          <label className="onboarding-field">
            <span>Emergency relationship</span>
            <select
              value={relationshipMode}
              required
              onChange={(event) => {
                const value = event.target.value;
                setRelationshipMode(value);
                setProfile({
                  ...profile,
                  emergency_contact_relationship:
                    value === "Other" ? "" : value,
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
            </select>
          </label>
          {relationshipMode === "Other" ? (
            <TextField
              label="Other relationship"
              value={profile.emergency_contact_relationship}
              onChange={(value) =>
                setProfile({
                  ...profile,
                  emergency_contact_relationship: value,
                })
              }
            />
          ) : null}
          <TextField
            label="Emergency phone"
            type="tel"
            value={profile.emergency_contact_phone}
            onChange={(value) =>
              setProfile({ ...profile, emergency_contact_phone: value })
            }
          />
          <TextField
            label="Emergency email"
            type="email"
            value={profile.emergency_contact_email}
            onChange={(value) =>
              setProfile({ ...profile, emergency_contact_email: value })
            }
            required={false}
          />
        </div>
      </section>
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
      {validationError ? (
        <p className="form-error" role="alert">
          {validationError}
        </p>
      ) : null}
      <MutationFooter mutation={mutation} />
    </form>
  );
}

function DocumentStep({
  model,
  requirement,
  onSaved,
  back,
}: StepProps & {
  readonly requirement: EmployeeOnboardingRequirement;
  /** UI-PRE-001 mockup: the group this page belongs to; the page then owns the heading. */
  readonly back?: { readonly label: string; readonly go: () => void };
}) {
  const { account } = useAuth();
  if (!account) return null;
  return (
    <div className="onboarding-step">
      {back ? (
        <>
          <button
            type="button"
            className="pb-btn pb-btn-secondary"
            onClick={back.go}
          >
            <span aria-hidden>‹</span> {back.label}
          </button>
          <StepHeading
            eyebrow={back.label}
            title={requirement.title}
            copy={requirement.description}
          />
          <RequirementBadge requirement={requirement} />
        </>
      ) : null}
      <DocumentReviewDrawer
        inline
        hideHeader={back !== undefined}
        audience={{ workspaceId: model.workspace_id, selfOnly: true }}
        userId={account.userId}
        requirementId={requirement.id}
        canReview={false}
        onClose={() => {}}
        onNext={() => {
          void onSaved();
        }}
      />
    </div>
  );
}

function AvailabilityStep({ model, onSaved }: StepProps) {
  const { workspaceId = "" } = useParams();
  const requirement = model.requirements.find(
    (item) => item.kind === "availability",
  );
  const completed = requirement?.status === "completed";
  return (
    <section className="onboarding-step onboarding-weekly-step">
      <StepHeading
        eyebrow="Availability"
        title="Your weekly availability"
        copy=""
      />
      <WeeklyPreferencesPanel
        workspaceId={workspaceId}
        employeeId={model.employee_id}
        audience="employee"
        onboarding
        onSaved={() => void onSaved()}
      />
      {completed || requirement?.required === false ? (
        <div className="onboarding-weekly-continue">
          <Button type="button" onClick={() => void onSaved()}>
            {completed ? "Continue" : "Skip for now"}{" "}
            <ArrowRight size={17} aria-hidden />
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function ReviewStep({ model, onSaved }: StepProps) {
  const { workspaceId = "" } = useParams();
  const mutation = useMutation({
    mutationFn: () => submitMyOnboarding(workspaceId, model.revision),
    onSuccess: onSaved,
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
  return (
    <form className="onboarding-step" onSubmit={submit}>
      <StepHeading
        eyebrow="Review"
        title={
          model.case_status === "submitted"
            ? "Submitted for manager review"
            : model.case_status === "changes_requested"
              ? "Changes requested"
              : "Review your onboarding"
        }
        copy={
          model.case_status === "submitted"
            ? "Your account remains pending until the review is complete."
            : model.case_status === "changes_requested"
              ? "Open the highlighted requirement, make the correction, and submit again."
              : "Check each requirement before submitting."
        }
      />
      <div className="onboarding-review-list">
        {model.requirements
          .filter((item) => item.required)
          .map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() =>
                window.location.assign(
                  workspacePath(workspaceId, requirementPath(item)),
                )
              }
            >
              <RequirementIcon requirement={item} />
              <span>
                <strong>{item.title}</strong>
                <small>{statusLabel(item.status)}</small>
              </span>
              <ArrowRight size={16} aria-hidden />
            </button>
          ))}
      </div>
      {model.case_status !== "submitted" ? (
        <MutationFooter
          mutation={mutation}
          disabled={!ready}
          label="Submit for review"
        />
      ) : null}
    </form>
  );
}

interface StepProps {
  readonly model: EmployeeOnboarding;
  readonly onSaved: () => Promise<void>;
}

function StepHeading({
  eyebrow,
  title,
  copy,
  icon,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly copy: string;
  readonly icon?: ReactNode;
}) {
  return (
    <header className="onboarding-step-heading">
      {icon ? <span>{icon}</span> : null}
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <div>{copy}</div>
    </header>
  );
}

function MutationFooter({
  mutation,
  disabled = false,
  label = "Save and continue",
}: {
  readonly mutation: { isPending: boolean; error: unknown; mutate: () => void };
  readonly disabled?: boolean;
  readonly label?: string;
}) {
  return (
    <footer className="onboarding-step-footer">
      {mutation.error ? (
        <p className="form-error" role="alert">
          {errorMessage(mutation.error)}
        </p>
      ) : (
        <span />
      )}
      <Button type="submit" disabled={disabled || mutation.isPending}>
        {mutation.isPending ? "Saving" : label}
        <ArrowRight size={17} aria-hidden />
      </Button>
    </footer>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = true,
  wide = false,
  maxLength,
  readOnly = false,
  help,
  max,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: string;
  readonly required?: boolean;
  readonly wide?: boolean;
  readonly maxLength?: number;
  readonly readOnly?: boolean;
  readonly help?: string;
  readonly max?: string;
}) {
  return (
    <label className={`onboarding-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        maxLength={maxLength}
        max={max}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
      {help ? <small>{help}</small> : null}
    </label>
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

function RequirementIcon({
  requirement,
}: {
  readonly requirement: EmployeeOnboardingRequirement;
}) {
  if (
    requirement.status === "completed" ||
    requirement.status === "awaiting_review"
  )
    return <Check size={17} aria-hidden />;
  if (requirement.status === "rejected")
    return <CircleAlert size={17} aria-hidden />;
  if (requirement.kind === "ssn") return <IdCard size={17} aria-hidden />;
  return <span className="requirement-dot" aria-hidden />;
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

function statusLabel(value: EmployeeOnboardingRequirement["status"]): string {
  return {
    not_started: "Not started",
    in_progress: "In progress",
    awaiting_review: "Awaiting review",
    completed: "Complete",
    rejected: "Changes requested",
    manual_follow_up: "Follow-up required",
    superseded: "Superseded",
  }[value];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Onboarding request failed";
}
