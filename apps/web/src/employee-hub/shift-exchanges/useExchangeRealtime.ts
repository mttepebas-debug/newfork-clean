import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { can } from "../../auth/can";
import { supabaseClient } from "../../lib/supabase";
import { refreshExchangeSurfaces } from "./exchange-data";

/**
 * Events only invalidate authenticated reads; they never set assignment data.
 * The channel opens only for someone the core lets join it (its policy asks
 * exchange.offer_own): a refused private join holds every other join on the
 * shared socket for ~5 s (BL-115).
 * The 60 s fallback and the online/visible refreshes need no channel, so
 * everyone in the workspace keeps them (BL-152).
 */
export function useExchangeRealtime(
  context: ActiveWorkspaceContext | null | undefined,
) {
  const client = useQueryClient();
  const workspace = context?.workspace.id;
  const mayJoinChannel = can(context, "exchange.offer_own");
  useEffect(() => {
    if (!workspace) return;
    const supabase = mayJoinChannel ? supabaseClient : null;
    let disposed = false;
    let pending = false;
    let refreshing = false;
    let queued: number | undefined;
    const canRefresh = () =>
      !disposed && document.visibilityState === "visible" && navigator.onLine;
    const flush = async () => {
      queued = undefined;
      if (!canRefresh()) return;
      pending = false;
      refreshing = true;
      try {
        await refreshExchangeSurfaces(client, workspace);
      } catch {
        // Query observers expose read failures. Keep recovery possible on the
        // next signal/poll without an unhandled background rejection.
      } finally {
        refreshing = false;
        // A later commit may have arrived after this read took its snapshot.
        // Never discard that signal, or restart the read while it is running.
        if (pending && canRefresh()) refresh();
      }
    };
    const refresh = () => {
      if (disposed) return;
      pending = true;
      if (!canRefresh() || refreshing || queued !== undefined) return;
      // Related commits commonly arrive 45–220ms apart. The window
      // starts at the first signal, so ongoing events cannot postpone it.
      queued = window.setTimeout(() => void flush(), 250);
    };
    const channel = supabase
      ?.channel(`shift-exchanges:${workspace}`, { config: { private: true } })
      .on("broadcast", { event: "changed" }, (event) => {
        if (event.payload?.workspace_id === workspace) refresh();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      if (queued !== undefined) clearTimeout(queued);
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [client, mayJoinChannel, workspace]);
}
