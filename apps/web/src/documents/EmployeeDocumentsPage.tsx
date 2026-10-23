import { documentStatusFilterFromLink } from "@newfork/shared";
import { useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { noAccessHomePath } from "../auth/resolveLanding";
import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { CatalogPageHeader } from "../views/CatalogPageHeader";
import {
  EmployeeDocumentsList,
  useEmployeeDocuments,
} from "./EmployeeDocumentsList";
import "../settings/jobs-settings.css";

export default function EmployeeDocumentsPage() {
  const { context } = useAuth();
  const [search] = useSearchParams();
  const audience = { workspaceId: context?.workspace.id ?? "", selfOnly: false };
  const query = useEmployeeDocuments(audience, context?.userId ?? "");
  const initialStatus = documentStatusFilterFromLink(search.get("status"));
  // Refused: the card alone, no page header (Mert 2026-10-14).
  if (isNoAccess(query.error))
    return (
      <NoAccessState
        homeHref={noAccessHomePath(context, "/app/employees/documents")}
      />
    );
  return (
    <section
      className="employees-page employee-documents-page jobs-settings-page list-page"
      aria-labelledby="employee-documents-title"
    >
      <CatalogPageHeader
        eyebrow="EMPLOYEES"
        title="Documents"
        titleId="employee-documents-title"
        description="Review employee documents, delivery status and expiration."
      />
      <EmployeeDocumentsList
        audience={audience}
        userId={context?.userId ?? ""}
        canReview={can(context, "documents.review")}
        kind="document"
        initialRequirementId={search.get("requirement")}
        initialStatus={initialStatus}
        initialLocationId={search.get("location") ?? undefined}
      />
    </section>
  );
}
