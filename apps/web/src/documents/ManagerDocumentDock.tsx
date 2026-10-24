import { BadgeCheck, BellRing, CalendarClock, ChevronRight, RotateCcw, ShieldCheck } from "lucide-react";
import type { Ref } from "react";
import type { Green, ResultLine, ReviewResult } from "./review-dock";

// The dock of the manager's review drawer (A2 Tur 6, mockup-spec 15): one line, then the one green button, far
// right (full width on a phone). Nothing else lives here: no Reject, no secondary button. The line is a note (what
// is missing, what Save will do), a refresh line, or the result of a Save, said politely.

// Each result by what was done; its tone colours it.
const icons = {
  approved: BadgeCheck,
  sent_back: RotateCcw,
  extended: CalendarClock,
  excused: ShieldCheck,
  asked: BellRing,
} as const;

export type DockLine =
  | { kind: "note"; text: string; live?: boolean }
  | { kind: "result"; icon: ReviewResult["kind"]; line: ResultLine; full: string };

export function ManagerDocumentDock({
  noteId,
  line,
  green,
  busy,
  greenRef,
  onGreen,
}: {
  noteId: string;
  line: DockLine;
  green: Green;
  busy: boolean;
  greenRef: Ref<HTMLButtonElement>;
  onGreen: () => void;
}) {
  const label = green.act === "save" ? "Save" : green.act === "next" ? green.label : "Close";
  const off = busy || (green.act === "save" && green.off);
  let note;
  if (line.kind === "result") {
    const Icon = icons[line.icon];
    note = (
      <p
        className={`rd-foot-note docr-note docr-result ${line.line.tone}`}
        id={noteId}
        role="status"
        title={line.line.title}
      >
        <Icon size={14} aria-hidden className="docr-note-icon" />
        <span className="docr-note-text">
          <b>{line.line.word}</b> · {line.line.text}
        </span>
      </p>
    );
  } else {
    note = (
      <p
        className="rd-foot-note docr-note"
        id={noteId}
        role={line.live ? "status" : undefined}
        title={line.text}
      >
        <span className="docr-note-text">{line.text}</span>
      </p>
    );
  }
  return (
    <>
      {note}
      <div className="rd-foot-row docr-row">
        <button
          ref={greenRef}
          type="button"
          className="nf-button docr-green"
          aria-describedby={noteId}
          aria-disabled={off ? "true" : undefined}
          aria-busy={busy ? "true" : undefined}
          title={label}
          data-guard=""
          onClick={() => {
            if (!off) onGreen();
          }}
        >
          <span className="docr-green-label">{label}</span>
          {green.act === "next" ? <ChevronRight size={16} aria-hidden /> : null}
        </button>
      </div>
    </>
  );
}
