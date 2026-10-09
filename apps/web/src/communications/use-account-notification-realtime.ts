import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "../lib/supabase";

export function useAccountNotificationRealtime(userId?: string) {
  const queries = useQueryClient();
  useEffect(() => {
    if (!userId || !supabaseClient) return;
    const client = supabaseClient;
    const channel = client.channel(`account-notifications:${userId}`, { config: { private: true } })
      .on("postgres_changes", {
        event: "*", schema: "public", table: "account_notification_items",
        filter: `user_id=eq.${userId}`,
      }, () => { void queries.invalidateQueries({ queryKey: ["notifications"] }); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [queries, userId]);
}
