import type { DocumentDetail } from "@newfork/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@newfork/ui";
import { ChevronRight, FileText, TriangleAlert } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { RequestError } from "../lib/request-error";
import { errorText } from "../settings/GeneralSettingsPage";
import { TimezoneSelect } from "../settings/TimezoneSelect";
import { DrawerSection } from "../views/RequestDrawer";
import {
  downloadDocument,
  extendDocumentDeadline,
  reviewDocument,
  setDocumentExemption,
  setDocumentTimezone,
  type DocumentAudience,
} from "./document-data";
import {
  documentFacts,
  firstName,
  formatDate,
  formatDay,
  keptRenewal,
  shownVersion,
} from "./document-review-facts";
import { isObligationClosed, statusLabel } from "./document-rules";
import { ManagerDocumentFiles, type FileReview } from "./ManagerDocumentFiles";
import { ManagerDocumentHistory } from "./ManagerDocumentHistory";
import { ManagerDocumentDock, type DockLine } from "./ManagerDocumentDock";
import { ManagerDocumentOptions } from "./ManagerDocumentOptions";
import {
  daysLeftLabel,
  periodChoices,
  reviewCommand,
  reviewProgress,
  type FileChoices,
  type FileReasons,
  type Period,
} from "./review-decision";
import {
  doneNote,
  filesNote,
  greenFor,
  greenKey,
  resultLine,
  timezoneNote,
  waitingNote,
  type ReviewResult,
} from "./review-dock";
import type { ReviewGuard } from "./review-guard";
import {
  extendState,
  optionCards,
  otherDays,
  panelName,
  panelNote,
  reasonState,
  type OptionPanel,
} from "./review-options";
import { documentWaits } from "./review-queue";
import type { ManagerDraft, ManagerTypedValues, ReviewSitting } from "./review-sitting";

// One document in the manager's review drawer (A2 Tur 6, K1). The drawer around it (ManagerDocumentDrawer) stays
// open while it walks the list; this part is keyed by the document, so its commands and their errors belong to
// it alone. What was typed lives in the page's sitting, so it survives a move, a new revision and a close.
//
// Details: the facts, today's notes, the Files section (each file approved or rejected on its own) and More options
// (Extend deadline, Excuse, Ask for it again, one change per Save). History: one plain-word timeline. The dock is
// drawn into the drawer's footer: one line and one green button.

export type ManagerTab = "details" | "files" | "history";

