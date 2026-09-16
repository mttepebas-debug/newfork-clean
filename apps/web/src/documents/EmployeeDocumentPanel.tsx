import { useAuth } from "../auth/AuthContext";
import { EmployeeDocumentsList } from "./EmployeeDocumentsList";

/** Employee drawer and Settings use the same scoped data and review operations. */
export function EmployeeDocumentPanel({ employeeId }: { employeeId: string }) {
  const { context } = useAuth();
  if (!context?.permissions.includes("employee_documents.read")) return null;
  return (
    <EmployeeDocumentsList
      audience={{ workspaceId: context.workspace.id, selfOnly: false }}
      userId={context.userId}
      canReview={context.permissions.includes("employee_documents.review")}
      employeeId={employeeId}
    />
  );
}
