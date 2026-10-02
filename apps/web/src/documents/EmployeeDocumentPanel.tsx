import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { EmployeeDocumentsList } from "./EmployeeDocumentsList";

/** Employee drawer and Settings use the same scoped data and review operations. */
export function EmployeeDocumentPanel({ employeeId }: { employeeId: string }) {
  const { context } = useAuth();
  if (!context || !can(context, "documents.read")) return null;
  return (
    <EmployeeDocumentsList
      audience={{ workspaceId: context.workspace.id, selfOnly: false }}
      userId={context.userId}
      canReview={can(context, "documents.review")}
      employeeId={employeeId}
    />
  );
}
