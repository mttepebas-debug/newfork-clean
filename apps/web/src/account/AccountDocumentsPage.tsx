import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { EmployeeDocumentsList } from "../documents/EmployeeDocumentsList";
import { listAccountWorkspaces, supabaseClient } from "../lib/supabase";
import { AccountPageHeader } from "./components";

export default function AccountDocumentsPage() {
  const { account, context } = useAuth();
  const [params] = useSearchParams();
  const workspaces = useQuery({
    queryKey: ["account-document-workspaces", account?.userId],
    queryFn: () => {
      if (!supabaseClient) throw new Error("Account storage is not configured");
      return listAccountWorkspaces(supabaseClient);
    },
    enabled: Boolean(account),
  });
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(
    params.get("workspace"),
  );
  const [tab, setTab] = useState<"document" | "acknowledgement">(
    params.get("kind") === "acknowledgement" ? "acknowledgement" : "document",
  );
  const linked = workspaces.data ?? [];
  const requested = selectedWorkspace ?? context?.workspace.id;
  const workspaceId = linked.some((w) => w.id === requested)
    ? requested!
    : (linked[0]?.id ?? "");
  return (
    <section className="account-page" aria-labelledby="account-documents-title">
      <AccountPageHeader
        title="Documents"
        titleId="account-documents-title"
        description="Complete requests and keep track of your documents and agreements."
        action={
          <label>
            <span className="sr-only">Organization</span>
            <select
              aria-label="Organization"
              value={workspaceId}
              onChange={(e) => setSelectedWorkspace(e.target.value)}
            >
              {linked.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        }
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
      {workspaces.error && (
        <p role="alert">Your organizations could not be loaded.</p>
      )}
      {workspaceId ? (
        <EmployeeDocumentsList
          key={`${workspaceId}:${tab}`}
          audience={{ workspaceId, selfOnly: true }}
          userId={account?.userId ?? ""}
          canReview={false}
          kind={tab}
          initialRequirementId={
            selectedWorkspace === workspaceId ? params.get("requirement") : null
          }
        />
      ) : !workspaces.isLoading && !workspaces.error ? (
        <p>No linked organizations.</p>
      ) : null}
    </section>
  );
}
