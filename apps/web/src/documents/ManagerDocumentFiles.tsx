import type { DocumentDetail } from "@newfork/shared";
import { Check, Eye, FileClock, FileText, Image, Info, X } from "lucide-react";
import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { DrawerSection } from "../views/RequestDrawer";
import { fileMeta } from "./document-review-facts";
import type { DrawerTone } from "../views/RequestDrawer";
import type { FileChoice, FileChoices, FileReasons, Period, periodChoices } from "./review-decision";
import { hasReason, quickReasons, toggleReason } from "./review-reasons";

// The files of the manager's review drawer (A2 Tur 6, file buttons design a; Mert 23 Oct). Each file of the version
// under review gets its own Approve and Reject, with no choice made at first (K1 decision 13); a rejected file opens
// its common reasons and its reason; one rejected file asks how long the person has to send a new one. Once decided,
// a version's files read what the API says was decided: Approved, Rejected (with its note), Kept. Opening a file is
// today's signed download (K1 decision 16); a rejected file is no longer handed out.

type Submission = DocumentDetail["submissions"][number];
type File = Submission["files"][number];

export type FileReview = {
  version: Submission;
  choices: FileChoices;
  reasons: FileReasons;
  period: Period;
  periods: ReturnType<typeof periodChoices>;
  onChoose: (fileId: string, choice: FileChoice) => void;
  onReason: (fileId: string, reason: string) => void;
  onPeriod: (period: Period) => void;
  /** A More options panel is open: the file controls wait (one change per Save). */
  off?: boolean;
};

type Shared = {
  phone: boolean;
  first: string;
  busy: boolean;
  /** The dock's line, which says what the review still needs. */
  describedBy: string;
  /** Opens a file (a signed download in a new tab). */
  onOpen: (submissionId: string, fileId: string) => void;
  opening: boolean;
};

function fileIcon(file: File): ReactNode {
  return file.media_type === "application/pdf" || /\.pdf$/i.test(file.filename) ? (
    <FileText size={18} />
  ) : (
    <Image size={18} />
  );
}

/** What was decided on a file of a decided version, in the manager's words; none while undecided or excused. */
function decided(version: Submission, file: File): { label: string; tone: DrawerTone } | null {
  if (file.decision === "discard" && version.state !== "draft" && version.state !== "pending_review")
    return { label: "Rejected", tone: "red" };
  if (version.state === "accepted") return { label: "Approved", tone: "ok" };
  if (version.state === "rejected") return { label: "Kept", tone: "grey" };
  return null;
}

function FileRow({
  version,
  file,
  shared,
  tag,
  meta,
  choice,
  children,
}: {
  version: Submission;
  file: File;
  shared: Shared;
  tag: { label: string; tone: DrawerTone } | null;
  meta?: string;
  choice?: FileChoice;
  children?: ReactNode;
}) {
  // The server hands out kept files only.
  const closed = file.decision === "discard";
  const open = () => shared.onOpen(version.id, file.id);
  const chip = tag ? <span className={`rd-chip ${tag.tone}`}>{tag.label}</span> : null;
  const note =
    tag?.label === "Rejected" && file.note ? <span className="docr-ro-note">{file.note}</span> : null;
  const metaText = meta ?? fileMeta(file);
  return (
    <div className={`docr-file${choice ? (choice === "reject" ? " is-no" : " is-ok") : ""}`}>
      {shared.phone ? (
        <button
          type="button"
          className={`docr-file-open${chip ? " has-tag" : ""}`}
          aria-label={`Open ${file.filename}${tag ? ` · ${tag.label}` : ""}`}
          disabled={closed || shared.opening}
          onClick={open}
        >
          <span className="docr-thumb" aria-hidden>
            {fileIcon(file)}
          </span>
          <span className="docr-file-text">
            <span className="docr-fname">{file.filename}</span>
            <span className="docr-file-meta">{metaText}</span>
          </span>
          {chip}
          <Eye size={18} aria-hidden className="docr-file-eye" />
        </button>
      ) : (
        <>
          <span className="docr-thumb" aria-hidden>
            {fileIcon(file)}
          </span>
          <span className="docr-file-main">
            <button
              type="button"
              className="docr-file-name"
              title={file.filename}
              disabled={closed || shared.opening}
              onClick={open}
            >
              {file.filename}
            </button>
            <span className="docr-file-meta">{metaText}</span>
          </span>
          {children ? null : (chip ?? <span />)}
        </>
      )}
      {children}
      {note}
    </div>
  );
}

