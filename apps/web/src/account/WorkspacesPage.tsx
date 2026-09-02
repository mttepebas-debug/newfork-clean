import type { WorkspaceSummary } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { Check, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  createOwnerWorkspace,
  listAccountWorkspaces,
  selectActiveWorkspace,
  supabaseClient,
} from "../lib/supabase";

export default function WorkspacesPage() {
  const { context, refresh } = useAuth();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (context) {
      navigate(workspaceDestinationFromRole(context.membership.role), {
        replace: true,
      });
      return;
    }
    if (!supabaseClient) return;
    let active = true;
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
      }
    })();
    return () => {
      active = false;
    };
  }, [context, navigate]);

  const createWorkspace = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!supabaseClient) return;
    setCreating(true);
    setError(null);
    try {
      await createOwnerWorkspace(supabaseClient, workspaceName);
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
    if (!supabaseClient) return;
    setError(null);
    try {
      if (!workspace.isActive) {
        await selectActiveWorkspace(supabaseClient, workspace.id);
      }
      const resolvedContext = await refresh();
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
    }
  };

  return (
    <section className="account-page" aria-labelledby="workspaces-title">
      <header>
        <p className="eyebrow">Account Center</p>
        <h1 id="workspaces-title">Workspaces</h1>
      </header>
      <div className="workspace-list">
        {workspaces.map((workspace) => (
          <div className="workspace-row" key={workspace.id}>
            <div>
              <strong>{workspace.name}</strong>
              <span>{workspace.role}</span>
            </div>
            {workspace.isActive ? (
              <Button
                className="secondary-button compact-button active-workspace"
                type="button"
                onClick={() => activate(workspace)}
              >
                <Check size={15} aria-hidden /> Open app
              </Button>
            ) : (
              <Button
                className="secondary-button compact-button"
                type="button"
                onClick={() => activate(workspace)}
              >
                Open
              </Button>
            )}
          </div>
        ))}
      </div>
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
