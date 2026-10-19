import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { hasManagementAccess } from "../auth/access";
import { documentQueryKey, listDocuments } from "./document-data";
import { isObligationClosed } from "./document-rules";

// One's own documents in the open workspace (MY-DOCUMENTS, Mert 2026-10-19):
// one page, reached from the employee interface as Documents and from the
// management interface as My documents. Account has no Documents any more.

/** The employee interface's address: it keeps the employee view's frame. */
export const employeeDocumentsPath = "/app/employee-hub/documents";
/** The management interface's address, for whoever holds a management access. */
export const managementDocumentsPath = "/app/my-documents";

export function isOwnDocumentsPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  return path === employeeDocumentsPath || path === managementDocumentsPath;
}

/** Where somebody's own documents open: management's address if they manage. */
export function ownDocumentsPath(membership: Parameters<typeof hasManagementAccess>[0]): string {
  return hasManagementAccess(membership) ? managementDocumentsPath : employeeDocumentsPath;
}

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
      !isObligationClosed(obligation.status as Parameters<typeof isObligationClosed>[0]),
  ).length;
}

/**
 * What the open workspace asks of the signed-in person: whether it asks
 * anything at all (management shows My documents only then) and how much of it
 * still waits on them. The page's own list runs this same query.
 */
export function useOwnDocuments(): { readonly asked: boolean; readonly waiting: number } {
  const { account, context } = useAuth();
  const workspaceId = context?.workspace.id ?? "";
  const userId = account?.userId ?? "";
  const audience = { workspaceId, selfOnly: true } as const;
  const documents = useQuery({
    queryKey: documentQueryKey(audience, userId),
    queryFn: () => listDocuments(audience),
    enabled: Boolean(workspaceId && userId),
  });
  const list = documents.data ?? [];
  return {
    asked: list.length > 0,
    waiting: waitingOnYou(list, "document") + waitingOnYou(list, "acknowledgement"),
  };
}
