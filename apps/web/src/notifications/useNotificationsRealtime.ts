import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "../lib/supabase";
import { notificationKeys } from "./notifications-data";

/**
 * BILDIRIM-10: the core sends `changed` on the private channel
 * `notifications:<user id>` when a notice is written or closed for this
 * person (S-91). The signal carries only the workspace id (null for an
 * account notice); it never carries content, so it only refreshes reads that
 * go through the API. Everyone may join their own channel (account.self), so
 * a join is never refused. Coming back to the tab or online refreshes too.
 */
export function useNotificationsRealtime(userId: string | undefined, workspaceId: string | undefined) {
  const client = useQueryClient();
  useEffect(() => {
    if (!userId || !workspaceId) return;
    const refresh = () => void client.invalidateQueries({ queryKey: notificationKeys.all(workspaceId) });
    const supabase = supabaseClient;
    const channel = supabase
      ?.channel(`notifications:${userId}`, { config: { private: true } })
      .on("broadcast", { event: "changed" }, (event) => {
        const about = (event.payload as { workspace_id?: string | null } | undefined)?.workspace_id ?? null;
        if (about === null || about === workspaceId) refresh();
      })
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [client, userId, workspaceId]);
}