/** Approve and Reject on one file: two buttons, the pressed one drawn selected (never the solid green of Save). */
function DecisionPair({ file, review, busy }: { file: File; review: FileReview; busy: boolean }) {
  const choice = review.choices[file.id];
  const button = (value: FileChoice) => (
    <button
      type="button"
      className={`docr-db docr-db-${value === "approve" ? "ok" : "no"}`}
      aria-pressed={choice === value}
      aria-disabled={review.off ? "true" : undefined}
      data-guard=""
      disabled={busy}
      onClick={() => {
        if (!review.off) review.onChoose(file.id, value);
      }}
    >
      {value === "approve" ? (
        <Check size={16} aria-hidden className="docr-db-icon" />
      ) : (
        <X size={16} aria-hidden className="docr-db-icon" />
      )}
      <span>{value === "approve" ? "Approve" : "Reject"}</span>
    </button>
  );
  return (
    <div className="docr-dec" role="group" aria-label={`Approve or reject ${file.filename}`}>
      {button("approve")}
      {button("reject")}
    </div>
  );
}

function ReasonBox({
  file,
  review,
  shared,
  input,
}: {
  file: File;
  review: FileReview;
  shared: Shared;
  input: (element: HTMLInputElement | null) => void;
}) {
  const text = review.reasons[file.id] ?? "";
  return (
    <div className="docr-why">
      <div className="docr-chips" role="group" aria-label={`Common reasons for ${file.filename}`}>
        {quickReasons.map((reason) => (
          <button
            key={reason}
            type="button"
            aria-pressed={hasReason(text, reason)}
            aria-disabled={review.off ? "true" : undefined}
            data-guard=""
            disabled={shared.busy}
            onClick={() => {
              if (!review.off) review.onReason(file.id, toggleReason(text, reason));
            }}
          >
            {reason}
          </button>
        ))}
      </div>
      <input
        ref={input}
        type="text"
        maxLength={500}
        autoComplete="off"
        placeholder={`Why? ${shared.first} sees this`}
        aria-label={`Why reject ${file.filename}? ${shared.first} sees this`}
        aria-required="true"
        aria-describedby={shared.describedBy}
        value={text}
        className={review.off ? "is-off" : undefined}
        disabled={shared.busy || review.off}
        onChange={(event) => review.onReason(file.id, event.target.value)}
      />
    </div>
  );
}

function PeriodRow({ review, busy }: { review: FileReview; busy: boolean }) {
  const id = useId();
  const { full, remaining } = review.periods;
  const period = review.period === "remaining" && remaining.open ? "remaining" : "full";
  return (
    <div className="docr-period">
      <span className="docr-period-label" id={id}>
        Time to send a new one
      </span>
      <div className="docr-seg" role="group" aria-labelledby={id}>
        <button
          type="button"
          aria-pressed={period === "full"}
          aria-disabled={review.off ? "true" : undefined}
          data-label={full}
          data-guard=""
          disabled={busy}
          onClick={() => {
            if (!review.off) review.onPeriod("full");
          }}
        >
          {full}
        </button>
        <button
          type="button"
          aria-pressed={period === "remaining"}
          aria-disabled={remaining.open && !review.off ? undefined : "true"}
          data-label={remaining.label}
          data-guard=""
          disabled={busy}
          onClick={() => {
            if (remaining.open && !review.off) review.onPeriod("remaining");
          }}
        >
          {remaining.label}
        </button>
      </div>
    </div>
  );
}

