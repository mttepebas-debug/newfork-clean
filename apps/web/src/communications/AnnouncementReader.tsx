import type { AnnouncementRecord, AnnouncementShiftChange } from "@newfork/shared";
import { Button, useToast } from "@newfork/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, X } from "lucide-react";
import { useEffect } from "react";
import { CatalogDrawer } from "../settings/CatalogDrawer";
import { LinesOutline } from "../shell/LoadState";
import { announcementQueryKeys } from "./AnnouncementDrawer";
import {
  announcementCategoryText,
  dayText,
  hoursText,
  rangeText,
  type TimeFormat,
} from "./announcement-model";
import { acknowledgeAnnouncement } from "./communications-data";
import { probeReaderLayout } from "./reader-layout-probe";
import "./announcement-drawer.css";

/** "Your 3:00 PM–4:00 PM shift was removed" and the like. */
export function myShiftSentence(change: AnnouncementShiftChange, timeFormat: TimeFormat): string {
  const time =
    change.start_time && change.end_time ? hoursText(change.start_time, change.end_time, timeFormat) : "";
  if (change.outcome === "removed") return time ? `Your ${time} shift was removed` : "Your shift was removed";
  if (change.outcome === "opened")
    return time ? `You're off the ${time} shift; it's now open for others` : "You're off this shift; it's now open for others";
  return change.after_start && change.after_end
    ? `Your shift is now ${hoursText(change.after_start, change.after_end, timeFormat)}`
    : "Your shift changed";
}

/** A published post as the person it was sent to reads it (EKRAN-08). */
export function AnnouncementReader({
  workspaceId,
  record,
  loading = false,
  myLocationIds,
  timeFormat,
  onClose,
}: {
  workspaceId: string;
  record: AnnouncementRecord | null;
  /** The post is not in the list on hand and a fresh list is on its way. */
  loading?: boolean;
  myLocationIds: readonly string[];
  timeFormat: TimeFormat;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const toast = useToast();
  // Temporary: measures the reader on an iPhone (reader-layout-probe.ts).
  useEffect(() => probeReaderLayout(), []);
  const acknowledge = useMutation({
    mutationFn: () => acknowledgeAnnouncement(workspaceId, record!.id),
    onSuccess: async () => {
      await Promise.all(announcementQueryKeys.map((key) => client.invalidateQueries({ queryKey: [key] })));
      toast.success("Thanks, acknowledged.");
    },
  });
  const title = record?.title ?? "Announcement";
  const mine = (record?.locations ?? []).filter(
    (location) => !location.archived && myLocationIds.includes(location.location_id),
  );
  const changes = (record?.my_changes ?? []).filter((change) => !change.silent && !change.brought_back_at);
  return (
    <CatalogDrawer label={title} className="announcement-drawer announcement-reader" onClose={onClose}>
      <div className="ad">
        <header className="ad-head ad-head-plain">
          <div className="ad-head-row">
            <div className="ad-head-text">
              {record && <span className="ad-chip">{announcementCategoryText(record)}</span>}
              <h2 className="ad-title ad-title-large">{title}</h2>
              {record?.starts_on && (
                <p className="ad-sub">
                  {rangeText(record.starts_on, record.ends_on)}
                  {record.event_from && record.event_until
                    ? `, ${hoursText(record.event_from, record.event_until, timeFormat)}`
                    : ""}
                  {record.recurrence !== "none" ? " · every year" : ""}
                </p>
              )}
            </div>
            <button type="button" className="ad-close" aria-label="Close" onClick={onClose}>
              <X size={18} aria-hidden />
            </button>
          </div>
        </header>
        <div className="ad-body">
          {!record && loading ? (
            <LinesOutline label="Loading announcement" lines={4} />
          ) : !record ? (
            <p className="ad-note">This announcement is no longer available.</p>
          ) : (
            <>
              {record.body && <p className="ad-reader-body">{record.body}</p>}
              {mine.map((location) => (
                <p className="ad-reader-day" key={location.location_id}>
                  <b>{location.short_name || location.name}:</b>{" "}
                  {location.day === "closed"
                    ? "closed"
                    : location.day === "short" && location.opens && location.closes
                      ? hoursText(location.opens, location.closes, timeFormat)
                      : "usual hours"}
                </p>
              ))}
              {changes.map((change) => (
                <div className="ad-yours" key={change.id} data-tone={change.outcome === "edited" ? "blue" : "red"}>
                  <span className="ad-yours-head">Your shift · {dayText(change.scheduled_date)}</span>
                  <span>{myShiftSentence(change, timeFormat)}</span>
                </div>
              ))}
              {record.asked_to_acknowledge &&
                record.display_status === "published" &&
                (record.acknowledged_at ? (
                  <span className="ad-acked">
                    <CheckCircle2 size={16} aria-hidden /> Acknowledged
                  </span>
                ) : (
                  <div>
                    <Button type="button" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate()}>
                      Acknowledge
                    </Button>
                  </div>
                ))}
              {acknowledge.isError && (
                <p className="ad-foot-error" role="alert">
                  It didn&apos;t go through. Try again.
                </p>
              )}
            </>
          )}
        </div>
        <footer className="ad-foot">
          <div className="ad-foot-row">
            <div className="ad-foot-right">
              <Button type="button" className="secondary-button" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </CatalogDrawer>
  );
}
