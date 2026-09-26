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
 * shared socket for ~5 s, the person's own notifications included (BL-115).
 */
export function useExchangeRealtime(
  context: ActiveWorkspaceContext | null | undefined,
) {
  const client = useQueryClient();
  const workspace = can(context, "exchange.offer_own")
    ? context?.workspace.id
    : undefined;
  useEffect(() => {
    if (!workspace || !supabaseClient) return;
    const supabase = supabaseClient;
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
      // Domain and inbox commits commonly arrive 45–220ms apart. The window
      // starts at the first signal, so ongoing events cannot postpone it.
      queued = window.setTimeout(() => void flush(), 250);
    };
    const channel = supabase
      .channel(`shift-exchanges:${workspace}`, { config: { private: true } })
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
      void supabase.removeChannel(channel);
    };
  }, [client, workspace]);
}
