import {
  EmployeeAssignmentDocumentPreview,
  useEmployeeDocumentAssignmentPreview,
} from "../documents/EmployeeAssignmentDocumentPreview";
import { EmployeeDocumentPanel } from "../documents/EmployeeDocumentPanel";
import {
  employeeInputSchema,
  employeeSectionSchema,
  type EmployeeDetail,
  type EmployeeInput,
  type EmployeeCreateCommand,
  type EmployeeCreateResult,
  type EmployeeOnboardingManager,
  type EmployeeOnboardingRequirement,
  type EmployeeSection,
  type WorkspaceRole,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  History,
  ImageOff,
  KeyRound,
  MailPlus,
  Pencil,
  RotateCcw,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { postMvpSurfaces } from "../lib/post-mvp";
import { WeeklyPreferencesPanel } from "../availability/WeeklyPreferencesPanel";
import {
  getEmployeeDetail,
  getEmployeeAvatar,
  createEmployee,
  type InviteRoleOption,
  loadEmployeeReferenceData,
  prepareEmployeeInvitation,
  removeEmployeeAvatar,
  removeEmployeeAccess,
  retryEmployeeInvitation,
  revokeEmployeeInvitation,
  saveEmployee,
  setEmployeeArchived,
  terminateEmployee,
  updateEmployeeRole,
  type EmployeeTerminationInput,
  type EmployeeOption,
} from "./employee-data";
import {
  getEmployeeDocumentDownload,
  getEmployeeOnboardingReview,
  reviewEmployeeOnboarding,
} from "./onboarding-data";
import {
  canInviteWithRole,
  employeeCreateReadiness,
} from "./employee-create-flow";
import { registerEmployeeHistoryGuard } from "./employee-history-guard";

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
  is_remote: false,
  is_excluded_from_schedule: false,
  expected_revision: null,
};

interface EmployeeDrawerProps {
  readonly employeeId: string | null;
  readonly creating: boolean;
  readonly section: EmployeeSection;
  readonly onSectionChange: (section: EmployeeSection) => void;
  readonly onClose: () => void;
  readonly onCreated: (employeeId: string) => void;
  readonly onOnboardingReviewSuccess?: (review: {
    readonly action: "accept_requirement" | "reject_requirement";
    readonly requirementId: string;
  }) => void;
}

