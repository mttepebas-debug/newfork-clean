import type { ActiveWorkspaceContext, WorkspaceSummary } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Crown, Ellipsis, Plus, Star, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { clearTenantQueriesForOrganizationSwitch } from "../auth/tenant-query-cache";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import { InvitationRow } from "../employees/InvitationRow";
import { ListOutline, LoadError, RefreshError } from "../shell/LoadState";
import { BusinessRow, StatusBadge, roleLabel } from "../shell/prebiz/PreBiz";
import { useStartOwnerSetup } from "../shell/CreateOrganizationButton";
import { RequestError } from "../lib/request-error";
import { AccountPageHeader, unfinishedSetup } from "./components";
import { accountWorkspacesKey } from "./legal-name-data";
import {
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
  supabaseClient,
} from "../lib/supabase";
import { membershipClass } from "../auth/access";
import { appLandingPath, workspaceLandingPathForRole } from "../auth/resolveLanding";

export default function WorkspacesPage() {
  const { account, context, refresh } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // "Create workspace" opens owner setup step 1 directly; that step asks for
  // the name (KARARLAR "Create" button, KARAR-001).
  const setup = useStartOwnerSetup();
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
  // The refusal names the transfer standing in the way. Describing where to
  // find it was the best the screen could do while it did not know which one.
  const [blockingTransferId, setBlockingTransferId] = useState<string | null>(
    null,
  );
  // Keyed by the account and its active workspace, not by the context object:
  // a fresh sign-in (the password check before a transfer or a closure)
  // rebuilds the context, and reloading then wiped the refusal the person had
  // not read yet. Sharing the query cache means focus, other screens'
  // invalidations and a role changed elsewhere reach this list (BL-149).
  const contextWorkspaceId = context?.workspace.id ?? null;
  const latestContext = useRef(context);
  latestContext.current = context;
  const workspacesKey = [
    ...accountWorkspacesKey,
    account?.userId ?? null,
    contextWorkspaceId,
  ] as const;
  const fetchWorkspaces = async (): Promise<WorkspaceSummary[]> => {
    if (supabaseClient) return listAccountWorkspaces(supabaseClient);
    const current = latestContext.current;
    return current ? [workspaceSummaryFromContext(current)] : [];
  };
  const workspacesQuery = useQuery({
    queryKey: workspacesKey,
    queryFn: fetchWorkspaces,
  });
  const workspaces = workspacesQuery.data ?? [];
  const loading = workspacesQuery.isPending;
  const loaded = workspacesQuery.isSuccess;
  const setWorkspaces = (
    update: WorkspaceSummary[] | ((current: WorkspaceSummary[]) => WorkspaceSummary[]),
  ): void => {
    queryClient.setQueryData<WorkspaceSummary[]>(workspacesKey, (current) =>
      typeof update === "function" ? update(current ?? []) : update,
    );
  };

  const reloadWorkspaces = async (): Promise<void> => {
    setWorkspaces(await fetchWorkspaces());
    // The account badge counts the invitations and transfers answered here.
    await queryClient.invalidateQueries({ queryKey: ["account-attention"] });
  };

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
  // An unfinished setup is continued, never created again: the server would
  // resume it and write the draft name over the one typed in step 1.
  const startSetup = (): void => {
    void setup.start(workspaces.find(unfinishedSetup) ?? null);
  };
  const currentWorkspaceId = context?.workspace.id ?? null;
  const onboardingWorkspaces = workspaces.filter(workspace => workspace.status === "pending");
  const orderedWorkspaces = [...accessibleWorkspaces, ...onboardingWorkspaces].sort((a, b) =>
    Number(b.id === currentWorkspaceId) - Number(a.id === currentWorkspaceId) ||
    Number(b.isActive) - Number(a.isActive));

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

  // Arrow keys walk the open menu's enabled items; Tab keeps working as well.
  const moveMenuFocus = (key: string): boolean => {
    const items = [...(actionsMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    if (!items.length) return false;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = key === "Home" ? 0
      : key === "End" ? items.length - 1
        : key === "ArrowDown" ? (at + 1) % items.length
          : key === "ArrowUp" ? (at <= 0 ? items.length - 1 : at - 1)
            : -1;
    const item = items[next];
    if (!item) return false;
    item.focus();
    return true;
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
        .catch(() => { if (active) setSearchError("Admins could not be searched right now. Try the search again."); })
        .finally(() => { if (active) setSearching(false); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [transferTarget, candidateQuery]);


  const activate = async (workspace: WorkspaceSummary): Promise<void> => {
    if (!supabaseClient) {
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      navigate(workspaceLandingPathForRole(workspace.role), {
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
      navigate(appLandingPath(resolvedContext), {
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

  const submitClosure = async (): Promise<void> => {
    if (!supabaseClient || !closureTarget) return;
    setClosingWorkspaceId(closureTarget.workspace.id);
    setError(null);
    try {
      // The server checks the password (SEC-003).
      await requestWorkspaceClosure(supabaseClient, {
        workspaceId: closureTarget.workspace.id,
        mode: closureTarget.mode,
        typedWorkspaceName:
          closureTarget.mode === "immediate" ? closureNameConfirmation : null,
        ...(unfinishedSetup(closureTarget.workspace)
          ? {}
          : { password: sensitivePassword }),
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
        navigate(next && resolved ? appLandingPath(resolved) : "/organization-switcher", { replace: true });
      } else {
        await refresh();
        await reloadWorkspaces();
      }
      setClosureTarget(null);
      setSensitivePassword("");
    } catch (closureError: unknown) {
      setError(
        lifecycleMessage(
          closureError,
          "This workspace was not closed. Reload the page and try again.",
        ),
      );
      setBlockingTransferId(
        closureError instanceof RequestError &&
          closureError.reason === "workspace.closure.transfer_pending"
          ? (closureError.detail ?? null)
          : null,
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
        lifecycleMessage(
          closureError,
          "The scheduled closure is still in place. Reload the page and try again.",
        ),
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
      await initiateWorkspaceOwnershipTransfer(supabaseClient, {
        workspaceId: transferTarget.id,
        targetUserId: transferTargetUserId.trim(),
        password: sensitivePassword,
      });
      await reloadWorkspaces();
      setTransferTarget(null);
      setSensitivePassword("");
    } catch (transferError: unknown) {
      setError(
        lifecycleMessage(
          transferError,
          "The transfer was not started. Reload the page and try again.",
        ),
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
      await respondWorkspaceOwnershipTransfer(supabaseClient, {
        workspaceId: workspace.id,
        transferId: workspace.pendingOwnershipTransfer.id,
        action,
        ...(action === "accept" ? { password: sensitivePassword } : {}),
      });
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      await refresh();
      await reloadWorkspaces();
      setTransferResponseTarget(null);
      setSensitivePassword("");
    } catch (transferError: unknown) {
      setError(
        lifecycleMessage(
          transferError,
          "Your answer was not saved. Reload the page and answer again.",
        ),
      );
    } finally {
      setTransferringWorkspaceId(null);
    }
  };

  // What went wrong belongs next to the thing that went wrong, not at the end
  // of the page. Only one of these is ever on screen at a time.
  const errorNotice = error ?? setup.error ? (
    <div className="workspace-error-notice">
      <p className="form-error" role="alert">
        {error ?? setup.error}
      </p>
      {/* The refusal named the transfer, so the way out is a button rather
          than directions to a menu. */}
      {blockingTransferId && closureTarget ? (
        <Button
          type="button"
          className="secondary-button"
          disabled={transferringWorkspaceId !== null}
          onClick={() => void cancelBlockingTransfer()}
        >
          Cancel that transfer
        </Button>
      ) : null}
    </div>
  ) : null;

  /**
   * Cancels the one the refusal named, rather than whichever this row happens
   * to know about. They are the same today; they would not be if a second were
   * ever started while the first was waiting.
   */
  const cancelBlockingTransfer = async (): Promise<void> => {
    if (!supabaseClient || !closureTarget || !blockingTransferId) return;
    setTransferringWorkspaceId(closureTarget.workspace.id);
    setError(null);
    try {
      await cancelWorkspaceOwnershipTransfer(
        supabaseClient,
        closureTarget.workspace.id,
        blockingTransferId,
      );
      setBlockingTransferId(null);
      await reloadWorkspaces();
    } catch (cancelError: unknown) {
      setError(
        lifecycleMessage(
          cancelError,
          "That transfer was not cancelled. Reload the page and try again.",
        ),
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
    } catch (error) {
      setError(
        lifecycleMessage(
          error,
          "The transfer is still waiting. Reload the page and try again.",
        ),
      );
    }
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
            disabled={setup.busy}
            onClick={startSetup}
          >
            <Plus size={16} aria-hidden /> Create workspace
          </Button>
        ) : undefined}
      />
      {orderedWorkspaces.filter(workspace => workspace.pendingOwnershipTransfer?.role === "target").map(workspace => (
        <div key={workspace.id} className="account-notice workspace-transfer-banner" role="region" aria-label={`Ownership request for ${workspace.name}`}>
          <strong>Ownership transfer · {workspace.name}</strong>
          <p>
            The owner has asked you to take {workspace.name} over. Answer by{" "}
            {formatDate(workspace.pendingOwnershipTransfer?.expiresAt ?? null, "the deadline in the request")}, or the request runs out.
          </p>
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
      {loading ? <ListOutline label="Loading workspaces" rows={3} columns={2} /> : null}
      {workspacesQuery.error && !workspacesQuery.data ? (
        <LoadError
          title="We couldn't load your workspaces"
          detail="Your workspaces didn't load. Nothing was changed."
          retrying={workspacesQuery.isFetching}
          onRetry={() => void workspacesQuery.refetch()}
        />
      ) : null}
      {workspacesQuery.error && workspacesQuery.data ? (
        <RefreshError
          message="Your workspaces didn't refresh. These are the last ones that loaded."
          retrying={workspacesQuery.isFetching}
          onRetry={() => void workspacesQuery.refetch()}
        />
      ) : null}
      {/* The kit rows are list items, so the container says it is their list.
          With nothing to list under a failed load, the card stays last on the
          page and sits in its middle. */}
      {workspacesQuery.error && !workspacesQuery.data && invitations.length === 0 ? null : (
        <div className="workspace-list" role="list" aria-label="Workspaces">
          {invitations.map(invitation => (
            <InvitationRow key={invitation.id} invitation={invitation} />
          ))}
          {workspacesQuery.data && orderedWorkspaces.length === 0 ? (
            <div className="workspace-row empty-workspace-row" role="listitem">
              <div>
                <strong>No workspaces yet</strong>
                <span>{invitations.length > 0 ? "Respond to your invitation to continue." : "Create your first workspace to continue."}</span>
                {canCreate ? <Button type="button" disabled={setup.busy} onClick={startSetup}>Create workspace</Button> : null}
              </div>
            </div>
          ) : null}
          {orderedWorkspaces.map((workspace) => {
            const activating = activatingWorkspaceId === workspace.id;
            const lifecycleStatus = workspace.lifecycleStatus ?? "active";
            const pendingTransfer = workspace.pendingOwnershipTransfer ?? null;
            const isCurrent = workspace.id === currentWorkspaceId;
            const onboarding = workspace.status === "pending";
            // An employer draft is active but not set up: its owner continues it, it
            // is not opened. Another member can only open it and wait, as before.
            const draft = unfinishedSetup(workspace);
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
                      ? <StatusBadge>{workspace.closureEffectiveAt
                          ? `Scheduled closure · ${formatDate(workspace.closureEffectiveAt, "")}`
                          : "Closes on its scheduled date"}</StatusBadge>
                      : null}
                    {pendingTransfer
                      ? <StatusBadge tone="progress">Ownership transfer {pendingTransfer.role === "target" ? "needs response" : "pending"}</StatusBadge>
                      : null}
                  </>
                }
              >
                  {onboarding ? (
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
                        onKeyDown={(event) => {
                          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                          event.preventDefault();
                          setOpenActionsWorkspaceId(workspace.id);
                          const key = event.key === "ArrowDown" ? "Home" : "End";
                          window.requestAnimationFrame(() => moveMenuFocus(key));
                        }}
                      >
                        <Ellipsis size={18} aria-hidden />
                      </button>
                      {actionsOpen ? (
                        <div
                          className="workspace-actions-popover"
                          role="menu"
                          aria-label={`Actions for ${workspace.name}`}
                          onKeyDown={(event) => { if (moveMenuFocus(event.key)) event.preventDefault(); }}
                        >
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
                              ? "Default workspace"
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
                                <CalendarClock size={15} aria-hidden /> Schedule closure
                              </button>
                              <div className="workspace-actions-separator" role="separator" />
                              <button role="menuitem" type="button" className="workspace-actions-danger" disabled={closingWorkspaceId === workspace.id}
                                onClick={() => { closeActionsMenu(workspace.id); beginClosure(workspace, "immediate"); }}>
                                <Trash2 size={15} aria-hidden /> Close immediately
                              </button>
                            </>
                            ) : null
                          ) : null}
                          {hasOwnerActions && lifecycleStatus === "closure_scheduled" && !pendingTransfer ? (
                            <button role="menuitem" type="button" disabled={closingWorkspaceId === workspace.id}
                              onClick={() => { closeActionsMenu(workspace.id); void cancelClosure(workspace); }}>
                              <X size={15} aria-hidden /> Cancel closure
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
      )}
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
            {/* The rule is stated once, then what it costs, then the way
                back out of it. */}
            <p id="workspace-transfer-description">
              Only an admin who has finished setting up their account and
              confirmed their email can take this workspace over. When they
              accept, they become the owner and you become an admin. You can
              cancel while the request is still waiting.
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
            {!searching && !searchError && candidateQuery.trim().length >= 2 && candidates.length === 0
              ? <p>Nobody here matches that and can take the workspace over. Make someone an admin in Employees and have them finish setting up, then come back.</p>
              : null}
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
            <span>I understand I cannot undo this once they accept it.</span>
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
          {errorNotice}
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
                ? `Close ${closureTarget.workspace.name} immediately`
                : `Schedule closure for ${closureTarget.workspace.name}`}
            </strong>
            {/* One sentence for the whole rule: what happens to everyone at
                once, not a line per person it happens to. The count says how
                many that is, which is the part a number can carry and a rule
                cannot. */}
            <p id="workspace-closure-description">
              {whoIsInIt(closureTarget.workspace)}{" "}
              {closureTarget.mode === "immediate"
                ? "Everyone loses access to this workspace the moment you close it, and invitations that are still waiting stop working. Nobody, including support, can bring it back."
                : `${closesOn(closureTarget.workspace)
                    ? `Everyone keeps access until ${closesOn(closureTarget.workspace)}, and you can cancel the closure any time before it.`
                    : "Everyone keeps access until the closure date, and you can cancel the closure any time before it."} Then the workspace and its data are permanently deleted.`}
            </p>
          </div>
          {closureTarget.mode === "immediate" ? (
            <>
              <label className="account-field">
                Type the workspace name
                <input
                  value={closureNameConfirmation}
                  onChange={(event) =>
                    setClosureNameConfirmation(event.target.value)
                  }
                  placeholder={closureTarget.workspace.name}
                />
              </label>
            </>
          ) : null}
          {unfinishedSetup(closureTarget.workspace) ? null : (
            <label className="account-field">
              Account password
              <input
                type="password"
                autoComplete="current-password"
                value={sensitivePassword}
                onChange={(event) => setSensitivePassword(event.target.value)}
              />
            </label>
          )}
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={closureAcknowledged}
              onChange={(event) => setClosureAcknowledged(event.target.checked)}
            />
            <span>
              {closureTarget.mode === "immediate"
                ? "I understand everyone loses access and this cannot be undone."
                : "I understand everyone loses access on the closure date."}
            </span>
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
                  closureNameConfirmation !== closureTarget.workspace.name) ||
                (!unfinishedSetup(closureTarget.workspace) &&
                  sensitivePassword.trim().length === 0)
              }
              onClick={submitClosure}
            >
              {closingWorkspaceId === closureTarget.workspace.id
                ? "Closing"
                : closureTarget.mode === "immediate"
                  ? "Close immediately"
                  : "Schedule closure"}
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
              Keep this workspace
            </Button>
          </div>
          {errorNotice}
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
                ? `Take over ${transferResponseTarget.workspace.name}`
                : `Turn down ${transferResponseTarget.workspace.name}`}
            </strong>
            <p id="workspace-transfer-response-description">
              {transferResponseTarget.action === "accept"
                ? "You become the owner of this workspace and the owner who asked you becomes an admin. Type your account password to confirm."
                : "Ownership stays where it is and nothing about your access changes. The owner can ask you again later."}
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
          {errorNotice}
        </section>
      ) : null}
      {!closureTarget && !transferTarget && !transferResponseTarget
        ? errorNotice
        : null}
    </section>
  );
}

/**
 * The closure and transfer rules live in the database, and it states them for
 * the people who wrote them. Each one is said here once, in the words of the
 * person reading it, and with the single thing they can do next. A sentence
 * that is not listed never reaches the screen: the flow shows its own fallback,
 * so nobody is left reading a rule written for somebody else.
 */
/**
 * What the app says for each thing the database can refuse, keyed by the
 * machine key the RPC raises in `hint`. Keys, not sentences: the English the
 * server raises is a log line, and rewording it must not change this screen.
 */
/**
 * How big the thing being closed is. "Everyone loses access" is equally true
 * of a workspace with one person in it and of one with forty, and the owner
 * deciding is the reader least able to tell which they have.
 *
 * The reader is not counted. They know about themselves; what the screen has
 * to say is what closing costs everybody else. When the counts are missing —
 * an older payload, a summary built from context — the sentence is left out
 * rather than guessed at.
 */
/**
 * When a scheduled closure would land. The rule belongs to the database, which
 * sends the date it produces; the screen says it rather than working it out and
 * risking a different answer from the one that will be applied.
 */
function closesOn(workspace: WorkspaceSummary): string {
  return formatDate(workspace.defaultClosureEffectiveAt ?? null, "");
}

export function whoIsInIt(workspace: WorkspaceSummary): string {
  const members = workspace.otherMemberCount;
  const invitations = workspace.pendingInvitationCount ?? 0;
  if (members === undefined) return "";
  if (members === 0 && invitations === 0)
    return "Nobody else has access to this workspace yet.";
  const parts: string[] = [];
  if (members === 1) parts.push("1 other person has access");
  else if (members > 1) parts.push(`${members} other people have access`);
  if (invitations === 1) parts.push("1 invitation is waiting for an answer");
  else if (invitations > 1)
    parts.push(`${invitations} invitations are waiting for an answer`);
  return `${parts.join(" and ")} here.`;
}

const lifecycleReasons: Readonly<Record<string, string>> = {
  "workspace.closure.transfer_pending":
    "An ownership transfer is still waiting on this workspace. Cancel it from the actions menu, then close the workspace.",
  "workspace.owner_required":
    "Only the owner of this workspace can do that, and you are not the owner any more. Reload the page to see where you stand.",
  "authz.owner_only":
    "Only the owner of this workspace can do that, and you are not the owner any more. Reload the page to see where you stand.",
  "workspace.not_found":
    "This workspace is already closed. Reload the page to see the ones you still have.",
  "workspace.closure.not_scheduled":
    "This workspace has no closure scheduled any more. Reload the page to see its current state.",
  "workspace.closure.name_mismatch":
    "The name you typed is not this workspace's name. Type it exactly as it appears on the row.",
  "workspace.closure.acknowledgement_required":
    "Tick the box to say you understand what closing does, then try again.",
  "transfer.already_pending":
    "This workspace already has a transfer waiting. Cancel that one from the actions menu before starting another.",
  "transfer.target_not_admin":
    "That person is no longer an admin here. Pick someone else, or make them an admin in Employees first.",
  "transfer.target_email_unverified":
    "That person has not confirmed their email yet. Ask them to confirm it, then start the transfer again.",
  "transfer.target_onboarding_incomplete":
    "That person has not finished setting up their account. Ask them to finish it, then start the transfer again.",
  "transfer.target_legal_name_missing":
    "That person has no legal name on file here yet, and an owner needs one because documents and signatures use it. Ask them to finish setting up their account, then start the transfer again.",
  "transfer.target_is_self":
    "You already own this workspace. Pick somebody else to hand it to.",
  "transfer.not_found":
    "This request is no longer waiting for an answer. Reload the page to see the workspaces you have.",
  "transfer.target_required":
    "This request was not sent to you. Reload the page to see the ones that were.",
  "transfer.expired":
    "This request ran out of time. Ask the owner to send it again.",
  "session.password_required": "Type your account password to continue.",
  "session.password_incorrect": "That password did not match. Type it again.",
};

/**
 * A setup its owner never finished: it holds nothing, so closing it asks for no
 * password. The server reads the same three fields (workspace-account-routes
 * isUnfinishedSetup) and has the last word.
 */
/**
 * The same answers keyed by the English the database raises, for a refusal that
 * has not been given a key yet. Nothing new belongs here: every refusal these
 * screens read now carries one, and supabase/tests/lifecycle_refusals_carry_keys
 * fails if a later one does not.
 */
const lifecycleSentences: Readonly<Record<string, string>> = {
  "pending ownership transfer must be resolved before workspace closure":
    "An ownership transfer is still waiting on this workspace. Cancel it from the actions menu, then close the workspace.",
  "workspace owner access required":
    "Only the owner of this workspace can do that, and you are not the owner any more. Reload the page to see where you stand.",
  "workspace not found":
    "This workspace is already closed. Reload the page to see the ones you still have.",
  "workspace closure is not scheduled":
    "This workspace has no closure scheduled any more. Reload the page to see its current state.",
  "workspace name confirmation does not match":
    "The name you typed is not this workspace's name. Type it exactly as it appears on the row.",
  "workspace closure requires explicit acknowledgement":
    "Tick the box to say you understand what closing does, then try again.",
  "pending ownership transfer already exists":
    "This workspace already has a transfer waiting. Cancel that one from the actions menu before starting another.",
  "ownership transfer target must be an active admin":
    "That person is no longer an admin here. Pick someone else, or make them an admin in Employees first.",
  "ownership transfer target must have a verified email":
    "That person has not confirmed their email yet. Ask them to confirm it, then start the transfer again.",
  "ownership transfer target must have completed onboarding":
    "That person has not finished setting up their account. Ask them to finish it, then start the transfer again.",
  "ownership transfer target must be another account":
    "You already own this workspace. Pick somebody else to hand it to.",
  "pending ownership transfer not found":
    "This request is no longer waiting for an answer. Reload the page to see the workspaces you have.",
  "ownership transfer target access required":
    "This request was not sent to you. Reload the page to see the ones that were.",
  "ownership transfer has expired":
    "This request ran out of time. Ask the owner to send it again.",
};

/** The sentence for this failure, never the server's own. */
function lifecycleMessage(error: unknown, fallback: string): string {
  const keyed =
    error instanceof RequestError && error.reason
      ? lifecycleReasons[error.reason]
      : undefined;
  const sentence =
    keyed ??
    (error instanceof Error ? lifecycleSentences[error.message] : undefined);
  return sentence ?? fallback;
}

function workspaceSummaryFromContext(
  context: ActiveWorkspaceContext,
): WorkspaceSummary {
  return {
    id: context.workspace.id,
    name: context.workspace.name,
    role: membershipClass(context.membership),
    status: "active",
    isActive: true,
    onboarding: context.onboarding,
    lifecycleStatus: "active",
    closureEffectiveAt: null,
  };
}

/** A date the person can read, or the words to use when there is no date yet. */
function formatDate(value: string | null, fallback: string): string {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
