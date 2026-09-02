import {
  employeeInputSchema,
  employeeSectionSchema,
  type EmployeeDetail,
  type EmployeeInput,
  type EmployeeOnboardingManager,
  type EmployeeOnboardingRequirement,
  type EmployeeSection,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  BriefcaseBusiness,
  CalendarClock,
  FileText,
  History,
  KeyRound,
  MailPlus,
  RotateCcw,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  getEmployeeDetail,
  type InviteRoleOption,
  loadEmployeeReferenceData,
  prepareEmployeeInvitation,
  revokeEmployeeInvitation,
  saveEmployee,
  setEmployeeArchived,
  type EmployeeOption,
} from "./employee-data";
import {
  getEmployeeDocumentDownload,
  getEmployeeOnboardingReview,
  reviewEmployeeOnboarding,
} from "./onboarding-data";

const sections = [
  ["profile", "Profile", UserRound],
  ["employment", "Employment", BriefcaseBusiness],
  ["availability", "Availability", CalendarClock],
  ["documents", "Documents", FileText],
  ["access", "Access", KeyRound],
  ["history", "History", History],
] as const;

const emptyDraft: EmployeeInput = {
  first_name: "",
  last_name: "",
  preferred_name: "",
  invitation_email: "",
  start_date: "",
  internal_note: "",
  location_ids: [],
  primary_location_id: null,
  job_ids: [],
  primary_job_id: null,
  expected_revision: null,
};

interface EmployeeDrawerProps {
  readonly employeeId: string | null;
  readonly creating: boolean;
  readonly section: EmployeeSection;
  readonly onSectionChange: (section: EmployeeSection) => void;
  readonly onClose: () => void;
  readonly onCreated: (employeeId: string) => void;
}

