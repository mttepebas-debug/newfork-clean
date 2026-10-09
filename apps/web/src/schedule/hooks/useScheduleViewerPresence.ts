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
  locationIds,
  editLocationIds = [],
  authUserId,
  mode,
}: {
  readonly workspaceId: string | null;
  readonly weekStart: string;
  /** D-D3: every shown location, so an edit at any of them is seen. */
  readonly locationIds: readonly string[];
  /** Where the person's edit reaches; elsewhere they show as looking. */
  readonly editLocationIds?: readonly string[];
  readonly authUserId: string | null;
  readonly mode: "preview" | "edit";
}): ScheduleViewerPresence[] {
  const [viewers, setViewers] = useState<ScheduleViewerPresence[]>([]);
  const editKey = editLocationIds.join(",");
  const channelPlan = useMemo(
    () => {
      const editing = new Set(editKey ? editKey.split(",") : []);
      return workspaceId
        ? [...new Set(locationIds)].map((locationId) => ({
            name: `schedule:presence:${workspaceId}:${locationId}:${weekStart}`,
            mode: mode === "edit" && editing.has(locationId) ? "edit" as const : "preview" as const,
          }))
        : [];
    },
    [editKey, locationIds, mode, weekStart, workspaceId],
  );

  useEffect(() => {
    const client = supabaseClient;
    if (!client || !channelPlan.length || !authUserId) {
      setViewers([]);
      return undefined;
    }

    // Private: only people who can read a location's schedule may join its channel.
    const channels = channelPlan.map(({ name }) =>
      client.channel(name, {
        config: { private: true, presence: { key: authUserId } },
      }),
    );

    const syncPresence = () => {
      // One row per person: whoever edits at any shown location counts as editing.
      const byUser = new Map<string, ScheduleViewerPresence>();
      for (const channel of channels) {
        for (const viewer of Object.values(channel.presenceState<PresenceMeta>())
          .flat()
          .map(normalizeSchedulePresence)) {
          if (!viewer) continue;
          const seen = byUser.get(viewer.userId);
          if (!seen || (seen.mode !== "edit" && viewer.mode === "edit")) {
            byUser.set(viewer.userId, viewer);
          }
        }
      }
      const next = [...byUser.values()];
      setViewers((current) =>
        sameScheduleViewers(current, next) ? current : next,
      );
    };

    channels.forEach((channel, index) => {
      channel.on("presence", { event: "sync" }, syncPresence).subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        void channel.track({
          user_id: authUserId,
          mode: channelPlan[index]!.mode,
          online_at: new Date().toISOString(),
        });
      });
    });

    return () => {
      for (const channel of channels) {
        void channel.untrack();
        void client.removeChannel(channel);
      }
    };
  }, [authUserId, channelPlan]);

  return viewers;
}
