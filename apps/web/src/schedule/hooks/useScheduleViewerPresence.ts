import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "../../lib/supabase";

export interface ScheduleViewerPresence {
  readonly userId: string;
  readonly mode: "preview" | "edit";
  readonly onlineAt: string;
}

interface PresenceMeta {
  readonly user_id?: unknown;
  readonly mode?: unknown;
  readonly online_at?: unknown;
}

export function normalizeSchedulePresence(
  meta: PresenceMeta,
): ScheduleViewerPresence | null {
  if (typeof meta.user_id !== "string") return null;
  return {
    userId: meta.user_id,
    mode: meta.mode === "edit" ? "edit" : "preview",
    onlineAt:
      typeof meta.online_at === "string"
        ? meta.online_at
        : new Date(0).toISOString(),
  };
}

function sameScheduleViewers(
  current: readonly ScheduleViewerPresence[],
  next: readonly ScheduleViewerPresence[],
): boolean {
  return (
    current.length === next.length &&
    current.every((viewer, index) => {
      const nextViewer = next[index];
      return (
        nextViewer &&
        viewer.userId === nextViewer.userId &&
        viewer.mode === nextViewer.mode &&
        viewer.onlineAt === nextViewer.onlineAt
      );
    })
  );
}

export function useScheduleViewerPresence({
  workspaceId,
  weekStart,
  locationId,
  authUserId,
  mode,
}: {
  readonly workspaceId: string | null;
  readonly weekStart: string;
  readonly locationId: string | null;
  readonly authUserId: string | null;
  readonly mode: "preview" | "edit";
}): ScheduleViewerPresence[] {
  const [viewers, setViewers] = useState<ScheduleViewerPresence[]>([]);
  const channelName = useMemo(
    () =>
      workspaceId && locationId
        ? `schedule:presence:${workspaceId}:${locationId}:${weekStart}`
        : null,
    [locationId, weekStart, workspaceId],
  );

  useEffect(() => {
    const client = supabaseClient;
    if (!client || !channelName || !authUserId) {
      setViewers([]);
      return undefined;
    }

    const channel = client.channel(channelName, {
      config: { presence: { key: authUserId } },
    });

    const syncPresence = () => {
      const state = channel.presenceState<PresenceMeta>();
      const next = Object.values(state)
        .flat()
        .map(normalizeSchedulePresence)
        .filter((viewer): viewer is ScheduleViewerPresence =>
          Boolean(viewer),
        );
      setViewers((current) =>
        sameScheduleViewers(current, next) ? current : next,
      );
    };

    channel.on("presence", { event: "sync" }, syncPresence).subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      void channel.track({
        user_id: authUserId,
        mode,
        online_at: new Date().toISOString(),
      });
    });

    return () => {
      void channel.untrack();
      void client.removeChannel(channel);
    };
  }, [authUserId, channelName, mode]);

  return viewers;
}
