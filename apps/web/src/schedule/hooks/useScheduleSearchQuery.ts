import { useCallback } from "react";
import { useNavigate } from "react-router";

import { withScheduleSearchValue } from "../lib/scheduleDismissal";

/**
 * Writes the top bar search to the address as ?q= (S-228). The search is sent
 * after a short pause, and the router moves to a new address inside a
 * transition, so the render that sends it can still hold the previous address
 * (a week step just clicked, the new week not drawn yet). It starts from the
 * address the browser shows, never the render's copy, so that step stays.
 */
export function useSetScheduleSearchQuery(): (value: string) => void {
  const navigate = useNavigate();
  return useCallback(
    (value: string) => {
      const live = new URLSearchParams(window.location.search);
      const next = withScheduleSearchValue(live, "q", value.trim() ? value : null);
      void navigate(`?${next}`, { replace: true });
    },
    [navigate],
  );
}
