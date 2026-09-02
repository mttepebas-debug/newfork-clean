import { useToast } from "@newfork/ui";
import { useEffect } from "react";
import { supabaseClient } from "../../lib/supabase";
import {
  formatCascadeNoticeToast,
  type CascadeNoticePayload,
} from "../components/CascadeNoticeToast";

export function useCascadeNotice({
  workspaceId,
  actorNameByUserId,
}: {
  readonly workspaceId: string | null | undefined;
  readonly actorNameByUserId?: (userId: string) => string | null | undefined;
}) {
  const toast = useToast();

  useEffect(() => {
    const client = supabaseClient;
    if (!workspaceId || !client) return undefined;

    const channel = client
      .channel(`schedule:cascade:${workspaceId}`)
      .on("broadcast", { event: "cascade_notice" }, (event) => {
        if (!isCascadeNoticePayload(event.payload)) return;
        toast.info(
          formatCascadeNoticeToast(
            event.payload,
            actorNameByUserId?.(event.payload.actor_user_id) ?? null,
          ),
        );
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [actorNameByUserId, toast, workspaceId]);
}

export function isCascadeNoticePayload(
  value: unknown,
): value is CascadeNoticePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<CascadeNoticePayload>;
  return (
    payload.kind === "cascade_notice" &&
    typeof payload.actor_user_id === "string" &&
    Array.isArray(payload.affected_op_ids) &&
    (payload.affected_action === "stripped" ||
      payload.affected_action === "deleted" ||
      payload.affected_action === "mixed") &&
    !!payload.deleted_resource &&
    typeof payload.deleted_resource === "object" &&
    (payload.deleted_resource.type === "job" ||
      payload.deleted_resource.type === "shift_type") &&
    typeof payload.deleted_resource.name === "string" &&
    Array.isArray(payload.deleted_resource.ids)
  );
}
