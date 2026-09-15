import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { getCurrentUserWorkspaceAvatar } from "../lib/supabase";

export function AccountAvatar({ workspaceUrl, globalUrl, name, className }: {
  workspaceUrl?: string | null; globalUrl?: string | null; name: string; className: string;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const url = [workspaceUrl, globalUrl].find(value => value && !failed.includes(value));
  return url ? <img className={className} src={url} alt="" onError={() => setFailed(values => [...values, url])} />
    : <span className={className} aria-hidden>{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "A"}</span>;
}

// Only the signed-in user's workspace photo is read; never a directory-wide fallback.
export function CurrentUserAvatar() {
  const { account, context } = useAuth();
  const workspaceId = context?.workspace.id;
  const photo = useQuery({
    queryKey: ["current-user-avatar", workspaceId, context?.userId],
    queryFn: () => getCurrentUserWorkspaceAvatar(workspaceId!), enabled: Boolean(workspaceId),
    retry: false, staleTime: 240_000, refetchInterval: 240_000,
  });
  return <AccountAvatar key={`${workspaceId}:${context?.userId}`} workspaceUrl={photo.data?.url}
    globalUrl={account?.avatarUrl} name={account?.displayName ?? "Account"} className="current-user-avatar" />;
}
