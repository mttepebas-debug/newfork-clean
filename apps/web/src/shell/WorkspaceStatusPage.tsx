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
  // What happened to the workspace is answered before what happened to the
  // person. Closing a workspace suspends every membership in it, so reading
  // the membership first would tell everybody who was in it that they are "on
  // hold until an owner lifts the hold" -- about a workspace that has no owner
  // left to lift anything.
  if (workspaceHasClosed(workspace)) return "closed";
  if (workspace.accessRemoved === true) return "access_removed";
  if (workspace.status === "suspended") return "on_hold";
  return null;
}

function workspaceHasClosed(workspace: WorkspaceSummary): boolean {
  if (
    workspace.lifecycleStatus === "deleted" ||
    workspace.lifecycleStatus === "closed"
  )
    return true;
  // A scheduled closure is not something a job flips when the day comes: the
  // date itself is what ends access, checked wherever access is checked. So
  // the day it passes is the day the workspace is closed, whatever the stored
  // status still says.
  if (workspace.lifecycleStatus !== "closure_scheduled") return false;
  const effective = workspace.closureEffectiveAt
    ? Date.parse(workspace.closureEffectiveAt)
    : Number.NaN;
  return Number.isFinite(effective) && effective <= Date.now();
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
        // Said plainly because the alternative reading -- that something was
        // done to this person -- is the one people reach for first.
        description: closedOn(workspace)
          ? `It closed on ${closedOn(workspace)}. The workspace itself closed, not your access to it, and it will not reopen.`
          : "The workspace itself closed, not your access to it, and it will not reopen.",
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