export function EmployeeDrawer(props: EmployeeDrawerProps) {
  const { context, refresh } = useAuth();
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
  const canReviewDocuments =
    context?.permissions.includes("employee_documents.review") ?? false;
  const onboardingReview = useQuery({
    queryKey: ["employee-onboarding-review", workspaceId, props.employeeId],
    queryFn: () =>
      getEmployeeOnboardingReview(workspaceId, props.employeeId ?? ""),
    enabled: Boolean(
      workspaceId &&
      props.employeeId &&
      !props.creating &&
      context?.permissions.includes("employees.read"),
    ),
  });
  const [draft, setDraft] = useState<EmployeeInput>(emptyDraft);
  const [inviteRoleId, setInviteRoleId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [developmentUrl, setDevelopmentUrl] = useState<string | null>(null);
  const [terminationOpen, setTerminationOpen] = useState(false);
  const [terminationNotice, setTerminationNotice] = useState<string | null>(
    null,
  );
  const [inviteRoleDirty, setInviteRoleDirty] = useState(false);
  const [inviteRoleAttempt, setInviteRoleAttempt] = useState(0);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [createResult, setCreateResult] = useState<EmployeeCreateResult | null>(
    null,
  );
  const [uncertainCreate, setUncertainCreate] = useState(false);
  const commandRef = useRef<EmployeeCreateCommand | null>(null);
  const submittingCreateRef = useRef(false);
  const createdIdRef = useRef<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const focusEmailOnProfileRef = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<() => void>(() => {});
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const openingFocusRef = useRef<HTMLElement | null>(null);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const allowNavigationRef = useRef(false);
  const previousSectionRef = useRef(props.section);
  const readiness = employeeCreateReadiness(draft);
  const allowedSections = sections.filter(
    ([key]) =>
      (key !== "availability" ||
        context?.permissions.includes("availability.read")) &&
      (key !== "documents" ||
        context?.permissions.includes("employee_documents.read")) &&
      (key !== "access" ||
        context?.permissions.includes("employee_access.read") ||
        context?.permissions.includes("employee_access.manage")),
  );
  const activeSection =
    props.creating && (props.section !== "employment" || !readiness.namesReady)
      ? "profile"
      : allowedSections.some(([key]) => key === props.section)
        ? props.section
        : "profile";
  const visibleSections = props.creating
    ? sections.slice(0, 2)
    : allowedSections;
  const DrawerForm =
    !props.creating && activeSection === "availability" ? "div" : "form";
  const scrollRef = useRef<HTMLDivElement>(null);
  const draftEditedRef = useRef(false);
  const draftSubjectKey = `${workspaceId}:${
    props.creating ? "new" : (props.employeeId ?? "")
  }`;
  const lastDraftSubjectKeyRef = useRef<string | null>(null);
  const lastInviteRoleSubjectKeyRef = useRef<string | null>(null);
  const allowNextDraftRefreshRef = useRef(false);
  const baseline = props.creating
    ? emptyDraft
    : detail.data
      ? toDraft(detail.data)
      : emptyDraft;
  const assignmentKey = (value: EmployeeInput) =>
    JSON.stringify([
      [...new Set(value.location_ids)].sort(),
      [...new Set(value.job_ids)].sort(),
    ]);
  const needsDocumentPreview =
    draftEditedRef.current &&
    !props.creating &&
    Boolean(detail.data?.user_id) &&
    context?.documentAccess !== undefined &&
    assignmentKey(draft) !== assignmentKey(baseline);
  const documentPreview = useEmployeeDocumentAssignmentPreview({
    enabled: needsDocumentPreview,
    actorId: context?.userId ?? "",
    workspaceId,
    employeeId: props.employeeId ?? "",
    locationIds: draft.location_ids,
    jobIds: draft.job_ids,
  });
  const documentPreviewBlocked =
    needsDocumentPreview &&
    (documentPreview.isPending ||
      documentPreview.isFetching ||
      Boolean(documentPreview.error));
  const baselineKey = JSON.stringify(baseline);
  const dirty = draftEditedRef.current && JSON.stringify(draft) !== baselineKey;

  useEffect(() => {
    const subjectChanged = lastDraftSubjectKeyRef.current !== draftSubjectKey;
    if (
      !subjectChanged &&
      draftEditedRef.current &&
      !allowNextDraftRefreshRef.current
    ) {
      return;
    }
    setDraft(baseline);
    draftEditedRef.current = false;
    allowNextDraftRefreshRef.current = false;
    lastDraftSubjectKeyRef.current = draftSubjectKey;
    if (subjectChanged) {
      setError(null);
      if (props.employeeId !== createdIdRef.current || props.creating) {
        setDevelopmentUrl(null);
        setCreateResult(null);
        commandRef.current = null;
      }
      setUncertainCreate(false);
      setDiscardOpen(false);
      setTerminationNotice(null);
    }
  }, [baselineKey, draftSubjectKey]);

  const updateDraft = (update: React.SetStateAction<EmployeeInput>): void => {
    draftEditedRef.current = true;
    setDraft(update);
  };

  useEffect(() => {
    const pendingRoleId = detail.data?.invitation?.role_id;
    const subjectChanged =
      lastInviteRoleSubjectKeyRef.current !== draftSubjectKey;
    if (
      subjectChanged &&
      props.employeeId === createdIdRef.current &&
      inviteRoleDirty
    ) {
      lastInviteRoleSubjectKeyRef.current = draftSubjectKey;
      return;
    }
    if (!subjectChanged && inviteRoleDirty) return;
    setInviteRoleId(pendingRoleId ?? "");
    setInviteRoleDirty(false);
    setInviteRoleAttempt(0);
    lastInviteRoleSubjectKeyRef.current = draftSubjectKey;
  }, [detail.data?.invitation?.role_id, draftSubjectKey, inviteRoleDirty]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (terminationOpen) setTerminationOpen(false);
        else closeRef.current();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [props.onClose, terminationOpen]);

  const canManage = context?.permissions.includes("employees.manage") ?? false;
  const canArchive =
    context?.permissions.includes("employees.archive") ?? false;
  const canManageAccess =
    context?.permissions.includes("employee_access.manage") ?? false;
  const archived = Boolean(detail.data?.archived_at);
  const targetIsOwner = detail.data?.role_name === "Owner";
  const readOnly = archived || !canManage || targetIsOwner;
  const createMutation = useMutation({
    mutationFn: (command: EmployeeCreateCommand) =>
      createEmployee(workspaceId, command),
    onSuccess: (result) => {
      createdIdRef.current = result.id;
      setCreateResult(result);
      setDevelopmentUrl(result.invitation?.developmentUrl ?? null);
      setUncertainCreate(false);
      setError(null);
      draftEditedRef.current = false;
      allowNextDraftRefreshRef.current = true;
      props.onCreated(result.id);
      void queryClient.invalidateQueries({
        queryKey: ["employees", workspaceId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["employee-detail", workspaceId, result.id],
      });
    },
    onError: (cause) => {
      setError(errorMessage(cause));
      const status = "status" in cause ? Number(cause.status) : 0;
      setUncertainCreate(![400, 401, 403, 404, 409, 422].includes(status));
    },
    onSettled: () => {
      submittingCreateRef.current = false;
    },
  });
  const saveMutation = useMutation({
    mutationFn: () =>
      saveEmployee(workspaceId, draft, props.employeeId ?? undefined),
    onSuccess: async (savedId) => {
      draftEditedRef.current = false;
      allowNextDraftRefreshRef.current = true;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees", workspaceId] }),
        queryClient.invalidateQueries({
          queryKey: ["employee-detail", workspaceId, savedId],
        }),
      ]);
      setError(null);
      if (props.creating) props.onCreated(savedId);
      else props.onSectionChange("profile");
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
  const terminationMutation = useMutation({
    mutationFn: (input: EmployeeTerminationInput) =>
      terminateEmployee(workspaceId, props.employeeId ?? "", input),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees", workspaceId] }),
        queryClient.invalidateQueries({
          queryKey: ["employee-detail", workspaceId, props.employeeId],
        }),
      ]);
      setTerminationOpen(false);
      allowNextDraftRefreshRef.current = true;
      setError(null);
      setTerminationNotice(
        `Employee terminated. ${result.releasedShiftCount} published shift${result.releasedShiftCount === 1 ? "" : "s"} released.`,
      );
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const inviteMutation = useMutation({
    mutationFn: () => {
      setCreateResult(null);
      return prepareEmployeeInvitation(
        workspaceId,
        props.employeeId ?? "",
        draft.invitation_email,
        inviteRoleId || null,
      );
    },
    onSuccess: async (result) => {
      setDevelopmentUrl(result.developmentUrl ?? null);
      setInviteRoleDirty(false);
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees", workspaceId] }),
        queryClient.invalidateQueries({
          queryKey: ["employee-detail", workspaceId, props.employeeId],
        }),
      ]);
    },
    onError: async (cause) => {
      setError(errorMessage(cause));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees", workspaceId] }),
        queryClient.invalidateQueries({
          queryKey: ["employee-detail", workspaceId, props.employeeId],
        }),
      ]);
    },
  });
  const retryInvitationMutation = useMutation({
    mutationFn: () =>
      retryEmployeeInvitation(workspaceId, props.employeeId ?? ""),
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
    onError: async (cause) => {
      setError(errorMessage(cause));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees", workspaceId] }),
        queryClient.invalidateQueries({
          queryKey: ["employee-detail", workspaceId, props.employeeId],
        }),
      ]);
    },
  });
  const revokeMutation = useMutation({
    mutationFn: () =>
      revokeEmployeeInvitation(workspaceId, props.employeeId ?? ""),
    onSuccess: async () => {
      setDevelopmentUrl(null);
      setInviteRoleDirty(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees", workspaceId] }),
        queryClient.invalidateQueries({
          queryKey: ["employee-detail", workspaceId, props.employeeId],
        }),
      ]);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const removeAccessMutation = useMutation({
    mutationFn: () => removeEmployeeAccess(workspaceId, props.employeeId ?? ""),
    onSuccess: async () => {
      setDevelopmentUrl(null);
      setInviteRoleDirty(false);
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
  const roleMutation = useMutation({
    mutationFn: (roleId: string) =>
      updateEmployeeRole(workspaceId, props.employeeId ?? "", roleId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees", workspaceId] }),
        queryClient.invalidateQueries({
          queryKey: ["employee-detail", workspaceId, props.employeeId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["employee-reference-data", workspaceId],
        }),
        refresh(),
      ]);
      setError(null);
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
    onSuccess: async (_revision, input) => {
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
      if (
        input.requirementId &&
        (input.action === "accept_requirement" ||
          input.action === "reject_requirement")
      ) {
        props.onOnboardingReviewSuccess?.({
          action: input.action,
          requirementId: input.requirementId,
        });
      }
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

  const busy =
    createMutation.isPending ||
    saveMutation.isPending ||
    inviteMutation.isPending ||
    retryInvitationMutation.isPending ||
    removeAccessMutation.isPending;
  const done =
    !props.creating &&
    !dirty &&
    (createResult !== null || saveMutation.isSuccess);
  const inviteRoles = (references.data?.inviteRoles ?? [])
    .filter((role) =>
      canInviteWithRole(
        context?.membership.role ?? "employee",
        role.accessClass,
      ),
    )
    .sort((a, b) => {
      const rank = (key: string | null) =>
        key === "employee"
          ? 0
          : key === "manager"
            ? 1
            : key === "admin"
              ? 2
              : 3;
      return (
        rank(a.systemKey) - rank(b.systemKey) || a.name.localeCompare(b.name)
      );
    });
  const inviteRoleReady = inviteRoles.some((role) => role.id === inviteRoleId);
  const inviteReady =
    readiness.employeeReady &&
    readiness.emailReady &&
    inviteRoleReady &&
    canManageAccess &&
    !readOnly;
  const changeSection = (section: EmployeeSection) => {
    if (busy || uncertainCreate) return;
    if (props.creating && section === "employment" && !readiness.namesReady)
      return;
    if (section !== activeSection) props.onSectionChange(section);
  };
  useEffect(() => {
    if (previousSectionRef.current === activeSection) return;
    previousSectionRef.current = activeSection;
    requestAnimationFrame(() => {
      if (
        activeSection === "profile" &&
        focusEmailOnProfileRef.current &&
        emailInputRef.current
      ) {
        focusEmailOnProfileRef.current = false;
        emailInputRef.current.focus();
      } else if (stepHeadingRef.current?.getClientRects().length)
        stepHeadingRef.current.focus();
      else
        dialogRef.current
          ?.querySelector<HTMLElement>(
            '.employee-create-steps [aria-current="step"]',
          )
          ?.focus();
      scrollRef.current?.scrollTo?.(0, 0);
    });
  }, [activeSection]);
  const requestClose = () => {
    if (busy) return;
    if (discardOpen) {
      pendingNavigationRef.current = null;
      setDiscardOpen(false);
      return;
    }
    if (props.creating && (dirty || inviteRoleDirty)) setDiscardOpen(true);
    else props.onClose();
  };
  closeRef.current = requestClose;
  useEffect(() => {
    openingFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => openingFocusRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!props.creating && props.employeeId === createdIdRef.current) {
      requestAnimationFrame(() => {
        if (stepHeadingRef.current?.getClientRects().length)
          stepHeadingRef.current.focus();
        else
          dialogRef.current
            ?.querySelector<HTMLElement>('[aria-label="Employee section"]')
            ?.focus();
      });
    }
  }, [props.creating, props.employeeId]);
  useEffect(() => {
    if (props.creating && activeSection !== props.section)
      props.onSectionChange(activeSection);
  }, [activeSection, props.creating, props.section, props.onSectionChange]);
  useEffect(() => {
    if (!props.creating || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [props.creating, dirty]);
  useEffect(() => {
    if (!props.creating || (!dirty && !busy)) return;
    let index = Number(window.history.state?.idx ?? 0);
    let restoring = false;
    const path = window.location.pathname;
    const pop = (event: PopStateEvent) => {
      if (allowNavigationRef.current) return;
      const nextIndex = Number(event.state?.idx ?? index);
      if (restoring) {
        restoring = false;
        event.stopImmediatePropagation();
        return;
      }
      const url = new URL(window.location.href);
      if (url.pathname === path && url.searchParams.get("mode") === "create") {
        index = nextIndex;
        return;
      }
      const delta = nextIndex - index;
      if (!delta) return;
      // Restore the current entry before asking. The router must not unmount the draft.
      event.stopImmediatePropagation();
      restoring = true;
      window.history.go(-delta);
      if (!busy) {
        pendingNavigationRef.current = () => {
          allowNavigationRef.current = true;
          window.history.go(delta);
        };
        setDiscardOpen(true);
      }
    };
    const follow = (event: MouseEvent) => {
      if (
        allowNavigationRef.current ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.button !== 0
      )
        return;
      const anchor = (
        event.target as Element | null
      )?.closest<HTMLAnchorElement>("a[href]");
      if (
        !anchor ||
        anchor.target === "_blank" ||
        dialogRef.current?.contains(anchor)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!busy) {
        pendingNavigationRef.current = () => {
          allowNavigationRef.current = true;
          window.location.assign(anchor.href);
        };
        setDiscardOpen(true);
      }
    };
    const unregisterHistoryGuard = registerEmployeeHistoryGuard(pop);
    document.addEventListener("click", follow, true);
    return () => {
      unregisterHistoryGuard();
      document.removeEventListener("click", follow, true);
    };
  }, [props.creating, dirty, busy, activeSection]);
  const startCreate = (invite: boolean) => {
    if (invite && !inviteRoles.some((role) => role.id === inviteRoleId)) {
      setInviteRoleAttempt((current) => current + 1);
      return;
    }
    if (
      busy ||
      submittingCreateRef.current ||
      uncertainCreate ||
      readOnly ||
      !readiness.employeeReady ||
      (invite && !inviteReady)
    )
      return;
    const command: EmployeeCreateCommand = {
      request_id: crypto.randomUUID(),
      employee: employeeInputSchema.parse(draft),
      invite_role_id: invite ? inviteRoleId : null,
    };
    commandRef.current = command;
    submittingCreateRef.current = true;
    createMutation.mutate(command);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || uncertainCreate || readOnly) return;
    if (done) {
      requestClose();
      return;
    }
    if (props.creating) {
      if (activeSection === "profile" && !readiness.employeeReady) {
        if (readiness.namesReady) changeSection("employment");
      } else startCreate(false);
      return;
    }
    const parsed = employeeInputSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the employee details");
      return;
    }
    if (documentPreviewBlocked) return;
    saveMutation.mutate();
  };

  const handleInviteRoleChange = (roleId: string): void => {
    setInviteRoleId(roleId);
    setInviteRoleDirty(true);
    setInviteRoleAttempt(0);
  };
  const handleAddEmail = (): void => {
    focusEmailOnProfileRef.current = true;
    changeSection("profile");
  };

  return (
    <div className="employee-drawer-layer" role="presentation">
      <button
        type="button"
        className="employee-drawer-backdrop"
        aria-label="Close employee details"
        onClick={requestClose}
      />
      <aside
        className={`employee-drawer${props.creating ? " employee-drawer-create" : ""}`}
        ref={dialogRef}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.nativeEvent.isComposing &&
            !event.defaultPrevented &&
            !terminationOpen &&
            !discardOpen &&
            (activeSection === "profile" || activeSection === "employment") &&
            (event.target instanceof HTMLHeadingElement ||
              (event.target instanceof HTMLInputElement &&
                !event.target
                  .getAttribute("aria-label")
                  ?.startsWith("Search ")))
          ) {
            event.preventDefault();
            if (!event.repeat) submit(event);
            return;
          }
          if (!props.creating || event.key !== "Tab") return;
          const root = discardOpen
            ? dialogRef.current?.querySelector("[data-discard-dialog]")
            : dialogRef.current;
          const items = Array.from(
            root?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
            ) ?? [],
          ).filter((item) => item.getClientRects().length > 0);
          const first = items[0],
            last = items[items.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              !items.includes(document.activeElement as HTMLElement))
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-drawer-title"
        data-employee-drawer-panel="true"
      >
        <DrawerForm
          {...(DrawerForm === "form"
            ? { onSubmit: submit, noValidate: props.creating }
            : {})}
          className="employee-drawer-form"
          aria-busy={busy}
        >
          <div className="employee-drawer-main">
            <nav
              className="employee-summary-rail"
              aria-label="Employee sections"
            >
              <div className="employee-identity">
                <span className="employee-avatar" aria-hidden>
                  {(draft.first_name || "N").slice(0, 1).toUpperCase()}
                </span>
                <strong id="employee-drawer-title">
                  {props.creating
                    ? "New employee"
                    : (detail.data?.display_name ?? "Employee details")}
                </strong>
                {!props.creating ? (
                  <span>
                    {detail.data?.employee_code ?? "Code assigned on save"}
                  </span>
                ) : null}
                {detail.data ? (
                  <span
                    className={`employee-state state-${detail.data.display_status}`}
                  >
                    {statusLabel(detail.data.display_status)}
                  </span>
                ) : null}
                {draft.is_remote || draft.is_excluded_from_schedule ? (
                  <div
                    className="employee-work-statuses"
                    aria-label="Work status"
                  >
                    {draft.is_excluded_from_schedule ? (
                      <span className="employee-work-status danger">
                        Off schedule
                      </span>
                    ) : null}
                    {draft.is_remote ? (
                      <span className="employee-work-status warning">
                        Remote
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="employee-section-links">
                {visibleSections.map(([key, label, Icon], index) => (
                  <button
                    type="button"
                    key={key}
                    className={activeSection === key ? "active" : ""}
                    aria-current={
                      activeSection === key
                        ? props.creating
                          ? "step"
                          : "page"
                        : undefined
                    }
                    disabled={
                      busy ||
                      uncertainCreate ||
                      (props.creating &&
                        key === "employment" &&
                        !readiness.namesReady)
                    }
                    data-group-start={index === 3 || index === 4}
                    onClick={() => changeSection(key)}
                  >
                    <Icon size={16} aria-hidden />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </nav>

            <div className="employee-drawer-content">
              <div className="employee-drawer-mobile-header">
                {props.creating ? (
                  <nav
                    className="employee-create-steps"
                    aria-label="Create employee steps"
                  >
                    {visibleSections.map(([key, label]) => (
                      <button
                        type="button"
                        key={key}
                        aria-current={
                          activeSection === key ? "step" : undefined
                        }
                        disabled={
                          busy ||
                          uncertainCreate ||
                          (key === "employment" && !readiness.namesReady)
                        }
                        onClick={() => changeSection(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </nav>
                ) : (
                  <select
                    aria-label="Employee section"
                    value={props.section}
                    onChange={(event) =>
                      changeSection(
                        employeeSectionSchema.parse(event.target.value),
                      )
                    }
                  >
                    {visibleSections.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="icon-button"
                  type="button"
                  onClick={requestClose}
                  aria-label="Close employee details"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>
              <header className="employee-section-header">
                <div>
                  <h2
                    tabIndex={-1}
                    ref={stepHeadingRef}
                    style={{ outline: "none" }}
                  >
                    {sections.find(([key]) => key === activeSection)?.[1]}
                  </h2>
                  {!props.creating ? (
                    <p>{sectionDescription(props.section)}</p>
                  ) : null}
                </div>
                <button
                  className="icon-button employee-drawer-close"
                  type="button"
                  onClick={requestClose}
                  aria-label="Close employee details"
                  title="Close"
                >
                  <X size={18} aria-hidden />
                </button>
              </header>
              <div
                className="employee-section-scroll"
                data-section={activeSection}
                ref={scrollRef}
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
                      activeSection,
                      draft,
                      updateDraft,
                      detail.data,
                      props.creating && references.data
                        ? { ...references.data, inviteRoles }
                        : references.data,
                      inviteRoleId,
                      handleInviteRoleChange,
                      emailInputRef,
                      handleAddEmail,
                      readOnly || busy || uncertainCreate,
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
                      () => retryInvitationMutation.mutate(),
                      retryInvitationMutation.isPending,
                      () => revokeMutation.mutate(),
                      revokeMutation.isPending,
                      () => removeAccessMutation.mutate(),
                      removeAccessMutation.isPending,
                      context?.membership.role ?? "employee",
                      (roleId) => roleMutation.mutate(roleId),
                      roleMutation.isPending,
                      props.creating,
                    )
                  : null}
                {needsDocumentPreview && (
                  <EmployeeAssignmentDocumentPreview query={documentPreview} />
                )}
                {props.creating && references.isLoading ? (
                  <p role="status">Loading locations, jobs and roles...</p>
                ) : null}
                {props.creating && references.isError ? (
                  <p role="alert">
                    Couldn't load locations, jobs or roles.{" "}
                    <button
                      type="button"
                      onClick={() => void references.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                ) : null}
                {props.creating && references.data?.inviteRolesError ? (
                  <p role="alert">
                    Couldn't load invite roles.{" "}
                    <button
                      type="button"
                      onClick={() => void references.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                ) : null}
                {props.creating &&
                activeSection === "employment" &&
                readiness.emailPresent ? (
                  <div className="employee-create-invite-summary">
                    <MailPlus size={18} aria-hidden />
                    <div>
                      <strong>{draft.invitation_email}</strong>
                      <span>
                        {inviteRoles.find((role) => role.id === inviteRoleId)
                          ?.name ?? "Choose an invite role"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      title="Edit invitation"
                      aria-label="Edit invitation"
                      onClick={() => changeSection("profile")}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                ) : null}
                {props.creating &&
                activeSection === "employment" &&
                readiness.emailPresent &&
                !readiness.emailReady ? (
                  <p className="employee-field-error" role="alert">
                    Enter a valid email address in Profile.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {developmentUrl ? (
            <div className="employee-drawer-notice">
              <span>Development invitation prepared.</span>
              <a href={developmentUrl}>Open acceptance link</a>
            </div>
          ) : null}
          {terminationNotice ? (
            <div className="employee-drawer-notice" role="status">
              <span>{terminationNotice}</span>
            </div>
          ) : null}
          {createResult ? (
            <div className="employee-drawer-notice" role="status">
              <span>
                {!createResult.invitation
                  ? "Employee saved."
                  : createResult.invitation.deliveryStatus === "sent"
                    ? "Employee saved. Invitation sent."
                    : createResult.invitation.deliveryStatus === "failed"
                      ? "Employee saved. Invitation couldn't be sent."
                      : "Employee saved. Invitation delivery is pending."}
              </span>
              {createResult.invitation &&
              createResult.invitation.deliveryStatus !== "sent" &&
              commandRef.current ? (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => createMutation.mutate(commandRef.current!)}
                >
                  Retry invitation
                </Button>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p className="employee-drawer-error" role="alert">
              {error}
            </p>
          ) : null}
          {uncertainCreate ? (
            <div className="employee-drawer-notice" role="alert">
              <span>Check the previous request before continuing.</span>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  commandRef.current &&
                  createMutation.mutate(commandRef.current)
                }
              >
                Retry request
              </Button>
            </div>
          ) : null}
          {props.creating ? (
            <footer className="employee-drawer-footer employee-create-footer">
              <div />
              {canManageAccess ? (
                <div className="employee-create-role">
                  <InviteRoleField
                    roles={inviteRoles}
                    inviteRoleId={inviteRoleId}
                    onInviteRoleChange={handleInviteRoleChange}
                    disabled={
                      busy ||
                      uncertainCreate ||
                      readOnly ||
                      !readiness.emailReady
                    }
                    invalidAttempt={inviteRoleReady ? 0 : inviteRoleAttempt}
                  />
                </div>
              ) : null}
              <div className="employee-drawer-actions">
                <Button
                  className="secondary-button"
                  type="button"
                  disabled={busy || uncertainCreate}
                  onClick={() =>
                    activeSection === "employment"
                      ? changeSection("profile")
                      : requestClose()
                  }
                >
                  {activeSection === "employment" ? (
                    <>
                      <ArrowLeft size={16} aria-hidden />
                      Back
                    </>
                  ) : (
                    "Cancel"
                  )}
                </Button>
                {canManageAccess ? (
                  <Button
                    type="button"
                    disabled={
                      busy ||
                      uncertainCreate ||
                      !readiness.employeeReady ||
                      !readiness.emailReady ||
                      !canManageAccess ||
                      readOnly
                    }
                    onClick={() => startCreate(true)}
                  >
                    <MailPlus size={16} aria-hidden />
                    {createMutation.isPending &&
                    commandRef.current?.invite_role_id
                      ? "Inviting..."
                      : "Invite"}
                  </Button>
                ) : null}
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    uncertainCreate ||
                    readOnly ||
                    (activeSection === "profile"
                      ? !readiness.namesReady
                      : !readiness.employeeReady)
                  }
                >
                  {activeSection === "profile" && !readiness.employeeReady ? (
                    <>
                      Next
                      <ArrowRight size={16} aria-hidden />
                    </>
                  ) : createMutation.isPending ? (
                    "Saving..."
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </footer>
          ) : activeSection === "availability" ? null : (
            <footer className="employee-drawer-footer">
              <div>
                {!props.creating && canArchive && !targetIsOwner ? (
                  <button
                    type="button"
                    className={`employee-lifecycle-button${archived ? " restore" : ""}`}
                    disabled={
                      archiveMutation.isPending ||
                      terminationMutation.isPending ||
                      (!archived && dirty)
                    }
                    title={
                      !archived && dirty
                        ? "Save profile changes before terminating the employee"
                        : undefined
                    }
                    onClick={() => {
                      if (!archived) {
                        setError(null);
                        setTerminationNotice(null);
                        setTerminationOpen(true);
                        return;
                      }
                      if (
                        window.confirm(
                          "Restore this employee record for rehire? Workspace access stays off until they accept a new invite and complete onboarding.",
                        )
                      )
                        archiveMutation.mutate(false);
                    }}
                  >
                    {archived ? (
                      <RotateCcw size={16} aria-hidden />
                    ) : (
                      <Archive size={16} aria-hidden />
                    )}
                    {archived ? "Restore employee" : "Terminate employee"}
                  </button>
                ) : null}
              </div>
              {!detail.data?.user_id &&
              readiness.emailPresent &&
              canManageAccess ? (
                <div className="employee-create-role">
                  <InviteRoleField
                    roles={inviteRoles}
                    inviteRoleId={inviteRoleId}
                    onInviteRoleChange={handleInviteRoleChange}
                    disabled={
                      busy ||
                      readOnly ||
                      detail.data?.invitation?.status === "pending"
                    }
                    invalidAttempt={inviteRoleReady ? 0 : inviteRoleAttempt}
                  />
                </div>
              ) : null}
              <div className="employee-drawer-actions">
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
                    disabled={
                      busy ||
                      !readiness.emailReady ||
                      (dirty && !readiness.employeeReady)
                    }
                    title={
                      !inviteRoleReady
                        ? "Choose a role before sending the invitation"
                        : detail.data?.invitation?.status === "pending"
                          ? "Create a new link and invalidate the current invitation"
                          : undefined
                    }
                    onClick={async () => {
                      if (!inviteRoleReady) {
                        setInviteRoleAttempt((current) => current + 1);
                        return;
                      }
                      if (dirty) {
                        try {
                          await saveMutation.mutateAsync();
                        } catch {
                          return;
                        }
                      }
                      inviteMutation.mutate();
                    }}
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
                    disabled={
                      busy || documentPreviewBlocked || (!dirty && !done)
                    }
                  >
                    {saveMutation.isPending
                      ? "Saving"
                      : done
                        ? "Done"
                        : props.creating
                          ? "Save"
                          : "Save changes"}
                  </Button>
                ) : null}
              </div>
            </footer>
          )}
        </DrawerForm>
        {discardOpen ? (
          <div className="employee-discard-overlay">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="employee-discard-title"
              data-discard-dialog
            >
              <h2 id="employee-discard-title">Discard new employee?</h2>
              <div>
                <Button
                  type="button"
                  className="secondary-button"
                  autoFocus
                  onClick={() => {
                    pendingNavigationRef.current = null;
                    setDiscardOpen(false);
                  }}
                >
                  Keep editing
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    allowNavigationRef.current = true;
                    if (pendingNavigationRef.current)
                      pendingNavigationRef.current();
                    else props.onClose();
                  }}
                >
                  Discard
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {terminationOpen && detail.data ? (
          <EmployeeTerminationDialog
            employeeName={`${detail.data.first_name} ${detail.data.last_name}`}
            locations={(references.data?.locations ?? []).filter((location) =>
              detail.data?.locations.some(
                (assignment) => assignment.id === location.id,
              ),
            )}
            primaryLocationId={detail.data.primary_location_id}
            pending={terminationMutation.isPending}
            error={terminationMutation.isError ? error : null}
            onClose={() => setTerminationOpen(false)}
            onSubmit={(input) => terminationMutation.mutate(input)}
          />
        ) : null}
      </aside>
    </div>
  );
}

function EmployeeTerminationDialog({
  employeeName,
  locations,
  primaryLocationId,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  readonly employeeName: string;
  readonly locations: readonly EmployeeOption[];
  readonly primaryLocationId: string | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (input: EmployeeTerminationInput) => void;
}) {
  const titleId = useId();
  const timezoneOptions = Array.from(
    new Set(locations.map((location) => location.timezone).filter(Boolean)),
  ) as string[];
  const primaryTimezone =
    locations.find((location) => location.id === primaryLocationId)?.timezone ??
    timezoneOptions[0] ??
    "";
  const [timezone, setTimezone] = useState(primaryTimezone);
  const [effectiveLocal, setEffectiveLocal] = useState(() =>
    localDateTimeValue(new Date(), primaryTimezone || undefined),
  );
  const [timeEntryAction, setTimeEntryAction] =
    useState<EmployeeTerminationInput["timeEntryAction"]>("block");
  const [reason, setReason] = useState("");
  const idempotencyKey = useRef(crypto.randomUUID());

  return (
    <div className="employee-termination-layer" role="presentation">
      <button
        type="button"
        className="employee-termination-backdrop"
        aria-label="Close termination dialog"
        onClick={onClose}
      />
      <section
        className="employee-termination-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <div>
            <h2 id={titleId}>Terminate employee</h2>
            <p>{employeeName}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close termination dialog"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({
              effectiveLocal,
              worksiteTimezone: timezone,
              timeEntryAction,
              reason,
              idempotencyKey: idempotencyKey.current,
            });
          }}
        >
          <label>
            Effective date and time
            <input
              type="datetime-local"
              value={effectiveLocal}
              max={localDateTimeValue(new Date(), timezone || undefined)}
              onChange={(event) => setEffectiveLocal(event.target.value)}
              required
            />
          </label>
          <label>
            Worksite timezone
            <select
              value={timezone}
              onChange={(event) => {
                const nextTimezone = event.target.value;
                setTimezone(nextTimezone);
                setEffectiveLocal(localDateTimeValue(new Date(), nextTimezone));
              }}
              required
            >
              {timezoneOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Open time entry handling
            <select
              value={timeEntryAction}
              onChange={(event) =>
                setTimeEntryAction(
                  event.target
                    .value as EmployeeTerminationInput["timeEntryAction"],
                )
              }
            >
              <option value="block">Block if a time entry is open</option>
              <option value="close_at">Close at the effective time</option>
              <option value="keep_open">Keep open for manager review</option>
            </select>
          </label>
          <label>
            Reason
            <textarea
              value={reason}
              minLength={3}
              maxLength={240}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </label>
          <p className="employee-termination-warning">
            Access will be suspended. Published shifts starting at or after the
            effective time will become open and create manager follow-ups.
          </p>
          {!timezoneOptions.length ? (
            <p className="employee-drawer-error" role="alert">
              An active employee location with a timezone is required.
            </p>
          ) : null}
          {error ? (
            <p className="employee-drawer-error" role="alert">
              {error}
            </p>
          ) : null}
          <footer>
            <Button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !timezoneOptions.length}>
              {pending ? "Terminating" : "Confirm termination"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function localDateTimeValue(date: Date, timezone?: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function DrawerAvailability({ employeeId }: { employeeId: string }) {
  const { context } = useAuth();
  return context?.workspace.id ? (
    <WeeklyPreferencesPanel
      workspaceId={context.workspace.id}
      employeeId={employeeId}
      audience="manager"
    />
  ) : (
    <p role="status">Loading workspace...</p>
  );
}

function renderSection(
  section: EmployeeSection,
  draft: EmployeeInput,
  setDraft: React.Dispatch<React.SetStateAction<EmployeeInput>>,
  detail: EmployeeDetail | undefined,
  references: Awaited<ReturnType<typeof loadEmployeeReferenceData>> | undefined,
  inviteRoleId: string,
  onInviteRoleChange: (roleId: string) => void,
  emailInputRef: React.RefObject<HTMLInputElement | null>,
  onAddEmail: () => void,
  readOnly: boolean,
  canManageAccess: boolean,
  onboarding: EmployeeOnboardingManager | null | undefined,
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
  onRetryInvitation: () => void,
  retryingInvitation: boolean,
  onRevokeInvitation: () => void,
  revokingInvitation: boolean,
  onRemoveAccess: () => void,
  removingAccess: boolean,
  actorRole: WorkspaceRole,
  onRoleChange: (roleId: string) => void,
  changingRole: boolean,
  creating = false,
) {
  if (section === "profile")
    return (
      <ProfileSection
        creating={creating}
        draft={draft}
        setDraft={setDraft}
        readOnly={readOnly}
        linked={Boolean(detail?.user_id)}
        identityLocked={detail?.display_status === "active"}
        invitePending={detail?.invitation?.status === "pending"}
        accountEmail={detail?.account_email ?? null}
        privateContact={detail?.private_contact ?? null}
        emailInputRef={emailInputRef}
        onboarding={onboarding}
        onboardingLoading={onboardingLoading}
        canReviewDocuments={canReviewDocuments}
        onReview={onReview}
        reviewing={reviewing}
        onOpenDocument={onOpenDocument}
        openingDocument={openingDocument}
      />
    );
  if (section === "employment")
    return (
      <EmploymentSection
        creating={creating}
        draft={draft}
        setDraft={setDraft}
        readOnly={readOnly}
        references={references}
      />
    );
  if (section === "availability")
    return detail ? (
      <DrawerAvailability employeeId={detail.id} />
    ) : (
      <p>Save the employee first to enter availability.</p>
    );
  if (section === "documents")
    return detail ? (
      <EmployeeDocumentPanel employeeId={detail.id} />
    ) : (
      <p>Save the employee before reviewing documents.</p>
    );
  if (section === "access")
    return (
      <AccessSection
        draft={draft}
        detail={detail}
        roles={references?.inviteRoles ?? []}
        inviteRoleId={inviteRoleId}
        onAddEmail={onAddEmail}
        readOnly={
          Boolean(detail?.archived_at) ||
          !canManageAccess ||
          detail?.role_name === "Owner"
        }
        onRetryInvitation={onRetryInvitation}
        retryingInvitation={retryingInvitation}
        onRevokeInvitation={onRevokeInvitation}
        revokingInvitation={revokingInvitation}
        onRemoveAccess={onRemoveAccess}
        removingAccess={removingAccess}
        actorRole={actorRole}
        onRoleChange={onRoleChange}
        changingRole={changingRole}
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
  readonly onboarding: EmployeeOnboardingManager | null | undefined;
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
  const permissions = useAuth().context?.permissions ?? [];
  const canReadDocuments = permissions.includes("employee_documents.read");
  const canReview = (kind: EmployeeOnboardingRequirement["kind"]) =>
    kind === "document"
      ? canReviewDocuments
      : permissions.includes(
          kind === "profile"
            ? "employees.private.manage"
            : "employee_onboarding.review",
        );
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
      </div>
      {requirements.length ? (
        requirements.map((requirement) => (
          <article
            key={requirement.id}
            className="manager-onboarding-item"
            aria-label={`Review ${requirement.title}`}
          >
            <div>
              <strong>{requirement.title}</strong>
              <span>{requirement.status.replaceAll("_", " ")}</span>
            </div>
            {requirement.rejection_reason ? (
              <p>{requirement.rejection_reason}</p>
            ) : null}
            {requirement.kind === "document" &&
            canReadDocuments &&
            ["awaiting_review", "completed", "rejected"].includes(
              requirement.status,
            ) ? (
              <Button
                type="button"
                className="secondary-button"
                aria-label={`Open ${requirement.title}`}
                disabled={openingDocument}
                onClick={() => onOpenDocument(requirement.id)}
              >
                Open document
              </Button>
            ) : null}
            {requirement.requires_review &&
            requirement.status === "awaiting_review" ? (
              <div>
                <Button
                  type="button"
                  className="secondary-button"
                  aria-label={`Request changes for ${requirement.title}`}
                  disabled={reviewing || !canReview(requirement.kind)}
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
                  aria-label={`Accept ${requirement.title}`}
                  disabled={reviewing || !canReview(requirement.kind)}
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
      {activationReady && permissions.includes("employee_onboarding.review") ? (
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
  creating = false,
  draft,
  setDraft,
  readOnly,
  linked,
  identityLocked,
  invitePending,
  accountEmail,
  privateContact,
  emailInputRef,
  onboarding,
  onboardingLoading,
  canReviewDocuments,
  onReview,
  reviewing,
  onOpenDocument,
  openingDocument,
}: {
  creating?: boolean;
  draft: EmployeeInput;
  setDraft: React.Dispatch<React.SetStateAction<EmployeeInput>>;
  readOnly: boolean;
  linked: boolean;
  identityLocked: boolean;
  invitePending: boolean;
  accountEmail: string | null;
  privateContact: EmployeeDetail["private_contact"];
  emailInputRef: React.RefObject<HTMLInputElement | null>;
  onboarding: EmployeeOnboardingManager | null | undefined;
  onboardingLoading: boolean;
  canReviewDocuments: boolean;
  onReview: (
    action: "accept_requirement" | "reject_requirement" | "activate",
    requirementId: string | null,
    reason: string,
  ) => void;
  reviewing: boolean;
  onOpenDocument: (requirementId: string) => void;
  openingDocument: boolean;
}) {
  const canReadPrivate =
    useAuth().context?.permissions.includes("employees.private.read") ?? false;
  const profileReviewVisible =
    canReadPrivate &&
    onboarding?.requirements.some(
      (requirement) =>
        requirement.kind === "profile" &&
        requirement.requires_review &&
        requirement.status !== "completed",
    );
  const identityReadOnly = readOnly || identityLocked;
  const pendingInviteHint = invitePending
    ? "Locked while invitation is pending"
    : undefined;
  const emailValue = linked
    ? (accountEmail ?? draft.invitation_email)
    : draft.invitation_email;
  return (
    <div className="employee-profile-sections">
      <ProfileGroup title="Identity">
        <div className="employee-form-grid">
          <Field
            label="First name"
            required={creating}
            value={draft.first_name}
            disabled={identityReadOnly}
            readOnly={invitePending}
            hint={
              identityLocked ? "Locked after activation" : pendingInviteHint
            }
            onChange={(value) =>
              setDraft((current) => ({ ...current, first_name: value }))
            }
          />
          <Field
            label="Last name"
            required={creating}
            value={draft.last_name}
            disabled={identityReadOnly}
            readOnly={invitePending}
            hint={
              identityLocked ? "Locked after activation" : pendingInviteHint
            }
            onChange={(value) =>
              setDraft((current) => ({ ...current, last_name: value }))
            }
          />
          <Field
            label="Preferred name"
            value={draft.preferred_name}
            disabled={identityReadOnly}
            onChange={(value) =>
              setDraft((current) => ({ ...current, preferred_name: value }))
            }
          />
          {!creating && canReadPrivate ? (
            <ReadOnlyField
              label="Date of birth"
              value={privateContact?.date_of_birth ?? null}
            />
          ) : null}
        </div>
      </ProfileGroup>

      <ProfileGroup title="Contact">
        <div className="employee-form-grid employee-contact-grid">
          <Field
            label="E-mail"
            value={emailValue}
            type="email"
            disabled={readOnly}
            readOnly={linked || invitePending}
            inputRef={emailInputRef}
            hint={linked ? "Verified account e-mail" : pendingInviteHint}
            onChange={(value) =>
              setDraft((current) => ({ ...current, invitation_email: value }))
            }
          />
          {canReadPrivate && (
            <ReadOnlyField
              label="Phone"
              value={privateContact?.phone ?? null}
            />
          )}
          {!creating && canReadPrivate ? (
            <ReadOnlyField
              label="Emergency contact"
              value={privateContact?.emergency_contact_name ?? null}
            />
          ) : null}
          {!creating && canReadPrivate ? (
            <ReadOnlyField
              label="Relationship"
              value={privateContact?.emergency_contact_relationship ?? null}
            />
          ) : null}
          {!creating && canReadPrivate ? (
            <ReadOnlyField
              label="Emergency phone"
              value={privateContact?.emergency_contact_phone ?? null}
            />
          ) : null}
          {!creating && canReadPrivate ? (
            <ReadOnlyField
              label="Emergency e-mail"
              value={privateContact?.emergency_contact_email || null}
            />
          ) : null}
        </div>
      </ProfileGroup>

      {canReadPrivate && (
        <ProfileGroup title="Address">
          <div className="employee-form-grid employee-address-grid">
            <ReadOnlyField
              label="Street address"
              value={privateContact?.street_address ?? null}
              wide
            />
            <ReadOnlyField label="City" value={privateContact?.city ?? null} />
            <ReadOnlyField
              label="State"
              value={privateContact?.region ?? null}
            />
            <ReadOnlyField
              label="ZIP code"
              value={privateContact?.postal_code ?? null}
            />
            <ReadOnlyField
              label="Country"
              value={privateContact?.country_code ?? null}
            />
          </div>
        </ProfileGroup>
      )}

      {profileReviewVisible ? (
        <section className="employee-readonly-panel">
          <h3>Legal name review</h3>
          <OnboardingReviewPanel
            onboarding={onboarding}
            loading={onboardingLoading}
            kinds={["profile"]}
            canReviewDocuments={canReviewDocuments}
            onReview={onReview}
            reviewing={reviewing}
            onOpenDocument={onOpenDocument}
            openingDocument={openingDocument}
          />
        </section>
      ) : null}
    </div>
  );
}

function EmploymentSection({
  creating = false,
  draft,
  setDraft,
  readOnly,
  references,
}: {
  creating?: boolean;
  draft: EmployeeInput;
  setDraft: React.Dispatch<React.SetStateAction<EmployeeInput>>;
  readOnly: boolean;
  references: Awaited<ReturnType<typeof loadEmployeeReferenceData>> | undefined;
}) {
  return (
    <div className="employee-form-stack">
      {creating ? (
        <h3 className="employee-form-section-title">Work mode</h3>
      ) : null}
      <div className="employee-toggle-grid">
        <label
          className="employee-work-mode remote"
          data-selected={draft.is_remote ? "true" : "false"}
        >
          <input
            type="checkbox"
            checked={draft.is_remote ?? false}
            disabled={readOnly}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                is_remote: event.target.checked,
              }))
            }
          />
          <span>Remote</span>
        </label>
        <label
          className="employee-work-mode off-schedule"
          data-selected={draft.is_excluded_from_schedule ? "true" : "false"}
        >
          <input
            type="checkbox"
            checked={draft.is_excluded_from_schedule ?? false}
            disabled={readOnly}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                is_excluded_from_schedule: event.target.checked,
              }))
            }
          />
          <span>Exclude from schedule</span>
        </label>
      </div>
      <AssignmentPicker
        label="Locations"
        required={!draft.is_remote && !draft.is_excluded_from_schedule}
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
        required={!draft.is_remote && !draft.is_excluded_from_schedule}
        options={references?.jobs ?? []}
        selected={draft.job_ids}
        primary={draft.primary_job_id}
        disabled={readOnly}
        searchable={false}
        onChange={(ids, primary) =>
          setDraft((current) => ({
            ...current,
            job_ids: ids,
            primary_job_id: primary,
          }))
        }
      />
      <Field
        label="Start date"
        type="date"
        value={draft.start_date}
        disabled={readOnly}
        onChange={(value) =>
          setDraft((current) => ({ ...current, start_date: value }))
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
  detail,
  roles,
  inviteRoleId,
  onAddEmail,
  readOnly,
  onRetryInvitation,
  retryingInvitation,
  onRevokeInvitation,
  revokingInvitation,
  onRemoveAccess,
  removingAccess,
  actorRole,
  onRoleChange,
  changingRole,
}: {
  draft: EmployeeInput;
  detail: EmployeeDetail | undefined;
  roles: readonly InviteRoleOption[];
  inviteRoleId: string;
  onAddEmail: () => void;
  readOnly: boolean;
  onRetryInvitation: () => void;
  retryingInvitation: boolean;
  onRevokeInvitation: () => void;
  revokingInvitation: boolean;
  onRemoveAccess: () => void;
  removingAccess: boolean;
  actorRole: WorkspaceRole;
  onRoleChange: (roleId: string) => void;
  changingRole: boolean;
}) {
  const linked = Boolean(detail?.user_id);
  const currentRoleId = detail?.role_id ?? "";
  const invitation = detail?.invitation ?? null;
  const email = draft.invitation_email.trim();
  const assignableRoles = roles.filter((role) =>
    canAssignRole(actorRole, role.accessClass),
  );
  const inviteRoleName = assignableRoles.find(
    (role) => role.id === inviteRoleId,
  )?.name;
  const invitationExpired = Boolean(
    invitation?.status === "pending" &&
    Date.parse(invitation.expires_at) <= Date.now(),
  );
  const state = linked
    ? detail?.display_status === "active"
      ? "linked"
      : "onboarding"
    : !email
      ? "no_email"
      : invitationExpired || invitation?.status === "expired"
        ? "expired"
        : invitation?.status === "pending" &&
            invitation.delivery_status === "failed"
          ? "failed"
          : invitation?.status === "pending"
            ? "invited"
            : invitation?.status === "revoked"
              ? "revoked"
              : invitation?.status === "declined"
                ? "declined"
                : invitation?.status === "accepted"
                  ? "access_removed"
                  : "ready";

  const stateContent = {
    no_email: {
      icon: <AlertTriangle size={18} aria-hidden />,
      title: "No email",
      copy: "Add an email before sending an invite.",
      tone: "warning",
    },
    ready: {
      icon: <MailPlus size={18} aria-hidden />,
      title: "Ready to invite",
      copy: `The invitation will grant the ${inviteRoleName ?? "selected"} role.`,
      tone: "neutral",
    },
    invited: {
      icon: <Clock3 size={18} aria-hidden />,
      title: "Invitation sent",
      copy: invitation
        ? `Sent to ${invitation.email}. Expires ${formatDateTime(invitation.expires_at)}.`
        : "The invitation is waiting for acceptance.",
      tone: "warning",
    },
    failed: {
      icon: <AlertTriangle size={18} aria-hidden />,
      title: "Invitation delivery failed",
      copy:
        invitation?.delivery_error ??
        "Retry the same link, or use Resend to replace it with a new link.",
      tone: "danger",
    },
    expired: {
      icon: <AlertTriangle size={18} aria-hidden />,
      title: "Invitation expired",
      copy: "Use Resend to create a new invitation link.",
      tone: "danger",
    },
    revoked: {
      icon: <KeyRound size={18} aria-hidden />,
      title: "Invitation revoked",
      copy: "The previous link no longer grants access. Send a new invite when ready.",
      tone: "neutral",
    },
    declined: {
      icon: <KeyRound size={18} aria-hidden />,
      title: "Invitation declined",
      copy: "The employee declined the previous invitation. You can send a new one.",
      tone: "neutral",
    },
    access_removed: {
      icon: <KeyRound size={18} aria-hidden />,
      title: "Access removed",
      copy: "The employee record and work history are preserved. A new invite starts fresh onboarding.",
      tone: "neutral",
    },
    onboarding: {
      icon: <Clock3 size={18} aria-hidden />,
      title: "Onboarding in progress",
      copy: "The account is linked and waiting for onboarding completion.",
      tone: "warning",
    },
    linked: {
      icon: <CheckCircle2 size={18} aria-hidden />,
      title: "Onboarded and linked",
      copy: "This employee has active workspace access.",
      tone: "success",
    },
  }[state];

  return (
    <div className="employee-access-sections">
      <section className="employee-access-group">
        <header>
          <div>
            <h3>Account access</h3>
            <p>Invitation, onboarding, and workspace role.</p>
          </div>
          <KeyRound size={18} aria-hidden />
        </header>
        <div className={`employee-access-state ${stateContent.tone}`}>
          {stateContent.icon}
          <div>
            <strong>{stateContent.title}</strong>
            <p>{stateContent.copy}</p>
          </div>
          {state === "no_email" && !readOnly ? (
            <Button type="button" onClick={onAddEmail}>
              Add email
            </Button>
          ) : state === "failed" && !readOnly ? (
            <Button
              type="button"
              disabled={retryingInvitation}
              onClick={onRetryInvitation}
            >
              <RotateCcw size={15} aria-hidden />
              {retryingInvitation ? "Retrying" : "Retry"}
            </Button>
          ) : null}
        </div>

        {linked ? (
          <div className="employee-linked-access-controls">
            <label className="employee-field">
              <span>Workspace role</span>
              <select
                aria-label="Workspace role"
                value={currentRoleId}
                disabled={
                  readOnly || changingRole || assignableRoles.length === 0
                }
                onChange={(event) => onRoleChange(event.target.value)}
              >
                {currentRoleId &&
                !assignableRoles.some((role) => role.id === currentRoleId) ? (
                  <option value={currentRoleId}>
                    {detail?.role_name ?? "Current role"}
                  </option>
                ) : null}
                {assignableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <small>Owner access is managed separately.</small>
            </label>
            {!readOnly && detail?.role_name !== "Owner" ? (
              <Button
                className="secondary-button employee-remove-access"
                type="button"
                disabled={removingAccess}
                onClick={() => {
                  if (
                    window.confirm(
                      "Remove this employee's workspace access? Their employee record, shifts, time history, and kiosk access will be preserved.",
                    )
                  )
                    onRemoveAccess();
                }}
              >
                <KeyRound size={15} aria-hidden />
                {removingAccess ? "Removing" : "Remove access"}
              </Button>
            ) : null}
          </div>
        ) : state !== "no_email" ? (
          <dl className="employee-access-details">
            <div>
              <dt>E-mail</dt>
              <dd>{invitation?.email ?? email}</dd>
            </div>
            <div>
              <dt>Invite role</dt>
              <dd>{inviteRoleName ?? "Choose a role"}</dd>
            </div>
            {invitation ? (
              <div>
                <dt>Invitation status</dt>
                <dd>{stateContent.title}</dd>
              </div>
            ) : null}
            {invitation?.delivery_attempted_at ? (
              <div>
                <dt>Last delivery attempt</dt>
                <dd>{formatDateTime(invitation.delivery_attempted_at)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {invitation?.status === "pending" && !invitationExpired && !readOnly ? (
          <div className="employee-pending-invite-actions">
            <Button
              className="secondary-button"
              type="button"
              disabled={retryingInvitation}
              onClick={onRetryInvitation}
            >
              <RotateCcw size={15} aria-hidden />
              {retryingInvitation ? "Sending" : "Send reminder"}
            </Button>
            <Button
              className="secondary-button employee-revoke-invite"
              type="button"
              disabled={revokingInvitation}
              onClick={onRevokeInvitation}
            >
              Revoke invitation
            </Button>
          </div>
        ) : null}
      </section>

      <section className="employee-access-group">
        <header>
          <div>
            <h3>Profile photo</h3>
            <p>
              Remove the workspace profile photo shown for this employee in this
              workspace.
            </p>
          </div>
          <ImageOff size={18} aria-hidden />
        </header>
        <EmployeeAvatarControl
          workspaceId={detail?.workspace_id ?? ""}
          employeeId={detail?.id ?? ""}
          readOnly={readOnly}
        />
      </section>

      {postMvpSurfaces ? (
        <section className="employee-access-group">
          <header>
            <div>
              <h3>Kiosk</h3>
              <p>
                Reset the employee PIN used to clock in or out from shared kiosk
                devices.
              </p>
            </div>
            <KeyRound size={18} aria-hidden />
          </header>
          <div className="employee-access-empty">
            <strong>Kiosk access is not configured</strong>
            <Button className="secondary-button" type="button" disabled>
              <RotateCcw size={15} aria-hidden />
              Reset PIN
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function EmployeeAvatarControl({
  workspaceId,
  employeeId,
  readOnly,
}: {
  readonly workspaceId: string;
  readonly employeeId: string;
  readonly readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const avatar = useQuery({
    queryKey: ["employee-avatar", workspaceId, employeeId],
    queryFn: () => getEmployeeAvatar(workspaceId, employeeId),
    enabled: Boolean(workspaceId && employeeId),
  });
  const remove = useMutation({
    mutationFn: () => removeEmployeeAvatar(workspaceId, employeeId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["employee-avatar", workspaceId, employeeId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["employee-detail", workspaceId, employeeId],
        }),
      ]);
    },
  });

  if (avatar.isLoading)
    return <p className="employee-panel-state">Loading profile photo...</p>;
  if (avatar.isError)
    return (
      <div className="employee-access-empty">
        <strong>Profile photo unavailable</strong>
        <Button
          className="secondary-button"
          type="button"
          onClick={() => void avatar.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  const hasAvatar = Boolean(avatar.data?.present);

  return (
    <div className="employee-avatar-control">
      {hasAvatar && avatar.data?.url ? (
        <img src={avatar.data.url} alt="Employee workspace profile" />
      ) : (
        <span className="employee-avatar-placeholder" aria-hidden>
          <UserRound size={20} />
        </span>
      )}
      <div>
        <strong>Profile photo removal</strong>
        <span>Remove only the photo shown for this workspace.</span>
        {remove.error ? (
          <small role="alert">{errorMessage(remove.error)}</small>
        ) : null}
      </div>
      {!readOnly ? (
        <Button
          className="secondary-button"
          type="button"
          disabled={!hasAvatar || remove.isPending}
          onClick={() => {
            if (
              window.confirm(
                "Remove this employee's profile photo from this workspace?",
              )
            )
              remove.mutate();
          }}
        >
          <ImageOff size={15} aria-hidden />
          {remove.isPending ? "Removing" : "Remove photo"}
        </Button>
      ) : null}
    </div>
  );
}

function canAssignRole(
  actorRole: WorkspaceRole,
  targetAccessClass: WorkspaceRole,
) {
  if (targetAccessClass === "owner") return false;
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetAccessClass !== "admin";
  return false;
}

function InviteRoleField({
  roles,
  inviteRoleId,
  onInviteRoleChange,
  disabled,
  invalidAttempt,
}: {
  roles: readonly InviteRoleOption[];
  inviteRoleId: string;
  onInviteRoleChange: (roleId: string) => void;
  disabled: boolean;
  invalidAttempt: number;
}) {
  const selectedRoleId = roles.some((role) => role.id === inviteRoleId)
    ? inviteRoleId
    : "";
  const invalid = invalidAttempt > 0;
  const pulseClass =
    invalidAttempt > 0
      ? ` employee-invite-role-invalid employee-invite-role-invalid-${invalidAttempt % 2}`
      : "";
  return (
    <label className={`employee-field employee-invite-role-field${pulseClass}`}>
      <select
        aria-label="Invite role"
        aria-invalid={invalid || undefined}
        value={selectedRoleId}
        disabled={disabled || roles.length === 0}
        onChange={(event) => onInviteRoleChange(event.target.value)}
      >
        {roles.length > 0 ? <option value="">Select a role</option> : null}
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

function ProfileGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="employee-profile-group">
      <header>
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  );
}

function ReadOnlyField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}) {
  return (
    <label
      className={`employee-field employee-readonly-field${wide ? " wide" : ""}`}
    >
      <span>{label}</span>
      <input
        aria-label={label}
        readOnly
        value={value ?? ""}
        placeholder="Not provided"
      />
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  readOnly = false,
  inputRef,
  type = "text",
  hint,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  readOnly?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  type?: string;
  hint?: string;
  required?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const id = useId();
  const invalid =
    touched &&
    ((required && !value.trim()) ||
      (type === "email" &&
        Boolean(value.trim()) &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())));
  const validationMessage =
    type === "email" ? "Enter a valid email address." : `${label} is required.`;
  const helperVisible = invalid || Boolean(hint) || required;
  const helperText = invalid ? validationMessage : (hint ?? "");
  return (
    <label
      className={`employee-field${type === "email" ? " employee-email-field" : ""}`}
    >
      <span>
        {label}
        {required ? (
          <small className="employee-field-requirement" aria-hidden>
            Required
          </small>
        ) : null}
      </span>
      <input
        ref={inputRef}
        aria-label={label}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={helperVisible && helperText ? id : undefined}
        onBlur={(event) => {
          if (
            event.relatedTarget instanceof Element &&
            event.relatedTarget.closest(".employee-drawer")
          )
            setTouched(true);
        }}
        type={type}
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
      {helperVisible ? (
        <small
          id={helperText ? id : undefined}
          className={`employee-field-helper${invalid ? " employee-field-error" : ""}`}
          aria-hidden={!helperText || undefined}
        >
          {helperText}
        </small>
      ) : null}
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
  required = false,
  searchable = true,
}: {
  label: string;
  options: readonly EmployeeOption[];
  selected: readonly string[];
  primary: string | null;
  disabled: boolean;
  onChange: (ids: string[], primary: string | null) => void;
  required?: boolean;
  searchable?: boolean;
}) {
  const [search, setSearch] = useState("");
  const available = options.filter(
    (option) => !option.archived || selected.includes(option.id),
  );
  const searchText = searchable ? search : "";
  const matching = available.filter((option) =>
    option.name.toLowerCase().includes(searchText.toLowerCase()),
  );
  return (
    <fieldset className="employee-assignment-picker" disabled={disabled}>
      <legend>
        {label}
        {required ? (
          <span className="employee-field-requirement">Required</span>
        ) : null}
      </legend>
      {searchable && available.length > 8 ? (
        <input
          aria-label={`Search ${label.toLowerCase()}`}
          placeholder={`Search ${label.toLowerCase()}`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      ) : null}
      {matching.map((option) => {
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
      {available.length === 0 ? (
        <p>No active {label.toLowerCase()}.</p>
      ) : matching.length === 0 ? (
        <p>No matching {label.toLowerCase()}.</p>
      ) : null}
      {required && selected.length === 0 && available.length > 0 ? (
        <p>Select at least one {label === "Locations" ? "location" : "job"}.</p>
      ) : null}
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
    is_remote: detail.is_remote ?? false,
    is_excluded_from_schedule: detail.is_excluded_from_schedule ?? false,
    expected_revision: detail.revision,
  };
}

function sectionDescription(section: EmployeeSection): string {
  return {
    profile: "Identity and manager-owned contact details.",
    employment: "Location, job, start date, and internal context.",
    availability: "Employee preferences and shared manager reminders.",
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

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "on an unknown date"
    : date.toLocaleString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Employee operation failed";
}