export function EmployeeDrawer(props: EmployeeDrawerProps) {
  const { context } = useAuth();
  const workspaceId = context?.workspace.id ?? "";
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["employee-detail", workspaceId, props.employeeId],
    queryFn: () => getEmployeeDetail(workspaceId, props.employeeId ?? ""),
    enabled: Boolean(workspaceId && props.employeeId && !props.creating),
  });
  const references = useQuery({
    queryKey: ["employee-reference-data", workspaceId],
    queryFn: () => loadEmployeeReferenceData(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const canReviewOnboarding =
    context?.permissions.includes("employee_onboarding.review") ?? false;
  const canReviewDocuments =
    context?.permissions.includes("employee_documents.review") ?? false;
  const onboardingReview = useQuery({
    queryKey: ["employee-onboarding-review", workspaceId, props.employeeId],
    queryFn: () =>
      getEmployeeOnboardingReview(workspaceId, props.employeeId ?? ""),
    enabled: Boolean(
      workspaceId && props.employeeId && !props.creating && canReviewOnboarding,
    ),
  });
  const [draft, setDraft] = useState<EmployeeInput>(emptyDraft);
  const [inviteRoleId, setInviteRoleId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [developmentUrl, setDevelopmentUrl] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wheelIntent = useRef(0);

  useEffect(() => {
    setDraft(
      props.creating
        ? emptyDraft
        : detail.data
          ? toDraft(detail.data)
          : emptyDraft,
    );
    setError(null);
    setDevelopmentUrl(null);
  }, [detail.data, props.creating, props.employeeId]);

  useEffect(() => {
    const pendingRoleId = detail.data?.invitation?.role_id;
    const defaultEmployeeRoleId = references.data?.inviteRoles.find(
      (role) => role.systemKey === "employee",
    )?.id;
    setInviteRoleId(pendingRoleId ?? defaultEmployeeRoleId ?? "");
  }, [detail.data?.invitation?.role_id, references.data?.inviteRoles]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [props.onClose]);

  const canManage = context?.permissions.includes("employees.manage") ?? false;
  const canArchive =
    context?.permissions.includes("employees.archive") ?? false;
  const canManageAccess =
    context?.permissions.includes("employee_access.manage") ?? false;
  const archived = Boolean(detail.data?.archived_at);
  const readOnly = archived || (!props.creating && !canManage);
  const baseline = props.creating
    ? emptyDraft
    : detail.data
      ? toDraft(detail.data)
      : emptyDraft;
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveEmployee(workspaceId, draft, props.employeeId ?? undefined),
    onSuccess: async (savedId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees", workspaceId] }),
        queryClient.invalidateQueries({
          queryKey: ["employee-detail", workspaceId, savedId],
        }),
      ]);
      setError(null);
      if (props.creating) props.onCreated(savedId);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const archiveMutation = useMutation({
    mutationFn: (nextArchived: boolean) =>
      setEmployeeArchived(workspaceId, props.employeeId ?? "", nextArchived),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["employees", workspaceId],
      });
      props.onClose();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const inviteMutation = useMutation({
    mutationFn: () =>
      prepareEmployeeInvitation(
        workspaceId,
        props.employeeId ?? "",
        draft.invitation_email,
        inviteRoleId || null,
      ),
    onSuccess: async (result) => {
      setDevelopmentUrl(result.developmentUrl ?? null);
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees", workspaceId] }),
        queryClient.invalidateQueries({
          queryKey: ["employee-detail", workspaceId, props.employeeId],
        }),
      ]);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const revokeMutation = useMutation({
    mutationFn: () =>
      revokeEmployeeInvitation(workspaceId, props.employeeId ?? ""),
    onSuccess: async () => {
      setDevelopmentUrl(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees", workspaceId] }),
        queryClient.invalidateQueries({
          queryKey: ["employee-detail", workspaceId, props.employeeId],
        }),
      ]);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const reviewMutation = useMutation({
    mutationFn: (input: {
      action: "accept_requirement" | "reject_requirement" | "activate";
      requirementId: string | null;
      reason: string;
    }) =>
      reviewEmployeeOnboarding(workspaceId, props.employeeId ?? "", {
        ...input,
        revision: onboardingReview.data?.revision ?? 0,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            "employee-onboarding-review",
            workspaceId,
            props.employeeId,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: ["employee-detail", workspaceId, props.employeeId],
        }),
        queryClient.invalidateQueries({ queryKey: ["employees", workspaceId] }),
      ]);
      setError(null);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const downloadMutation = useMutation({
    mutationFn: (requirementId: string) =>
      getEmployeeDocumentDownload(
        workspaceId,
        props.employeeId ?? "",
        requirementId,
      ),
    onSuccess: (url) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (cause) => setError(errorMessage(cause)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = employeeInputSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the employee details");
      return;
    }
    saveMutation.mutate();
  };

  const moveSection = (direction: -1 | 1) => {
    const index = sections.findIndex(([key]) => key === props.section);
    const next = sections[index + direction];
    if (next) props.onSectionChange(next[0]);
  };

  return (
    <div className="employee-drawer-layer" role="presentation">
      <button
        type="button"
        className="employee-drawer-backdrop"
        aria-label="Close employee details"
        onClick={props.onClose}
      />
      <aside
        className="employee-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-drawer-title"
        data-employee-drawer-panel="true"
      >
        <form onSubmit={submit} className="employee-drawer-form">
          <div className="employee-drawer-main">
            <nav
              className="employee-summary-rail"
              aria-label="Employee sections"
            >
              <div className="employee-identity">
                <span className="employee-avatar" aria-hidden>
                  {(draft.preferred_name || draft.first_name || "N")
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <strong id="employee-drawer-title">
                  {props.creating
                    ? "New employee"
                    : (detail.data?.display_name ?? "Employee details")}
                </strong>
                <span>
                  {detail.data?.employee_code ?? "Code assigned on save"}
                </span>
                {detail.data ? (
                  <span
                    className={`employee-state state-${detail.data.display_status}`}
                  >
                    {statusLabel(detail.data.display_status)}
                  </span>
                ) : null}
              </div>
              <div className="employee-section-links">
                {sections.map(([key, label, Icon], index) => (
                  <button
                    type="button"
                    key={key}
                    className={props.section === key ? "active" : ""}
                    data-group-start={index === 3 || index === 4}
                    onClick={() => props.onSectionChange(key)}
                  >
                    <Icon size={16} aria-hidden />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </nav>

            <div className="employee-drawer-content">
              <div className="employee-drawer-mobile-header">
                <select
                  aria-label="Employee section"
                  value={props.section}
                  onChange={(event) =>
                    props.onSectionChange(
                      employeeSectionSchema.parse(event.target.value),
                    )
                  }
                >
                  {sections.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  type="button"
                  onClick={props.onClose}
                  aria-label="Close employee details"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>
              <header className="employee-section-header">
                <div>
                  <h2>
                    {sections.find(([key]) => key === props.section)?.[1]}
                  </h2>
                  <p>{sectionDescription(props.section)}</p>
                </div>
                <button
                  className="icon-button employee-drawer-close"
                  type="button"
                  onClick={props.onClose}
                  aria-label="Close employee details"
                  title="Close"
                >
                  <X size={18} aria-hidden />
                </button>
              </header>
              <div
                className="employee-section-scroll"
                ref={scrollRef}
                onWheel={(event) => {
                  const node = scrollRef.current;
                  if (!node) return;
                  const atTop = node.scrollTop <= 0 && event.deltaY < 0;
                  const atBottom =
                    node.scrollTop + node.clientHeight >=
                      node.scrollHeight - 1 && event.deltaY > 0;
                  if (!atTop && !atBottom) {
                    wheelIntent.current = 0;
                    return;
                  }
                  wheelIntent.current += Math.abs(event.deltaY);
                  if (wheelIntent.current >= 90) {
                    moveSection(event.deltaY > 0 ? 1 : -1);
                    wheelIntent.current = 0;
                    node.scrollTop = 0;
                  }
                }}
              >
                {detail.isLoading && !props.creating ? (
                  <p className="employee-panel-state">Loading employee...</p>
                ) : null}
                {detail.error ? (
                  <p className="employee-panel-state error" role="alert">
                    {errorMessage(detail.error)}
                  </p>
                ) : null}
                {!detail.isLoading && !detail.error
                  ? renderSection(
                      props.section,
                      draft,
                      setDraft,
                      detail.data,
                      references.data,
                      inviteRoleId,
                      setInviteRoleId,
                      readOnly,
                      canManageAccess,
                      onboardingReview.data,
                      onboardingReview.isLoading,
                      canReviewDocuments,
                      (action, requirementId, reason) =>
                        reviewMutation.mutate({
                          action,
                          requirementId,
                          reason,
                        }),
                      reviewMutation.isPending,
                      (requirementId) => downloadMutation.mutate(requirementId),
                      downloadMutation.isPending,
                      () => revokeMutation.mutate(),
                      revokeMutation.isPending,
                    )
                  : null}
              </div>
            </div>
          </div>

          {developmentUrl ? (
            <div className="employee-drawer-notice">
              <span>Development invitation prepared.</span>
              <a href={developmentUrl}>Open acceptance link</a>
            </div>
          ) : null}
          {error ? (
            <p className="employee-drawer-error" role="alert">
              {error}
            </p>
          ) : null}
          <footer className="employee-drawer-footer">
            <div>
              {!props.creating && canArchive ? (
                <button
                  type="button"
                  className={`employee-lifecycle-button${archived ? " restore" : ""}`}
                  disabled={archiveMutation.isPending}
                  onClick={() => {
                    const action = archived ? "restore" : "archive";
                    if (
                      window.confirm(
                        `${action === "archive" ? "Archive" : "Restore"} this employee?`,
                      )
                    )
                      archiveMutation.mutate(!archived);
                  }}
                >
                  {archived ? (
                    <RotateCcw size={16} aria-hidden />
                  ) : (
                    <Archive size={16} aria-hidden />
                  )}
                  {archived ? "Restore employee" : "Archive employee"}
                </button>
              ) : null}
            </div>
            <div className="employee-drawer-actions">
              {dirty && !readOnly ? (
                <span className="employee-dirty">
                  <i />
                  Unsaved changes
                </span>
              ) : null}
              <Button
                className="secondary-button"
                type="button"
                onClick={props.onClose}
              >
                Cancel
              </Button>
              {!props.creating &&
              !readOnly &&
              canManageAccess &&
              draft.invitation_email ? (
                <Button
                  className="secondary-button"
                  type="button"
                  disabled={dirty || inviteMutation.isPending || !inviteRoleId}
                  title={
                    dirty
                      ? "Save changes before sending the invitation"
                      : !inviteRoleId
                        ? "Choose a role before sending the invitation"
                        : undefined
                  }
                  onClick={() => inviteMutation.mutate()}
                >
                  <MailPlus size={16} aria-hidden />
                  {detail.data?.invitation?.status === "pending"
                    ? "Resend"
                    : "Invite"}
                </Button>
              ) : null}
              {!readOnly ? (
                <Button
                  type="submit"
                  disabled={saveMutation.isPending || !dirty}
                >
                  {saveMutation.isPending
                    ? "Saving"
                    : props.creating
                      ? "Save"
                      : "Save changes"}
                </Button>
              ) : null}
            </div>
          </footer>
        </form>
      </aside>
    </div>
  );
}

function renderSection(
  section: EmployeeSection,
  draft: EmployeeInput,
  setDraft: React.Dispatch<React.SetStateAction<EmployeeInput>>,
  detail: EmployeeDetail | undefined,
  references: Awaited<ReturnType<typeof loadEmployeeReferenceData>> | undefined,
  inviteRoleId: string,
  setInviteRoleId: React.Dispatch<React.SetStateAction<string>>,
  readOnly: boolean,
  canManageAccess: boolean,
  onboarding: EmployeeOnboardingManager | undefined,
  onboardingLoading: boolean,
  canReviewDocuments: boolean,
  onReview: (
    action: "accept_requirement" | "reject_requirement" | "activate",
    requirementId: string | null,
    reason: string,
  ) => void,
  reviewing: boolean,
  onOpenDocument: (requirementId: string) => void,
  openingDocument: boolean,
  onRevokeInvitation: () => void,
  revokingInvitation: boolean,
) {
  if (section === "profile")
    return (
      <ProfileSection
        draft={draft}
        setDraft={setDraft}
        readOnly={readOnly}
        linked={Boolean(detail?.user_id)}
        roles={references?.inviteRoles ?? []}
        inviteRoleId={inviteRoleId}
        setInviteRoleId={setInviteRoleId}
        canManageAccess={canManageAccess}
      />
    );
  if (section === "employment")
    return (
      <EmploymentSection
        draft={draft}
        setDraft={setDraft}
        readOnly={readOnly}
        references={references}
      />
    );
  if (section === "availability")
    return (
      <OnboardingReviewPanel
        onboarding={onboarding}
        loading={onboardingLoading}
        kinds={["availability"]}
        canReviewDocuments={canReviewDocuments}
        onReview={onReview}
        reviewing={reviewing}
        onOpenDocument={onOpenDocument}
        openingDocument={openingDocument}
      />
    );
  if (section === "documents")
    return (
      <OnboardingReviewPanel
        onboarding={onboarding}
        loading={onboardingLoading}
        kinds={["document", "acknowledgement"]}
        canReviewDocuments={canReviewDocuments}
        onReview={onReview}
        reviewing={reviewing}
        onOpenDocument={onOpenDocument}
        openingDocument={openingDocument}
      />
    );
  if (section === "access")
    return (
      <AccessSection
        draft={draft}
        setDraft={setDraft}
        detail={detail}
        roles={references?.inviteRoles ?? []}
        inviteRoleId={inviteRoleId}
        setInviteRoleId={setInviteRoleId}
        readOnly={readOnly || !canManageAccess}
        onRevokeInvitation={onRevokeInvitation}
        revokingInvitation={revokingInvitation}
      />
    );
  return <HistorySection detail={detail} />;
}

function OnboardingReviewPanel({
  onboarding,
  loading,
  kinds,
  canReviewDocuments,
  onReview,
  reviewing,
  onOpenDocument,
  openingDocument,
}: {
  readonly onboarding: EmployeeOnboardingManager | undefined;
  readonly loading: boolean;
  readonly kinds: readonly EmployeeOnboardingRequirement["kind"][];
  readonly canReviewDocuments: boolean;
  readonly onReview: (
    action: "accept_requirement" | "reject_requirement" | "activate",
    requirementId: string | null,
    reason: string,
  ) => void;
  readonly reviewing: boolean;
  readonly onOpenDocument: (requirementId: string) => void;
  readonly openingDocument: boolean;
}) {
  if (loading)
    return <p className="employee-panel-state">Loading onboarding...</p>;
  if (!onboarding)
    return (
      <SummaryPanel
        icon={<CalendarClock size={20} aria-hidden />}
        title="Onboarding not started"
        copy="An accepted invitation starts the employee onboarding case."
      />
    );
  const requirements = onboarding.requirements.filter((requirement) =>
    kinds.includes(requirement.kind),
  );
  const activationReady =
    onboarding.case_status === "submitted" &&
    onboarding.requirements
      .filter(
        (requirement) => requirement.required && requirement.blocks_activation,
      )
      .every((requirement) => requirement.status === "completed");
  return (
    <div className="manager-onboarding-review">
      <div className="manager-onboarding-summary">
        <span className={`employee-state state-${onboarding.case_status}`}>
          {onboarding.case_status.replaceAll("_", " ")}
        </span>
        <strong>
          {onboarding.progress_completed} of {onboarding.progress_total}{" "}
          complete
        </strong>
        <span>SSN {onboarding.ssn_present ? "received" : "missing"}</span>
      </div>
      {requirements.length ? (
        requirements.map((requirement) => (
          <article key={requirement.id} className="manager-onboarding-item">
            <div>
              <strong>{requirement.title}</strong>
              <span>{requirement.status.replaceAll("_", " ")}</span>
            </div>
            {requirement.rejection_reason ? (
              <p>{requirement.rejection_reason}</p>
            ) : null}
            {requirement.requires_review &&
            requirement.status === "awaiting_review" ? (
              <div>
                {requirement.kind === "document" && canReviewDocuments ? (
                  <Button
                    type="button"
                    className="secondary-button"
                    disabled={openingDocument}
                    onClick={() => onOpenDocument(requirement.id)}
                  >
                    Open document
                  </Button>
                ) : null}
                <Button
                  type="button"
                  className="secondary-button"
                  disabled={
                    reviewing ||
                    (requirement.kind === "document" && !canReviewDocuments)
                  }
                  onClick={() => {
                    const reason = window.prompt(
                      "What should the employee correct?",
                    );
                    if (reason?.trim())
                      onReview(
                        "reject_requirement",
                        requirement.id,
                        reason.trim(),
                      );
                  }}
                >
                  Request changes
                </Button>
                <Button
                  type="button"
                  disabled={
                    reviewing ||
                    (requirement.kind === "document" && !canReviewDocuments)
                  }
                  onClick={() =>
                    onReview("accept_requirement", requirement.id, "")
                  }
                >
                  Accept
                </Button>
              </div>
            ) : null}
          </article>
        ))
      ) : (
        <p className="employee-panel-state">No requirements in this section.</p>
      )}
      {activationReady ? (
        <Button
          type="button"
          disabled={reviewing}
          onClick={() => onReview("activate", null, "")}
        >
          Activate employee access
        </Button>
      ) : null}
    </div>
  );
}

function ProfileSection({
  draft,
  setDraft,
  readOnly,
  linked,
  roles,
  inviteRoleId,
  setInviteRoleId,
  canManageAccess,
}: {
  draft: EmployeeInput;
  setDraft: React.Dispatch<React.SetStateAction<EmployeeInput>>;
  readOnly: boolean;
  linked: boolean;
  roles: readonly InviteRoleOption[];
  inviteRoleId: string;
  setInviteRoleId: React.Dispatch<React.SetStateAction<string>>;
  canManageAccess: boolean;
}) {
  return (
    <div className="employee-form-grid">
      <Field
        label="First name"
        value={draft.first_name}
        disabled={readOnly}
        onChange={(value) =>
          setDraft((current) => ({ ...current, first_name: value }))
        }
      />
      <Field
        label="Last name"
        value={draft.last_name}
        disabled={readOnly}
        onChange={(value) =>
          setDraft((current) => ({ ...current, last_name: value }))
        }
      />
      <Field
        label="Preferred name"
        value={draft.preferred_name}
        disabled={readOnly}
        onChange={(value) =>
          setDraft((current) => ({ ...current, preferred_name: value }))
        }
      />
      <Field
        label="Invitation email"
        value={draft.invitation_email}
        type="email"
        disabled={readOnly || linked}
        hint={linked ? "Owned by the linked account" : undefined}
        onChange={(value) =>
          setDraft((current) => ({ ...current, invitation_email: value }))
        }
      />
      {canManageAccess && !linked ? (
        <InviteRoleField
          roles={roles}
          inviteRoleId={inviteRoleId}
          setInviteRoleId={setInviteRoleId}
          disabled={readOnly}
        />
      ) : null}
    </div>
  );
}

function EmploymentSection({
  draft,
  setDraft,
  readOnly,
  references,
}: {
  draft: EmployeeInput;
  setDraft: React.Dispatch<React.SetStateAction<EmployeeInput>>;
  readOnly: boolean;
  references: Awaited<ReturnType<typeof loadEmployeeReferenceData>> | undefined;
}) {
  return (
    <div className="employee-form-stack">
      <Field
        label="Start date"
        type="date"
        value={draft.start_date}
        disabled={readOnly}
        onChange={(value) =>
          setDraft((current) => ({ ...current, start_date: value }))
        }
      />
      <AssignmentPicker
        label="Locations"
        options={references?.locations ?? []}
        selected={draft.location_ids}
        primary={draft.primary_location_id}
        disabled={readOnly}
        onChange={(ids, primary) =>
          setDraft((current) => ({
            ...current,
            location_ids: ids,
            primary_location_id: primary,
          }))
        }
      />
      <AssignmentPicker
        label="Jobs"
        options={references?.jobs ?? []}
        selected={draft.job_ids}
        primary={draft.primary_job_id}
        disabled={readOnly}
        onChange={(ids, primary) =>
          setDraft((current) => ({
            ...current,
            job_ids: ids,
            primary_job_id: primary,
          }))
        }
      />
      <label className="employee-field">
        <span>Internal note</span>
        <textarea
          value={draft.internal_note}
          disabled={readOnly}
          maxLength={1000}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              internal_note: event.target.value,
            }))
          }
        />
      </label>
    </div>
  );
}

function AccessSection({
  draft,
  setDraft,
  detail,
  roles,
  inviteRoleId,
  setInviteRoleId,
  readOnly,
  onRevokeInvitation,
  revokingInvitation,
}: {
  draft: EmployeeInput;
  setDraft: React.Dispatch<React.SetStateAction<EmployeeInput>>;
  detail: EmployeeDetail | undefined;
  roles: readonly InviteRoleOption[];
  inviteRoleId: string;
  setInviteRoleId: React.Dispatch<React.SetStateAction<string>>;
  readOnly: boolean;
  onRevokeInvitation: () => void;
  revokingInvitation: boolean;
}) {
  return (
    <div className="employee-form-stack">
      <div className="employee-access-status">
        <span>Workspace access</span>
        <strong>{detail?.role_name ?? "No active access"}</strong>
      </div>
      <div className="employee-access-status">
        <span>Invitation</span>
        <strong>
          {detail?.invitation
            ? statusLabel(detail.invitation.status)
            : "Not sent"}
        </strong>
      </div>
      <Field
        label="Invitation email"
        type="email"
        value={draft.invitation_email}
        disabled={readOnly || Boolean(detail?.user_id)}
        onChange={(value) =>
          setDraft((current) => ({ ...current, invitation_email: value }))
        }
      />
      <InviteRoleField
        roles={roles}
        inviteRoleId={inviteRoleId}
        setInviteRoleId={setInviteRoleId}
        disabled={readOnly || Boolean(detail?.user_id)}
      />
      {detail?.invitation?.status === "pending" && !readOnly ? (
        <Button
          className="secondary-button employee-revoke-invite"
          type="button"
          disabled={revokingInvitation}
          onClick={onRevokeInvitation}
        >
          Revoke invitation
        </Button>
      ) : null}
    </div>
  );
}

function InviteRoleField({
  roles,
  inviteRoleId,
  setInviteRoleId,
  disabled,
}: {
  roles: readonly InviteRoleOption[];
  inviteRoleId: string;
  setInviteRoleId: React.Dispatch<React.SetStateAction<string>>;
  disabled: boolean;
}) {
  return (
    <label className="employee-field">
      <span>Invite role</span>
      <select
        aria-label="Invite role"
        value={inviteRoleId}
        disabled={disabled || roles.length === 0}
        onChange={(event) => setInviteRoleId(event.target.value)}
      >
        {roles.length === 0 ? (
          <option value="">No assignable roles</option>
        ) : null}
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
      <small>The selected role is applied when the invite is accepted.</small>
    </label>
  );
}

function HistorySection({ detail }: { detail: EmployeeDetail | undefined }) {
  if (!detail?.events.length)
    return (
      <SummaryPanel
        icon={<History size={20} aria-hidden />}
        title="No history yet"
        copy="Lifecycle changes will appear here."
      />
    );
  return (
    <ol className="employee-history">
      {detail.events.map((event) => (
        <li key={event.id}>
          <span />
          <div>
            <strong>{event.summary || event.action}</strong>
            <small>{new Date(event.occurred_at).toLocaleString()}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

function SummaryPanel({
  icon,
  title,
  copy,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="employee-summary-panel">
      {icon}
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="employee-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function AssignmentPicker({
  label,
  options,
  selected,
  primary,
  disabled,
  onChange,
}: {
  label: string;
  options: readonly EmployeeOption[];
  selected: readonly string[];
  primary: string | null;
  disabled: boolean;
  onChange: (ids: string[], primary: string | null) => void;
}) {
  return (
    <fieldset className="employee-assignment-picker" disabled={disabled}>
      <legend>{label}</legend>
      {options
        .filter((option) => !option.archived || selected.includes(option.id))
        .map((option) => {
          const checked = selected.includes(option.id);
          return (
            <div key={option.id}>
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const ids = checked
                      ? selected.filter((id) => id !== option.id)
                      : [...selected, option.id];
                    onChange(
                      ids,
                      checked && primary === option.id
                        ? (ids[0] ?? null)
                        : (primary ?? option.id),
                    );
                  }}
                />
                <span>{option.name}</span>
                {option.archived ? <small>Archived</small> : null}
              </label>
              {checked ? (
                <label className="primary-choice">
                  <input
                    type="radio"
                    name={`primary-${label}`}
                    checked={primary === option.id}
                    onChange={() => onChange([...selected], option.id)}
                  />
                  Primary
                </label>
              ) : null}
            </div>
          );
        })}
      {options.length === 0 ? <p>No active {label.toLowerCase()}.</p> : null}
    </fieldset>
  );
}

function toDraft(detail: EmployeeDetail): EmployeeInput {
  return {
    first_name: detail.first_name,
    last_name: detail.last_name,
    preferred_name: detail.preferred_name,
    invitation_email: detail.invitation_email ?? "",
    start_date: detail.start_date ?? "",
    internal_note: detail.internal_note,
    location_ids: detail.locations.map((item) => item.id),
    primary_location_id: detail.primary_location_id,
    job_ids: detail.jobs.map((item) => item.id),
    primary_job_id: detail.primary_job_id,
    expected_revision: detail.revision,
  };
}

function sectionDescription(section: EmployeeSection): string {
  return {
    profile: "Identity and manager-owned contact details.",
    employment: "Location, job, start date, and internal context.",
    availability: "Employee-submitted recurring scheduling availability.",
    documents: "Onboarding document requirement progress.",
    access: "Invitation and workspace access state.",
    history: "Audited employee lifecycle changes.",
  }[section];
}

function statusLabel(status: string): string {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Employee operation failed";
}
