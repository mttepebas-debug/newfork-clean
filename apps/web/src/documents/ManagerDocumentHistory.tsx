import type { DocumentDetail } from "@newfork/shared";
import {
  BadgeCheck,
  Bell,
  CalendarClock,
  Clock,
  FilePen,
  FileText,
  Globe,
  Image,
  Pause,
  PenLine,
  RotateCcw,
  ShieldCheck,
  Undo2,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
import { DrawerSection } from "../views/RequestDrawer";
import { documentTimeline, type TimelineIcon } from "./review-history";

// The manager's History tab (A2 Tur 6, mockup-spec 14): one timeline, newest first, a 24 px icon in a soft circle on
// a 1 px rail. Each event: what happened, when, the reason, the files with what was decided on each, what was
// entered, and the time it gave. A kept file opens as today (a signed download, K1 decision 16); a rejected one is
// no longer handed out.

const icons: Record<TimelineIcon, LucideIcon> = {
  sent: FileText,
  approved: BadgeCheck,
  rejected: RotateCcw,
  excused: ShieldCheck,
  asked: Bell,
  extended: CalendarClock,
  later: Clock,
  signed: PenLine,
  withdrawn: Undo2,
  paused: Pause,
  changed: FilePen,
  removed: UserMinus,
  zone: Globe,
};

export function ManagerDocumentHistory({
  detail,
  now,
  opening,
  onOpen,
}: {
  detail: DocumentDetail;
  now: Date;
  opening: boolean;
  onOpen: (submissionId: string, fileId: string) => void;
}) {
  const events = documentTimeline(detail, now);
  if (!events.length)
    return (
      <DrawerSection>
        <p className="rd-empty">Nothing has happened to this document yet.</p>
      </DrawerSection>
    );
  return (
    <DrawerSection>
      <ol className="docr-hist" aria-label="History">
        {events.map((event) => {
          const Icon = icons[event.icon];
          return (
            <li key={event.id} className={event.tone === "muted" ? "docr-ev" : `docr-ev ${event.tone}`}>
              <span className="docr-ev-icon" aria-hidden="true">
                <Icon size={14} />
              </span>
              <div className="docr-ev-main">
                <div className="docr-ev-title">
                  <b>{event.title}</b>
                  {event.waiting ? <span className="rd-chip warn">Needs review</span> : null}
                </div>
                <p className="docr-ev-when">
                  <time dateTime={event.at}>{event.when}</time>
                </p>
                {event.note ? <p className="rd-quote">{event.note}</p> : null}
                {event.files.length ? (
                  <div className="docr-ev-files">
                    {event.files.map((file) => (
                      <div key={file.id} className="docr-ev-file">
                        {/\.pdf$/i.test(file.name) ? <FileText size={14} aria-hidden /> : <Image size={14} aria-hidden />}
                        {file.open ? (
                          <button
                            type="button"
                            className="docr-ev-fname"
                            title={file.name}
                            disabled={opening}
                            onClick={() => onOpen(file.submissionId, file.id)}
                          >
                            {file.name}
                          </button>
                        ) : (
                          <span className="docr-ev-fname" title={file.name}>
                            {file.name}
                          </span>
                        )}
                        {file.chip ? <span className={`rd-chip ${file.chip.tone}`}>{file.chip.label}</span> : <span />}
                        {file.note ? <span className="docr-ev-fnote">{file.note}</span> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {event.entered.length ? (
                  <div className="docr-ev-entered">
                    {event.icon === "sent" ? <span className="docr-ev-label">Entered</span> : null}
                    <dl className="toa-facts">
                      {event.entered.map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
                {event.meta ? (
                  <p className="docr-ev-meta">
                    <Clock size={14} aria-hidden />
                    <span>{event.meta}</span>
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </DrawerSection>
  );
}
