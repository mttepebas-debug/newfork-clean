import { useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { CatalogPageHeader } from "../views/CatalogPageHeader";
import { EmployeeDocumentsList } from "./EmployeeDocumentsList";
import "../settings/jobs-settings.css";

export default function EmployeeDocumentsPage() {
  const { context } = useAuth();
  const [search] = useSearchParams();
  return (
    <section
      className="employees-page employee-documents-page jobs-settings-page"
      aria-labelledby="employee-documents-title"
    >
      <CatalogPageHeader
        eyebrow="EMPLOYEES"
        title="Documents"
        titleId="employee-documents-title"
        description="Review employee documents, delivery status and expiration."
      />
      <EmployeeDocumentsList
        audience={{ workspaceId: context?.workspace.id ?? "", selfOnly: false }}
        userId={context?.userId ?? ""}
        canReview={can(context, "documents.review")}
        kind="document"
        initialRequirementId={search.get("requirement")}
      />
    </section>
  );
}
