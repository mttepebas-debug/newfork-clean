import {
  EmployeeAssignmentDocumentPreview,
  useEmployeeDocumentAssignmentPreview,
} from "../documents/EmployeeAssignmentDocumentPreview";
import { EmployeeDocumentPanel } from "../documents/EmployeeDocumentPanel";
import {
  displayUsPhone,
  emergencyIsOwnPhoneMessage,
  employeeInputSchema,
  hasTurkishOnlyLetters,
  managerLocationRefusal,
  employeeSectionSchema,
  sameUsPhone,
  toUsPhone,
  usLettersMessage,
  usPhoneMessage,
  type EmployeeDetail,
  type EmployeeInput,
  type EmployeeCreateCommand,
  type EmployeeCreateResult,
  type EmployeeOnboardingManager,
  type EmployeeSection,
  type WorkspaceRole,
} from "@newfork/shared";
import { Button, ConfirmButton, useConfirmClick, useToast } from "@newfork/ui";
import { ConfirmDialog } from "../shell/ConfirmDialog";
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
  ClipboardCopy,
  Pencil,
  RotateCcw,
  UserRound,
  X,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { noAccessHomePath } from "../auth/resolveLanding";
import { isNoAccess } from "../lib/no-access";
import { RequestError } from "../lib/request-error";
import { isGoneMeanwhile } from "../lib/catalog-refusals";
import { NoAccessState } from "../shell/NoAccessState";
import {
  LinesOutline,
  LoadError,
  LoadingOutline,
  RefreshError,
  Skeleton,
} from "../shell/LoadState";
import { FieldNote, fieldNoteId } from "../shell/FieldNote";
import { UsPhoneInput } from "../shell/UsPhoneInput";
import { WeeklyPreferencesPanel } from "../availability/WeeklyPreferencesPanel";
import "./employee-termination.css";
import {
  getEmployeeDetail,
  getEmployeeAvatar,
  createEmployee,
  type InviteRoleOption,
  loadEmployeeInvitationLink,
  decidePreferredName,
  listPendingPreferredNames,
  saveOwnEmploymentContact,
  loadEmployeeReferenceData,
  prepareEmployeeInvitation,
  removeEmployeeAvatar,
  removeEmployeeAccess,
  removeEmployeeFromLocation,
  retryEmployeeInvitation,
  revokeEmployeeInvitation,
  saveEmployee,
  setEmployeeArchived,
  terminateEmployee,
  updateEmployeeRole,
  type EmployeeTerminationInput,
  type EmployeeDepartmentOption,
  type EmployeeOption,
} from "./employee-data";
import {
  getEmployeeOnboardingReview,
  reviewEmployeeOnboarding,
} from "./onboarding-data";
import {
  employeeCreateReadiness,
  firstJobExceptOwner,
} from "./employee-create-flow";
import { registerEmployeeHistoryGuard } from "./employee-history-guard";
import {
  PassiveTerminate,
  ownerJobReason,
  RemoveFromLocationButton,
  TerminateNote,
} from "./EmployeeLocationParts";
import { refreshExchangeSurfaces } from "../employee-hub/shift-exchanges/exchange-data";
import { WindowAlert } from "../shell/WindowAlert";
import { membershipClass } from "../auth/access";

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
  const toast = useToast();
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
  const onboardingReview = useQuery({
    queryKey: ["employee-onboarding-review", workspaceId, props.employeeId],
    queryFn: () =>
      getEmployeeOnboardingReview(workspaceId, props.employeeId ?? ""),
    enabled: Boolean(
      workspaceId &&
      props.employeeId &&
      !props.creating &&
      can(context, "employee.read"),
    ),
  });
  const [draft, setDraft] = useState<EmployeeInput>(emptyDraft);
  const [inviteRoleId, setInviteRoleId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [developmentUrl, setDevelopmentUrl] = useState<string | null>(null);
  const [terminationOpen, setTerminationOpen] = useState(false);
  // The button that opens the termination window takes the focus back when
  // it closes, however it closes (BL-779).
  const lifecycleButtonRef = useRef<HTMLButtonElement>(null);
  const terminationWasOpen = useRef(false);
  useEffect(() => {
    if (terminationWasOpen.current && !terminationOpen) {
      lifecycleButtonRef.current?.focus();
    }
    terminationWasOpen.current = terminationOpen;
  }, [terminationOpen]);
  const [terminationNotice, setTerminationNotice] = useState<string | null>(
    null,
  );
  const [inviteRoleDirty, setInviteRoleDirty] = useState(false);
  const [inviteRoleAttempt, setInviteRoleAttempt] = useState(0);
  // The workspace role (EMP-001 item 15): picked here, saved by Save changes
  // with its own command. Untouched, it follows the record.
  const [rolePicked, setRolePicked] = useState<string | null>(null);
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
  const previousSectionRef = useRef(props.section);
  // EMP-001 K4: a manager who is not Remote has a location. The record says
  // its role by id; the class comes from the roles the reader may give, which
  // cover every record they may save. The database decides either way.
  const roleClass = (roleId: string | null | undefined) =>
    references.data?.inviteRoles.find((role) => role.id === roleId)?.accessClass;
  const managerRecord =
    !props.creating && roleClass(detail.data?.role_id) === "manager";
  // FB-6.6 S1: a legal name is approved by an owner or an admin, one rank up,
  // never one's own. A role the reader may not give is a peer's or a
  // senior's: closed.
  const personRole: WorkspaceRole | undefined = detail.data?.is_workspace_owner
    ? "owner"
    : roleClass(detail.data?.role_id);
  const canDecideLegalName =
    detail.data !== undefined &&
    personRole !== undefined &&
    can(context, "onboarding.legal_name", {
      person: {
        role: personRole,
        isSelf: detail.data.user_id !== null && detail.data.user_id === context?.userId,
      },
    });
  const managerRefusal = managerLocationRefusal(
    managerRecord ? "manager" : null,
    draft,
  );
  // ROL-CIFT 2.2: somebody who only manages is never scheduled, so their
  // record shows no "Exclude from schedule": what holds Save does not offer it.
  const scheduled = props.creating || detail.data?.access.employee !== false;
  const draftReadiness = employeeCreateReadiness(draft, { scheduled });
  const readiness = managerRefusal
    ? { ...draftReadiness, employeeReady: false, assignmentBlocker: managerRefusal }
    : draftReadiness;
  const allowedSections = sections.filter(
    ([key]) =>
      (key !== "availability" || can(context, "availability.team_read")) &&
      (key !== "documents" || can(context, "documents.read")) &&
      (key !== "access" ||
        (props.creating
          ? can(context, "employee.invite")
          : Boolean(
              detail.data &&
                (detail.data.allowed.invite ||
                  detail.data.allowed.remove_access ||
                  detail.data.allowed.change_role ||
                  // The profile photo is removed here.
                  detail.data.allowed.save ||
                  // The server gives the invitation only to who may read access.
                  detail.data.invitation !== null),
            ))),
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
  // The record the draft was built from: what was typed is measured against
  // it, not against a newer copy read in the background (review Y1).
  const draftBaseRef = useRef<EmployeeInput>(emptyDraft);
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
    Boolean(context) &&
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
  // A refused check has no retry: Save says why it stays held.
  const saveHeldByRefusal =
    needsDocumentPreview &&
    !documentPreview.isFetching &&
    isNoAccess(documentPreview.error);
  const saveHeldReasonId = useId();
  const baselineKey = JSON.stringify(baseline);
  const dirty = draftEditedRef.current && JSON.stringify(draft) !== baselineKey;
  const roleSaved = detail.data?.role_id ?? "";
  const roleNow = rolePicked ?? roleSaved;
  // The role is picked only on a linked, active record the server lets the
  // reader change it on.
  const roleEditable =
    !props.creating &&
    Boolean(detail.data?.user_id) &&
    !detail.data?.archived_at &&
    (detail.data?.allowed.change_role ?? false);
  const roleDirty = roleEditable && roleNow !== roleSaved;
  // The owner's own emergency contact goes with the one Save (K3, P20).
  const ownOwnerRecord = Boolean(
    detail.data &&
      context?.userId &&
      detail.data.user_id === context.userId &&
      detail.data.is_workspace_owner,
  );
  const contactBaseline: ContactDraft = {
    name: detail.data?.private_contact?.emergency_contact_name ?? "",
    relationship: detail.data?.private_contact?.emergency_contact_relationship ?? "",
    phone: detail.data?.private_contact?.emergency_contact_phone ?? "",
  };
  const [contactDraft, setContactDraft] = useState<ContactDraft | null>(null);
  const contactNow = contactDraft ?? contactBaseline;
  // The saved number is E.164 and the field hands back the mask: compared the
  // way they are stored, a number typed back to the saved one is no change.
  const storedContact = (contact: ContactDraft) => ({
    ...contact,
    phone: toUsPhone(contact.phone) ?? contact.phone,
  });
  const contactDirty =
    ownOwnerRecord &&
    contactDraft !== null &&
    JSON.stringify(storedContact(contactDraft)) !==
      JSON.stringify(storedContact(contactBaseline));
  // Both halves: a name with no number is not a contact (the server's rule);
  // a whole US number, and names under the US letter rule (BL-503).
  // TEL-2 (Mert, 2026-10-09): the emergency contact is somebody else.
  const contactIsOwn = sameUsPhone(detail.data?.private_contact?.phone, contactNow.phone);
  const contactReady =
    contactNow.name.trim().length > 0 &&
    toUsPhone(contactNow.phone) !== null &&
    !contactIsOwn &&
    !hasTurkishOnlyLetters(contactNow.name) &&
    !hasTurkishOnlyLetters(contactNow.relationship);
  // What Save changes has to send; Terminate and Invite wait for it too.
  const anyDirty = dirty || roleDirty || contactDirty;

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
    draftBaseRef.current = baseline;
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
      setRolePicked(null);
      setContactDraft(null);
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
    // On the window, after the page: a bubble or a box that spends Escape on
    // itself stops it at the document, and the drawer keeps its draft (review D2).
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [props.onClose, terminationOpen]);

  // What this reader may do to this record is the server's answer
  // (detail.allowed); a new record asks whether they may create one at all.
  const allowed = detail.data?.allowed;
  const canSave = props.creating
    ? can(context, "employee.create")
    : (allowed?.save ?? false);
  // Inviting asks the core (employee.invite with the person, FB-6.2 .5); a new
  // record, whether they may invite anybody at all.
  const canManageAccess = props.creating
    ? can(context, "employee.invite")
    : (allowed?.invite ?? false);
  const archived = Boolean(detail.data?.archived_at);
  // Terminating an active record, restoring an archived one.
  const canChangeLifecycle = archived
    ? (allowed?.archive ?? false)
    : (allowed?.terminate ?? false);
  const readOnly = archived || !canSave;
  // Save changes is there for whoever may save the record or, on a record
  // they may not, change the role.
  const canSubmit = !readOnly || roleEditable;
  // A manager who may take them off a location but not end their employment
  // still sees Terminate, switched off, with the reason (FB-6.2.8).
  const managerCannotTerminate =
    (context ? membershipClass(context.membership) : undefined) === "manager" &&
    !props.creating &&
    !archived &&
    Boolean(detail.data) &&
    !(allowed?.terminate ?? false) &&
    (detail.data?.locations.some((location) => location.removable) ?? false);
  // BL-1045: a location or job deleted while the drawer was open; by its key,
  // the lists load again so it leaves the pickers. The sentence stays.
  const reloadGoneReferences = (cause: unknown) => {
    if (isGoneMeanwhile(cause))
      void queryClient.invalidateQueries({
        queryKey: ["employee-reference-data", workspaceId],
      });
  };
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
      reloadGoneReferences(cause);
    },
    onSettled: () => {
      submittingCreateRef.current = false;
    },
  });
  const saveMutation = useMutation({
    // The record, then the role: two commands, in that order, because the
    // role service moves the record's revision on. The record that landed is
    // no longer dirty, so when the role fails a retry sends the role alone.
    mutationFn: async () => {
      let savedId = props.employeeId ?? "";
      const recordSent = dirty;
      if (recordSent) {
        savedId = await saveEmployee(
          workspaceId,
          draft,
          props.employeeId ?? undefined,
        );
        draftEditedRef.current = false;
        allowNextDraftRefreshRef.current = true;
      }
      const contactSent = contactDirty;
      if (contactSent) {
        try {
          await saveOwnEmploymentContact(workspaceId, savedId, {
            name: contactNow.name.trim(),
            relationship: contactNow.relationship.trim(),
            phone: toUsPhone(contactNow.phone) ?? contactNow.phone.trim(),
            email: detail.data?.private_contact?.emergency_contact_email ?? "",
          });
        } catch {
          if (recordSent) await refreshRecord();
          throw new Error("Emergency contact could not be saved");
        }
      }
      if (roleDirty) {
        try {
          await updateEmployeeRole(workspaceId, savedId, roleNow);
        } catch (cause) {
          // The form takes up the record that did land before the error shows.
          if (recordSent) await refreshRecord();
          throw cause;
        }
        // A form touched and put back still takes up the new revision.
        draftEditedRef.current = false;
        allowNextDraftRefreshRef.current = true;
      }
      return { savedId, recordSent, roleSent: roleDirty, contactSent };
    },
    onSuccess: async ({ savedId, recordSent, roleSent, contactSent }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees", workspaceId] }),
        queryClient.invalidateQueries({
          queryKey: ["employee-detail", workspaceId, savedId],
        }),
        // A new role moves which roles may be given, and the reader's own
        // access when the record is theirs.
        ...(roleSent
          ? [
              queryClient.invalidateQueries({
                queryKey: ["employee-reference-data", workspaceId],
              }),
              refresh(),
            ]
          : []),
      ]);
      setRolePicked(null);
      if (contactSent) setContactDraft(null);
      setError(null);
      if (props.creating) props.onCreated(savedId);
      // A role saved alone leaves the reader on Access (K7 (ii)).
      else if (recordSent) props.onSectionChange("profile");
    },
    onError: async (cause) => {
      if (!isRevisionConflict(cause) || !props.employeeId) {
        setError(errorMessage(cause));
        reloadGoneReferences(cause);
        return;
      }
      // Someone else saved first (BL-781): read the record again, keep what
      // was typed over it, and let the next Save apply it. Fields left alone
      // take what the other person saved.
      const typed = draft;
      const before = draftBaseRef.current;
      const fresh = await queryClient.fetchQuery({
        queryKey: ["employee-detail", workspaceId, props.employeeId],
        queryFn: () => getEmployeeDetail(workspaceId, props.employeeId ?? ""),
        staleTime: 0,
      });
      const next = toDraft(fresh);
      const merged = mergeTypedOver(typed, before, next);
      draftBaseRef.current = next;
      draftEditedRef.current = true;
      setDraft(merged);
      setError(
        "Someone else saved this employee meanwhile. Save again to apply your changes.",
      );
    },
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
        // Released shifts leave Schedule, the dashboard and the hub.
        refreshExchangeSurfaces(queryClient, workspaceId),
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
  const refreshRecord = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["employees", workspaceId] }),
      queryClient.invalidateQueries({
        queryKey: ["employee-detail", workspaceId, props.employeeId],
      }),
    ]);
  // Taking them off one location (FB-6.2 S1); the record stays.
  const removeFromLocationMutation = useMutation({
    mutationFn: (locationId: string) =>
      removeEmployeeFromLocation(workspaceId, props.employeeId ?? "", locationId),
    onSuccess: async (_result, locationId) => {
      setError(null);
      const name = detail.data?.locations.find(
        (location) => location.id === locationId,
      )?.name;
      await Promise.all([
        refreshRecord(),
        // Their shifts there from now on were left open (BL-785).
        refreshExchangeSurfaces(queryClient, workspaceId),
      ]);
      // Off the one location the reader reached them through, the record is
      // no longer theirs to read: the drawer closes and says what happened.
      if (
        isNoAccess(
          queryClient.getQueryState([
            "employee-detail",
            workspaceId,
            props.employeeId,
          ])?.error,
        )
      ) {
        toast.success(`Removed from ${name ?? "the location"}`);
        props.onClose();
      }
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
    onError: async (cause) => {
      if (!isOnboardingChanged(cause)) {
        setError(errorMessage(cause));
        return;
      }
      // The employee or another reviewer moved the onboarding on first
      // (BL-1046): read it again and say so; the next decision goes on it.
      await queryClient.invalidateQueries({
        queryKey: ["employee-onboarding-review", workspaceId, props.employeeId],
      });
      setError("This onboarding changed meanwhile. You're seeing the latest version.");
    },
  });

  const busy =
    createMutation.isPending ||
    saveMutation.isPending ||
    inviteMutation.isPending ||
    retryInvitationMutation.isPending ||
    removeAccessMutation.isPending;
  const done =
    !props.creating &&
    !anyDirty &&
    (createResult !== null || saveMutation.isSuccess);
  const rolesState = references.isError ? "error" : references.data ? "ready" : "loading";
  // The server sends only the roles this person may invite with (BL-231).
  const inviteRoles = [...(references.data?.inviteRoles ?? [])]
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
  // Closing never asks: what was typed or picked and not saved is dropped
  // (K7 (i), user decision 2026-09-30). A request on its way holds it.
  const requestClose = () => {
    if (!busy) props.onClose();
  };
  closeRef.current = requestClose;
  useEffect(() => {
    openingFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = dialogRef.current;
    // Somebody already saved is read first: until the form is up the focus
    // waits in the drawer, not on the row behind it (BL-478).
    (
      panel?.querySelector<HTMLInputElement>("input:not(:disabled)") ??
      panel?.querySelector<HTMLElement>("button:not(:disabled)")
    )?.focus();
    return () => {
      const opener = openingFocusRef.current;
      // The row that opened it can leave the list (removed from the
      // location): the focus goes to the page, not the document's top (BL-479).
      if (opener?.isConnected) opener.focus();
      else
        document
          .querySelector("main")
          ?.querySelector<HTMLElement>(
            "input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])",
          )
          ?.focus();
    };
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
  // While a create request is on its way the route stays, so the answer has a
  // form to come back to. Nothing is asked and nothing typed is guarded.
  useEffect(() => {
    if (!props.creating || !busy) return;
    let index = Number(window.history.state?.idx ?? 0);
    let restoring = false;
    const path = window.location.pathname;
    const pop = (event: PopStateEvent) => {
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
      // Restore the current entry. The router must not unmount the form.
      event.stopImmediatePropagation();
      restoring = true;
      window.history.go(-delta);
    };
    const follow = (event: MouseEvent) => {
      if (
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
    };
    const unregisterHistoryGuard = registerEmployeeHistoryGuard(pop);
    document.addEventListener("click", follow, true);
    return () => {
      unregisterHistoryGuard();
      document.removeEventListener("click", follow, true);
    };
  }, [props.creating, busy]);
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
    // An invitation as a manager makes them one (K4).
    const invitedManagerRefusal = invite
      ? managerLocationRefusal(roleClass(inviteRoleId), draft)
      : undefined;
    if (invitedManagerRefusal) {
      setError(invitedManagerRefusal);
      return;
    }
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
    if (busy || uncertainCreate || !canSubmit) return;
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
    // Enter sends what Save changes would: nothing when nothing changed.
    if (!anyDirty) return;
    if (dirty) {
      if (managerRefusal) {
        setError(managerRefusal);
        return;
      }
      const parsed = employeeInputSchema.safeParse(draft);
      if (!parsed.success) {
        setError(
          parsed.error.issues[0]?.message ?? "Check the employee details",
        );
        return;
      }
      if (documentPreviewBlocked) return;
    }
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

  // Out of reach: only the card, no nameless record beside it (BL-402).
  const noAccess = isNoAccess(detail.error);
  // A role just saved and nothing typed since (BL-463, BL-477).
  const roleJustSaved =
    saveMutation.isSuccess && saveMutation.data.roleSent && !anyDirty;
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
          // Tab stays in the drawer (BL-478); the termination window keeps its own.
          if (event.key !== "Tab" || terminationOpen) return;
          // A box opened from the drawer into the page (Request changes) bubbles
          // its keys here through React; it keeps its own Tab (review O1).
          if (!(event.target instanceof Node) || !dialogRef.current?.contains(event.target))
            return;
          const items = Array.from(
            dialogRef.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
            ) ?? [],
          ).filter((item) => item.getClientRects().length > 0);
          const first = items[0],
            last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={noAccess ? undefined : "employee-drawer-title"}
        aria-label={noAccess ? "Employee" : undefined}
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
            {noAccess ? null : (
              <nav
                className="employee-summary-rail"
                aria-label="Employee sections"
              >
                <div className="employee-identity">
                  {/* A person still loading is not drawn as a new one (QA 55). */}
                  <span className="employee-avatar" aria-hidden>
                    {(draft.first_name || (props.creating ? "N" : "")).slice(0, 1).toUpperCase()}
                  </span>
                  <strong id="employee-drawer-title">
                    {props.creating
                      ? "New employee"
                      : (detail.data?.display_name ?? "Employee details")}
                  </strong>
                  {!props.creating && detail.data ? (
                    <span>
                      {detail.data.employee_code ?? "Code assigned on save"}
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
            )}

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
                ) : noAccess ? null : (
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
                    {noAccess
                      ? null
                      : sections.find(([key]) => key === activeSection)?.[1]}
                  </h2>
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
                  <LinesOutline label="Loading employee" lines={5} />
                ) : null}
                {isNoAccess(detail.error) ? (
                  <NoAccessState
                    subject="this employee"
                    homeHref={noAccessHomePath(context, "/app/employees")}
                  />
                ) : detail.error && detail.data ? (
                  // Read again after a save and failed: what was saved is
                  // said, the server's sentence is not (BL-463).
                  <RefreshError
                    // The sections stay hidden until it reads again, so nothing
                    // stale is offered for editing.
                    message={`${roleJustSaved ? "Role saved. " : ""}This employee didn't reload.`}
                    retrying={detail.isFetching}
                    onRetry={() => void detail.refetch()}
                  />
                ) : detail.error ? (
                  <LoadError
                    inset
                    level={3}
                    title="We couldn't load this employee"
                    detail="This employee didn't load. Nothing was changed."
                    retrying={detail.isFetching}
                    onRetry={() => void detail.refetch()}
                  />
                ) : null}
                {!detail.isLoading && !detail.error
                  ? renderSection(
                      activeSection,
                      draft,
                      updateDraft,
                      detail.data,
                      // One order for every role picker (AC4, BL-669).
                      references.data
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
                      (action, requirementId, reason) =>
                        reviewMutation.mutate({
                          action,
                          requirementId,
                          reason,
                        }),
                      reviewMutation.isPending,
                      () => retryInvitationMutation.mutate(),
                      retryInvitationMutation.isPending,
                      () => revokeMutation.mutate(),
                      revokeMutation.isPending,
                      () => removeAccessMutation.mutate(),
                      removeAccessMutation.isPending,
                      (context ? membershipClass(context.membership) : undefined) ?? "employee",
                      allowed,
                      roleNow,
                      setRolePicked,
                      busy,
                      ownOwnerRecord
                        ? {
                            value: contactNow,
                            onChange: setContactDraft,
                            required: contactDirty,
                            isOwnPhone: contactIsOwn,
                            disabled: busy || readOnly,
                          }
                        : null,
                      canDecideLegalName,
                      {
                        onRemove: (locationId) =>
                          removeFromLocationMutation.mutate(locationId),
                        removingLocationId: removeFromLocationMutation.isPending
                          ? (removeFromLocationMutation.variables ?? null)
                          : null,
                        managerRecord,
                      },
                      props.creating,
                    )
                  : null}
                {needsDocumentPreview && (
                  <EmployeeAssignmentDocumentPreview query={documentPreview} />
                )}
                {props.creating && references.isLoading ? (
                  <LinesOutline label="Loading locations, jobs and roles" lines={3} />
                ) : null}
                {/* A saved person's pickers need them too: empty would read as
                    no assignments (BL-244). */}
                {(props.creating ||
                  activeSection === "employment" ||
                  activeSection === "access") &&
                references.isError &&
                !references.data ? (
                  <LoadError
                    inset
                    level={3}
                    title="We couldn't load locations, jobs and roles"
                    detail="The choices for this form didn't load. Nothing was changed."
                    retrying={references.isFetching}
                    onRetry={() => void references.refetch()}
                  />
                ) : null}
                {(props.creating ||
                  activeSection === "employment" ||
                  activeSection === "access") &&
                references.isError &&
                references.data ? (
                  <RefreshError
                    message="Locations, jobs and roles didn't refresh. These are the last choices that loaded."
                    retrying={references.isFetching}
                    onRetry={() => void references.refetch()}
                  />
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
                {props.creating && activeSection === "employment" ? (
                  <FieldNote
                    id="employee-invite-email"
                    error={
                      readiness.emailPresent && !readiness.emailReady
                        ? "Enter a valid email address in Profile."
                        : null
                    }
                  />
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
          {/* The drawer's error, or why Save is held, lies over the body's
              bottom edge above the footer; the body gets room under it (UI-FIELDMSG-2). */}
          <WindowAlert
            between
            message={error}
            status={
              dirty &&
              // A new person hears about Employment once there (E10, BL-669).
              !(props.creating && activeSection === "profile")
                ? readiness.assignmentBlocker
                : null
            }
          />
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
                    rolesState={rolesState}
                    waitsForEmail={!readiness.emailReady}
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
                {managerCannotTerminate ? <PassiveTerminate /> : null}
                {!props.creating && canChangeLifecycle && !archived && anyDirty ? (
                  // Held by a draft: switched off has one look (visual QA D1).
                  <PassiveTerminate reason="Save your changes before terminating the employee" />
                ) : !props.creating && canChangeLifecycle ? (
                  <button
                    ref={lifecycleButtonRef}
                    type="button"
                    className={`employee-lifecycle-button${archived ? " restore" : ""}`}
                    disabled={
                      archiveMutation.isPending || terminationMutation.isPending
                    }
                    onClick={() => {
                      if (!archived) {
                        setError(null);
                        setTerminationNotice(null);
                        setTerminationOpen(true);
                        return;
                      }
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
                    rolesState={rolesState}
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
                  {/* Nothing to cancel in a drawer that only reads (K10, BL-408). */}
                  {canSubmit ? "Cancel" : "Close"}
                </Button>
                {!props.creating &&
                !readOnly &&
                canManageAccess &&
                // A linked account has nobody left to invite (visual QA .7b).
                !detail.data?.user_id &&
                draft.invitation_email ? (
                  <Button
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
                      if (anyDirty) {
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
                {canSubmit && saveHeldByRefusal ? (
                  <p id={saveHeldReasonId} className="employee-save-held">
                    You can't save these changes without access to check documents.
                  </p>
                ) : null}
                {canSubmit ? (
                  <Button
                    type="submit"
                    aria-describedby={
                      saveHeldByRefusal ? saveHeldReasonId : undefined
                    }
                    disabled={
                      busy ||
                      documentPreviewBlocked ||
                      (!anyDirty && !done) ||
                      // Same gate the create flow already has. Without it,
                      // clearing the last location or job left Save enabled and
                      // the server refused it after the round trip.
                      (dirty && !readiness.employeeReady) ||
                      // Half an emergency contact is not one (K3).
                      (contactDirty && !contactReady)
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
        {/* Heard as well as seen on the button (BL-477). */}
        <span className="sr-only" role="status">
          {roleJustSaved ? "Role saved." : ""}
        </span>
        {terminationOpen && detail.data ? (
          <EmployeeTerminationDialog
            employeeName={`${detail.data.first_name} ${detail.data.last_name}`}
            locations={(references.data?.locations ?? []).filter((location) =>
              detail.data?.locations.some(
                (assignment) => assignment.id === location.id,
              ),
            )}
            workspaceLocations={(references.data?.locations ?? []).filter(
              (location) => !location.archived,
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
  workspaceLocations,
  primaryLocationId,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  readonly employeeName: string;
  readonly locations: readonly EmployeeOption[];
  /** The workspace's open locations: their zones serve somebody with none left (K4). */
  readonly workspaceLocations: readonly EmployeeOption[];
  readonly primaryLocationId: string | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (input: EmployeeTerminationInput) => void;
}) {
  const titleId = useId();
  const fieldId = useId();
  const zonesOf = (rows: readonly EmployeeOption[]) =>
    Array.from(new Set(rows.map((row) => row.timezone).filter(Boolean))) as string[];
  // The zone is one of the places they work. With no location left (K4,
  // BL-765) the server takes any valid zone: the workspace's are offered.
  const ownZones = zonesOf(locations);
  const timezoneOptions = ownZones.length ? ownZones : zonesOf(workspaceLocations);
  const timezoneMissing = timezoneOptions.length
    ? null
    : "An active employee location with a timezone is required.";
  const primaryTimezone =
    locations.find((location) => location.id === primaryLocationId)?.timezone ??
    timezoneOptions[0] ??
    "";
  const [chosenTimezone, setTimezone] = useState(primaryTimezone);
  // The pick lists can arrive after the window opens.
  const timezone = timezoneOptions.includes(chosenTimezone)
    ? chosenTimezone
    : primaryTimezone;
  const [effectiveLocal, setEffectiveLocal] = useState(() =>
    localDateTimeValue(new Date(), primaryTimezone || undefined),
  );
  // Zones that arrive after the window opened: "now" is suggested again where
  // the person works, not in the reader's own zone.
  // A time already typed stays (P10).
  const zoneKnown = useRef(Boolean(timezone));
  const effectiveTyped = useRef(false);
  useEffect(() => {
    if (zoneKnown.current || !timezone) return;
    zoneKnown.current = true;
    if (!effectiveTyped.current)
      setEffectiveLocal(localDateTimeValue(new Date(), timezone));
  }, [timezone]);
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    effective?: string;
    reason?: string;
  }>({});
  const idempotencyKey = useRef(crypto.randomUUID());
  const dialogRef = useRef<HTMLElement>(null);
  const effectiveRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    effectiveRef.current?.focus();
  }, []);

  // Said under the field, not in the browser's bubble (T2, BL-779).
  function validate() {
    const next = {
      effective: !effectiveLocal
        ? "Enter the effective date and time."
        : effectiveLocal > localDateTimeValue(new Date(), timezone || undefined)
          ? "The effective time can't be in the future."
          : undefined,
      reason:
        reason.trim().length < 3
          ? "Enter a reason of at least 3 characters."
          : undefined,
    };
    setFieldErrors(next);
    if (next.effective) effectiveRef.current?.focus();
    else if (next.reason) reasonRef.current?.focus();
    return !next.effective && !next.reason;
  }

  function submit() {
    onSubmit({
      effectiveLocal,
      worksiteTimezone: timezone,
      reason,
      idempotencyKey: idempotencyKey.current,
    });
  }

  // Destructive: red, and a second click (K8, BL-778).
  const { armed, confirmProps } = useConfirmClick(() => {
    if (validate()) submit();
  });

  return (
    <div className="employee-termination-layer" role="presentation">
      <button
        type="button"
        className="employee-termination-backdrop"
        aria-label="Close termination dialog"
        onClick={onClose}
      />
      <section
        ref={dialogRef}
        className="employee-termination-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          // Tab stays in the window (BL-779).
          if (event.key !== "Tab") return;
          const items = Array.from(
            dialogRef.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
            ) ?? [],
          );
          const first = items[0],
            last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
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
        <form noValidate onSubmit={(event) => event.preventDefault()}>
          <label>
            Effective date and time
            <input
              ref={effectiveRef}
              // Named here: the error under it sits inside the label.
              aria-label="Effective date and time"
              type="datetime-local"
              value={effectiveLocal}
              max={localDateTimeValue(new Date(), timezone || undefined)}
              onChange={(event) => {
                effectiveTyped.current = true;
                setEffectiveLocal(event.target.value);
                setFieldErrors((current) => ({ ...current, effective: undefined }));
              }}
              aria-required
              aria-invalid={fieldErrors.effective ? true : undefined}
              aria-describedby={fieldNoteId(`${fieldId}-effective`, fieldErrors.effective)}
            />
            <FieldNote id={`${fieldId}-effective`} error={fieldErrors.effective} />
          </label>
          <label>
            Worksite timezone
            <select
              // Named here: the note under it sits inside the label.
              aria-label="Worksite timezone"
              value={timezone}
              onChange={(event) => {
                const nextTimezone = event.target.value;
                setTimezone(nextTimezone);
                setEffectiveLocal(localDateTimeValue(new Date(), nextTimezone));
              }}
              aria-required
              aria-invalid={timezoneOptions.length ? undefined : true}
              aria-describedby={fieldNoteId(`${fieldId}-timezone`, timezoneMissing)}
            >
              {timezoneOptions.map((option) => (
                <option key={option} value={option}>
                  {zoneName(option)}
                </option>
              ))}
            </select>
            {/* The field's own reason, under it; the server's in the band (UI-FIELDMSG-2). */}
            <FieldNote id={`${fieldId}-timezone`} error={timezoneMissing} />
          </label>
          <label>
            Reason
            <textarea
              ref={reasonRef}
              aria-label="Reason"
              value={reason}
              maxLength={240}
              onChange={(event) => {
                setReason(event.target.value);
                setFieldErrors((current) => ({ ...current, reason: undefined }));
              }}
              aria-required
              aria-invalid={fieldErrors.reason ? true : undefined}
              aria-describedby={fieldNoteId(`${fieldId}-reason`, fieldErrors.reason)}
            />
            <FieldNote id={`${fieldId}-reason`} error={fieldErrors.reason} />
          </label>
          <p className="employee-termination-warning">
            {/* The effective time can be in the past; a worked shift stays
                with who worked it (K1, BL-766). */}
            Access will be suspended. Published shifts that haven't started yet
            will become open and create manager follow-ups.
          </p>
          <footer>
            {/* Over the warning's bottom edge, above the buttons (UI-FIELDMSG). */}
            <WindowAlert message={error} />
            <Button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={`danger-button${armed ? " is-armed" : ""}`}
              disabled={pending || !timezoneOptions.length}
              {...confirmProps}
              onClick={(event) => {
                // Nothing is armed while a field is missing (BL-779).
                if (!armed && !validate()) return;
                confirmProps.onClick(event);
              }}
              data-confirming={armed}
            >
              {/* As wide at rest as armed, so Cancel never moves. */}
              <span className="employee-termination-confirm">
                <span>
                  {pending ? "Terminating" : armed ? "Confirm termination" : "Terminate"}
                </span>
                <span aria-hidden="true">Confirm termination</span>
              </span>
            </Button>
            <span className="sr-only" role="status">
              {armed ? "Confirm termination" : ""}
            </span>
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
  onReview: (
    action: "accept_requirement" | "reject_requirement" | "activate",
    requirementId: string | null,
    reason: string,
  ) => void,
  reviewing: boolean,
  onRetryInvitation: () => void,
  retryingInvitation: boolean,
  onRevokeInvitation: () => void,
  revokingInvitation: boolean,
  onRemoveAccess: () => void,
  removingAccess: boolean,
  actorRole: WorkspaceRole,
  allowed: EmployeeDetail["allowed"] | undefined,
  roleId: string,
  onRoleChange: (roleId: string) => void,
  changingRole: boolean,
  /** The viewer is looking at their own record, and they own the workspace. */
  ownContact: OwnContactControl | null,
  canDecideLegalName: boolean,
  locationActions: EmployeeLocationActions,
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
        pendingNameTarget={
          detail ? { workspaceId: detail.workspace_id, employeeId: detail.id } : null
        }
        ownEmergencyContact={ownContact}
        emailInputRef={emailInputRef}
        onboarding={onboarding}
        onboardingLoading={onboardingLoading}
        onReview={onReview}
        reviewing={reviewing}
        canReview={allowed?.onboarding_review ?? false}
        canDecideLegalName={canDecideLegalName}
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
        detail={creating ? undefined : detail}
        locationActions={locationActions}
        explainTerminate={actorRole === "manager"}
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
          Boolean(detail?.archived_at) || !canManageAccess
        }
        archived={Boolean(detail?.archived_at)}
        allowed={allowed}
        onRetryInvitation={onRetryInvitation}
        retryingInvitation={retryingInvitation}
        onRevokeInvitation={onRevokeInvitation}
        revokingInvitation={revokingInvitation}
        onRemoveAccess={onRemoveAccess}
        removingAccess={removingAccess}
        actorRole={actorRole}
        roleId={roleId}
        onRoleChange={onRoleChange}
        changingRole={changingRole}
      />
    );
  return <HistorySection detail={detail} />;
}

function OnboardingReviewPanel({
  onboarding,
  loading,
  onReview,
  reviewing,
  canReview,
  canDecideLegalName,
}: {
  /** The server's answer: may the reader review this onboarding. */
  readonly canReview: boolean;
  /** Accepting or sending back the legal name (onboarding.legal_name). */
  readonly canDecideLegalName: boolean;
  readonly onboarding: EmployeeOnboardingManager | null | undefined;
  readonly loading: boolean;
  readonly onReview: (
    action: "accept_requirement" | "reject_requirement" | "activate",
    requirementId: string | null,
    reason: string,
  ) => void;
  readonly reviewing: boolean;
}) {
  // The panel reviews the legal name (profile) requirement only.
  // The requirement whose correction note is being written.
  const [changesFor, setChangesFor] = useState<{
    readonly id: string;
    readonly title: string;
  } | null>(null);
  const [changesNote, setChangesNote] = useState("");
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
  const requirements = onboarding.requirements.filter(
    (requirement) => requirement.kind === "profile",
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
            {requirement.requires_review &&
            requirement.status === "awaiting_review" ? (
              <div>
                <Button
                  type="button"
                  className="secondary-button"
                  aria-label={`Request changes for ${requirement.title}`}
                  disabled={reviewing || !canDecideLegalName}
                  onClick={() => {
                    setChangesNote("");
                    setChangesFor({
                      id: requirement.id,
                      title: requirement.title,
                    });
                  }}
                >
                  Request changes
                </Button>
                <Button
                  type="button"
                  aria-label={`Accept ${requirement.title}`}
                  disabled={reviewing || !canDecideLegalName}
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
      {activationReady && canReview ? (
        <Button
          type="button"
          disabled={reviewing}
          onClick={() => onReview("activate", null, "")}
        >
          Activate employee access
        </Button>
      ) : null}
      <ConfirmDialog
        open={changesFor !== null}
        title={`Request changes to ${changesFor?.title ?? ""}?`}
        description="The employee sees this note and sends a corrected version."
        confirmLabel="Request changes"
        confirmDisabled={!changesNote.trim()}
        onCancel={() => setChangesFor(null)}
        onConfirm={() => {
          if (changesFor)
            onReview("reject_requirement", changesFor.id, changesNote.trim());
          setChangesFor(null);
        }}
      >
        <label className="app-confirm-field">
          <span>What should the employee correct?</span>
          <textarea
            rows={3}
            autoFocus
            value={changesNote}
            onChange={(event) => setChangesNote(event.target.value)}
          />
        </label>
      </ConfirmDialog>
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
  ownEmergencyContact,
  pendingNameTarget,
  emailInputRef,
  onboarding,
  onboardingLoading,
  onReview,
  reviewing,
  canReview,
  canDecideLegalName,
}: {
  creating?: boolean;
  /** The server's answer: may the reader review this onboarding. */
  canReview: boolean;
  /** The core's answer: may the reader approve this person's legal name. */
  canDecideLegalName: boolean;
  draft: EmployeeInput;
  setDraft: React.Dispatch<React.SetStateAction<EmployeeInput>>;
  readOnly: boolean;
  linked: boolean;
  identityLocked: boolean;
  invitePending: boolean;
  accountEmail: string | null;
  privateContact: EmployeeDetail["private_contact"];
  /** Present only on the owner's own record, which onboarding never asks. */
  ownEmergencyContact: OwnContactControl | null;
  /** The record being looked at, so a waiting preferred name can be answered. */
  pendingNameTarget: { workspaceId: string; employeeId: string } | null;
  emailInputRef: React.RefObject<HTMLInputElement | null>;
  onboarding: EmployeeOnboardingManager | null | undefined;
  onboardingLoading: boolean;
  onReview: (
    action: "accept_requirement" | "reject_requirement" | "activate",
    requirementId: string | null,
    reason: string,
  ) => void;
  reviewing: boolean;
}) {
  // The server gives the private contact only to who may read it (KK-35 S3).
  const canReadPrivate = privateContact !== null;
  const profileReviewVisible =
    canReadPrivate &&
    onboarding?.requirements.some(
      (requirement) =>
        requirement.kind === "profile" &&
        requirement.requires_review &&
        requirement.status !== "completed",
    );
  const identityReadOnly = readOnly || identityLocked;
  // Why a name cannot be typed into; read out, not printed under the field.
  const nameLockedReason = identityLocked
    ? "Locked after activation"
    : invitePending
      ? "Locked while invitation is pending"
      : undefined;
  const emailValue = linked
    ? (accountEmail ?? draft.invitation_email)
    : draft.invitation_email;
  return (
    <div className="employee-profile-sections">
      <ProfileGroup title="Identity">
        <div className="employee-form-grid">
          <div className="employee-name-grid">
            <Field
              label="First name"
              required={creating}
              value={draft.first_name}
              disabled={identityReadOnly}
              readOnly={invitePending}
              lockedReason={nameLockedReason}
              onChange={(value) =>
                setDraft((current) => ({ ...current, first_name: value }))
              }
            />
            <Field
              label="Middle name"
              optional
              value={draft.middle_name ?? ""}
              disabled={identityReadOnly}
              readOnly={invitePending}
              lockedReason={nameLockedReason}
              onChange={(value) =>
                setDraft((current) => ({ ...current, middle_name: value }))
              }
            />
            <Field
              label="Last name"
              required={creating}
              value={draft.last_name}
              disabled={identityReadOnly}
              readOnly={invitePending}
              lockedReason={nameLockedReason}
              onChange={(value) =>
                setDraft((current) => ({ ...current, last_name: value }))
              }
            />
          </div>
          {/* K2 as changed by KK-205 (BL-777): a preferred name changes only
              by the employee's request and an answer, and the save never wrote
              what was typed here. Only one they asked for is shown. */}
          {!creating && draft.preferred_name ? (
            <ReadOnlyField label="Preferred name" value={draft.preferred_name} />
          ) : null}
          {!creating && canReadPrivate ? (
            <ReadOnlyField
              label="Date of birth"
              value={privateContact?.date_of_birth ?? null}
            />
          ) : null}
          {!creating && pendingNameTarget ? (
            <PendingPreferredNameRow
              workspaceId={pendingNameTarget.workspaceId}
              employeeId={pendingNameTarget.employeeId}
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
            mark={
              linked
                ? { label: "Verified", tone: "verified" }
                : invitePending
                  ? { label: "Invitation pending", tone: "pending" }
                  : undefined
            }
            onChange={(value) =>
              setDraft((current) => ({ ...current, invitation_email: value }))
            }
          />
          {canReadPrivate && (
            <ReadOnlyField
              label="Phone"
              value={displayUsPhone(privateContact?.phone)}
            />
          )}
          {ownEmergencyContact ? (
            <OwnEmergencyContact control={ownEmergencyContact} />
          ) : null}
          {!creating && canReadPrivate && !ownEmergencyContact ? (
            <ReadOnlyField
              label="Emergency contact"
              value={privateContact?.emergency_contact_name ?? null}
            />
          ) : null}
          {!creating && canReadPrivate && !ownEmergencyContact ? (
            <ReadOnlyField
              label="Relationship"
              value={privateContact?.emergency_contact_relationship ?? null}
            />
          ) : null}
          {!creating && canReadPrivate && !ownEmergencyContact ? (
            <ReadOnlyField
              label="Emergency phone"
              value={displayUsPhone(privateContact?.emergency_contact_phone)}
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
            onReview={onReview}
            reviewing={reviewing}
            canReview={canReview}
            canDecideLegalName={canDecideLegalName}
          />
        </section>
      ) : null}
    </div>
  );
}

/** Taking somebody off a location (FB-6.2 S1), and whether they need one. */
interface EmployeeLocationActions {
  readonly onRemove: (locationId: string) => void;
  /** The location being taken off right now, if any. */
  readonly removingLocationId: string | null;
  /** A manager's record: a location is required unless Remote (EMP-001 K4). */
  readonly managerRecord: boolean;
}

function EmploymentSection({
  creating = false,
  draft,
  setDraft,
  readOnly,
  references,
  detail,
  locationActions,
  explainTerminate,
}: {
  creating?: boolean;
  draft: EmployeeInput;
  setDraft: React.Dispatch<React.SetStateAction<EmployeeInput>>;
  readOnly: boolean;
  references: Awaited<ReturnType<typeof loadEmployeeReferenceData>> | undefined;
  /** The saved record; none while creating one. */
  detail: EmployeeDetail | undefined;
  locationActions: EmployeeLocationActions;
  /** A manager reads why Terminate is off for them. */
  explainTerminate: boolean;
}) {
  // ROL-CIFT 2.2: somebody who only manages is never scheduled.
  const scheduled = creating || detail?.access.employee !== false;
  // Where the server lets this reader take them off (employee.remove_from_location).
  const removable = detail?.locations.filter((location) => location.removable) ?? [];
  const removableIds = new Set(removable.map((location) => location.id));
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
        {/* ROL-CIFT 2.2: only somebody with the employee access is ever
            scheduled, so only their record offers to keep them off it. A new
            record has no access yet: it is offered there as before. */}
        {scheduled ? (
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
        ) : null}
      </div>
      <AssignmentPicker
        label="Locations"
        // Nothing is asked of the owner: every location is theirs already.
        required={
          !detail?.is_workspace_owner &&
          !draft.is_remote &&
          (!draft.is_excluded_from_schedule || locationActions.managerRecord)
        }
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
        // The owner works at every location: nothing to pick, no primary (S4).
        fixedReason={detail?.is_workspace_owner ? ownerLocationsReason : undefined}
        // Remove lives on the location's own row and is the one way off it.
        lockedIds={removableIds}
        rowAction={(id) => {
          const location = removable.find((item) => item.id === id);
          return location ? (
            <RemoveFromLocationButton
              location={location}
              removing={locationActions.removingLocationId === id}
              disabled={locationActions.removingLocationId !== null}
              onRemove={locationActions.onRemove}
            />
          ) : null;
        }}
      />
      {explainTerminate && detail && !detail.allowed.terminate && !detail.archived_at ? (
        <TerminateNote detail={detail} removable={removable} />
      ) : null}
      <AssignmentPicker
        label="Jobs"
        // Nothing is asked of the owner here either (BL-482, KK-63).
        required={
          !detail?.is_workspace_owner &&
          !draft.is_remote &&
          !draft.is_excluded_from_schedule
        }
        options={references?.jobs ?? []}
        departments={references?.departments}
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
  roleId,
  onRoleChange,
  changingRole,
  archived,
  allowed,
}: {
  draft: EmployeeInput;
  detail: EmployeeDetail | undefined;
  roles: readonly InviteRoleOption[];
  inviteRoleId: string;
  onAddEmail: () => void;
  /** The invitation controls: the access permission, never an archived record. */
  readOnly: boolean;
  archived: boolean;
  /** What the server says this reader may do to the record. */
  allowed: EmployeeDetail["allowed"] | undefined;
  onRetryInvitation: () => void;
  retryingInvitation: boolean;
  onRevokeInvitation: () => void;
  revokingInvitation: boolean;
  onRemoveAccess: () => void;
  removingAccess: boolean;
  actorRole: WorkspaceRole;
  /** The role picked in the form; Save changes saves it. */
  roleId: string;
  onRoleChange: (roleId: string) => void;
  changingRole: boolean;
}) {
  const linked = Boolean(detail?.user_id);
  const currentRoleId = detail?.role_id ?? "";
  const invitation = detail?.invitation ?? null;
  const email = draft.invitation_email.trim();
  const assignableRoles = roles.filter((role) =>
    canAssignRole(actorRole, role.accessClass, allowed),
  );
  const canChangeRole = !archived && (allowed?.change_role ?? false);
  const canRemoveAccess = !archived && (allowed?.remove_access ?? false);
  // Why the owner's role cannot be picked; read out, not printed under it.
  const ownerRoleReasonId = useId();
  const ownerRoleReason =
    detail?.is_workspace_owner
      ? "Owner access is managed separately."
      : undefined;
  const inviteRoleName = assignableRoles.find(
    (role) => role.id === inviteRoleId,
  )?.name;
  const invitationExpired = Boolean(
    invitation?.status === "pending" &&
    Date.parse(invitation.expires_at) <= Date.now(),
  );
  const state = linked
    ? archived
      ? // Linked but archived: not onboarding (K9, AC8).
        "archived"
      : detail?.display_status === "active"
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
    archived: {
      icon: <KeyRound size={18} aria-hidden />,
      title: "Archived",
      copy: "Access is suspended while the employee is archived.",
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
            <label className="employee-field" title={ownerRoleReason}>
              <span>Workspace role</span>
              <select
                aria-label="Workspace role"
                aria-describedby={ownerRoleReason ? ownerRoleReasonId : undefined}
                value={roleId}
                disabled={
                  !canChangeRole ||
                  changingRole ||
                  assignableRoles.length === 0 ||
                  // One role, the one they hold, is nothing to pick (BL-430).
                  (assignableRoles.length === 1 &&
                    assignableRoles[0]?.id === currentRoleId)
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
              {ownerRoleReason ? (
                <span id={ownerRoleReasonId} className="sr-only">
                  {ownerRoleReason}
                </span>
              ) : null}
            </label>
            {canRemoveAccess ? (
              <ConfirmButton
                className="employee-remove-access danger-button"
                type="button"
                disabled={removingAccess}
                confirmLabel="Confirm remove access"
                title="The employee record and shifts are kept."
                onConfirm={onRemoveAccess}
              >
                <KeyRound size={15} aria-hidden />
                {removingAccess ? "Removing" : "Remove access"}
              </ConfirmButton>
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
              <dd>
                {invitation?.role_name ?? inviteRoleName ?? "Choose a role"}
              </dd>
            </div>
            {invitation ? (
              <div>
                <dt>Invitation status</dt>
                <dd>{stateContent.title}</dd>
              </div>
            ) : null}
            {invitation?.invited_by_name ? (
              <div>
                <dt>Invited by</dt>
                <dd>{invitation.invited_by_name}</dd>
              </div>
            ) : null}
            {invitation?.status === "pending" ? (
              <div>
                <dt>Expires</dt>
                <dd>{formatDateTime(invitation.expires_at)}</dd>
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
              type="button"
              disabled={retryingInvitation}
              onClick={onRetryInvitation}
            >
              <RotateCcw size={15} aria-hidden />
              {retryingInvitation ? "Sending" : "Send reminder"}
            </Button>
            <CopyInvitationLinkButton
              workspaceId={detail?.workspace_id ?? ""}
              employeeId={detail?.id ?? ""}
            />
            <ConfirmButton
              className="employee-revoke-invite danger-button"
              type="button"
              disabled={revokingInvitation}
              confirmLabel="Confirm revoke"
              onConfirm={onRevokeInvitation}
            >
              Revoke invitation
            </ConfirmButton>
          </div>
        ) : null}
      </section>

      <section className="employee-access-group">
        <header>
          <div>
            <h3>Profile photo</h3>
          </div>
          <ImageOff size={18} aria-hidden />
        </header>
        <EmployeeAvatarControl
          workspaceId={detail?.workspace_id ?? ""}
          employeeId={detail?.id ?? ""}
          readOnly={archived || !(allowed?.save ?? false)}
        />
      </section>
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
  const scopeId = useId();
  const photoScope = "Remove only the photo shown for this workspace.";
  const noPhoto = "There is no workspace photo to remove.";
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
    return (
      <LoadingOutline label="Loading profile photo" className="employee-avatar-outline">
        <Skeleton width={44} height={44} className="employee-avatar-skeleton" />
        <Skeleton width="40%" height={12} />
      </LoadingOutline>
    );
  if (avatar.isError && !avatar.data)
    return (
      <LoadError
        inset
        level={3}
        title="We couldn't load the profile photo"
        detail="The photo didn't load. Nothing was changed."
        retrying={avatar.isFetching}
        onRetry={() => void avatar.refetch()}
      />
    );
  const hasAvatar = Boolean(avatar.data?.present);

  return (
    <>
    {avatar.isError ? (
      <RefreshError
        message="The profile photo didn't refresh. This is the last photo that loaded."
        retrying={avatar.isFetching}
        onRetry={() => void avatar.refetch()}
      />
    ) : null}
    <div className="employee-avatar-control">
      {hasAvatar && avatar.data?.url ? (
        <img src={avatar.data.url} alt="Employee workspace profile" />
      ) : (
        <span className="employee-avatar-placeholder" aria-hidden>
          <UserRound size={20} />
        </span>
      )}
      {/* A row naming a removal nobody here can do is not drawn (BL-408). */}
      {!readOnly ? (
        <div>
          <strong>Profile photo removal</strong>
          <FieldNote
            id="employee-avatar-remove"
            error={remove.error ? errorMessage(remove.error) : null}
          />
        </div>
      ) : null}
      {!readOnly ? (
        <ConfirmButton
          className="danger-button"
          type="button"
          disabled={!hasAvatar || remove.isPending}
          confirmLabel="Confirm remove"
          // Which photo goes: read out and shown on hover, not printed.
          aria-describedby={scopeId}
          title={hasAvatar ? photoScope : noPhoto}
          onConfirm={() => remove.mutate()}
        >
          <ImageOff size={15} aria-hidden />
          {remove.isPending ? "Removing" : "Remove photo"}
        </ConfirmButton>
      ) : null}
      {!readOnly ? (
        <span id={scopeId} className="sr-only">
          {/* Off for a reason that is said, too (BL-473). */}
          {hasAvatar ? photoScope : noPhoto}
        </span>
      ) : null}
    </div>
    </>
  );
}

const roleRank: Record<WorkspaceRole, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  employee: 1,
};

/**
 * May this role be given to the record? Whether the reader may change the
 * record's role at all, and make an admin, is the server's answer; a role is
 * only ever given below the giver's own rank.
 */
function canAssignRole(
  actorRole: WorkspaceRole,
  targetAccessClass: WorkspaceRole,
  allowed: EmployeeDetail["allowed"] | undefined,
) {
  if (!allowed || targetAccessClass === "owner") return false;
  if (targetAccessClass === "admin") return allowed.make_admin;
  return allowed.change_role && roleRank[targetAccessClass] < roleRank[actorRole];
}

function InviteRoleField({
  roles,
  inviteRoleId,
  onInviteRoleChange,
  rolesState,
  waitsForEmail = false,
  disabled,
  invalidAttempt,
}: {
  roles: readonly InviteRoleOption[];
  inviteRoleId: string;
  onInviteRoleChange: (roleId: string) => void;
  rolesState: "loading" | "error" | "ready";
  /** The role only matters for an invite, so it waits for an email (bug 3). */
  waitsForEmail?: boolean;
  disabled: boolean;
  invalidAttempt: number;
}) {
  const noteId = useId();
  // Loading, a failed load and truly no roles each say so (bug 3).
  const empty =
    rolesState === "loading"
      ? "Loading roles…"
      : rolesState === "error"
        ? "Roles didn't load"
        : "You can't invite with any role";
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
        aria-describedby={noteId}
        aria-invalid={invalid || undefined}
        value={selectedRoleId}
        disabled={disabled || roles.length === 0}
        onChange={(event) => onInviteRoleChange(event.target.value)}
      >
        {roles.length > 0 ? <option value="">Select a role</option> : null}
        {roles.length === 0 ? <option value="">{empty}</option> : null}
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
      <small id={noteId}>
        {waitsForEmail
          ? "Add an email to choose an invite role."
          : "The selected role is applied when the invite is accepted."}
      </small>
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
            <small>{formatDateTime(event.occurred_at)}</small>
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
  lockedReason,
  mark,
  required = false,
  optional = false,
  refusal,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  readOnly?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  type?: string;
  /** Why it cannot be typed into: read out and shown on hover, never printed. */
  lockedReason?: string;
  /** A state drawn inside the field, at its end, with its name. */
  mark?: { label: string; tone: "verified" | "pending" };
  required?: boolean;
  /** Says so beside the label, rather than leaving it to be inferred. */
  optional?: boolean;
  /** Said under the field as it is typed (TEL-2). */
  refusal?: string | null;
}) {
  const [touched, setTouched] = useState(false);
  const id = useId();
  const phoneBroken = type === "tel" && Boolean(value.trim()) && toUsPhone(value) === null;
  const invalid =
    touched &&
    ((required && !value.trim()) ||
      phoneBroken ||
      (type === "email" &&
        Boolean(value.trim()) &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())));
  const validationMessage =
    type === "email"
      ? "Enter a valid email address."
      : phoneBroken
        ? usPhoneMessage
        : `${label} is required.`;
  // The US letter rule (BL-503), said as it is typed, not on leaving the field.
  const lettersBroken =
    type === "text" && !readOnly && !disabled && hasTurkishOnlyLetters(value);
  // The note under the field (TEL-2, UI-FIELDMSG-2): every check that fails,
  // each said whole, none dropped; nothing while all pass.
  const note =
    [refusal, invalid ? validationMessage : null, lettersBroken ? usLettersMessage : null]
      .filter(Boolean)
      .join(" ") || null;
  const describedBy = [
    fieldNoteId(id, note),
    lockedReason ? `${id}-reason` : null,
    mark ? `${id}-mark` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const MarkIcon = mark?.tone === "verified" ? CheckCircle2 : Clock3;
  const markTouched = (event: React.FocusEvent<HTMLInputElement>) => {
    if (
      event.relatedTarget instanceof Element &&
      event.relatedTarget.closest(".employee-drawer")
    )
      setTouched(true);
  };
  return (
    <label
      className={`employee-field${type === "email" ? " employee-email-field" : ""}`}
      title={lockedReason}
    >
      <span>
        {label}
        {required ? (
          <small className="employee-field-requirement" aria-hidden>
            Required
          </small>
        ) : optional ? (
          <small className="field-optional" aria-hidden>
            optional
          </small>
        ) : null}
      </span>
      <span className="employee-field-control" title={mark?.label}>
        {type === "tel" ? (
          // The one US phone field (BL-503): a fixed +1 and the mask.
          <UsPhoneInput
            aria-label={label}
            aria-required={required || undefined}
            aria-invalid={invalid || Boolean(refusal) || undefined}
            aria-describedby={describedBy || undefined}
            onBlur={markTouched}
            value={value}
            disabled={disabled}
            readOnly={readOnly}
            onChange={onChange}
          />
        ) : (
          <input
            ref={inputRef}
            aria-label={label}
            aria-required={required || undefined}
            aria-invalid={invalid || lettersBroken || undefined}
            aria-describedby={describedBy || undefined}
            onBlur={markTouched}
            type={type}
            value={value}
            // A long address is cut by the mark at the field's end (BL-439).
            title={type === "email" && value ? value : undefined}
            disabled={disabled}
            readOnly={readOnly}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
        {mark ? (
          <span
            id={`${id}-mark`}
            className={`employee-field-mark is-${mark.tone}`}
            role="img"
            aria-label={mark.label}
          >
            <MarkIcon size={16} aria-hidden />
          </span>
        ) : null}
      </span>
      <FieldNote id={id} error={note} className="employee-field-helper" />
      {lockedReason ? (
        <span id={`${id}-reason`} className="sr-only">
          {lockedReason}
        </span>
      ) : null}
    </label>
  );
}

const ownerLocationsReason = "The workspace owner works at every location.";

function AssignmentPicker({
  label,
  options,
  selected,
  primary,
  disabled,
  onChange,
  required = false,
  searchable = true,
  lockedIds,
  rowAction,
  fixedReason,
  departments,
}: {
  /** Rows only their own action takes off (Remove from a location). */
  lockedIds?: ReadonlySet<string>;
  rowAction?: (optionId: string) => React.ReactNode;
  /**
   * Set when nothing here is the reader's to pick (the owner's locations):
   * every row is switched off as it was read, with no Primary, for this reason.
   */
  fixedReason?: string;
  /** Jobs are listed under these, Management last (BL-218 .5). */
  departments?: readonly EmployeeDepartmentOption[];
  label: string;
  /** `owner`: the Owner job, the one job never marked primary (EMP-001 S2). */
  options: readonly (EmployeeOption & {
    readonly owner?: boolean;
    readonly departmentId?: string | null;
  })[];
  selected: readonly string[];
  primary: string | null;
  disabled: boolean;
  onChange: (ids: string[], primary: string | null) => void;
  required?: boolean;
  searchable?: boolean;
}) {
  const [search, setSearch] = useState("");
  const groupId = useId();
  const ownerJobId = options.find((option) => option.owner)?.id;
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
      {byDepartment(matching, departments ?? []).map((group) => (
        <Fragment key={group.id}>
          {group.name ? (
            <strong
              id={`${groupId}-${group.id}`}
              className="employee-assignment-group"
            >
              {group.name}
            </strong>
          ) : null}
          {group.options.map((option) => {
            const checked = selected.includes(option.id);
            // The Owner job is nobody's to tick or untick (EMP-001 C, item 9).
            const reason = option.owner ? ownerJobReason : fixedReason;
            const locked =
              Boolean(reason) ||
              (checked && (lockedIds?.has(option.id) ?? false));
            return (
              <div
                key={option.id}
                data-locked={locked ? "true" : undefined}
                // Off for a reason, not for its own Remove: the name greys too.
                data-locked-reason={reason ? "true" : undefined}
              >
                <label title={reason}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    aria-describedby={
                      [
                        group.name ? `${groupId}-${group.id}` : null,
                        reason ? `${groupId}-reason` : null,
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    onChange={() => {
                      const ids = checked
                        ? selected.filter((id) => id !== option.id)
                        : [...selected, option.id];
                      // Unticking moves the primary only off the one unticked;
                      // ticking fills an empty primary unless it is the Owner job.
                      onChange(
                        ids,
                        checked
                          ? primary === option.id
                            ? firstJobExceptOwner(ids, ownerJobId)
                            : primary
                          : (primary ?? (option.owner ? null : option.id)),
                      );
                    }}
                  />
                  <span>{option.name}</span>
                  {option.archived ? <small>Archived</small> : null}
                </label>
                {checked && !reason ? (
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
                {checked ? rowAction?.(option.id) : null}
              </div>
            );
          })}
        </Fragment>
      ))}
      {/* Why a row is switched off: read out, not printed (the drawer's rule). */}
      {fixedReason || ownerJobId ? (
        <span id={`${groupId}-reason`} className="sr-only">
          {fixedReason ?? ownerJobReason}
        </span>
      ) : null}
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

/**
 * The picker's rows under their departments (BL-218 .5): departments as given,
 * then jobs in none, Management last. With no job in any department the list
 * stays plain, under no heading.
 */
function byDepartment<Option extends { readonly departmentId?: string | null }>(
  options: readonly Option[],
  departments: readonly EmployeeDepartmentOption[],
): { id: string; name: string | null; options: readonly Option[] }[] {
  const under = (department: EmployeeDepartmentOption) => ({
    id: department.id,
    name: department.name,
    options: options.filter((option) => option.departmentId === department.id),
  });
  const groups = [
    ...departments.filter((department) => !department.management).map(under),
    {
      id: "none",
      name: "No department",
      options: options.filter(
        (option) => !departments.some((item) => item.id === option.departmentId),
      ),
    },
    ...departments.filter((department) => department.management).map(under),
  ].filter((group) => group.options.length > 0);
  return groups.some((group) => group.id !== "none")
    ? groups
    : [{ id: "none", name: null, options }];
}

function toDraft(detail: EmployeeDetail): EmployeeInput {
  return {
    first_name: detail.first_name,
    middle_name: detail.middle_name ?? "",
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
    // The owner holds every location and every job, so the form does not ask
    // which one is primary.
    is_owner_record: detail.is_workspace_owner,
    expected_revision: detail.revision,
  };
}

function statusLabel(status: string): string {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * The invitation link itself, for when email did not arrive and the admin has
 * to hand it over another way. The server records the copy; the button says
 * plainly that it happened.
 */
function CopyInvitationLinkButton({
  workspaceId,
  employeeId,
}: {
  readonly workspaceId: string;
  readonly employeeId: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = useMutation({
    mutationFn: () => loadEmployeeInvitationLink(workspaceId, employeeId),
    onSuccess: async (link) => {
      try {
        await navigator.clipboard.writeText(link.url);
        setState("copied");
      } catch {
        setState("failed");
      }
    },
    // The server's own wording is not for the screen.
    onError: () => setState("failed"),
  });

  return (
    <Button
      type="button"
      disabled={copy.isPending || !workspaceId || !employeeId}
      onClick={() => {
        setState("idle");
        copy.mutate();
      }}
    >
      <ClipboardCopy size={15} aria-hidden />
      {copy.isPending
        ? "Copying"
        : state === "copied"
          ? "Link copied"
          : state === "failed"
            ? "Copy failed"
            : "Copy link"}
    </Button>
  );
}

/** A zone in words, "Pacific Time (Los Angeles)", not its code (E3-37). */
function zoneName(zone: string): string {
  try {
    const generic = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longGeneric",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    const city = zone.split("/").pop()?.replaceAll("_", " ");
    return generic && city ? `${generic} (${city})` : zone;
  } catch {
    return zone;
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "on an unknown date"
    : // To the minute (BL-674, Employees half).
      date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * What was typed over `before`, laid on `next` (someone else's save): a field
 * typed wins, a field left alone takes the new value; lists take the items
 * added and drop the items removed, so the other person's additions stay
 * (BL-781, review O2). A primary no longer in its list falls back to the new
 * one, else to none.
 */
function mergeTypedOver(
  typed: EmployeeInput,
  before: EmployeeInput,
  next: EmployeeInput,
): EmployeeInput {
  const merged: Record<string, unknown> = { ...next };
  for (const key of Object.keys(typed) as (keyof EmployeeInput)[]) {
    if (key === "expected_revision") continue;
    const now = typed[key];
    const was = before[key];
    if (Array.isArray(now) && Array.isArray(was)) {
      const base = (next[key] as string[] | undefined) ?? [];
      const added = now.filter((id) => !was.includes(id));
      const removed = was.filter((id) => !now.includes(id));
      merged[key] = [
        ...base.filter((id) => !removed.includes(id)),
        ...added.filter((id) => !base.includes(id)),
      ];
    } else if (JSON.stringify(now) !== JSON.stringify(was)) {
      merged[key] = now;
    }
  }
  const result = merged as EmployeeInput;
  // No primary stays none (a Remote person, the owner); one taken out of its
  // list falls back to the new record's, else to none and the form asks.
  // Nothing is picked for the person (P11, review O3).
  const keepPrimary = (primary: string | null, list: readonly string[], fallback: string | null) =>
    primary === null || list.includes(primary)
      ? primary
      : fallback && list.includes(fallback)
        ? fallback
        : null;
  return {
    ...result,
    primary_location_id: keepPrimary(
      result.primary_location_id,
      result.location_ids,
      next.primary_location_id,
    ),
    primary_job_id: keepPrimary(result.primary_job_id, result.job_ids, next.primary_job_id),
  };
}

/**
 * The record moved on under the form: the server's PT409 with the hint
 * `employee.revision_conflict` (BL-958 / ACIL-40001, KK). Until that lands the
 * database raises 40001 and this never fires; #25 waits on it.
 */
function isRevisionConflict(error: unknown): boolean {
  return (
    error instanceof RequestError &&
    error.status === 409 &&
    error.reason === "employee.revision_conflict"
  );
}

/** The onboarding under review moved on: PT409 with `onboarding.changed` (BL-1046). */
function isOnboardingChanged(error: unknown): boolean {
  return (
    error instanceof RequestError &&
    error.status === 409 &&
    error.reason === "onboarding.changed"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Employee operation failed";
}

/**
 * The owner's own emergency contact. Everyone else gives one while onboarding,
 * and the owner never runs it, so theirs is entered here — by them, and never
 * required.
 */
/** The owner's own emergency contact, typed into the drawer's one Save (K3). */
type ContactDraft = {
  readonly name: string;
  readonly relationship: string;
  readonly phone: string;
};

interface OwnContactControl {
  readonly value: ContactDraft;
  readonly onChange: (next: ContactDraft) => void;
  /** Once anything is typed, a name and a number are both needed. */
  readonly required: boolean;
  /** The number is the owner's own (TEL-2). */
  readonly isOwnPhone: boolean;
  readonly disabled: boolean;
}

function OwnEmergencyContact({ control }: { readonly control: OwnContactControl }) {
  const { value, onChange, required, disabled, isOwnPhone } = control;
  return (
    <>
      <Field
        label="Emergency contact"
        optional={!required}
        required={required}
        value={value.name}
        disabled={disabled}
        onChange={(name) => onChange({ ...value, name })}
      />
      <Field
        label="Relationship"
        optional
        value={value.relationship}
        disabled={disabled}
        onChange={(relationship) => onChange({ ...value, relationship })}
      />
      <Field
        label="Emergency phone"
        type="tel"
        optional={!required}
        required={required}
        value={value.phone}
        disabled={disabled}
        onChange={(phone) => onChange({ ...value, phone })}
        refusal={isOwnPhone ? emergencyIsOwnPhoneMessage : null}
      />
    </>
  );
}

/**
 * A preferred name this person has asked for and the workspace has not
 * answered. It only appears where a workspace chose to answer them; on the
 * other setting a name is simply the name.
 *
 * Refusing says nothing to the person. That is the decision: a refusal is not
 * a conversation the workspace has to have, and a name that never appears is
 * the whole of it.
 */
export function PendingPreferredNameRow({
  workspaceId,
  employeeId,
}: {
  readonly workspaceId: string;
  readonly employeeId: string;
}) {
  const cache = useQueryClient();
  const pending = useQuery({
    queryKey: ["preferred-names-pending", workspaceId],
    queryFn: () => listPendingPreferredNames(workspaceId),
  });
  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      decidePreferredName(workspaceId, waiting!.requestId, approve),
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: ["preferred-names-pending", workspaceId],
      });
      await cache.invalidateQueries({ queryKey: ["employee-detail"] });
      // The list shows the name they now go by (BL-785).
      await cache.invalidateQueries({ queryKey: ["employees", workspaceId] });
    },
    // Someone may have answered it already; show the current list.
    onError: () =>
      cache.invalidateQueries({
        queryKey: ["preferred-names-pending", workspaceId],
      }),
  });
  const waiting = (pending.data ?? []).find(
    (request) => request.employeeId === employeeId,
  );

  if (!waiting) return null;

  return (
    <div className="employee-preferred-name-pending wide">
      <span>
        Asked to be called <strong>{waiting.requestedName}</strong> here.
      </span>
      <div className="pb-row-actions">
        <Button
          type="button"
          disabled={decide.isPending}
          onClick={() => decide.mutate(true)}
        >
          Use it
        </Button>
        <Button
          type="button"
          className="secondary-button"
          disabled={decide.isPending}
          onClick={() => decide.mutate(false)}
        >
          Leave it
        </Button>
      </div>
      <FieldNote
        id="preferred-name-decision"
        error={decide.error ? errorMessage(decide.error) : null}
      />
    </div>
  );
}
