import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { appLandingPath, hubPath } from "../auth/resolveLanding";
import { listAccountWorkspaces, supabaseClient } from "../lib/supabase";
import { PreBizFrame } from "../shell/prebiz/PreBiz";

/** "/welcome" without a workspace: find the organization whose onboarding is open. */
export default function WelcomeRedirect() {
  const { context } = useAuth();
  const workspaces = useQuery({
    queryKey: ["account-workspaces"],
    queryFn: () =>
      supabaseClient ? listAccountWorkspaces(supabaseClient) : [],
  });
  if (workspaces.isLoading)
    // The frame stays while it checks, so Sign out never disappears.
    return <PreBizFrame titleId="welcome-title" title="Checking your account" />;
  const onboarding = (workspaces.data ?? []).filter(
    (workspace) => workspace.status === "pending",
  );
  if (onboarding.length === 1)
    return <Navigate to={`/welcome/${onboarding[0]!.id}`} replace />;
  if (onboarding.length > 1)
    return <Navigate to={hubPath} replace />;
  return <Navigate to={appLandingPath(context)} replace />;
}
