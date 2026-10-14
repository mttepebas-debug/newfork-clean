import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { LoadError } from "../shell/LoadState";
import { getDocumentAccess } from "./document-data";

export function DocumentAccessRoute({ children }: { children: ReactNode }) {
  const { account, context } = useAuth();
  const workspaceId = context?.workspace.id ?? "";
  const enabled = Boolean(context && account && workspaceId);
  const access = useQuery({
    queryKey: ["document-lifecycle", account?.userId, workspaceId, "access"],
    queryFn: () => getDocumentAccess(workspaceId),
    enabled,
    refetchInterval: 30_000,
    staleTime: 0,
    retry: false,
  });
  if (enabled && access.isPending)
    return <main aria-label="Checking document requirements" />;
  // Only a first check that fails stands in the way. The check repeats every
  // 30 seconds; a failed repeat keeps the last answer instead of taking the
  // whole app off the screen.
  if (enabled && access.error && !access.data)
    return (
      <main className="document-access-error">
        <LoadError
          title="We couldn't check your documents"
          detail="Newfork checks whether a document is required before it opens. Nothing was changed."
          retrying={access.isFetching}
          onRetry={() => void access.refetch()}
        />
      </main>
    );
  if (access.data?.restricted)
    return (
      <Navigate to={`/account/documents?workspace=${workspaceId}`} replace />
    );
  return children;
}