/** The files of one version: to decide, or as decided. */
function VersionFiles({
  version,
  shared,
  review,
  exempt,
  meta,
}: {
  version: Submission;
  shared: Shared;
  review: FileReview | null;
  exempt: boolean;
  meta?: (file: File) => string;
}) {
  // A fresh Reject on a desktop puts the caret in that file's reason; a phone keeps focus (and its keyboard down).
  const caret = useRef<string | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  useLayoutEffect(() => {
    const id = caret.current;
    if (!id) return;
    caret.current = null;
    inputs.current.get(id)?.focus();
  });
  const choose = review
    ? (fileId: string, choice: FileChoice) => {
        if (choice === "reject" && review.choices[fileId] !== "reject" && !shared.phone) caret.current = fileId;
        review.onChoose(fileId, choice);
      }
    : undefined;
  const live = review && choose ? { ...review, onChoose: choose } : null;
  return (
    <div className="docr-files">
      {version.files.map((file) => (
        <FileRow
          key={file.id}
          version={version}
          file={file}
          shared={shared}
          tag={live || exempt ? null : decided(version, file)}
          meta={meta?.(file)}
          choice={live?.choices[file.id]}
        >
          {live ? (
            <>
              <DecisionPair file={file} review={live} busy={shared.busy} />
              {live.choices[file.id] === "reject" ? (
                <ReasonBox
                  file={file}
                  review={live}
                  shared={shared}
                  input={(element) => {
                    if (element) inputs.current.set(file.id, element);
                    else inputs.current.delete(file.id);
                  }}
                />
              ) : null}
            </>
          ) : undefined}
        </FileRow>
      ))}
    </div>
  );
}

/**
 * Details' Files section on a desktop, the Files tab on a phone: the version sent (or the approved one), to decide or
 * as decided. An expired document shows its last approved copy; a document with nothing sent says so.
 */
export function ManagerDocumentFiles({
  detail,
  version,
  review,
  again,
  off,
  sent,
  approvedOn,
  ...shared
}: Shared & {
  detail: DocumentDetail;
  version: Submission | null;
  review: FileReview | null;
  /** An approved version can be reviewed again (K1 decision 2). */
  again: { open: boolean; onToggle: () => void } | null;
  /** A More options panel is open, by its name, with its own way out (mockup-spec 8.5). */
  off: { name: string; onCancel: () => void } | null;
  /** "Sent Wed, Oct 21", for the phone's head. */
  sent: string | null;
  /** The day the approved copy was approved, for an expired document. */
  approvedOn: string | null;
}) {
  const { obligation } = detail;
  if (obligation.status === "expired" && version)
    return (
      <DrawerSection title="Last approved">
        <VersionFiles
          version={version}
          shared={shared}
          review={null}
          exempt
          meta={(file) => `${fileMeta(file)}${approvedOn ? ` · approved ${approvedOn}` : ""}`}
        />
      </DrawerSection>
    );
  if (!version)
    return (
      <DrawerSection title="Files">
        <div className="docr-files">
          <div className="docr-file docr-nofile">
            <span className="docr-thumb" aria-hidden>
              <FileClock size={18} />
            </span>
            <span className="docr-file-meta">Nothing sent yet</span>
          </div>
        </div>
      </DrawerSection>
    );
  const live = review && off ? { ...review, off: true } : review;
  const rejected = live ? version.files.some((file) => live.choices[file.id] === "reject") : false;
  const aside = shared.phone ? sent : `Version ${version.version}`;
  return (
    <DrawerSection
      title={shared.phone ? `Version ${version.version}` : "Files"}
      aside={aside ? <span>{aside}</span> : undefined}
    >
      <VersionFiles version={version} shared={shared} review={live} exempt={obligation.status === "exempt"} />
      {live && rejected ? <PeriodRow review={live} busy={shared.busy} /> : null}
      {off && (live || again) ? (
        <p className="rd-foot-note docr-offnote">
          <Info size={14} aria-hidden className="docr-offnote-icon" />
          <span className="docr-offnote-text">Save or cancel {off.name} first</span>
          <button type="button" className="docr-textbtn" data-guard="" disabled={shared.busy} onClick={off.onCancel}>
            Cancel
          </button>
        </p>
      ) : null}
      {again ? (
        <div className="docr-files-foot">
          <button
            type="button"
            className="docr-textbtn"
            aria-disabled={off ? "true" : undefined}
            data-guard=""
            disabled={shared.busy}
            onClick={() => {
              if (!off) again.onToggle();
            }}
          >
            {again.open ? "Cancel review" : "Review again"}
          </button>
        </div>
      ) : null}
    </DrawerSection>
  );
}
