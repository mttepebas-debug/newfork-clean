import type { WorkspaceSummary } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { hubPath } from "../auth/resolveLanding";
import { listAccountWorkspaces, supabaseClient } from "../lib/supabase";
import { PreBizFrame } from "./prebiz/PreBiz";

/** Why a workspace cannot be opened. One of three endings, not one sentence. */
export type WorkspaceEnding = "on_hold" | "access_removed" | "closed";

export function endingFor(workspace: WorkspaceSummary): WorkspaceEnding | null {
  if (workspace.lifecycleStatus === "deleted") return "closed";
  if (workspace.accessRemoved === true) return "access_removed";
  if (workspace.status === "suspended") return "on_hold";
  return null;
}

/**
 * The account knows the workspace is gone; this says which way. Until now all
 * three arrived as the same "on hold" screen, and two of them never arrived at
 * all because the list filtered them out.
 */
export default function WorkspaceStatusPage() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const workspaces = useQuery({
    queryKey: ["account-workspaces"],
    queryFn: () =>
      supabaseClient ? listAccountWorkspaces(supabaseClient) : [],
  });

  if (workspaces.isLoading)
    return (
      <PreBizFrame titleId="workspace-status-title" title="Checking your account" />
    );

  const workspace =
    workspaces.data?.find((candidate) => candidate.id === workspaceId) ?? null;
  const ending = workspace ? endingFor(workspace) : null;
  const name = workspace?.name ?? "That workspace";
  const { title, description } = wording(ending, name, workspace);

  return (
    <PreBizFrame
      titleId="workspace-status-title"
      title={title}
      description={description}
    >
      <div className="pb-footer">
        <Button
          className="pb-btn pb-btn-primary"
          type="button"
          onClick={() => navigate(hubPath)}
        >
          Choose a workspace
        </Button>
      </div>
    </PreBizFrame>
  );
}

function wording(
  ending: WorkspaceEnding | null,
  name: string,
  workspace: WorkspaceSummary | null,
): { readonly title: string; readonly description: string } {
  switch (ending) {
    case "on_hold":
      return {
        title: `${name} is on hold`,
        description: `Nothing in ${name} can be opened until an owner or an admin lifts the hold. Your other workspaces are unaffected.`,
      };
    case "access_removed":
      return {
        title: `You no longer have access to ${name}`,
        description:
          "Your work history there is kept. Ask a manager if this was not meant to happen.",
      };
    case "closed":
      return {
        title: `${name} has closed`,
        description: closedOn(workspace)
          ? `It closed on ${closedOn(workspace)}. Nothing in it can be opened any more.`
          : "Nothing in it can be opened any more.",
      };
    default:
      return {
        title: "That workspace isn't open to you",
        description:
          "It may have closed, or your access may have changed. Your other workspaces are unaffected.",
      };
  }
}

function closedOn(workspace: WorkspaceSummary | null): string | null {
  if (!workspace?.closureEffectiveAt) return null;
  const closed = new Date(workspace.closureEffectiveAt);
  return Number.isNaN(closed.getTime())
    ? null
    : closed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}
