import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { getDocumentAccess } from "./document-data";

export function DocumentAccessRoute({ children }: { children: ReactNode }) {
  const { account, context } = useAuth();
  const workspaceId = context?.workspace.id ?? "";
  // Development-only contexts predate a verified document access response.
  const enabled = Boolean(context?.documentAccess && account && workspaceId);
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
  if (enabled && access.error)
    return (
      <main>
        <p role="alert">Document access could not be checked.</p>
        <button type="button" onClick={() => void access.refetch()}>
          Try again
        </button>
      </main>
    );
  if (access.data?.restricted)
    return (
      <Navigate to={`/account/documents?workspace=${workspaceId}`} replace />
    );
  return children;
}
