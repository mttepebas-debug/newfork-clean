import { deviceReadsOtherClock, zoneName } from "../lib/today";

/**
 * "Times in Pacific Time" (S-226, Mert 2026-10-20): every time on the page is the location's, so a device in
 * another zone is told once, under the page's title. A device on the location's clock sees nothing. Only the
 * employee's Home says it; the other pages, a manager's Home and Lineup too, say nothing (S-257, Mert 2026-10-23).
 */
export function ZoneNote({ zone, now }: { readonly zone?: string; readonly now?: Date }) {
  if (!zone || !deviceReadsOtherClock(zone, now)) return null;
  return <p className="zone-note">Times in {zoneName(zone, now)}</p>;
}
