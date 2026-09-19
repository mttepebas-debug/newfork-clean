import type { ActiveWorkspaceContext, WorkspaceSummary } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Crown, Ellipsis, Plus, Star, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { clearTenantQueriesForOrganizationSwitch } from "../auth/tenant-query-cache";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import { InvitationRow } from "../employees/InvitationRow";
import { BusinessRow, StatusBadge, roleLabel } from "../shell/prebiz/PreBiz";
import { AccountPageHeader } from "./components";
import {
  createOwnerWorkspace,
  cancelWorkspaceClosure,
  cancelWorkspaceOwnershipTransfer,
  clearTabWorkspaceId,
  searchWorkspaceOwnershipCandidates,
  type OwnershipCandidate,
  initiateWorkspaceOwnershipTransfer,
  listAccountWorkspaces,
  requestWorkspaceClosure,
  respondWorkspaceOwnershipTransfer,
  selectActiveWorkspace,
  setDefaultWorkspace,
  setTabWorkspaceId,
  supabaseClient,
} from "../lib/supabase";

export default function WorkspacesPage() {
  const { account, context, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(
    () => (location.state as { openCreate?: boolean } | null)?.openCreate === true,
  );
  const createDialog = useRef<HTMLDialogElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const actionTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const [openActionsWorkspaceId, setOpenActionsWorkspaceId] = useState<string | null>(null);
  const [activatingWorkspaceId, setActivatingWorkspaceId] = useState<
    string | null
  >(null);
  const [defaultingWorkspaceId, setDefaultingWorkspaceId] = useState<
    string | null
  >(null);
  const [closureTarget, setClosureTarget] = useState<{
    workspace: WorkspaceSummary;
    mode: "scheduled_end_period" | "immediate";
  } | null>(null);
  const [closureNameConfirmation, setClosureNameConfirmation] = useState("");
  const [closureAcknowledged, setClosureAcknowledged] = useState(false);
  const [closingWorkspaceId, setClosingWorkspaceId] = useState<string | null>(
    null,
  );
  const [transferTarget, setTransferTarget] = useState<WorkspaceSummary | null>(
    null,
  );
  const [transferTargetUserId, setTransferTargetUserId] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidates, setCandidates] = useState<OwnershipCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [transferAcknowledged, setTransferAcknowledged] = useState(false);
  const [transferResponseTarget, setTransferResponseTarget] = useState<{
    workspace: WorkspaceSummary;
    action: "accept" | "reject";
  } | null>(null);
  const [sensitivePassword, setSensitivePassword] = useState("");
  const [transferringWorkspaceId, setTransferringWorkspaceId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const accessibleWorkspaces = workspaces.filter(workspace => workspace.status === "active" &&
    ((workspace.lifecycleStatus ?? "active") === "active" ||
      (workspace.lifecycleStatus === "closure_scheduled" && !!workspace.closureEffectiveAt && Date.parse(workspace.closureEffectiveAt) > Date.now())));
  const invitationsQuery = useQuery({
    queryKey: ["account-pending-invitations"],
    queryFn: listPendingEmployeeInvitations,
    enabled: supabaseClient !== null,
  });
  const invitations = invitationsQuery.data ?? [];
  // An invited account without an owner membership is an employee: it answers
  // the invitation first. The database enforces the same rule.
  const canCreate = loaded && !loading && (
    workspaces.some(workspace => workspace.role === "owner" && workspace.status === "active") ||
    (workspaces.length === 0 && (supabaseClient === null || (invitationsQuery.isSuccess && invitations.length === 0))));
  const currentWorkspaceId = context?.workspace.id ?? null;
  const onboardingWorkspaces = workspaces.filter(workspace => workspace.status === "pending");
  const orderedWorkspaces = [...accessibleWorkspaces, ...onboardingWorkspaces].sort((a, b) =>
    Number(b.id === currentWorkspaceId) - Number(a.id === currentWorkspaceId) ||
    Number(b.isActive) - Number(a.isActive));

  useEffect(() => {
    if (!createOpen || !canCreate) return;
    createDialog.current?.showModal();
    return () => document.getElementById("create-workspace-trigger")?.focus();
  }, [createOpen, canCreate]);

  useEffect(() => {
    if (!openActionsWorkspaceId) return;
    const workspaceId = openActionsWorkspaceId;
    const closeMenu = (returnFocus: boolean): void => {
      setOpenActionsWorkspaceId(null);
      if (returnFocus) {
        window.requestAnimationFrame(() => actionTriggerRefs.current.get(workspaceId)?.focus());
      }
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (!actionsMenuRef.current?.contains(event.target as Node)) closeMenu(true);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu(true);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openActionsWorkspaceId]);

  const closeActionsMenu = (workspaceId: string, returnFocus = true): void => {
    setOpenActionsWorkspaceId(null);
    if (returnFocus) {
      window.requestAnimationFrame(() => actionTriggerRefs.current.get(workspaceId)?.focus());
    }
  };

  useEffect(() => {
    setCandidates([]);
    setSearchError(null);
    if (!supabaseClient || !transferTarget || candidateQuery.trim().length < 2) { setSearching(false); return; }
    let active = true;
    const client = supabaseClient;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchWorkspaceOwnershipCandidates(client, transferTarget.id, candidateQuery.trim())
        .then(items => { if (active) setCandidates(items); })
        .catch(error => { if (active) setSearchError(error instanceof Error ? error.message : "Admins could not be loaded"); })
        .finally(() => { if (active) setSearching(false); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [transferTarget, candidateQuery]);

  useEffect(() => {
    if (!supabaseClient) {
      setWorkspaces(context ? [workspaceSummaryFromContext(context)] : []);
      setLoaded(true);
      return;
    }
    let active = true;
    setLoading(true);
    setLoaded(false);
    setWorkspaces([]);
    setError(null);
    void (async () => {
      try {
        const items = await listAccountWorkspaces(supabaseClient);
        if (!active) return;
        setWorkspaces(items);
        setLoaded(true);
      } catch (loadError: unknown) {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Workspaces could not be loaded",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [context, account?.userId]);

  const reloadWorkspaces = async (): Promise<void> => {
    if (!supabaseClient) {
      setWorkspaces(context ? [workspaceSummaryFromContext(context)] : []);
      return;
    }
    setWorkspaces(await listAccountWorkspaces(supabaseClient));
  };

  const createWorkspace = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!supabaseClient || !canCreate) return;
    setCreating(true);
    setError(null);
    try {
      const createdWorkspaceId = await createOwnerWorkspace(
        supabaseClient,
        workspaceName,
      );
      setTabWorkspaceId(createdWorkspaceId);
      await refresh();
      navigate("/onboarding");
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Workspace could not be created",
      );
    } finally {
      setCreating(false);
    }
  };

  const openCreateDialog = (): void => {
    setWorkspaceName("");
    setError(null);
    setCreateOpen(true);
  };

  const activate = async (workspace: WorkspaceSummary): Promise<void> => {
    if (!supabaseClient) {
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      navigate(workspaceDestinationFromRole(workspace.role), {
        replace: true,
      });
      return;
    }
    setActivatingWorkspaceId(workspace.id);
    setError(null);
    try {
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      await selectActiveWorkspace(supabaseClient, workspace.id);
      const resolvedContext = await refresh();
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      if (!resolvedContext) {
        setError("Workspace context could not be loaded");
        return;
      }
      navigate(workspaceDestinationFromRole(resolvedContext.membership.role), {
        replace: true,
      });
    } catch (activationError: unknown) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : "Workspace could not be selected",
      );
    } finally {
      setActivatingWorkspaceId(null);
    }
  };

  const makeDefault = async (workspace: WorkspaceSummary): Promise<void> => {
    if (!supabaseClient || workspace.isActive) return;
    setDefaultingWorkspaceId(workspace.id);
    setError(null);
    try {
      await setDefaultWorkspace(supabaseClient, workspace.id);
      setWorkspaces(current => current.map(item => ({
        ...item,
        isActive: item.id === workspace.id,
      })));
    } catch (defaultError: unknown) {
      setError(
        defaultError instanceof Error
          ? defaultError.message
          : "Default workspace could not be changed",
      );
    } finally {
      setDefaultingWorkspaceId(null);
    }
  };

  const beginClosure = (
    workspace: WorkspaceSummary,
    mode: "scheduled_end_period" | "immediate",
  ): void => {
    setTransferTarget(null);
    setTransferResponseTarget(null);
    setClosureTarget({ workspace, mode });
    setClosureNameConfirmation("");
    setClosureAcknowledged(false);
    setSensitivePassword("");
    setError(null);
  };

  const reauthenticateForSensitiveAction = async (): Promise<void> => {
    if (!supabaseClient) return;
    const password = sensitivePassword.trim();
    if (!password) throw new Error("Enter your account password to continue");
    if (!account?.email)
      throw new Error("Account email is required to reauthenticate");
    const { error: signInError } =
      await supabaseClient.auth.signInWithPassword({
        email: account.email,
        password,
      });
    if (signInError) throw new Error("Recent reauthentication failed");
  };

  const submitClosure = async (): Promise<void> => {
    if (!supabaseClient || !closureTarget) return;
    setClosingWorkspaceId(closureTarget.workspace.id);
    setError(null);
    try {
      if (closureTarget.mode === "immediate") {
        await reauthenticateForSensitiveAction();
      }
      await requestWorkspaceClosure(supabaseClient, {
        workspaceId: closureTarget.workspace.id,
        mode: closureTarget.mode,
        typedWorkspaceName:
          closureTarget.mode === "immediate" ? closureNameConfirmation : null,
      });
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      if (
        closureTarget.mode === "immediate" &&
        closureTarget.workspace.id === currentWorkspaceId
      ) {
        clearTabWorkspaceId();
        const remaining = (await listAccountWorkspaces(supabaseClient)).filter(workspace => workspace.id !== closureTarget.workspace.id && workspace.status === "active" &&
          ((workspace.lifecycleStatus ?? "active") === "active" || (workspace.lifecycleStatus === "closure_scheduled" && !!workspace.closureEffectiveAt && Date.parse(workspace.closureEffectiveAt) > Date.now())));
        setWorkspaces(remaining);
        const next = remaining.find(workspace => workspace.isActive) ?? remaining[0];
        if (next) await selectActiveWorkspace(supabaseClient, next.id);
        const resolved = await refresh();
        navigate(next && resolved ? workspaceDestinationFromRole(resolved.membership.role) : "/organization-switcher", { replace: true });
      } else {
        await refresh();
        await reloadWorkspaces();
      }
      setClosureTarget(null);
      setSensitivePassword("");
    } catch (closureError: unknown) {
      setError(
        closureError instanceof Error
          ? closureError.message
          : "Workspace closure could not be requested",
      );
    } finally {
      setClosingWorkspaceId(null);
    }
  };

  const cancelClosure = async (workspace: WorkspaceSummary): Promise<void> => {
    if (!supabaseClient) return;
    setClosingWorkspaceId(workspace.id);
    setError(null);
    try {
      await cancelWorkspaceClosure(supabaseClient, workspace.id);
      await reloadWorkspaces();
    } catch (closureError: unknown) {
      setError(
        closureError instanceof Error
          ? closureError.message
          : "Workspace closure could not be cancelled",
      );
    } finally {
      setClosingWorkspaceId(null);
    }
  };

  const beginTransfer = (workspace: WorkspaceSummary): void => {
    setClosureTarget(null);
    setTransferResponseTarget(null);
    setTransferTarget(workspace);
    setTransferTargetUserId("");
    setCandidateQuery("");
    setCandidates([]);
    setTransferAcknowledged(false);
    setSensitivePassword("");
    setError(null);
  };

  const submitTransfer = async (): Promise<void> => {
    if (!supabaseClient || !transferTarget || !candidates.some(candidate => candidate.userId === transferTargetUserId)) return;
    setTransferringWorkspaceId(transferTarget.id);
    setError(null);
    try {
      await reauthenticateForSensitiveAction();
      await initiateWorkspaceOwnershipTransfer(supabaseClient, {
        workspaceId: transferTarget.id,
        targetUserId: transferTargetUserId.trim(),
      });
      await reloadWorkspaces();
      setTransferTarget(null);
      setSensitivePassword("");
    } catch (transferError: unknown) {
      setError(
        transferError instanceof Error
          ? transferError.message
          : "Ownership transfer could not be started",
      );
    } finally {
      setTransferringWorkspaceId(null);
    }
  };

  const respondToTransfer = async (
    workspace: WorkspaceSummary,
    action: "accept" | "reject",
  ): Promise<void> => {
    if (!supabaseClient || !workspace.pendingOwnershipTransfer) return;
    setTransferringWorkspaceId(workspace.id);
    setError(null);
    try {
      if (action === "accept") await reauthenticateForSensitiveAction();
      await respondWorkspaceOwnershipTransfer(supabaseClient, {
        workspaceId: workspace.id,
        transferId: workspace.pendingOwnershipTransfer.id,
        action,
      });
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      await refresh();
      await reloadWorkspaces();
      setTransferResponseTarget(null);
      setSensitivePassword("");
    } catch (transferError: unknown) {
      setError(
        transferError instanceof Error
          ? transferError.message
          : "Ownership transfer response could not be saved",
      );
    } finally {
      setTransferringWorkspaceId(null);
    }
  };

  const cancelTransfer = async (workspace: WorkspaceSummary): Promise<void> => {
    if (!supabaseClient || !workspace.pendingOwnershipTransfer) return;
    setTransferringWorkspaceId(workspace.id);
    setError(null);
    try {
      await cancelWorkspaceOwnershipTransfer(supabaseClient, workspace.id, workspace.pendingOwnershipTransfer.id);
      await reloadWorkspaces();
    } catch (error) { setError(error instanceof Error ? error.message : "Transfer could not be cancelled"); }
    finally { setTransferringWorkspaceId(null); }
  };

  return (
    <section className="account-page" aria-labelledby="workspaces-title">
      <AccountPageHeader
        title="Workspaces"
        titleId="workspaces-title"
        description="See every workspace linked to this account and manage ownership deliberately."
        action={canCreate ? (
          <Button
            id="create-workspace-trigger"
            type="button"
            className="primary-button"
            onClick={openCreateDialog}
          >
            <Plus size={16} aria-hidden /> Create business
          </Button>
        ) : undefined}
      />
      {orderedWorkspaces.filter(workspace => workspace.pendingOwnershipTransfer?.role === "target").map(workspace => (
        <div key={workspace.id} className="account-notice workspace-transfer-banner" role="region" aria-label={`Ownership request for ${workspace.name}`}>
          <strong>Ownership transfer · {workspace.name}</strong>
          <p>You have been asked to become the owner. Review the request before it expires.</p>
          <div className="workspace-row-actions">
            {(["reject", "accept"] as const).map(action => (
              <Button key={action} type="button" className={action === "accept" ? "primary-button compact-button" : "secondary-button compact-button"}
                disabled={transferringWorkspaceId === workspace.id}
                aria-label={`${action === "accept" ? "Accept" : "Reject"} owner transfer for ${workspace.name}`}
                onClick={() => { setClosureTarget(null); setTransferTarget(null); setTransferResponseTarget({ workspace, action }); setSensitivePassword(""); setError(null); }}>
                {action === "accept" ? "Accept owner transfer" : "Reject owner transfer"}
              </Button>
            ))}
          </div>
        </div>
      ))}
      {loading ? (
        <p className="settings-state" role="status">
          Loading workspaces...
        </p>
      ) : null}
      {/* The kit rows are list items, so the container says it is their list. */}
      <div className="workspace-list" role="list" aria-label="Businesses">
        {invitations.map(invitation => (
          <InvitationRow key={invitation.id} invitation={invitation} />
        ))}
        {orderedWorkspaces.length === 0 && !loading ? (
          <div className="workspace-row empty-workspace-row" role="listitem">
            <div>
              <strong>No businesses yet</strong>
              <span>{invitations.length > 0 ? "Respond to your invitation to continue." : "Create your first business to continue."}</span>
              {canCreate ? <Button type="button" onClick={openCreateDialog}>Create business</Button> : null}
            </div>
          </div>
        ) : null}
        {orderedWorkspaces.map((workspace) => {
          const activating = activatingWorkspaceId === workspace.id;
          const lifecycleStatus = workspace.lifecycleStatus ?? "active";
          const pendingTransfer = workspace.pendingOwnershipTransfer ?? null;
          const isCurrent = workspace.id === currentWorkspaceId;
          const onboarding = workspace.status === "pending";
          // An employer draft is active but not set up: it is continued, not opened.
          const draft = workspace.status === "active" && workspace.onboarding.status !== "complete";
          const hasOwnerActions = workspace.role === "owner" && (
            (!pendingTransfer && (lifecycleStatus === "active" || lifecycleStatus === "closure_scheduled")) ||
            pendingTransfer?.role === "initiator"
          );
          const actionsOpen = openActionsWorkspaceId === workspace.id;
          return (
            <BusinessRow
              key={workspace.id}
              name={workspace.name}
              role={roleLabel[workspace.role]}
              current={isCurrent}
              badge={
                <>
                  {onboarding ? <StatusBadge tone="progress">Onboarding in progress</StatusBadge> : null}
                  {draft ? <StatusBadge tone="progress">Setup in progress</StatusBadge> : null}
                  {workspace.isActive ? <StatusBadge>Default</StatusBadge> : null}
                  {lifecycleStatus === "closure_scheduled"
                    ? <StatusBadge>Closes {formatClosureDate(workspace.closureEffectiveAt ?? null)}</StatusBadge>
                    : null}
                  {pendingTransfer
                    ? <StatusBadge tone="progress">Ownership transfer {pendingTransfer.role === "target" ? "needs response" : "pending"}</StatusBadge>
                    : null}
                </>
              }
            >
                {isCurrent ? (
                  <span className="account-pill active-workspace" aria-label={`${workspace.name} is the current business`}>
                    <Check size={15} aria-hidden />
                    Current
                  </span>
                ) : onboarding ? (
                  <Button
                    className="pb-btn pb-btn-primary"
                    type="button"
                    aria-label={`Continue onboarding for ${workspace.name}`}
                    onClick={() => navigate(`/welcome/${workspace.id}`)}
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    className="pb-btn pb-btn-primary"
                    type="button"
                    aria-label={draft ? `Continue setup for ${workspace.name}` : `Open ${workspace.name}`}
                    disabled={activating}
                    onClick={() => activate(workspace)}
                  >
                    {activating ? "Opening" : draft ? "Continue" : "Open"}
                  </Button>
                )}
                <div className="workspace-actions-menu" ref={actionsOpen ? actionsMenuRef : undefined}>
                    <button
                      ref={(element) => {
                        if (element) actionTriggerRefs.current.set(workspace.id, element);
                        else actionTriggerRefs.current.delete(workspace.id);
                      }}
                      type="button"
                      className="workspace-actions-trigger"
                      aria-label={`Actions for ${workspace.name}`}
                      aria-haspopup="menu"
                      aria-expanded={actionsOpen}
                      onClick={() => setOpenActionsWorkspaceId(current => current === workspace.id ? null : workspace.id)}
                    >
                      <Ellipsis size={18} aria-hidden />
                    </button>
                    {actionsOpen ? (
                      <div className="workspace-actions-popover" role="menu" aria-label={`Actions for ${workspace.name}`}>
                        <button
                          role="menuitem"
                          type="button"
                          disabled={workspace.isActive || onboarding || defaultingWorkspaceId === workspace.id}
                          onClick={() => {
                            closeActionsMenu(workspace.id);
                            void makeDefault(workspace);
                          }}
                        >
                          {workspace.isActive ? <Check size={15} aria-hidden /> : <Star size={15} aria-hidden />}
                          {workspace.isActive
                            ? "Default business"
                            : defaultingWorkspaceId === workspace.id
                              ? "Setting default"
                              : "Set as default"}
                        </button>
                        {hasOwnerActions ? <div className="workspace-actions-separator" role="separator" /> : null}
                        {lifecycleStatus === "active" && !pendingTransfer ? (
                          hasOwnerActions ? (
                          <>
                            <button role="menuitem" type="button" disabled={transferringWorkspaceId === workspace.id}
                              onClick={() => { closeActionsMenu(workspace.id); beginTransfer(workspace); }}>
                              <Crown size={15} aria-hidden /> Transfer ownership
                            </button>
                            <button role="menuitem" type="button" disabled={closingWorkspaceId === workspace.id}
                              onClick={() => { closeActionsMenu(workspace.id); beginClosure(workspace, "scheduled_end_period"); }}>
                              <CalendarClock size={15} aria-hidden /> Close later
                            </button>
                            <div className="workspace-actions-separator" role="separator" />
                            <button role="menuitem" type="button" className="workspace-actions-danger" disabled={closingWorkspaceId === workspace.id}
                              onClick={() => { closeActionsMenu(workspace.id); beginClosure(workspace, "immediate"); }}>
                              <Trash2 size={15} aria-hidden /> Close now
                            </button>
                          </>
                          ) : null
                        ) : null}
                        {hasOwnerActions && lifecycleStatus === "closure_scheduled" && !pendingTransfer ? (
                          <button role="menuitem" type="button" disabled={closingWorkspaceId === workspace.id}
                            onClick={() => { closeActionsMenu(workspace.id); void cancelClosure(workspace); }}>
                            <X size={15} aria-hidden /> Cancel close
                          </button>
                        ) : null}
                        {hasOwnerActions && pendingTransfer?.role === "initiator" ? (
                          <button role="menuitem" type="button" disabled={transferringWorkspaceId === workspace.id}
                            onClick={() => { closeActionsMenu(workspace.id); void cancelTransfer(workspace); }}>
                            <X size={15} aria-hidden /> Cancel transfer
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
            </BusinessRow>
          );
        })}
      </div>
      {transferTarget ? (
        <section
          className="workspace-transfer-panel"
          role="region"
          aria-labelledby="workspace-transfer-title"
          aria-describedby="workspace-transfer-description"
          aria-live="polite"
        >
          <div>
            <strong id="workspace-transfer-title">Transfer ownership</strong>
            <p id="workspace-transfer-description">
              The target must be an active admin with completed onboarding and a
              verified email. Accepting the transfer promotes that admin to
              owner, demotes you to admin and requires billing details to be
              added again before the next payment.
            </p>
          </div>
          <label className="account-field">
            Find an admin by name or email
            <input
              value={candidateQuery}
              maxLength={80}
              onChange={(event) => { setCandidateQuery(event.target.value); setTransferTargetUserId(""); setCandidates([]); }}
              placeholder="Enter at least 2 characters"
            />
          </label>
          <div className="workspace-candidates" aria-live="polite">
            {searching ? <p role="status">Searching eligible admins...</p> : null}
            {searchError ? <p role="alert" className="form-error">{searchError}</p> : null}
            {!searching && !searchError && candidateQuery.trim().length >= 2 && candidates.length === 0 ? <p>No eligible admins found.</p> : null}
            {candidates.map(candidate => <label className="workspace-candidate" key={candidate.userId}>
              <input type="radio" name="ownership-candidate" checked={transferTargetUserId === candidate.userId}
                onChange={() => setTransferTargetUserId(candidate.userId)} />
              <span>{candidate.name}<small>{candidate.email}</small></span>
            </label>)}
          </div>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={transferAcknowledged}
              onChange={(event) =>
                setTransferAcknowledged(event.target.checked)
              }
            />
            <span>I understand an accepted ownership transfer cannot be reversed. I can cancel while it is pending.</span>
          </label>
          <label className="account-field">
            Account password
            <input
              type="password"
              autoComplete="current-password"
              value={sensitivePassword}
              onChange={(event) => setSensitivePassword(event.target.value)}
            />
          </label>
          <div className="workspace-row-actions">
            <Button
              className="primary-button"
              type="button"
              disabled={
                transferringWorkspaceId === transferTarget.id ||
                !transferAcknowledged ||
                !candidates.some(candidate => candidate.userId === transferTargetUserId) ||
                sensitivePassword.trim().length === 0
              }
              onClick={submitTransfer}
            >
              {transferringWorkspaceId === transferTarget.id
                ? "Starting transfer"
                : "Start transfer"}
            </Button>
            <Button
              className="secondary-button"
              type="button"
              disabled={transferringWorkspaceId === transferTarget.id}
              onClick={() => {
                setTransferTarget(null);
                setSensitivePassword("");
              }}
            >
              Cancel
            </Button>
          </div>
        </section>
      ) : null}
      {closureTarget ? (
        <section
          className="workspace-closure-panel"
          role="region"
          aria-labelledby="workspace-closure-title"
          aria-describedby="workspace-closure-description"
          aria-live="polite"
        >
          <div>
            <strong id="workspace-closure-title">
              {closureTarget.mode === "immediate"
                ? "Close organization now"
                : "Schedule organization closure"}
            </strong>
            <p id="workspace-closure-description">
              {closureTarget.mode === "immediate"
                ? "This cancels active access immediately, revokes pending invitations and removes this organization from every member's switcher. It cannot be restored by support."
                : "This keeps access until the current trial or paid period ends. You can cancel the closure before that time."}
            </p>
          </div>
          {closureTarget.mode === "immediate" ? (
            <>
              <label className="account-field">
                Type organization name
                <input
                  value={closureNameConfirmation}
                  onChange={(event) =>
                    setClosureNameConfirmation(event.target.value)
                  }
                  placeholder={closureTarget.workspace.name}
                />
              </label>
              <label className="account-field">
                Account password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={sensitivePassword}
                  onChange={(event) => setSensitivePassword(event.target.value)}
                />
              </label>
            </>
          ) : null}
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={closureAcknowledged}
              onChange={(event) => setClosureAcknowledged(event.target.checked)}
            />
            <span>I understand the organization closure impact.</span>
          </label>
          <div className="workspace-row-actions">
            <Button
              className={
                closureTarget.mode === "immediate"
                  ? "danger-button"
                  : "primary-button"
              }
              type="button"
              disabled={
                closingWorkspaceId === closureTarget.workspace.id ||
                !closureAcknowledged ||
                (closureTarget.mode === "immediate" &&
                  (closureNameConfirmation !== closureTarget.workspace.name ||
                    sensitivePassword.trim().length === 0))
              }
              onClick={submitClosure}
            >
              {closingWorkspaceId === closureTarget.workspace.id
                ? "Closing"
                : closureTarget.mode === "immediate"
                  ? "Close now"
                  : "Schedule close"}
            </Button>
            <Button
              className="secondary-button"
              type="button"
              disabled={closingWorkspaceId === closureTarget.workspace.id}
              onClick={() => {
                setClosureTarget(null);
                setSensitivePassword("");
              }}
            >
              Keep organization
            </Button>
          </div>
        </section>
      ) : null}
      {transferResponseTarget ? (
        <section
          className="workspace-transfer-panel"
          role="region"
          aria-labelledby="workspace-transfer-response-title"
          aria-describedby="workspace-transfer-response-description"
          aria-live="polite"
        >
          <div>
            <strong id="workspace-transfer-response-title">
              {transferResponseTarget.action === "accept"
                ? "Accept ownership transfer"
                : "Reject ownership transfer"}
            </strong>
            <p id="workspace-transfer-response-description">
              {transferResponseTarget.action === "accept" ? "Enter your account password to accept ownership of this workspace." : "Reject this request without changing workspace ownership. No password is needed."}
            </p>
          </div>
          {transferResponseTarget.action === "accept" ? <label className="account-field">
            Account password
            <input
              type="password"
              autoComplete="current-password"
              value={sensitivePassword}
              onChange={(event) => setSensitivePassword(event.target.value)}
            />
          </label> : null}
          <div className="workspace-row-actions">
            <Button
              className={
                transferResponseTarget.action === "accept"
                  ? "primary-button"
                  : "secondary-button"
              }
              type="button"
              disabled={
                transferringWorkspaceId === transferResponseTarget.workspace.id ||
                (transferResponseTarget.action === "accept" && sensitivePassword.trim().length === 0)
              }
              onClick={() =>
                respondToTransfer(
                  transferResponseTarget.workspace,
                  transferResponseTarget.action,
                )
              }
            >
              {transferringWorkspaceId === transferResponseTarget.workspace.id
                ? "Saving response"
                : transferResponseTarget.action === "accept"
                  ? "Accept transfer"
                  : "Reject transfer"}
            </Button>
            <Button
              className="secondary-button"
              type="button"
              disabled={
                transferringWorkspaceId === transferResponseTarget.workspace.id
              }
              onClick={() => {
                setTransferResponseTarget(null);
                setSensitivePassword("");
              }}
            >
              Cancel
            </Button>
          </div>
        </section>
      ) : null}
      {createOpen && canCreate ? <dialog ref={createDialog} className="account-confirmation-dialog account-create-workspace-dialog" aria-labelledby="create-workspace-title"
        onKeyDown={event => {
          if (event.key !== "Tab") return;
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
          const first = controls[0], last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}
        onCancel={event => { event.preventDefault(); if (!creating) setCreateOpen(false); }}>
      <h2 id="create-workspace-title">Create workspace</h2>
      <p>Start a separate workspace and complete its setup.</p>
      <form className="account-create-workspace-form" onSubmit={createWorkspace}>
        <label htmlFor="new-workspace-name">Workspace name</label>
        <div className="account-field">
          <input
            id="new-workspace-name"
            autoFocus
            value={workspaceName}
            maxLength={120}
            onChange={(event) => setWorkspaceName(event.target.value)}
            placeholder="Restaurant group name"
            required
          />
          <Button
            type="submit"
            disabled={creating || workspaceName.trim().length === 0}
          >
            <Plus size={16} aria-hidden /> {creating ? "Creating" : "Create"}
          </Button>
          <Button type="button" className="secondary-button" disabled={creating} onClick={() => setCreateOpen(false)}>Cancel</Button>
        </div>
      </form>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      </dialog> : null}
      {error && !createOpen ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function workspaceDestinationFromRole(role: WorkspaceSummary["role"]): string {
  return role === "employee" ? "/app/employee-hub" : "/app/workspace";
}

function workspaceSummaryFromContext(
  context: ActiveWorkspaceContext,
): WorkspaceSummary {
  return {
    id: context.workspace.id,
    name: context.workspace.name,
    role: context.membership.role,
    status: "active",
    isActive: true,
    onboarding: context.onboarding,
    lifecycleStatus: "active",
    closureEffectiveAt: null,
  };
}

function formatClosureDate(value: string | null): string {
  if (!value) return "at period end";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
