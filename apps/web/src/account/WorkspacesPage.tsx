import type { ActiveWorkspaceContext, WorkspaceSummary } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Crown, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { clearTenantQueriesForOrganizationSwitch } from "../auth/tenant-query-cache";
import { AccountPageHeader } from "./components";
import {
  createOwnerWorkspace,
  cancelWorkspaceClosure,
  initiateWorkspaceOwnershipTransfer,
  listAccountWorkspaces,
  requestWorkspaceClosure,
  respondWorkspaceOwnershipTransfer,
  selectActiveWorkspace,
  setTabWorkspaceId,
  supabaseClient,
} from "../lib/supabase";

export default function WorkspacesPage() {
  const { account, context, refresh } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activatingWorkspaceId, setActivatingWorkspaceId] = useState<
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

  useEffect(() => {
    if (!supabaseClient) {
      setWorkspaces(context ? [workspaceSummaryFromContext(context)] : []);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const items = await listAccountWorkspaces(supabaseClient);
        if (!active) return;
        setWorkspaces(items);
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
  }, [context]);

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
    if (!supabaseClient) return;
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
      await refresh();
      await reloadWorkspaces();
      if (
        closureTarget.mode === "immediate" &&
        closureTarget.workspace.isActive
      ) {
        navigate("/organization-switcher", { replace: true });
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
    setTransferAcknowledged(false);
    setSensitivePassword("");
    setError(null);
  };

  const submitTransfer = async (): Promise<void> => {
    if (!supabaseClient || !transferTarget) return;
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
      await reauthenticateForSensitiveAction();
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

  return (
    <section className="account-page" aria-labelledby="workspaces-title">
      <AccountPageHeader
        title="Workspaces"
        titleId="workspaces-title"
        description="Switch between organizations linked to this account, or create a new workspace."
      />
      {loading ? (
        <p className="settings-state" role="status">
          Loading workspaces...
        </p>
      ) : null}
      <div className="workspace-list">
        {workspaces.length === 0 && !loading ? (
          <div className="workspace-row empty-workspace-row">
            <div>
              <strong>No workspaces yet</strong>
              <span>Create a workspace to start setup.</span>
            </div>
          </div>
        ) : null}
        {workspaces.map((workspace) => {
          const activating = activatingWorkspaceId === workspace.id;
          const lifecycleStatus = workspace.lifecycleStatus ?? "active";
          const pendingTransfer = workspace.pendingOwnershipTransfer ?? null;
          return (
            <div
              className="workspace-row"
              key={workspace.id}
              data-active={workspace.isActive}
            >
              <div>
                <strong>{workspace.name}</strong>
                <span>
                  {workspace.role}
                  {lifecycleStatus === "closure_scheduled"
                    ? ` · closes ${formatClosureDate(workspace.closureEffectiveAt ?? null)}`
                    : ""}
                  {pendingTransfer
                    ? ` · ownership transfer ${pendingTransfer.role === "target" ? "needs response" : "pending"}`
                    : ""}
                </span>
              </div>
              <div className="workspace-row-actions">
                {workspace.isActive ? (
                  <Button
                    className="secondary-button compact-button active-workspace"
                    type="button"
                    aria-label={`Open app for ${workspace.name}`}
                    disabled={activating}
                    onClick={() => activate(workspace)}
                  >
                    <Check size={15} aria-hidden />
                    <span>Active workspace</span>
                    <span aria-hidden>·</span>
                    <span>{activating ? "Opening" : "Open app"}</span>
                  </Button>
                ) : (
                  <Button
                    className="secondary-button compact-button"
                    type="button"
                    aria-label={`Open ${workspace.name}`}
                    disabled={activating}
                    onClick={() => activate(workspace)}
                  >
                    {activating ? "Opening" : "Open"}
                  </Button>
                )}
                {workspace.role === "owner" ? (
                  lifecycleStatus === "closure_scheduled" ? (
                    <Button
                      className="secondary-button compact-button"
                      type="button"
                      aria-label={`Cancel close for ${workspace.name}`}
                      disabled={closingWorkspaceId === workspace.id}
                      onClick={() => cancelClosure(workspace)}
                    >
                      <X size={15} aria-hidden /> Cancel close
                    </Button>
                  ) : (
                    <>
                      <Button
                        className="secondary-button compact-button"
                        type="button"
                        aria-label={`Close later for ${workspace.name}`}
                        disabled={closingWorkspaceId === workspace.id}
                        onClick={() =>
                          beginClosure(workspace, "scheduled_end_period")
                        }
                      >
                        <CalendarClock size={15} aria-hidden /> Close later
                      </Button>
                      <Button
                        className="secondary-button compact-button danger-button"
                        type="button"
                        aria-label={`Close now for ${workspace.name}`}
                        disabled={closingWorkspaceId === workspace.id}
                        onClick={() => beginClosure(workspace, "immediate")}
                      >
                        <Trash2 size={15} aria-hidden /> Close now
                      </Button>
                    </>
                  )
                ) : null}
                {pendingTransfer?.role === "target" ? (
                  <>
                    <Button
                      className="secondary-button compact-button"
                      type="button"
                      aria-label={`Reject owner transfer for ${workspace.name}`}
                      disabled={transferringWorkspaceId === workspace.id}
                      onClick={() => {
                        setClosureTarget(null);
                        setTransferTarget(null);
                        setTransferResponseTarget({
                          workspace,
                          action: "reject",
                        });
                        setSensitivePassword("");
                        setError(null);
                      }}
                    >
                      Reject owner transfer
                    </Button>
                    <Button
                      className="primary-button compact-button"
                      type="button"
                      aria-label={`Accept owner transfer for ${workspace.name}`}
                      disabled={transferringWorkspaceId === workspace.id}
                      onClick={() => {
                        setClosureTarget(null);
                        setTransferTarget(null);
                        setTransferResponseTarget({
                          workspace,
                          action: "accept",
                        });
                        setSensitivePassword("");
                        setError(null);
                      }}
                    >
                      Accept owner transfer
                    </Button>
                  </>
                ) : null}
                {workspace.role === "owner" &&
                lifecycleStatus === "active" &&
                !pendingTransfer ? (
                  <Button
                    className="secondary-button compact-button"
                    type="button"
                    aria-label={`Transfer owner for ${workspace.name}`}
                    disabled={transferringWorkspaceId === workspace.id}
                    onClick={() => beginTransfer(workspace)}
                  >
                    <Crown size={15} aria-hidden /> Transfer owner
                  </Button>
                ) : null}
              </div>
            </div>
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
          <label>
            Target admin user ID
            <input
              value={transferTargetUserId}
              onChange={(event) => setTransferTargetUserId(event.target.value)}
              placeholder="00000000-0000-4000-8000-000000000000"
            />
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={transferAcknowledged}
              onChange={(event) =>
                setTransferAcknowledged(event.target.checked)
              }
            />
            <span>I understand ownership transfer cannot be reversed.</span>
          </label>
          <label>
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
                !uuidLike(transferTargetUserId.trim()) ||
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
              <label>
                Type organization name
                <input
                  value={closureNameConfirmation}
                  onChange={(event) =>
                    setClosureNameConfirmation(event.target.value)
                  }
                  placeholder={closureTarget.workspace.name}
                />
              </label>
              <label>
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
              Enter your account password to refresh your session before saving
              this ownership-transfer response.
            </p>
          </div>
          <label>
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
              className={
                transferResponseTarget.action === "accept"
                  ? "primary-button"
                  : "secondary-button"
              }
              type="button"
              disabled={
                transferringWorkspaceId === transferResponseTarget.workspace.id ||
                sensitivePassword.trim().length === 0
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
      <form className="create-workspace-form" onSubmit={createWorkspace}>
        <label htmlFor="new-workspace-name">Create workspace</label>
        <div>
          <input
            id="new-workspace-name"
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
        </div>
      </form>
      {error ? (
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

function uuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
