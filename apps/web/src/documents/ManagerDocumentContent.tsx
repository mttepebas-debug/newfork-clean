import type { DocumentDetail } from "@newfork/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@newfork/ui";
import { ChevronRight, FileClock, FileText, TriangleAlert } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RequestError } from "../lib/request-error";
import { errorText } from "../settings/GeneralSettingsPage";
import { TimezoneSelect } from "../settings/TimezoneSelect";
import { DrawerSection } from "../views/RequestDrawer";
import { DocumentExemptionAction } from "./DocumentExemptionAction";
import {
  downloadDocument,
  extendDocumentDeadline,
  reviewDocument,
  setDocumentTimezone,
  type DocumentAudience,
} from "./document-data";
import {
  documentFacts,
  firstName,
  formatDate,
  formatDay,
  shownVersion,
} from "./document-review-facts";
import { fileDecisionLabel, isObligationClosed, versionStateLabel } from "./document-rules";
import type { ManagerDraft, ManagerTypedValues, ReviewSitting } from "./review-sitting";

// One document in the manager's review drawer (A2 Tur 6, K1). The drawer around it (ManagerDocumentDrawer) stays
// open while it walks the list; this part is keyed by the document, so its commands and their errors belong to
// it alone. What was typed lives in the page's sitting, so it survives a move, a new revision and a close.
//
// Slots for the next stages: the Files section (fileSection), the dock (drawn into the drawer's footer through
// `dock`), More options (moreOptions) and History (history). Until those stages, they hold today's controls.

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

