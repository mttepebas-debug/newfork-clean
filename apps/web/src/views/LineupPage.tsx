import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { noAccessHomePath } from "../auth/resolveLanding";
import { isNoAccess } from "../lib/no-access";
import { clockIn, todayIn } from "../lib/today";
import { usePhoneWidth } from "../lib/usePhoneWidth";
import { useScheduleQuery } from "../schedule/hooks/useScheduleQuery";
import { useScheduleRealtime } from "../schedule/hooks/useScheduleRealtime";
import { lineupDay, unpublishedCount, type LineupLocation } from "../schedule/lineup";
import { useLineupDay } from "../schedule/lineup-data";
import { LineupPublishButton, LineupPublishWindow, PUBLISH_DONE_MS } from "../schedule/LineupPublishWindow";
import { LoadError } from "../shell/LoadState";
import { NoAccessState } from "../shell/NoAccessState";
import { CatalogPageHeader } from "./CatalogPageHeader";
import { DesktopLineupPage } from "./LineupDesktop";
import type { LineupEditing } from "./LineupDesktopEdit";
import { PhoneLineupPage } from "./LineupPhone";

// Lineup (Mert 2026-10-13): who works each shift of the day, per location, from the published Schedule, and
// publishing it to staff. On a phone, E · Çark tarih (KARARLAR Lineup, Mert 2026-10-17); on the desktop, F (Mert
// 2026-10-19): the same day picker, shift tabs and lineup card, one location's ticket at a time, whose draft rows,
// sections and notes a manager changes in place (LINEUP-EDIT W2a; the phone's come with W2b).

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function dayName(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function LineupPage() {
  const { context } = useAuth();
  const workspaceId = context?.workspace.id ?? null;
  const today = todayIn();
  const [params, setParams] = useSearchParams();
  const requested = params.get("date") ?? "";
  const date = isoDate.test(requested) ? requested : today;
  const locationId = params.get("location") ?? "";
  const shiftTypeId = params.get("shift") ?? "";

  const phone = usePhoneWidth();

  // The catalog around the lineups (shift types, the week, the time format) is the Schedule read's; the
  // lineups themselves, their rows and publish state, are the lineup day read (LINEUP-PUBLISH-WEB).
  const schedule = useScheduleQuery(workspaceId, date, "day");
  const day = useLineupDay(workspaceId, date);
  const model = schedule.data;
  const query = {
    isLoading: schedule.isLoading || day.isLoading,
    isFetching: schedule.isFetching || day.isFetching,
    error: schedule.error ?? day.error,
    refetch: () => Promise.all([schedule.error ? schedule.refetch() : null, day.error ? day.refetch() : null]),
  };
  const [publishOpen, setPublishOpen] = useState(false);
  // The Publish window is publishing: its Publish and the day controls wait until it has answered.
  const [publishing, setPublishing] = useState(false);
  const closePublish = useCallback(() => setPublishOpen(false), []);
  // It went out (notice A, mockup v-e.js .d-pub): the window closes and the Publish that opened it says
  // "Published" for PUBLISH_DONE_MS, then is as it was.
  const [justPublished, setJustPublished] = useState(false);
  // Which lineups went out last ("<location id>:<shift key>"): the phone gives focus to the first one's card.
  const [sent, setSent] = useState<readonly string[]>([]);
  const publishedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(publishedTimer.current), []);
  const published = useCallback((keys: readonly string[]) => {
    setPublishOpen(false);
    setSent(keys);
    setJustPublished(true);
    window.clearTimeout(publishedTimer.current);
    publishedTimer.current = window.setTimeout(() => setJustPublished(false), PUBLISH_DONE_MS);
  }, []);
  useScheduleRealtime({
    workspaceId,
    weekStart: model?.week_start ?? "",
    locationIds: model?.locations.map((location) => location.id) ?? [],
  });

  // Every lineup of the day: the page picks the location and shift on screen, and the Publish window lists them
  // all (PLAN §3).
  const lineups = useMemo(() => (day.data ? lineupDay(day.data, model ?? null) : []), [day.data, model]);

  function setParam(key: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }
  const goTo = (day: string) => {
    if (publishing) return;
    setPublishOpen(false);
    setParam("date", day === today ? "" : day);
  };

  const canShare = context ? can(context, "lineup.share") : false;
  // Whether a shift has started is told by each location's clock, not the device's: it locks Edit.
  const nowAt = (location: LineupLocation) => (date === todayIn(location.timezone) ? clockIn(location.timezone) : null);
  const waiting = unpublishedCount(lineups);
  const anyPublished = lineups.some((location) => location.shifts.some((shift) => shift.publish.published));
  const publishControl = canShare && day.data ? (
    <div className="lineup-publish-anchor">
      <LineupPublishButton
        waiting={waiting}
        anyPublished={anyPublished}
        open={publishOpen}
        published={justPublished}
        busy={publishing}
        onToggle={() => setPublishOpen(!publishOpen)}
      />
      {publishOpen ? (
        <LineupPublishWindow
          workspaceId={workspaceId}
          date={date}
          dateLabel={shortDate(date)}
          locations={lineups}
          timeFormat={model?.settings.time_format ?? "12h"}
          nowAt={nowAt}
          onClose={closePublish}
          onPublished={published}
          onWorking={setPublishing}
        />
      ) : null}
    </div>
  ) : null;

  const timeFormat = model?.settings.time_format ?? "12h";
  // What the desktop's row pickers offer (LINEUP-EDIT W2a): the Schedule's positions and labels, and each person's
  // own positions first.
  const editing = useMemo<LineupEditing | null>(() => {
    if (!canShare || !model) return null;
    const assigned = new Map(model.employees.map((employee) => [employee.id, employee.job_ids]));
    return {
      workspaceId,
      date,
      catalog: {
        departments: [...model.departments]
          .sort((a, b) => a.name.localeCompare(b.name, "en-US", { sensitivity: "base" }))
          .map((department) => ({ id: department.id, name: department.name })),
        jobs: model.jobs.map((job) => ({ id: job.id, name: job.name, departmentId: job.department_id })),
        labels: [...(model.shift_labels ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((label) => ({ id: label.id, name: label.name })),
        jobsOf: (employeeId) => assigned.get(employeeId) ?? [],
      },
    };
  }, [canShare, model, workspaceId, date]);
  // A phone: E · Çark tarih (KARARLAR Lineup, Mert 2026-10-17), its own page.
  if (phone && !(query.error && isNoAccess(query.error))) {
    return (
      <PhoneLineupPage
        header={
          <CatalogPageHeader
            eyebrow="THE RIGHT PEOPLE. IN THE RIGHT SPOT."
            title="Lineup"
            titleId="lineup-title"
            description="Today's lineups, live from the Schedule."
          />
        }
        workspaceId={workspaceId}
        date={date}
        dateLabel={shortDate(date)}
        today={today}
        onDate={goTo}
        loading={query.isLoading}
        error={
          query.error ? (
            <LoadError
              title="We couldn't load the lineup"
              detail={`${dayName(date)} didn't load. Nothing was changed.`}
              retrying={query.isFetching}
              onRetry={() => void query.refetch()}
            />
          ) : null
        }
        locations={lineups}
        locationId={locationId}
        onLocation={(id) => setParam("location", id)}
        chosen={shiftTypeId}
        onShift={(key) => setParam("shift", key)}
        nowAt={nowAt}
        timeFormat={timeFormat}
        editing={day.data ? editing : null}
        publish={
          canShare && day.data
            ? {
                waiting,
                anyPublished,
                open: publishOpen,
                published: justPublished,
                busy: publishing,
                sent,
                onToggle: () => setPublishOpen(!publishOpen),
                window: (
                  <LineupPublishWindow
                    workspaceId={workspaceId}
                    date={date}
                    dateLabel={shortDate(date)}
                    locations={lineups}
                    timeFormat={timeFormat}
                    nowAt={nowAt}
                    onClose={closePublish}
                    onPublished={published}
                    onWorking={setPublishing}
                    className="is-sheet"
                  />
                ),
              }
            : null
        }
      />
    );
  }

  // No access: the card alone, nothing of the page around it (Mert 2026-10-14).
  if (query.error && isNoAccess(query.error))
    return <NoAccessState homeHref={noAccessHomePath(context, "/app/schedule/lineup")} />;

  // The desktop: F (Mert 2026-10-19 ~2:45 AM, "f harika").
  return (
    <DesktopLineupPage
      header={
        <CatalogPageHeader
          eyebrow="THE RIGHT PEOPLE. IN THE RIGHT SPOT."
          title="Lineup"
          titleId="lineup-title"
          description="Today's lineups, live from the Schedule."
          action={publishControl}
        />
      }
      workspaceId={workspaceId}
      date={date}
      dateLabel={shortDate(date)}
      today={today}
      onDate={goTo}
      loading={query.isLoading}
      error={
        query.error ? (
          <LoadError
            title="We couldn't load the lineup"
            detail={`${dayName(date)} didn't load. Nothing was changed.`}
            retrying={query.isFetching}
            onRetry={() => void query.refetch()}
          />
        ) : null
      }
      locations={lineups}
      locationId={locationId}
      onLocation={(id) => setParam("location", id)}
      chosen={shiftTypeId}
      onShift={(key) => setParam("shift", key)}
      nowAt={nowAt}
      timeFormat={timeFormat}
      canEdit={canShare && Boolean(day.data)}
      editing={day.data ? editing : null}
      held={publishOpen}
      waiting={publishing}
    />
  );
}

export default LineupPage;
