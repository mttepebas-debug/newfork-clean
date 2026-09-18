import type { WorkspaceSummary } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  createOwnerWorkspace,
  setTabWorkspaceId,
  supabaseClient,
} from "../lib/supabase";

// Owner onboarding step 1 asks for the real name, so nothing is asked here.
const draftWorkspaceName = "New organization";

/**
 * Starts employer onboarding in one click. An unfinished setup is resumed
 * instead of created again, which also protects the name it already carries.
 */
export function CreateOrganizationButton({
  className = "",
  existingDraft = null,
  label = "Create your business organization",
}: {
  readonly className?: string;
  readonly existingDraft?: WorkspaceSummary | null;
  readonly label?: string;
}) {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (): Promise<void> => {
    if (!supabaseClient) return;
    setBusy(true);
    setError(null);
    try {
      const workspaceId =
        existingDraft?.id ??
        (await createOwnerWorkspace(supabaseClient, draftWorkspaceName));
      setTabWorkspaceId(workspaceId);
      // The account now owns a workspace and counts as linked; both are cached.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["account-workspaces"] }),
        queryClient.invalidateQueries({ queryKey: ["account-ever-linked"] }),
      ]);
      await refresh();
      navigate("/onboarding", { replace: true });
    } catch (startError: unknown) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Organization could not be created",
      );
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        className={className}
        type="button"
        disabled={busy}
        onClick={() => void start()}
      >
        <Building2 size={16} aria-hidden />
        {busy ? "Starting" : label}
      </Button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
