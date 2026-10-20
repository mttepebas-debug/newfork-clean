import type { ExchangeReadModel } from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { todayIn } from "../../lib/today";
import { addDays } from "../../schedule/lib/scheduleDateTime";
import { getExchanges } from "./exchange-data";

type ExchangeApplication = ExchangeReadModel["cases"][number]["applications"][number];
type ExchangeOpportunity = ExchangeReadModel["opportunities"][number];

export const activeApplication = (a: ExchangeApplication) =>
  a.status === "invited" || a.status === "pending_manager";

/** BL-995: their approved time off alone keeps this shift from them; they ask for those hours back first. */
export function blockedByTimeOff(eligibility: ExchangeOpportunity["eligibility"]) {
  return (
    eligibility.status !== "eligible" &&
    (eligibility.blockers ?? []).some((b) => b.code === "approved_time_off")
  );
}

/**
 * The open shifts an employee can still pick up (S-151 (3)): released shifts in
 * the pool, less the ones their time off blocks and the ones they already asked
 * for. A shift nobody is assigned to is never one of them (QA 38).
 */
export function pickupOpportunities(model: ExchangeReadModel): ExchangeOpportunity[] {
  const asked = (opportunity: ExchangeOpportunity) =>
    model.cases
      .find((c) => c.id === opportunity.case_id)
      ?.applications.some((a) => a.employee_id === model.employee_id && activeApplication(a));
  return model.opportunities.filter((o) => !blockedByTimeOff(o.eligibility) && !asked(o));
}

/** The pool as Shift Hub first reads it (today and six weeks on), so both share one answer. */
export function usePickupShifts(workspaceId: string) {
  const { context } = useAuth();
  const from = todayIn();
  const to = addDays(from, 42);
  const query = useQuery({
    queryKey: ["shift-exchanges", workspaceId, context?.userId, from, to, undefined],
    queryFn: () => getExchanges(workspaceId, false, { from, to }),
    refetchInterval: 60_000,
    refetchOnReconnect: "always",
  });
  return query.data ? pickupOpportunities(query.data).map((o) => o.shift) : [];
}
