import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router";

/**
 * Sets one ?key= on the address, keeping the others; an empty value removes it.
 *
 * The router moves to a new address inside a transition, so until the page has rendered it, the page (and
 * react-router's own `setSearchParams(current => …)`) still holds the previous address. Two steps close together,
 * the phone Lineup's › and then its Location menu, would write the day before back (CI 40082125411). Each step
 * starts from the last address this page wrote that the render has not caught up with yet.
 */
export function useSetSearchParam(): (key: string, value: string) => void {
  const [params, setParams] = useSearchParams();
  const ahead = useRef<URLSearchParams | null>(null);
  useEffect(() => {
    ahead.current = null;
  }, [params]);
  return useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(ahead.current ?? params);
      if (value) next.set(key, value);
      else next.delete(key);
      ahead.current = next;
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
}
