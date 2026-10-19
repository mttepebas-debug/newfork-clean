import { useState } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { EmployeeDocumentsList } from "./EmployeeDocumentsList";
import { useTabSwipe } from "../shell/useTabSwipe";
import { CatalogPageHeader } from "../views/CatalogPageHeader";
import { onTabListKeyDown } from "../lib/tab-list-keys";

const DOCUMENT_TABS = ["document", "acknowledgement"] as const;

/**
 * One's own documents and agreements in the open workspace (MY-DOCUMENTS,
 * Mert 2026-10-19): a page of its own, no longer a tab of Account. The
 * employee interface calls it Documents; management, where Documents is the
 * team's, calls it My documents.
 */
export default function MyDocumentsPage({ title }: { readonly title: "Documents" | "My documents" }) {
  const { account, context } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<(typeof DOCUMENT_TABS)[number]>(
    params.get("kind") === "acknowledgement" ? "acknowledgement" : "document",
  );
  // On a phone a swipe sideways moves between the two tabs (KARARLAR §1.5).
  const swipe = useTabSwipe({ tabs: DOCUMENT_TABS, active: tab, onSelect: setTab });
  if (!context) return null;
  const workspaceId = context.workspace.id;
  // A link from a notification or Home names a request; only one of this
  // workspace's opens here.
  const requested = params.get("workspace");
  const initialRequirementId = !requested || requested === workspaceId ? params.get("requirement") : null;

  return (
    <section className="settings-page my-documents-page" aria-labelledby="my-documents-title" ref={swipe.root}>
      <CatalogPageHeader
        eyebrow="REQUESTS. FILES. AGREEMENTS."
        title={title}
        titleId="my-documents-title"
        description={`What ${context.workspace.name} asks of you: your documents and the policies you agree to.`}
      />
      <div
        className="requests-tabs"
        role="tablist"
        aria-label="Your documents"
        onKeyDown={onTabListKeyDown}
        ref={swipe.tabs}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "document"}
          tabIndex={tab === "document" ? 0 : -1}
          className={tab === "document" ? "active" : ""}
          onClick={() => setTab("document")}
        >
          Documents
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "acknowledgement"}
          tabIndex={tab === "acknowledgement" ? 0 : -1}
          className={tab === "acknowledgement" ? "active" : ""}
          onClick={() => setTab("acknowledgement")}
        >
          Policies &amp; Agreements
        </button>
      </div>
      <EmployeeDocumentsList
        key={tab}
        audience={{ workspaceId, selfOnly: true }}
        userId={account?.userId ?? ""}
        canReview={false}
        kind={tab}
        initialRequirementId={initialRequirementId}
        personal
      />
    </section>
  );
}