export function ManagerDocumentContent({
  audience,
  userId,
  detail,
  canReview,
  tab,
  phone,
  sitting,
  dock,
  onBusy,
  onAlert,
  onShowFiles,
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
  onBusy: (busy: boolean) => void;
  onAlert: (message: string | null) => void;
  /** The phone's row in Details opens the Files tab. */
  onShowFiles: () => void;
}) {
  const cache = useQueryClient();
  const obligation = detail.obligation;
  const id = obligation.id;
  const typed = useSyncExternalStore(sitting.subscribe, () => sitting.draft(id));
  const current = detail.submissions.find((s) => s.id === obligation.submitted_id);
  // A typed value counts while what it was typed for is still here (BL-467); typed for another version under
  // review, it gives way to the saved value.
  function typedField<K extends keyof ManagerTypedValues>(
    key: K,
    typedFor: string | undefined,
    saved: ManagerTypedValues[K],
  ) {
    const entry = typed[key];
    const value = typedFor !== undefined && entry?.for === typedFor ? entry.value : saved;
    const set = (next: ManagerTypedValues[K]) =>
      sitting.setDraft(id, (all) => ({ ...all, [key]: { for: typedFor!, value: next } }) as ManagerDraft);
    return [value, set] as const;
  }
  // A command that went through used what it sent; its form starts again.
  const forget = (...keys: (keyof ManagerTypedValues)[]) =>
    sitting.setDraft(id, (all) => {
      const rest = { ...all };
      for (const key of keys) delete rest[key];
      return rest;
    });
  const [reason, setReason] = typedField("reason", current?.id, "");
  const [correction, setCorrection] = typedField("correction", current?.id, "full");
  const savedFiles = (current?.files ?? []).map((f) => ({ id: f.id, decision: f.decision, note: f.note }));
  const [files, setFiles] = typedField("files", current?.id, savedFiles);
  const [extensionDays, setExtensionDays] = typedField("extensionDays", id, 1);
  const [extensionReason, setExtensionReason] = typedField("extensionReason", id, "");
  const [referenceTimezone, setReferenceTimezone] = typedField(
    "timezone",
    id,
    detail.timezone_settings?.configured_value ?? "",
  );
  const [notice, setNotice] = useState("");
  // BL-828: someone changed this document or the person first; said until the next command.
  const [changed, setChanged] = useState(false);
  const [exemptionLocked, setExemptionLocked] = useState(false);

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
    mutationFn: (decision: "approve" | "reject") =>
      reviewDocument(audience, id, {
        revision: obligation.revision,
        submission_id: current!.id,
        decision,
        // BL-832: a reason typed before choosing Approve is not the approval's.
        reason: decision === "reject" ? reason : "",
        correction_period: correction,
        files,
      }),
    onSuccess: async () => {
      setNotice("Decision saved");
      sitting.answer(id);
      await refresh();
      forget("reason", "correction", "files");
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
      await refresh();
      forget("timezone");
    },
  });
  const extension = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: () =>
      extendDocumentDeadline(audience, id, {
        revision: obligation.revision,
        additional_days: extensionDays,
        reason: extensionReason,
      }),
    onSuccess: async () => {
      sitting.answer(id);
      await refresh();
      forget("extensionDays", "extensionReason");
    },
  });
  const busy = extension.isPending || review.isPending || timezone.isPending || exemptionLocked;
  const error = extension.error ?? review.error ?? download.error ?? timezone.error;
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

  const dirty =
    extensionReason !== "" ||
    referenceTimezone !== (detail.timezone_settings?.configured_value ?? "") ||
    reason !== "" ||
    JSON.stringify(files) !== JSON.stringify(savedFiles);
  const canDecide =
    canReview &&
    !isObligationClosed(obligation.status) &&
    current !== undefined &&
    ["pending_review", "accepted"].includes(current.state);
  const now = new Date();
  const first = firstName(obligation.employee_name);
  const version = shownVersion(detail);
  const fileCount = version?.files.length ?? 0;

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
  const facts = (
    <DrawerSection>
      <dl className="toa-facts docr-facts">
        {documentFacts(detail, now).map(([label, value]) => (
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
      <fieldset key="zone" className="docr-zone" disabled={busy}>
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
  if (obligation.rejection_reason)
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

  // The files. Stage 2 slot: today's versions and review fields until the A2 file rows replace them.
  const fileRows =
    detail.submissions.length === 0 ? (
      <div className="docr-files">
        <div className="docr-file docr-nofile">
          <span className="docr-thumb" aria-hidden>
            <FileClock size={18} />
          </span>
          <span className="docr-file-meta">Nothing sent yet</span>
        </div>
      </div>
    ) : (
      <div className="docr-legacy-files">
        {detail.submissions.map((shown) => (
          <section key={shown.id} aria-label={`Version ${shown.version}`}>
            <h3>
              Version {shown.version} · {versionStateLabel(shown.state)}
            </h3>
            {shown.files.map((file) => (
              <div key={file.id} className="document-file-row">
                <button
                  type="button"
                  className="job-secondary-button"
                  disabled={file.decision === "discard" || download.isPending}
                  onClick={() => download.mutate({ submissionId: shown.id, fileId: file.id })}
                >
                  {file.filename}
                </button>
                {canDecide && current.id === shown.id ? (
                  <>
                    <select
                      aria-label={`Decision for ${file.filename}`}
                      value={files.find((f) => f.id === file.id)?.decision}
                      disabled={busy}
                      onChange={(e) =>
                        setFiles(
                          files.map((f) =>
                            f.id === file.id ? { ...f, decision: e.target.value as "keep" | "discard" } : f,
                          ),
                        )
                      }
                    >
                      <option value="keep">Keep</option>
                      <option value="discard">Discard</option>
                    </select>
                    <input
                      aria-label={`Note for ${file.filename}`}
                      placeholder="Optional file note"
                      maxLength={500}
                      value={files.find((f) => f.id === file.id)?.note ?? ""}
                      onChange={(e) =>
                        setFiles(files.map((f) => (f.id === file.id ? { ...f, note: e.target.value } : f)))
                      }
                    />
                  </>
                ) : (
                  <span>{fileDecisionLabel(file.decision)}</span>
                )}
              </div>
            ))}
          </section>
        ))}
        {canDecide ? (
          <fieldset disabled={busy}>
            <legend>Review decision</legend>
            <label className="job-field">
              <span>Rejection reason</span>
              <textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            </label>
            <label className="job-field">
              <span>Correction period</span>
              <select
                value={correction}
                onChange={(e) => setCorrection(e.target.value as "full" | "remaining")}
              >
                <option value="full">Full correction period</option>
                <option value="remaining" disabled={!obligation.remaining_seconds}>
                  Remaining time
                </option>
              </select>
            </label>
          </fieldset>
        ) : null}
      </div>
    );
  // A desktop titles the section Files with the version on the right; the phone's Files tab titles it by the
  // version, with when it was sent on the right (mockup-spec 5.1).
  const sent = version?.submitted_at ? `Sent ${formatDay(version.submitted_at, obligation.timezone, now)}` : null;
  const aside = !version ? null : phone ? sent : `Version ${version.version}`;
  const fileSection = (
    <DrawerSection
      title={phone && version ? `Version ${version.version}` : "Files"}
      aside={aside ? <span>{aside}</span> : undefined}
    >
      {fileRows}
    </DrawerSection>
  );
  // The phone's Details holds one row that opens the Files tab (mockup-spec 12).
  const goFiles =
    fileCount > 0 ? (
      <DrawerSection>
        <button type="button" className="docr-gofiles" onClick={onShowFiles}>
          <FileText size={18} aria-hidden className="docr-gofiles-icon" />
          <span className="docr-gofiles-label">
            {canDecide && current?.state === "pending_review"
              ? `${plural(fileCount, "file", "files")} to review`
              : plural(fileCount, "file", "files")}
          </span>
          <span className="docr-gofiles-aside">Files</span>
          <ChevronRight size={16} aria-hidden className="docr-gofiles-chevron" />
        </button>
      </DrawerSection>
    ) : (
      fileSection
    );

  // More options. Stage 3 slot: today's exemption and deadline extension until the A2 cards replace them.
  const canExtend =
    canReview &&
    obligation.mode !== "optional" &&
    !obligation.suspended &&
    obligation.deadline_at !== null &&
    Date.parse(obligation.deadline_at) > Date.now() &&
    !["pending_review", "completed", "removed", "exempt", "paused"].includes(obligation.status);
  const moreOptions =
    (canReview && obligation.kind === "document") || canExtend ? (
      <DrawerSection title="More options">
        {canReview && obligation.kind === "document" ? (
          obligation.exemption_locked ? (
            <p className="document-exemption-note">
              Owners aren't required to submit documents. Uploading is optional.
            </p>
          ) : (
            <DocumentExemptionAction
              obligation={obligation}
              audience={audience}
              userId={userId}
              disabled={busy || dirty}
              onLockChange={setExemptionLocked}
            />
          )
        ) : null}
        {canExtend ? (
          <fieldset disabled={busy}>
            <legend>Extend delivery deadline</legend>
            <label className="job-field">
              <span>Additional days</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={extensionDays}
                onChange={(e) => setExtensionDays(Number(e.target.value))}
              />
            </label>
            <label className="job-field">
              <span>Extension reason</span>
              <textarea
                maxLength={500}
                value={extensionReason}
                onChange={(e) => setExtensionReason(e.target.value)}
              />
            </label>
            <Button
              type="button"
              className="secondary-button"
              disabled={
                busy ||
                !extensionReason.trim() ||
                !Number.isInteger(extensionDays) ||
                extensionDays < 1 ||
                extensionDays > 3650
              }
              onClick={() => extension.mutate()}
            >
              Extend deadline
            </Button>
          </fieldset>
        ) : null}
      </DrawerSection>
    ) : null;

  // History. Stage 3 slot: today's lines until the A2 timeline replaces them.
  const history = (
    <DrawerSection>
      {detail.history.length ? (
        <ol className="docr-legacy-history">
          {detail.history.map((event) => (
            <li key={event.id}>
              <time dateTime={event.occurred_at}>{event.occurred_at}</time> ·{" "}
              {event.action.replaceAll("document.", "").replaceAll("_", " ")}
              {typeof event.metadata.reason === "string" ? <> · {event.metadata.reason}</> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rd-empty">Nothing has happened to this document yet.</p>
      )}
    </DrawerSection>
  );

  // The dock. Stage 2 slot: today's Reject and Approve until the one green button replaces them.
  const dockContent = canDecide ? (
    <div className="rd-foot-row">
      <div className="rd-foot-actions">
        <Button
          type="button"
          className="secondary-button"
          disabled={busy || !reason.trim()}
          onClick={() => review.mutate("reject")}
        >
          Reject
        </Button>
        <Button
          type="button"
          disabled={busy || !files.some((f) => f.decision === "keep")}
          onClick={() => review.mutate("approve")}
        >
          Approve
        </Button>
      </div>
    </div>
  ) : null;

  const status = (
    <>
      {changed && !notice ? (
        <p className="rd-foot-note" role="status">
          This document changed. You're seeing the latest version.
        </p>
      ) : null}
      {notice ? (
        <p className="rd-foot-note" role="status">
          {notice}
        </p>
      ) : null}
    </>
  );

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
          {obligation.kind === "acknowledgement" && !detail.submissions.length
            ? null
            : phone
              ? goFiles
              : fileSection}
          {moreOptions}
        </>
      )}
      {status}
      {dock && dockContent ? createPortal(dockContent, dock) : null}
    </>
  );
}