// A 409 that means "changed meanwhile, reload": the document's revision or, for the time zone, the person's (BL-1028).
function changedMeanwhile(failure: unknown): boolean {
  return (
    failure instanceof RequestError &&
    failure.status === 409 &&
    (failure.reason === "document.changed" || failure.reason === "employee.revision_conflict")
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const noChoices: FileChoices = Object.freeze({});
const noReasons: FileReasons = Object.freeze({});

export function ManagerDocumentContent({
  audience,
  userId,
  detail,
  canReview,
  tab,
  phone,
  sitting,
  dock,
  guard,
  nextUp,
  othersWait,
  onBusy,
  onAlert,
  onShowFiles,
  onNext,
  onClose,
  onSay,
  escape,
}: {
  audience: DocumentAudience;
  userId: string;
  detail: DocumentDetail;
  canReview: boolean;
  tab: ManagerTab;
  phone: boolean;
  sitting: ReviewSitting;
  /** The drawer's footer, where this document's dock is drawn. */
  dock: HTMLElement | null;
  /** The drawer's guard against repeated presses, kept across documents. */
  guard: ReviewGuard;
  /** The next document still waiting, by its label, for the green after a decision. */
  nextUp: () => { id: string; label: string } | null;
  /** Another document of the whole list (any tab) still waits: no "All caught up" then. */
  othersWait: () => boolean;
  onBusy: (busy: boolean) => void;
  onAlert: (message: string | null) => void;
  /** The phone's row in Details opens the Files tab. */
  onShowFiles: () => void;
  /** The green's "Next: <who>". */
  onNext: (id: string) => void;
  onClose: () => void;
  /** Said by the drawer's polite live region. */
  onSay: (text: string) => void;
  /** Escape asks this first: an open panel closes before the drawer does (mockup-spec 21). */
  escape: { current: (() => boolean) | null };
}) {
  const cache = useQueryClient();
  const obligation = detail.obligation;
  const id = obligation.id;
  const typed = useSyncExternalStore(sitting.subscribe, () => sitting.draft(id));
  // An answer made in this sitting stands until a newer version waits for review (then there is that to decide).
  const answered = useSyncExternalStore(sitting.subscribe, () => sitting.answered(obligation));
  const result = useSyncExternalStore(sitting.subscribe, () => sitting.result(obligation));
  const current = detail.submissions.find((s) => s.id === obligation.submitted_id);
  // A typed value counts while what it was typed for is still here (BL-467); typed for another version under
  // review, it gives way to the saved value. A new change on a document answered in this sitting opens it again.
  // More options' own values leave an answer standing: a panel opened and cancelled after a Save keeps its result.
  function typedField<K extends keyof ManagerTypedValues>(
    key: K,
    typedFor: string | undefined,
    saved: ManagerTypedValues[K],
    reopens = true,
  ) {
    const entry = typed[key];
    const value = typedFor !== undefined && entry?.for === typedFor ? entry.value : saved;
    const set = (next: ManagerTypedValues[K]) => {
      sitting.setDraft(id, (all) => ({ ...all, [key]: { for: typedFor!, value: next } }) as ManagerDraft);
      if (reopens) sitting.reopen(id);
    };
    return [value, set] as const;
  }
  // A command that went through used what it sent; its form starts again.
  const forget = (...keys: (keyof ManagerTypedValues)[]) =>
    sitting.setDraft(id, (all) => {
      const rest = { ...all };
      for (const key of keys) delete rest[key];
      return rest;
    });
  const [choices, setChoices] = typedField("choices", current?.id, noChoices);
  const [reasons, setReasons] = typedField("reasons", current?.id, noReasons);
  const [period, setPeriod] = typedField("period", current?.id, "full");
  const [reviewAgain, setReviewAgain] = typedField("reviewAgain", current?.id, false);
  // More options (mockup-spec 8-10): the card open and what was picked and typed in it, kept with the document.
  const [openPanel, setPanel] = typedField("panel", id, null, false);
  const [extendPick, setExtendPick] = typedField("extendPick", id, null, false);
  const [extendOther, setExtendOther] = typedField("extendOther", id, "", false);
  const [extensionReason, setExtensionReason] = typedField("extensionReason", id, "", false);
  const [excuseReason, setExcuseReason] = typedField("excuseReason", id, "", false);
  const [againReason, setAgainReason] = typedField("againReason", id, "", false);
  const [referenceTimezone, setReferenceTimezone] = typedField(
    "timezone",
    id,
    detail.timezone_settings?.configured_value ?? "",
  );
  // BL-828: someone changed this document or the person first; said until the next command.
  const [changed, setChanged] = useState(false);
  const green = useRef<HTMLButtonElement>(null);
  const focusGreen = useRef(false);
  // The time zone's Save turns itself off once saved (and its fieldset while saving): focus goes back to the choice.
  const zone = useRef<HTMLFieldSetElement>(null);
  const focusZone = useRef(false);
  const sending = useRef(false);
  const noteId = useId();

  const refresh = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ["document-lifecycle", userId, audience.workspaceId] }),
      // The person's own onboarding steps show each document's status.
      cache.invalidateQueries({ queryKey: ["my-employee-onboarding", audience.workspaceId] }),
      // The account badge counts documents still to act on.
      cache.invalidateQueries({ queryKey: ["account-attention"] }),
      // BL-1014: a decision can move the person out of Onboarding; the Employees list and the person's drawer
      // show their status.
      cache.invalidateQueries({ queryKey: ["employees", audience.workspaceId] }),
      cache.invalidateQueries({ queryKey: ["employee-detail", audience.workspaceId] }),
      // K1 decision 14: the Employee drawer reads the person's onboarding under its own key, and a decision here
      // can change it (the case's revision, "changes requested").
      cache.invalidateQueries({ queryKey: ["employee-onboarding-review", audience.workspaceId] }),
    ]);
  // BL-828, BL-1028: reload and say so instead of the server's "refresh required". Any other 409 is a standing
  // refusal ("changes are paused"): nothing to reload, its own sentence stays.
  const conflict = async (failure: unknown) => {
    if (!changedMeanwhile(failure)) return;
    await refresh();
    setChanged(true);
  };
  const started = () => setChanged(false);
  const review = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: ({ command }: { command: ReturnType<typeof reviewCommand>; result: ReviewResult }) =>
      reviewDocument(audience, id, command),
    onSuccess: async (_, { command, result: done }) => {
      sitting.answer(id, command.submission_id, done);
      focusGreen.current = true;
      await refresh();
      forget("choices", "reasons", "period", "reviewAgain");
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  const download = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: ({ submissionId, fileId }: { submissionId: string; fileId: string }) =>
      downloadDocument(audience, id, submissionId, fileId),
  });
  const timezone = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: () =>
      setDocumentTimezone(audience, id, {
        employee_revision: detail.timezone_settings!.employee_revision,
        timezone: referenceTimezone,
      }),
    onSuccess: async () => {
      focusZone.current = true;
      await refresh();
      forget("timezone");
    },
  });
  const extension = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: ({ days, reason }: { days: number; reason: string; version: string | null }) =>
      extendDocumentDeadline(audience, id, { revision: obligation.revision, additional_days: days, reason }),
    onSuccess: async (_, { days, version }) => {
      sitting.answer(id, version, { kind: "extended", at: new Date().toISOString(), days });
      focusGreen.current = true;
      await refresh();
      forget("panel", "extendPick", "extendOther", "extensionReason");
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  // Excuse, or Ask for it again: today's exemption and its removal (K1 decisions 1 and 3).
  const exemption = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: ({ exempt, reason }: { exempt: boolean; reason: string; version: string | null }) =>
      setDocumentExemption(audience, id, { revision: obligation.revision, exempt, reason }),
    onSuccess: async (_, { exempt, version }) => {
      sitting.answer(id, version, { kind: exempt ? "excused" : "asked", at: new Date().toISOString() });
      focusGreen.current = true;
      await refresh();
      forget("panel", exempt ? "excuseReason" : "againReason");
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  const busy = extension.isPending || exemption.isPending || review.isPending || timezone.isPending;
  const error = extension.error ?? exemption.error ?? review.error ?? download.error ?? timezone.error;
  const shownError =
    !error || changedMeanwhile(error)
      ? null
      : error instanceof RequestError && (error.status ?? 0) >= 500
        ? error === download.error
          ? "Couldn't open the file. Try again."
          : "Couldn't save. Try again."
        : errorText(error);
  // The drawer around this document holds its close and its strip while a command runs, and shows its error.
  useEffect(() => {
    onBusy(busy);
  }, [busy, onBusy]);
  useEffect(() => () => onBusy(false), [onBusy]);
  useEffect(() => {
    onAlert(shownError);
  }, [shownError, onAlert]);
  useEffect(() => () => onAlert(null), [onAlert]);

  // The server reviews the version sent while it waits for review, and an approved one again (K1 decision 2).
  const canDecide =
    canReview &&
    !isObligationClosed(obligation.status) &&
    current !== undefined &&
    ["pending_review", "accepted"].includes(current.state);
  const underReview = canDecide && current.state === "pending_review";
  const canReviewAgain = canDecide && current.state === "accepted" && obligation.status === "completed";
  const reviewing = underReview || (canReviewAgain && reviewAgain);
  const now = new Date();
  const first = firstName(obligation.employee_name);
  const version = obligation.status === "expired"
    ? (detail.submissions.find((s) => s.id === obligation.approved_id) ?? null)
    : shownVersion(detail);
  // A renewal sent back while the copy on file still counts stands as its own version under it (gaps A2).
  const renewal = keptRenewal(detail);
  const fileCount = (version?.files.length ?? 0) + (renewal?.files.length ?? 0);
  const periods = periodChoices(obligation);
  const progress = reviewing && current ? reviewProgress(current.files, choices, reasons) : null;
  const expires = current?.expiry_date ? formatDate(current.expiry_date) : null;

  // More options (K1 decisions 1 and 3): Extend only where today's drawer offers it (the server refuses the rest),
  // Excuse on a document not excused, Ask for it again on an excused one; never for the owner, whose excuse stands.
  const canExtend =
    canReview &&
    obligation.mode !== "optional" &&
    !obligation.suspended &&
    obligation.deadline_at !== null &&
    Date.parse(obligation.deadline_at) > Date.now() &&
    !["pending_review", "completed", "removed", "exempt", "paused"].includes(obligation.status);
  const excusable = canReview && obligation.kind === "document" && !obligation.exemption_locked;
  const canExcuse = excusable && obligation.status !== "exempt";
  const cards = optionCards({ extend: canExtend, excuse: canExcuse, again: excusable && obligation.status === "exempt" });
  // A card no longer offered (the document changed meanwhile) has no panel open.
  const panel: OptionPanel | null = openPanel && cards.includes(openPanel) ? openPanel : null;
  const extendNow =
    panel === "extend" && obligation.deadline_at
      ? extendState({ pick: extendPick, other: extendOther, reason: extensionReason }, obligation.deadline_at)
      : null;
  const panelNow =
    panel === "extend"
      ? extendNow
      : panel === "excuse"
        ? reasonState(excuseReason)
        : panel === "again"
          ? reasonState(againReason)
          : null;
  const dueDay = obligation.deadline_at ? formatDay(obligation.deadline_at, obligation.timezone, now) : null;
  const newDueDay = extendNow?.due ? formatDay(extendNow.due, obligation.timezone, now) : null;
  // Cancel or Escape closes the panel and gives focus back to its card's head (on the phone's Files tab, where the
  // card is not, to the first file's Approve).
  const focusAfter = useRef<OptionPanel | null>(null);
  const closePanel = () => {
    if (!panel) return;
    focusAfter.current = panel;
    setPanel(null);
  };
  useLayoutEffect(() => {
    const key = focusAfter.current;
    if (!key) return;
    focusAfter.current = null;
    const drawer = document.querySelector<HTMLElement>(".document-review-drawer");
    (
      drawer?.querySelector<HTMLElement>(`[data-option="${key}"]`) ?? drawer?.querySelector<HTMLElement>(".docr-db-ok")
    )?.focus({ preventScroll: true });
  });
  useLayoutEffect(() => {
    escape.current = () => {
      if (!panel || busy) return false;
      closePanel();
      return true;
    };
  });
  useLayoutEffect(
    () => () => {
      escape.current = null;
    },
    [escape],
  );

  // Details: what the document is and where it stands (mockup-spec 4.3), then what today's drawer also says.
  const expired =
    obligation.status === "expired" ? (
      <p className="docr-call red">
        <TriangleAlert size={18} aria-hidden />
        <span>
          <b>{obligation.expiry_date ? `Expired on ${formatDate(obligation.expiry_date)}` : "Expired"}</b>
          <span>
            {obligation.deadline_at && Date.parse(obligation.deadline_at) > now.getTime()
              ? `${first} needs to send a new one by ${formatDay(obligation.deadline_at, obligation.timezone, now)}.`
              : `${first} needs to send a new one.`}
          </span>
        </span>
      </p>
    ) : null;
  // A decision made in this sitting takes the due date's place, so the files under the facts never jump.
  // A new due date (an extension, or asked again) stays the Due row's own.
  const decidedLabel = { approved: "Approved", sent_back: "Sent back", excused: "Excused" } as const;
  const decided =
    result && result.kind in decidedLabel
      ? { label: decidedLabel[result.kind as keyof typeof decidedLabel], at: result.at }
      : undefined;
  const facts = (
    <DrawerSection>
      <dl className="toa-facts docr-facts">
        {documentFacts(detail, now, decided).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </DrawerSection>
  );
  const notes: ReactNode[] = [];
  if (obligation.tracks_expiry && !obligation.timezone)
    notes.push(
      <p key="zone-note" className="rd-note" role="note">
        An administrator needs to set this employee's document time zone before expiration dates can be checked.
      </p>,
    );
  if (detail.timezone_settings?.can_manage)
    notes.push(
      <fieldset key="zone" ref={zone} className="docr-zone" disabled={busy}>
        <legend>Document time zone</legend>
        <p>
          This employee has no active location. This time zone is used only for their document dates and reminders.
        </p>
        <TimezoneSelect value={referenceTimezone} onChange={setReferenceTimezone} />
        <Button
          type="button"
          className="secondary-button"
          disabled={
            busy || !referenceTimezone || referenceTimezone === detail.timezone_settings.configured_value
          }
          onClick={() => timezone.mutate()}
        >
          Save document time zone
        </Button>
      </fieldset>,
    );
  // A document sent back from this drawer has its reason made of the files' own reasons, which stand under their
  // files; the reason shows here only when a rejected file of the version carries none (sent back before them).
  const sentBack = version?.state === "rejected" ? version : renewal;
  const rejectedFiles = sentBack ? sentBack.files.filter((file) => file.decision === "discard") : [];
  const reasonOnFiles = rejectedFiles.length > 0 && rejectedFiles.every((file) => file.note.trim());
  if (obligation.rejection_reason && !reasonOnFiles)
    notes.push(
      <p key="reason" className="rd-quote" role="note">
        {obligation.rejection_reason}
      </p>,
    );
  if (obligation.suspended)
    notes.push(
      <p key="suspended" className="rd-note warn" role="alert">
        Workspace access is restricted until the outstanding requirements are completed.
      </p>,
    );
  const policy = detail.policy ? (
    <DrawerSection title="Policy">
      <article className="docr-policy" tabIndex={0} aria-label="Policy content">
        {detail.policy.content_text}
      </article>
      {detail.policy.evidence ? (
        <p className="rd-foot-note">
          Acknowledged by {detail.policy.evidence.typed_name} on{" "}
          <time dateTime={detail.policy.evidence.executed_at}>{detail.policy.evidence.executed_at}</time>
        </p>
      ) : null}
      {detail.policy.history
        .filter((entry) => entry.withdrawn_at)
        .map((entry, index) => (
          <p key={index} className="rd-foot-note">
            Acknowledgement by {entry.typed_name} withdrawn on {entry.withdrawn_at}
          </p>
        ))}
      <div>
        <Button
          type="button"
          className="secondary-button"
          onClick={() => {
            const shown = detail.policy!;
            const text = [
              obligation.title,
              shown.content_text,
              shown.intent_statement,
              shown.evidence
                ? `Acknowledged by ${shown.evidence.typed_name} at ${shown.evidence.executed_at}`
                : "Not acknowledged",
              `Content digest: ${shown.content_digest}`,
            ].join("\n\n");
            const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = "policy-copy.txt";
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download policy copy
        </Button>
      </div>
    </DrawerSection>
  ) : null;

  // The files (mockup-spec 5-13): to decide while the version waits for review (or is reviewed again), as decided
  // once it is. A new choice on a document answered in this sitting opens it again (its result gives way).
  const fileReview: FileReview | null =
    reviewing && current
      ? {
          version: current,
          choices,
          reasons,
          period,
          periods,
          onChoose: (fileId, choice) => setChoices({ ...choices, [fileId]: choice }),
          onReason: (fileId, reason) => setReasons({ ...reasons, [fileId]: reason }),
          onPeriod: setPeriod,
        }
      : null;
  // While a panel is open the files wait (one change per Save), and say how to get them back.
  const off = panel ? { name: panelName(panel, first), onCancel: closePanel } : null;
  const openFile = (submissionId: string, fileId: string) => download.mutate({ submissionId, fileId });
  const shared = {
    phone,
    first,
    busy,
    describedBy: noteId,
    onOpen: openFile,
    opening: download.isPending,
  };
  const sent = version?.submitted_at ? `Sent ${formatDay(version.submitted_at, obligation.timezone, now)}` : null;
  const approvedOn =
    obligation.status === "expired" && version?.reviewed_at
      ? formatDay(version.reviewed_at, obligation.timezone, now)
      : null;
  const fileSection = (
    <ManagerDocumentFiles
      {...shared}
      detail={detail}
      version={version}
      renewal={renewal}
      review={fileReview}
      again={canReviewAgain ? { open: reviewAgain, onToggle: () => setReviewAgain(!reviewAgain) } : null}
      off={off}
      sent={sent}
      approvedOn={approvedOn}
    />
  );
  // The phone's Details holds one row that opens the Files tab, saying where the review stands (mockup-spec 12).
  const filesLabel = (() => {
    if (progress)
      return progress.open
        ? `${plural(progress.open, "file", "files")} to review`
        : fileCount === 1
          ? "File checked"
          : `All ${fileCount} files checked`;
    if (!version || obligation.status === "exempt" || obligation.status === "expired")
      return plural(fileCount, "file", "files");
    if (renewal) return "Renewal sent back";
    const rejected = version.files.filter((file) => file.decision === "discard").length;
    if (version.state === "rejected")
      return fileCount === 1 ? "File rejected" : `${rejected} of ${fileCount} files rejected`;
    if (version.state === "accepted") return fileCount === 1 ? "File approved" : `${fileCount} files approved`;
    return plural(fileCount, "file", "files");
  })();
  const goFiles =
    fileCount > 0 ? (
      <DrawerSection>
        <button type="button" className="docr-gofiles" data-guard="" onClick={onShowFiles}>
          <FileText size={18} aria-hidden className="docr-gofiles-icon" />
          <span className="docr-gofiles-label">{filesLabel}</span>
          <span className="docr-gofiles-aside">Files</span>
          <ChevronRight size={16} aria-hidden className="docr-gofiles-chevron" />
        </button>
      </DrawerSection>
    ) : (
      fileSection
    );

  const moreOptions =
    cards.length || (canReview && obligation.kind === "document" && obligation.exemption_locked) ? (
      <>
        {cards.length ? (
          <ManagerDocumentOptions
            cards={cards}
            panel={panel}
            first={first}
            phone={phone}
            busy={busy}
            due={dueDay}
            newDue={newDueDay}
            otherBad={extendPick === "other" && extendOther.trim() !== "" && otherDays(extendOther) === null}
            typed={{ pick: extendPick, other: extendOther, extendReason: extensionReason, excuseReason, againReason }}
            onToggle={(key) => setPanel(panel === key ? null : key)}
            onPick={setExtendPick}
            onOther={setExtendOther}
            onReason={(key, text) => {
              if (key === "extendReason") setExtensionReason(text);
              else if (key === "excuseReason") setExcuseReason(text);
              else setAgainReason(text);
            }}
            onCancel={closePanel}
          />
        ) : null}
        {/* The owner asked for the documents in the first place; their excuse is never lifted (BL-834). */}
        {obligation.exemption_locked && canReview && obligation.kind === "document" ? (
          <DrawerSection title={cards.length ? undefined : "More options"}>
            <p className="docr-owner-note">Owners aren't required to submit documents. Uploading is optional.</p>
          </DrawerSection>
        ) : null}
      </>
    ) : null;

  // History (mockup-spec 14, K1 decision 8): one plain-word timeline; every version's files by name, the kept ones
  // opening as in Details.
  const history = (
    <ManagerDocumentHistory detail={detail} now={now} opening={download.isPending} onOpen={openFile} />
  );

  // The dock (mockup-spec 15): what the green does now, and the one line over it.
  const waiting = documentWaits(obligation.status);
  const timezoneRow = obligation.status === "timezone_required";
  // An open panel is what Save saves (mockup-spec 15.4); closed again, an answer made in this sitting stands. A
  // waiting document with nothing to review saves only through a card: with none, there is nothing to save.
  const saving = panel !== null || (!answered && (reviewing || (waiting && !timezoneRow && cards.length > 0)));
  const next = saving ? null : nextUp();
  const greenNow = greenFor({ saving, ready: panelNow ? panelNow.ready : (progress?.ready ?? false), next });
  const doneLabel =
    obligation.status === "completed"
      ? "Approved"
      : obligation.status === "exempt"
        ? "Excused"
        : statusLabel(obligation, "manager");
  const line: DockLine =
    changed && !result
      ? { kind: "note", text: "This document changed. You're seeing the latest version.", live: true }
      : panel && panelNow
        ? { kind: "note", text: panelNote(panel, panelNow, { first, due: newDueDay }) }
      : result
        ? {
            kind: "result",
            icon: result.kind,
            line: resultLine(result, {
              first,
              phone,
              // Nobody else waits, here or in the list's other tabs.
              end: greenNow.act === "close" && !othersWait(),
              now: {
                status: obligation.status,
                expiry: obligation.expiry_date ? formatDate(obligation.expiry_date) : null,
                due: obligation.deadline_at ? formatDay(obligation.deadline_at, obligation.timezone, now) : null,
              },
            }),
          }
        : progress
          ? { kind: "note", text: filesNote(progress, { phone, first, expires }) }
          : timezoneRow
            ? { kind: "note", text: timezoneNote(detail.timezone_settings?.can_manage ?? false) }
            : waiting
              ? {
                  kind: "note",
                  text: waitingNote({ phone, first, label: doneLabel, extend: canExtend, excuse: canExcuse }),
                }
              : { kind: "note", text: doneNote(doneLabel) };
  const meaning = greenKey(id, greenNow, panel);
  // A new meaning holds the green for a moment, from when it can be pressed (after the refresh).
  useLayoutEffect(() => {
    if (!busy) guard.mean(meaning, performance.now());
  }, [busy, guard, meaning]);
  // Done: the green takes focus, so Enter moves on.
  useEffect(() => {
    if (busy || !focusGreen.current) return;
    focusGreen.current = false;
    green.current?.focus({ preventScroll: true });
  });
  useEffect(() => {
    if (busy || !focusZone.current) return;
    focusZone.current = false;
    (zone.current?.querySelector<HTMLElement>("select") ?? green.current)?.focus({ preventScroll: true });
  });
  // Save turning on is said: the line over it is not live.
  const on = greenNow.act === "save" && !greenNow.off;
  const wasOn = useRef(on);
  useEffect(() => {
    if (on && !wasOn.current && line.kind === "note") onSay(`Ready · ${line.text}`);
    wasOn.current = on;
  });
  // One change per Save: the open panel's, or else the files'.
  const savePanel = () => {
    if (!panel || !panelNow?.ready || busy || sending.current) return;
    sending.current = true;
    const version = obligation.submitted_id;
    if (panel === "extend") extension.mutate({ days: extendNow!.days!, reason: extensionReason.trim(), version });
    else
      exemption.mutate({
        exempt: panel === "excuse",
        reason: (panel === "excuse" ? excuseReason : againReason).trim(),
        version,
      });
  };
  const save = () => {
    if (panel) return savePanel();
    if (!reviewing || !current || !progress?.ready || busy || sending.current) return;
    const chosen: Period = period === "remaining" && periods.remaining.open ? "remaining" : "full";
    const command = reviewCommand({
      revision: obligation.revision,
      submissionId: current.id,
      files: current.files,
      choices,
      reasons,
      period: chosen,
    });
    const at = new Date().toISOString();
    const days = obligation.settings.period_days;
    const done: ReviewResult =
      command.decision === "approve"
        ? { kind: "approved", at, expires }
        : {
            kind: "sent_back",
            at,
            time:
              chosen === "remaining"
                ? { kind: "left", left: daysLeftLabel(obligation.remaining_seconds) }
                : days
                  ? { kind: "new", days }
                  : null,
          };
    sending.current = true;
    review.mutate({ command, result: done });
  };
  const press = () => {
    if (guard.held(performance.now())) return;
    if (greenNow.act === "save") save();
    else if (greenNow.act === "next") onNext(greenNow.id);
    else onClose();
  };
  const dockContent = canReview ? (
    <ManagerDocumentDock
      noteId={noteId}
      line={line}
      green={greenNow}
      busy={busy}
      greenRef={green}
      onGreen={press}
    />
  ) : null;

  return (
    <>
      {tab === "history" ? (
        history
      ) : tab === "files" ? (
        fileSection
      ) : (
        <>
          {expired}
          {facts}
          {notes.length ? <DrawerSection>{notes}</DrawerSection> : null}
          {policy}
          {/* An expired document keeps its last approved copy in Details on a phone too (mockup tur2-a2.js:294-296). */}
          {obligation.kind === "acknowledgement" && !detail.submissions.length
            ? null
            : phone && obligation.status !== "expired"
              ? goFiles
              : fileSection}
          {moreOptions}
        </>
      )}
      {dock && dockContent ? createPortal(dockContent, dock) : null}
    </>
  );
}
