import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";
import type { WorkspaceSummary } from "@newfork/shared";
import { useAuth } from "../auth/AuthContext";
import { documentQueryKey, listDocuments } from "../documents/document-data";
import { isObligationClosed } from "../documents/document-rules";
import { EmployeeDocumentsList } from "../documents/EmployeeDocumentsList";
import { listAccountWorkspaces, supabaseClient } from "../lib/supabase";
import { AccountPageHeader } from "./components";

/**
 * How many of these are still waiting on the person. A closed obligation is
 * one they can no longer act on; everything else is theirs to finish.
 */
export function waitingOnYou(
  obligations: readonly { readonly status: string; readonly kind: string }[],
  kind: "document" | "acknowledgement",
): number {
  return obligations.filter(
    (obligation) =>
      obligation.kind === kind &&
      obligation.status !== "completed" &&
      obligation.status !== "pending_review" &&
      !isObligationClosed(
        obligation.status as Parameters<typeof isObligationClosed>[0],
      ),
  ).length;
}

export default function AccountDocumentsPage() {
  const { account } = useAuth();
  const [params] = useSearchParams();
  const workspaces = useQuery({
    queryKey: ["account-document-workspaces", account?.userId],
    queryFn: () => {
      if (!supabaseClient) throw new Error("Account storage is not configured");
      return listAccountWorkspaces(supabaseClient);
    },
    enabled: Boolean(account),
  });
  const [tab, setTab] = useState<"document" | "acknowledgement">(
    params.get("kind") === "acknowledgement" ? "acknowledgement" : "document",
  );
  // Somebody in three workspaces had to find the right one in a dropdown before
  // they could see what any of them were asking for. All of them are here.
  const linked = (workspaces.data ?? []).filter(
    (workspace) => workspace.status === "active",
  );
  const requestedWorkspace = params.get("workspace");

  return (
    <section className="account-page" aria-labelledby="account-documents-title">
      <AccountPageHeader
        title="Documents"
        titleId="account-documents-title"
        description="Complete requests and keep track of your documents and agreements."
      />
      <div className="requests-tabs" role="tablist" aria-label="Your documents">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "document"}
          className={tab === "document" ? "active" : ""}
          onClick={() => setTab("document")}
        >
          Documents
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "acknowledgement"}
          className={tab === "acknowledgement" ? "active" : ""}
          onClick={() => setTab("acknowledgement")}
        >
          Policies &amp; Agreements
        </button>
      </div>
      {workspaces.error ? (
        <p role="alert">Your workspaces could not be loaded.</p>
      ) : null}
      {linked.map((workspace) => (
        <WorkspaceDocuments
          key={`${workspace.id}:${tab}`}
          workspace={workspace}
          userId={account?.userId ?? ""}
          kind={tab}
          initialRequirementId={
            requestedWorkspace === workspace.id
              ? params.get("requirement")
              : null
          }
        />
      ))}
      {linked.length === 0 && !workspaces.isLoading && !workspaces.error ? (
        <p>You are not in a workspace yet.</p>
      ) : null}
    </section>
  );
}

/** One workspace's share of it, with what it is still waiting for. */
function WorkspaceDocuments({
  workspace,
  userId,
  kind,
  initialRequirementId,
}: {
  readonly workspace: WorkspaceSummary;
  readonly userId: string;
  readonly kind: "document" | "acknowledgement";
  readonly initialRequirementId: string | null;
}) {
  const audience = { workspaceId: workspace.id, selfOnly: true } as const;
  // The list below runs this same query; React Query serves both from one
  // fetch, so the count costs nothing extra.
  const documents = useQuery({
    queryKey: documentQueryKey(audience, userId),
    queryFn: () => listDocuments(audience),
  });
  const waiting = waitingOnYou(documents.data ?? [], kind);

  return (
    <section
      className="account-section-block"
      aria-label={`${workspace.name} documents`}
    >
      <div className="account-section-copy account-documents-group-head">
        <h2>{workspace.name}</h2>
        {/* A quiet workspace needs no badge; only work waiting gets one. */}
        {waiting > 0 ? (
          <span className="pb-badge pb-badge-progress">
            {waiting === 1 ? "1 waiting on you" : `${waiting} waiting on you`}
          </span>
        ) : null}
      </div>
      <EmployeeDocumentsList
        audience={audience}
        userId={userId}
        canReview={false}
        kind={kind}
        initialRequirementId={initialRequirementId}
        personal
      />
    </section>
  );
}
