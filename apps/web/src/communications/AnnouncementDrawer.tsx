import type {
  AnnouncementDetail,
  AnnouncementDraft,
  AnnouncementIntent,
  AnnouncementList,
  AnnouncementPerson,
  AnnouncementPreview,
  AnnouncementSaved,
  AnnouncementStateAction,
} from "@newfork/shared";
import { Button, ConfirmButton, useToast } from "@newfork/ui";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { isNoAccess } from "../lib/no-access";
import { RequestError } from "../lib/request-error";
import { todayIn, validZone } from "../lib/today";
import { CatalogDrawer } from "../settings/CatalogDrawer";
import {
  changesHours,
  draftFromRecord,
  draftKey,
  draftToSend,
  failureReason,
  hasStarted,
  headerLine,
  isWizard,
  mainAction,
  momentText,
  newDraft,
  nextStepAfter,
  onDrawerTabs,
  plural,
  shiftBadge,
  shiftBand,
  shownProblems,
  statusLabels,
  statusTones,
  stepBefore,
  wizardSteps,
  zonedMoment,
  zonedWall,
  type DrawerTab,
} from "./announcement-model";
import {
  AudienceTab,
  DetailsTab,
  HistoryTab,
  PublishingRow,
  ShiftsTab,
  type WhereLocation,
} from "./AnnouncementDrawerTabs";
import {
  getAnnouncement,
  previewAnnouncement,
  saveAnnouncement,
  setAnnouncementState,
} from "./communications-data";
import "./announcement-drawer.css";
import { LinesOutline, LoadError } from "../shell/LoadState";

/** Everything a post's change can show up in. */
export const announcementQueryKeys = [
  "announcements",
  "important-dates",
  "schedule-read",
  "employee-hub",
  "notifications",
  "workspace-dashboard",
] as const;

/**
 * The one announcement drawer (EKRAN-08, prototype v11 with the Important Date
 * drawer's look, Mert 2026-10-12): Details (locations and publishing too),
 * Audience (who acknowledged too), Shifts only when a shift is reached, History
 * once it was published. A new post or a draft walks the tabs with Next; the
 * server's preview says what keeps it from going out and which shifts its days
 * reach.
 */
