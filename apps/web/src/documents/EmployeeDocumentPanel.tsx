import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { EmployeeDocumentsList } from "./EmployeeDocumentsList";
import type { ReviewSitting } from "./review-sitting";

/**
 * Employee drawer and Settings use the same scoped data and review operations. `sitting`: the drafts of the review
 * drawer, held by the page around the panel so they outlive it (K1 decision 5).
 */
export function EmployeeDocumentPanel({ employeeId, sitting }: { employeeId: string; sitting?: ReviewSitting }) {
  const { context } = useAuth();
  if (!context || !can(context, "documents.read")) return null;
  return (
    <EmployeeDocumentsList
      audience={{ workspaceId: context.workspace.id, selfOnly: false }}
      userId={context.userId}
      canReview={can(context, "documents.review")}
      employeeId={employeeId}
      sitting={sitting}
    />
  );
}
