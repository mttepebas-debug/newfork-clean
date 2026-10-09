import type { WorkspaceSummary } from "@newfork/shared";
import type { ReactNode } from "react";

/**
 * An owner's workspace whose setup is not finished: it is continued, not
 * opened, and its employee routes stay shut until it is.
 */
export function unfinishedSetup(workspace: WorkspaceSummary): boolean {
  return (
    workspace.role === "owner" &&
    workspace.status === "active" &&
    workspace.onboarding.status !== "complete"
  );
}

export function AccountPageHeader({
  title,
  titleId,
  description,
  action,
}: {
  readonly title: string;
  readonly titleId: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <header className="account-page-header">
      <div>
        <h1 id={titleId}>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="account-header-action">{action}</div> : null}
    </header>
  );
}