export function AnnouncementDrawer({
  workspaceId,
  list,
  announcementId,
  importantDate = false,
  onClose,
}: {
  workspaceId: string;
  list: AnnouncementList;
  announcementId: string | null;
  importantDate?: boolean;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ["announcements", workspaceId, "detail", announcementId],
    queryFn: () => getAnnouncement(workspaceId, announcementId!),
    enabled: Boolean(announcementId),
    // An edit in progress is never swapped for a newer copy behind its back.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const [carry, setCarry] = useState<{ tab?: DrawerTab; notice?: string }>({});
  if (announcementId && !detail.data)
    return (
      <CatalogDrawer label="Announcement" className="announcement-drawer" onClose={onClose}>
        <div className="ad">
          <header className="ad-head">
            <div className="ad-head-row">
              <h2 className="ad-title">Announcement</h2>
              <CloseButton onClose={onClose} />
            </div>
          </header>
          <div className="ad-body">
            {detail.error && isNoAccess(detail.error) ? (
              <p className="ad-note" data-tone="red" role="alert">
                This announcement is no longer available.
              </p>
            ) : detail.error ? (
              <LoadError
                inset
                title="We couldn't load this announcement"
                detail="It didn't load. Nothing was changed."
                retrying={detail.isFetching}
                onRetry={() => void detail.refetch()}
              />
            ) : (
              <LinesOutline label="Loading announcement" lines={4} />
            )}
          </div>
        </div>
      </CatalogDrawer>
    );
  return (
    <AnnouncementEditor
      key={detail.data ? `${detail.data.id}:${detail.data.revision}` : "new"}
      workspaceId={workspaceId}
      list={list}
      record={detail.data ?? null}
      importantDate={importantDate}
      initialTab={carry.tab}
      notice={carry.notice}
      onStay={(tab, notice) => {
        setCarry({ tab, notice });
        void detail.refetch();
      }}
      onClose={onClose}
    />
  );
}

function CloseButton({ onClose, disabled = false }: { onClose: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="ad-close" aria-label="Close" disabled={disabled} onClick={onClose}>
      <X size={18} aria-hidden />
    </button>
  );
}

function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

// The database says which refusal it is with its key; these the screen words itself.
const refusals: Record<string, string> = {
  "announcement.changed": "This post changed since you opened it. Close it and open it again to see the current version.",
  "announcement.read_only": "This post can't change anymore.",
  "announcement.shifts_changed": "A shift on these days changed. Review the Shifts tab again.",
  "announcement.bring_back_changed": "A shift on the bring-back list changed. Review the list again.",
  "announcement.shift_tied": "A shift tied to an offboarding or a time off can't be removed.",
  "announcement.started_locked": "It has started: only its text, its people, the boxes and Ends change now.",
  "announcement.invalid": "This post can't be saved as sent.",
};

function refusalText(error: unknown): string {
  if (isNoAccess(error)) return "You can't change this post.";
  if (error instanceof RequestError && error.reason) {
    return refusals[error.reason] ?? error.message;
  }
  return "Something went wrong. Nothing was saved; try again.";
}

function savedMessage(
  intent: AnnouncementIntent,
  wasScheduled: boolean,
  result: AnnouncementSaved,
  publishAt: string | null,
  zone: string,
  timeFormat: "12h" | "24h",
): string {
  if (intent === "draft")
    return wasScheduled
      ? "Back to Draft. Nothing was sent."
      : "Draft saved. Nobody sees it and it doesn't touch the Schedule.";
  if (intent === "schedule")
    return `Scheduled for ${publishAt ? momentText(publishAt, zone, timeFormat) : "later"}. Until then nobody sees it; shift choices apply when it publishes.`;
  if (intent === "publish")
    return `Published. ${plural(result.recipient_count, "person", "people")} told${
      result.shift_changes ? `; ${plural(result.shift_changes, "shift")} changed.` : "."
    }`;
  return `Saved. ${plural(result.recipient_count, "person", "people")} get the updated notice.`;
}

function AnnouncementEditor({
  workspaceId,
  list,
  record,
  importantDate,
  initialTab,
  notice,
  onStay,
  onClose,
}: {
  workspaceId: string;
  list: AnnouncementList;
  record: AnnouncementDetail | null;
  importantDate: boolean;
  initialTab?: DrawerTab;
  notice?: string;
  onStay: (tab: DrawerTab, notice: string) => void;
  onClose: () => void;
}) {
  const { context } = useAuth();
  const me = context?.userId ?? null;
  const toast = useToast();
  const client = useQueryClient();
  const idPrefix = `ad${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const bodyRef = useRef<HTMLDivElement>(null);
  const timeFormat = list.time_format;
  const status = record?.display_status ?? null;
  const past = status === "past";
  // A past post never changes (can_edit is false), yet whoever may archive it
  // still gets Archive: read-only with one action, not a reader's view.
  const readOnly =
    record !== null && (status === "archived" || (!record.can_edit && !(past && record.can_archive)));
  const locked = readOnly || past;
  const started = record !== null && hasStarted(record);
  const [initial] = useState(() =>
    record ? draftFromRecord(record) : newDraft(list, importantDate, validZone()),
  );
  const [draft, setDraft] = useState<AnnouncementDraft>(initial);
  const [later, setLater] = useState(initial.publish_at !== null);
  const [publishWall, setPublishWall] = useState(() =>
    initial.publish_at ? zonedWall(initial.publish_at, record?.time_zone ?? validZone()) : "",
  );
  const [tab, setTab] = useState<DrawerTab>(initialTab ?? "details");
  const [tried, setTried] = useState<boolean | "draft">(false);
  const [triedTabs, setTriedTabs] = useState<Set<string>>(new Set());
  const [focusField, setFocusField] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState("");
  const update = (change: (current: AnnouncementDraft) => AnnouncementDraft) => {
    setDraft(change);
    setArmed(false);
    setFailure("");
  };

  const firstZone = list.locations.find((location) =>
    draft.locations.some((row) => row.location_id === location.id),
  )?.timezone;
  const [previewZone, setPreviewZone] = useState<string | null>(null);
  // The post's own clock: where its first location is, else its author's, else this device's.
  const zone = previewZone ?? record?.time_zone ?? firstZone ?? validZone();
  const composed = useMemo<AnnouncementDraft>(
    () => ({ ...draft, publish_at: later ? zonedMoment(publishWall, zone) : null }),
    [draft, later, publishWall, zone],
  );
  const main = mainAction(status, later, composed.publish_at);
  const previewInput = (value: AnnouncementDraft) => ({
    announcement_id: record?.id ?? null,
    intent: mainAction(status, later, value.publish_at).intent,
    announcement: draftToSend(value),
  });
  const previewQueryKey = (input: ReturnType<typeof previewInput>) => [
    "announcements",
    workspaceId,
    "preview",
    JSON.stringify(input),
  ];
  const settled = useDebounced(composed, 250);
  const settledInput = previewInput(settled);
  const preview = useQuery({
    queryKey: previewQueryKey(settledInput),
    queryFn: async () => onDrawerTabs(await previewAnnouncement(workspaceId, settledInput)),
    enabled: !locked,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const serverZone = preview.data?.time_zone ?? null;
  useEffect(() => {
    if (serverZone) setPreviewZone(serverZone);
  }, [serverZone]);
  const ensurePreview = (): Promise<AnnouncementPreview> => {
    const input = previewInput(composed);
    return client.fetchQuery({
      queryKey: previewQueryKey(input),
      queryFn: async () => onDrawerTabs(await previewAnnouncement(workspaceId, input)),
      staleTime: 15_000,
    });
  };

  const problems = locked ? [] : (preview.data?.problems ?? []);
  const shown = shownProblems(problems, tried, triedTabs);
  const problemAt = (field: string) => shown.find((problem) => problem.field === field)?.message;
  const wizard = isWizard(status) && !locked;
  const moment = (value: string | null) => (value ? new Date(value).toISOString() : null);
  const changed =
    draftKey({ ...composed, publish_at: moment(composed.publish_at) }) !==
    draftKey({ ...initial, publish_at: moment(initial.publish_at) });

  useEffect(() => {
    if (!focusField) return;
    const root = bodyRef.current;
    const target = field(root, focusField);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: "center" });
    setFocusField(null);
  }, [focusField, tab]);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 3200);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const refresh = () =>
    Promise.all(announcementQueryKeys.map((key) => client.invalidateQueries({ queryKey: [key] })));
  const save = useMutation({
    mutationFn: (input: { intent: AnnouncementIntent; announcement: AnnouncementDraft }) =>
      saveAnnouncement(workspaceId, {
        announcement_id: record?.id ?? null,
        expected_revision: record?.revision ?? null,
        ...input,
      }),
    onSuccess: async (result, input) => {
      await refresh();
      toast.success(
        savedMessage(input.intent, status === "scheduled", result, input.announcement.publish_at, zone, timeFormat),
      );
      onClose();
    },
    onError: (error) => {
      setFailure(refusalText(error));
      if (error instanceof RequestError && error.reason?.startsWith("announcement.")) {
        void client.invalidateQueries({ queryKey: ["announcements", workspaceId, "preview"] });
        if (error.reason === "announcement.changed" || error.reason === "announcement.read_only") void refresh();
        if (error.detail) {
          setTried(true);
          setFocusField(error.detail);
        }
      }
    },
  });
  const change = useMutation({
    mutationFn: ({ action, bringBack = [] }: { action: AnnouncementStateAction; bringBack?: string[] }) =>
      setAnnouncementState(workspaceId, record!.id, action, record!.revision, bringBack),
    onSuccess: async (result, { action, bringBack = [] }) => {
      await refresh();
      if (action === "unschedule") {
        toast.success("Unscheduled. It's a draft again; nothing was sent.");
        onClose();
      } else if (action === "archive") {
        toast.success("Archived. Nobody sees it; it stays under Archived.");
        onClose();
      } else if (action === "unpublish") {
        const back = (record?.shift_change_count ?? 0) > 0;
        onStay(
          back ? "shifts" : "details",
          `Unpublished. ${result.told ? `${plural(result.told, "person", "people")} told it's cancelled. ` : ""}${
            back ? "No shift comes back on its own: pick them below." : ""
          }`.trim(),
        );
      } else if (action === "bring_back") {
        onStay("shifts", `${plural(bringBack.length, "shift")} back on the Schedule. Each person got one notice.`);
      } else {
        onStay("aud", `Reminder sent to ${plural(result.told, "person", "people")} who haven't acknowledged.`);
      }
    },
    onError: (error) => {
      setFailure(refusalText(error));
      if (error instanceof RequestError && error.reason?.startsWith("announcement.")) void refresh();
    },
  });
  const busy = save.isPending || change.isPending || checking;

  // ---------- tabs ----------
  const counts = preview.data?.counts;
  const recipients = locked ? (record?.recipient_count ?? 0) : (preview.data?.recipient_count ?? record?.recipient_count ?? 0);
  // What the Shifts tab would list: the shifts this post's days reach, the
  // ones that may come back, or (a post nobody can change) what it changed.
  const reached = locked || status === "unpublished" ? null : (counts ?? null);
  const bringBack = locked ? 0 : (preview.data?.bring_back.length ?? 0);
  const changedShifts = locked ? (record?.changes ?? []).filter((item) => !item.brought_back_at).length : 0;
  const badge = shiftBadge(reached, bringBack, changedShifts);
  const band = locked ? null : shiftBand(reached, bringBack);
  const tabs: { id: DrawerTab; label: ReactNode; name: string }[] = [
    { id: "details", label: "Details", name: "Details" },
    {
      id: "aud",
      label: (
        <>
          Audience <span className="ad-badge">{recipients}</span>
        </>
      ),
      name: "Audience",
    },
  ];
  if (badge)
    tabs.push({
      id: "shifts",
      label: (
        <>
          Shifts{" "}
          <span className="ad-badge" data-tone={badge.warn ? "warn" : undefined}>
            {badge.count}
          </span>
        </>
      ),
      name: "Shifts",
    });
  if (record?.published_at) tabs.push({ id: "history", label: "History", name: "History" });
  const steps = wizardSteps(Boolean(badge));
  const current = tabs.some((item) => item.id === tab) ? tab : "details";
  const errorTabs = new Set<string>(shown.map((problem) => problem.tab));
  const showMissing = (target: DrawerTab, from: AnnouncementPreview) => {
    setTab(target);
    setTriedTabs((previous) => new Set(previous).add(target));
    const first = from.problems.find((problem) => problem.tab === target);
    if (first) setFocusField(first.field);
  };
  const openTab = async (target: DrawerTab) => {
    const gap = stepBefore(wizard, steps, problems, target);
    if (!gap) {
      setTab(target);
      return;
    }
    showMissing(gap, preview.data ?? (await ensurePreview()));
  };
  const nextTab = nextStepAfter(wizard, steps, current);
  const goNext = async () => {
    setChecking(true);
    try {
      const fresh = await ensurePreview();
      if (fresh.problems.some((problem) => problem.tab === current)) showMissing(current, fresh);
      else if (nextTab) setTab(nextTab);
    } catch (error) {
      setFailure(refusalText(error));
    } finally {
      setChecking(false);
    }
  };
  const runMain = async () => {
    setChecking(true);
    try {
      const fresh = await ensurePreview();
      if (fresh.problems.length) {
        setTried(true);
        setArmed(false);
        const first = fresh.problems[0]!;
        setTab(first.tab as DrawerTab);
        setFocusField(first.field);
        return;
      }
      if (main.verb && fresh.counts.removed > 0 && !armed) {
        setArmed(true);
        return;
      }
      setArmed(false);
      save.mutate({ intent: main.intent, announcement: draftToSend(composed, fresh) });
    } catch (error) {
      setFailure(refusalText(error));
    } finally {
      setChecking(false);
    }
  };
  const saveDraft = () => {
    if (!draft.title.trim()) {
      setTried((previous) => (previous === true ? true : "draft"));
      setTab("details");
      setFocusField("title");
      return;
    }
    save.mutate({ intent: "draft", announcement: draftToSend(composed, preview.data) });
  };

  // ---------- pieces ----------
  const people = useMemo(() => {
    const map = new Map<string, AnnouncementPerson>();
    for (const person of list.people) map.set(person.user_id, person);
    for (const person of record?.people ?? []) if (!map.has(person.user_id)) map.set(person.user_id, person);
    return map;
  }, [list.people, record?.people]);
  const recordLocations = record?.locations ?? [];
  const whereLocations: WhereLocation[] = locked
    ? recordLocations.map((location) => ({ id: location.location_id, name: location.name, canChangeHours: false }))
    : [
        ...list.locations.map((location) => ({
          id: location.id,
          name: location.name,
          canChangeHours: location.can_change_hours,
        })),
        ...recordLocations
          .filter((location) => !location.archived && !list.locations.some((item) => item.id === location.location_id))
          .map((location) => ({ id: location.location_id, name: location.name, canChangeHours: false })),
      ];
  const checkedLocations = draft.locations.map((row) => {
    const mine = list.locations.find((location) => location.id === row.location_id);
    const theirs = recordLocations.find((location) => location.location_id === row.location_id);
    return { id: row.location_id, name: mine?.name ?? theirs?.name ?? "A location", count: mine?.people_count ?? null };
  });
  const checkedIds = new Set(draft.locations.map((row) => row.location_id));
  const shiftPeople = [
    ...new Map(
      (preview.data?.shifts ?? [])
        .filter(
          (shift) =>
            shift.outcome !== "kept" &&
            shift.employee_user_id &&
            !draft.people.includes(shift.employee_user_id) &&
            !people.get(shift.employee_user_id)?.location_ids.some((id) => checkedIds.has(id)),
        )
        .map((shift) => [
          shift.employee_user_id!,
          {
            user_id: shift.employee_user_id!,
            name: shift.employee_name ?? "Someone",
            meta: `${shift.job_name} · ${shift.location_name}`,
          },
        ]),
    ).values(),
  ];
  const needsDate =
    draft.on_important_dates || draft.on_calendar || draft.on_schedule || changesHours(draft);
  const today = todayIn(zone);
  const startsAt = preview.data?.starts_at ?? record?.starts_at ?? null;
  const laterBlocked = !later && startsAt !== null && Date.parse(startsAt) <= Date.now();
  const applyText =
    status === "scheduled" && composed.publish_at
      ? `on ${momentText(composed.publish_at, zone, timeFormat)}, when it publishes`
      : status === "published"
        ? "when you save"
        : "when it publishes";

  const title = record ? record.title || "Untitled" : "New announcement";
  const banner = (() => {
    if (readOnly)
      return (
        <div className="ad-readonly">
          {status === "archived"
            ? "Archived. It stays here for the record; nobody sees it."
            : "You can read this but not change it."}
        </div>
      );
    if (status === "publish_failed")
      return (
        <p className="ad-note" data-tone="red">
          <b>Couldn&apos;t publish.</b> {failureReason(record?.publish_error_code ?? null)} Nothing was sent. Publish
          now to send it.
        </p>
      );
    if (status === "unpublished")
      return (
        <p className="ad-note">
          Unpublished: nobody sees it and it isn&apos;t on the Schedule. Publishing it again works like a new publish.
        </p>
      );
    if (past) return <p className="ad-note">This is over. It can&apos;t change anymore; you can archive it.</p>;
    if (status === "scheduled" && record?.publish_at)
      return (
        <p className="ad-note" data-tone="blue">
          Scheduled for {momentText(record.publish_at, zone, timeFormat)}. Nobody sees it yet; shift choices apply when
          it publishes.
        </p>
      );
    if (started)
      return (
        <p className="ad-note" data-tone="blue">
          It has started. Only the text and Ends can change now.
        </p>
      );
    return null;
  })();

  // ---------- footer ----------
  const left: ReactNode[] = [];
  if (!readOnly && record) {
    if (status === "scheduled" && record.can_unschedule)
      left.push(
        <Button
          key="unschedule"
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => change.mutate({ action: "unschedule" })}
        >
          Unschedule
        </Button>,
      );
    if (status === "published" && record.can_unpublish)
      left.push(
        <ConfirmButton
          key="unpublish"
          className="danger-button"
          disabled={busy}
          confirmLabel={`Unpublish and tell ${plural(record.recipient_count ?? 0, "person", "people")}?`}
          onConfirm={() => change.mutate({ action: "unpublish" })}
        >
          Unpublish
        </ConfirmButton>,
      );
    if ((status === "draft" || status === "unpublished" || status === "past") && record.can_archive)
      left.push(
        <ConfirmButton
          key="archive"
          className="danger-button"
          disabled={busy}
          confirmLabel="Archive it?"
          onConfirm={() => change.mutate({ action: "archive" })}
        >
          Archive
        </ConfirmButton>,
      );
  }
  const hereHasProblems = problems.some((problem) => problem.tab === current);
  let right: ReactNode;
  if (readOnly || past)
    right = (
      <Button type="button" className="secondary-button" onClick={onClose}>
        Close
      </Button>
    );
  else
    right = (
      <>
        {status !== "published" && status !== "scheduled" && (
          <Button type="button" className="secondary-button" disabled={busy} onClick={saveDraft}>
            Save draft
          </Button>
        )}
        {nextTab ? (
          <Button
            type="button"
            aria-disabled={hereHasProblems || undefined}
            data-dim={hereHasProblems || undefined}
            disabled={busy}
            onClick={() => void goNext()}
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            className={armed ? "danger-button is-armed" : undefined}
            aria-disabled={(wizard && problems.length > 0) || undefined}
            data-dim={(wizard && problems.length > 0) || undefined}
            disabled={busy || (!wizard && !changed && status !== "publish_failed" && status !== "unpublished")}
            onBlur={() => setArmed(false)}
            onClick={() => void runMain()}
          >
            {armed
              ? `Remove ${plural(counts?.removed ?? 0, "shift")} and ${main.verb}?`
              : main.label}
          </Button>
        )}
      </>
    );

  return (
    <CatalogDrawer label={title} className="announcement-drawer" onClose={onClose} busy={save.isPending || change.isPending}>
      <div className="ad">
        <header className="ad-head">
          <div className="ad-head-row">
            <div className="ad-head-text">
              <h2 className="ad-title">
                <span>{title}</span>
                {record && (
                  <span className="ad-status" data-tone={statusTones[record.display_status]}>
                    {statusLabels[record.display_status]}
                  </span>
                )}
                {draft.on_important_dates && <span className="ad-chip">On Important Dates</span>}
              </h2>
              <p className="ad-sub">{headerLine(draft)}</p>
            </div>
            <CloseButton onClose={onClose} disabled={save.isPending || change.isPending} />
          </div>
          <div className="ad-tabs" role="tablist" aria-label="Announcement sections">
            {tabs.map((item) => {
              const gap = stepBefore(wizard, steps, problems, item.id);
              const gapName = gap ? tabs.find((other) => other.id === gap)?.name : undefined;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`${idPrefix}-tab-${item.id}`}
                  aria-controls={`${idPrefix}-panel`}
                  aria-selected={current === item.id}
                  aria-disabled={gap ? true : undefined}
                  title={gapName ? `Finish ${gapName} first` : undefined}
                  onClick={() => void openTab(item.id)}
                >
                  {item.label}
                  {errorTabs.has(item.id) && (
                    <span className="ad-error-dot" title="Something here needs a fix">
                      <span className="sr-only">, needs a fix</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </header>
        <div
          ref={bodyRef}
          className="ad-body"
          data-tab={current}
          role="tabpanel"
          id={`${idPrefix}-panel`}
          aria-labelledby={`${idPrefix}-tab-${current}`}
        >
          {banner}
          {notice && (
            <p className="ad-note" data-tone="green" role="status">
              {notice}
            </p>
          )}
          {current === "details" && (
            <DetailsTab
              idPrefix={idPrefix}
              draft={draft}
              update={update}
              locked={locked}
              started={started}
              canWriteDates={list.can_write_dates}
              needsDate={needsDate}
              today={today}
              problemAt={problemAt}
              locations={whereLocations}
              preview={locked ? undefined : preview.data}
              timeFormat={timeFormat}
              publishing={
                status !== "published" &&
                status !== "past" && (
                  <PublishingRow
                    idPrefix={idPrefix}
                    later={later}
                    laterBlocked={laterBlocked}
                    publishWall={publishWall}
                    minWall={zonedWall(new Date().toISOString(), zone)}
                    locked={locked}
                    problem={problemAt("publish_at")}
                    timeFormat={timeFormat}
                    onLater={(next) => {
                      setLater(next);
                      setArmed(false);
                    }}
                    onWall={setPublishWall}
                  />
                )
              }
            />
          )}
          {current === "aud" && (
            <AudienceTab
              draft={draft}
              update={update}
              locked={locked}
              list={list}
              people={people}
              me={me}
              checkedLocations={checkedLocations}
              recipientCount={recipients}
              shiftPeople={shiftPeople}
              problem={problemAt("people")}
              acks={
                record?.ask_ack && record.status === "published"
                  ? {
                      people: record.acknowledgements ?? [],
                      zone,
                      timeFormat,
                      busy,
                      onRemind: () => change.mutate({ action: "remind" }),
                    }
                  : undefined
              }
            />
          )}
          {current === "shifts" && (
            <ShiftsTab
              status={status}
              draft={draft}
              update={update}
              locked={locked}
              preview={locked ? undefined : preview.data}
              changes={locked ? (record?.changes ?? []) : undefined}
              timeFormat={timeFormat}
              applyText={applyText}
              busy={busy}
              onBringBack={(ids) => change.mutate({ action: "bring_back", bringBack: ids })}
            />
          )}
          {current === "history" && record && <HistoryTab record={record} zone={zone} timeFormat={timeFormat} />}
        </div>
        <footer className="ad-foot">
          {band && (
            <div className="ad-band" data-tone={band.tone} role="status">
              {band.tone === "warn" ? (
                <AlertTriangle size={16} aria-hidden />
              ) : band.tone === "ok" ? (
                <CheckCircle2 size={16} aria-hidden />
              ) : (
                <Info size={16} aria-hidden />
              )}
              <span>{band.text}</span>
              {current !== "shifts" && badge && (
                <button type="button" className="ad-band-link" onClick={() => void openTab("shifts")}>
                  Review shifts
                </button>
              )}
            </div>
          )}
          {failure && (
            <p className="ad-foot-error" role="alert">
              {failure}
            </p>
          )}
          <div className="ad-foot-row">
            {left.length > 0 && <div className="ad-foot-left">{left}</div>}
            <div className="ad-foot-right">{right}</div>
          </div>
        </footer>
      </div>
    </CatalogDrawer>
  );
}

function field(root: HTMLElement | null, name: string): HTMLElement | null {
  if (!root) return null;
  if (name.startsWith("location:")) return root.querySelector<HTMLElement>('[data-focus="locs"]');
  return [...root.querySelectorAll<HTMLElement>("[data-field]")].find((element) => element.dataset.field === name) ?? null;
}
