// What the Daylight Home reads besides the hub's own model: open requests that
// wait on the person, the documents they still owe, the last few things that
// happened to them, and today's lineup (its section and shift type).
import type { DocumentObligation, EmployeeHubReadModel, EmployeeHubShift, NotificationItem } from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { documentQueryKey, listDocuments } from "../documents/document-data";
import { isObligationClosed } from "../documents/document-rules";
import { getNotificationFeed, notificationKeys } from "../notifications/notifications-data";
import { getMyLineups, lineupKeys } from "../schedule/lineup-data";
import { getExchanges } from "./shift-exchanges/exchange-data";
import { shiftDate } from "./dashboard-model";
import { employeeDocumentsPath } from "../documents/own-documents";

const base = "/app/employee-hub";

export type HomeNeed = { id: string; kind: "swap" | "doc"; title: string; detail: string; cta: string; href: string };
export type HomeUpdate = { id: string; kind: "ok" | "no" | "cal" | "swap"; title: string; detail: string; at: string; href: string | null; unread: boolean };

/**
 * Notification types that say something was decided about the person's own week. The feed's `topic` is the
 * group (my_schedule, time_off …), so Updates picks by `type` (S-247: it matched topics and stayed empty).
 */
const UPDATE_TYPES = /^(schedule\.published|time_off\.decided|shift_changes\.decided)$/;

export function updateKind(item: Pick<NotificationItem, "type" | "data" | "title">): HomeUpdate["kind"] {
  if (item.type.startsWith("schedule.")) return "cal";
  const outcome = String(item.data.outcome ?? item.data.decision ?? item.data.status ?? "");
  return /deni|declin|reject/i.test(outcome) || /declined|denied/i.test(item.title) ? "no" : "ok";
}

/** How long ago, in the words a phone uses: "2h ago", "Yesterday", "3 days ago". */
export function ago(at: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(at)) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  const days = Math.floor(minutes / (24 * 60));
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

const shortDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * A document waits on the person: missing, rejected, expired, or approved but
 * running out soon (the server's word, the manager's to-do rule).
 */
export function documentNeedsYou(item: Pick<DocumentObligation, "kind" | "status" | "expiring_soon">): boolean {
  if (item.kind !== "document" || item.status === "pending_review" || isObligationClosed(item.status)) return false;
  return item.status !== "completed" || item.expiring_soon === true;
}

/** The last three things decided about the person's own week, newest first. */
export function homeUpdates(items: readonly NotificationItem[]): HomeUpdate[] {
  return items
    .filter((item) => UPDATE_TYPES.test(item.type))
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      kind: updateKind(item),
      title: item.title,
      detail: item.body ?? "",
      at: item.created_at,
      href: item.url,
      unread: !item.read_at,
    }));
}

export function useHomeData(model: EmployeeHubReadModel, today: string) {
  const { context } = useAuth();
  const userId = context?.userId ?? "";
  const workspaceId = model.workspace_id;
  const exchanges = useQuery({
    queryKey: ["shift-exchanges", workspaceId, context?.userId, false],
    queryFn: () => getExchanges(workspaceId),
    enabled: Boolean(userId),
    refetchInterval: 60_000,
  });
  const audience = { workspaceId, selfOnly: true } as const;
  const documents = useQuery({
    queryKey: documentQueryKey(audience, userId),
    queryFn: () => listDocuments(audience),
    enabled: Boolean(userId),
    retry: false,
  });
  const readsFeed = can(context, "notifications.read_own");
  const feed = useQuery({
    queryKey: [...notificationKeys.feed(workspaceId, "all"), "home"],
    queryFn: () => getNotificationFeed(workspaceId, "all"),
    enabled: readsFeed,
    refetchInterval: 120_000,
  });
  const lineups = useQuery({
    queryKey: lineupKeys.mine(workspaceId, today),
    queryFn: () => getMyLineups(workspaceId, today),
    retry: false,
  });

  const invited = (exchanges.data?.cases ?? []).filter(
    (item) =>
      item.status === "open" &&
      item.applications.some((a) => a.employee_id === model.employee.id && a.status === "invited"),
  );
  const docs = (documents.data ?? []).filter((item) => documentNeedsYou(item));
  const needs: HomeNeed[] = [
    ...invited.map((item) => ({
      id: item.id,
      kind: "swap" as const,
      title: item.kind === "swap" ? "A teammate wants to swap shifts" : "A teammate asked you to cover their shift",
      detail: `${shiftDate(item.shift.scheduled_date)} · ${item.shift.location_name} · ${item.shift.job_name}`,
      cta: "Answer in Requests",
      href: `${base}/shift-hub?case=${item.id}&hub_view=requests`,
    })),
    ...docs.map((item) => ({
      id: item.id,
      kind: "doc" as const,
      title: item.status === "rejected" ? `Upload your ${item.title} again` : item.status === "expired" ? `Your ${item.title} expired` : `Upload your ${item.title}`,
      detail:
        item.status === "completed" && item.expiry_date
          ? `Your current one expires ${shortDate(item.expiry_date)}`
          : item.status === "rejected" && item.rejection_reason
            ? item.rejection_reason
            : item.deadline_at
              ? `Due ${new Date(item.deadline_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : "Your manager asked for it",
      cta: "Open Documents",
      href: `${employeeDocumentsPath}?workspace=${workspaceId}&kind=document&requirement=${item.id}`,
    })),
  ];
  const updates = homeUpdates(feed.data?.items ?? []);
  // The shift card's area: today's lineup section (Patio), else the lineup's or the shift's type (Dinner).
  const todayLineup = lineups.data?.lineups ?? [];
  const areaFor = (shift: EmployeeHubShift) => {
    const lineup = shift.scheduled_date === today ? todayLineup.find((item) => item.location.id === shift.location_id) : undefined;
    return lineup?.mine.find((row) => row.section_name)?.section_name ?? lineup?.shift_type_name ?? shift.shift_type_name ?? null;
  };
  return {
    needs,
    needsUnknown: exchanges.isError && !exchanges.data,
    updates,
    areaFor,
  };
}
