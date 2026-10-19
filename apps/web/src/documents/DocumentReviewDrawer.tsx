import {
  type DocumentDetail,
  type DocumentReviewCommand,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@newfork/ui";
import { X } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";
import { CatalogDrawer } from "../settings/CatalogDrawer";
import { ConfirmDialog } from "../shell/ConfirmDialog";
import { LinesOutline, LoadError } from "../shell/LoadState";
import { errorText } from "../settings/GeneralSettingsPage";
import { DocumentExemptionAction } from "./DocumentExemptionAction";
import { TimezoneSelect } from "../settings/TimezoneSelect";
import { setDocumentTimezone } from "./document-data";
import {
  extendDocumentDeadline,
  removeDocumentDraftFile,
  withdrawDocumentAcknowledgement,
  acknowledgeDocument,
  deferInitialDocument,
  documentQueryKey,
  downloadDocument,
  getDocument,
  reviewDocument,
  submitDocument,
  uploadDocument,
  type DocumentAudience,
} from "./document-data";
import { isNoAccess } from "../lib/no-access";
import { RequestError } from "../lib/request-error";
import {
  acceptAttribute,
  acceptsUpload,
  fileDecisionLabel,
  isObligationClosed,
  sameSignerName,
  statusLabel,
  versionStateLabel,
} from "./document-rules";
import { WindowAlert } from "../shell/WindowAlert";

// What a person typed into the drawer. Nothing stores it before its own
// command runs, so each value is kept here against what it was typed for:
// the draft, the version under review, the policy text or the document.
type TypedValues = {
  expiry: string;
  metadata: Record<string, string | number | null>;
  reason: string;
  correction: "full" | "remaining";
  files: DocumentReviewCommand["files"];
  deferralReason: string;
  extensionDays: number;
  extensionReason: string;
  policyRead: boolean;
  signerName: string;
  timezone: string;
};
type TypedFields = {
  [K in keyof TypedValues]?: { for: string; value: TypedValues[K] };
};

type DrawerProps = {
  audience: DocumentAudience;
  userId: string;
  requirementId: string;
  canReview: boolean;
  onClose: () => void;
  onNext?: () => void;
};

// The list keeps one drawer open and moves it from document to document;
// each document starts clean, so nothing typed for one returns on a way back.
export function DocumentReviewDrawer(props: DrawerProps) {
  return <DocumentDrawer key={props.requirementId} {...props} />;
}

function DocumentDrawer(props: DrawerProps) {
  // Held above the content, which every revision rebuilds: uploading, removing
  // a file, deferring or someone else's change all bump the revision.
  const [typed, setTyped] = useState<TypedFields>({});
  // BL-828: held here because the content is rebuilt for the new revision.
  const [changed, setChanged] = useState(false);
  const query = useQuery({
    queryKey: documentQueryKey(
      props.audience,
      props.userId,
      props.requirementId,
    ),
    queryFn: () => getDocument(props.audience, props.requirementId),
  });
  if (query.data)
    return (
      <DocumentDetailContent
        key={detailVersion(query.data)}
        {...props}
        detail={query.data}
        typed={typed}
        onTyped={setTyped}
        changed={changed}
        onChanged={setChanged}
      />
    );
  return (
    <CatalogDrawer label="Document details" onClose={props.onClose}>
      <div className="job-catalog-editor">
        <div className="job-editor-title">
          <h2>Document details</h2>
          <button
            type="button"
            className="job-icon-button"
            aria-label="Close document details"
            onClick={props.onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="catalog-drawer-body">
          {!query.error ? (
            <LinesOutline label="Loading document" lines={5} />
          ) : isNoAccess(query.error) ? (
            <p role="alert">You don't have access to this document.</p>
          ) : (
            <LoadError
              inset
              level={3}
              title="We couldn't load this document"
              detail="This document didn't load. Nothing was changed."
              retrying={query.isFetching}
              onRetry={() => void query.refetch()}
            />
          )}
        </div>
      </div>
    </CatalogDrawer>
  );
}

// A 409 that means "changed meanwhile, reload": the document's revision or,
// for the time zone, the person's (BL-1028).
function changedMeanwhile(failure: unknown): boolean {
  return (
    failure instanceof RequestError &&
    failure.status === 409 &&
    (failure.reason === "document.changed" ||
      failure.reason === "employee.revision_conflict")
  );
}

// Every revision a drawer command is checked against: the document's and,
// for the time zone, the person's (BL-828). A new one rebuilds the content.
function detailVersion(detail: DocumentDetail): string {
  return `${detail.obligation.id}:${detail.obligation.revision}:${detail.timezone_settings?.employee_revision ?? ""}`;
}

function DocumentDetailContent({
  detail,
  ...props
}: DrawerProps & {
  detail: DocumentDetail;
  typed: TypedFields;
  onTyped: Dispatch<SetStateAction<TypedFields>>;
  changed: boolean;
  onChanged: (changed: boolean) => void;
}) {
  const cache = useQueryClient();
  const obligation = detail.obligation;
  const current = detail.submissions.find(
    (s) => s.id === obligation.submitted_id,
  );
  const draft = detail.submissions.find((s) => s.state === "draft");
  // A typed value counts while what it was typed for is still here; typed for
  // another draft (a correction opened after a rejection), another version
  // under review or other policy text, it gives way to the saved value.
  function typedField<K extends keyof TypedValues>(
    key: K,
    typedFor: string | undefined,
    saved: TypedValues[K],
  ) {
    const entry = props.typed[key];
    const value =
      typedFor !== undefined && entry?.for === typedFor ? entry.value : saved;
    const set = (next: TypedValues[K]) =>
      props.onTyped(
        (all) =>
          ({ ...all, [key]: { for: typedFor!, value: next } }) as TypedFields,
      );
    return [value, set] as const;
  }
  // A command that went through used what it sent; its form starts again.
  const forget = (...keys: (keyof TypedValues)[]) =>
    props.onTyped((all) => {
      const rest = { ...all };
      for (const key of keys) delete rest[key];
      return rest;
    });
  const policyText = detail.policy?.content_digest;
  const [policyRead, setPolicyRead] = typedField(
    "policyRead",
    policyText,
    false,
  );
  const [signerName, setSignerName] = typedField("signerName", policyText, "");
  const [failedUpload, setFailedUpload] = useState<File | null>(null);
  const [signatureRequestId] = useState(() => crypto.randomUUID());
  const [deferralReason, setDeferralReason] = typedField(
    "deferralReason",
    obligation.id,
    detail.initial_deferral?.reason ?? "",
  );
  const [extensionDays, setExtensionDays] = typedField(
    "extensionDays",
    obligation.id,
    1,
  );
  const [extensionReason, setExtensionReason] = typedField(
    "extensionReason",
    obligation.id,
    "",
  );
  const [reason, setReason] = typedField("reason", current?.id, "");
  // Where the reviewer was going when unsaved changes stopped them.
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [correction, setCorrection] = typedField(
    "correction",
    current?.id,
    "full",
  );
  const savedFiles = (current?.files ?? []).map((f) => ({
    id: f.id,
    decision: f.decision,
    note: f.note,
  }));
  const [files, setFiles] = typedField("files", current?.id, savedFiles);
  const [expiry, setExpiry] = typedField(
    "expiry",
    draft?.id,
    draft?.expiry_date ?? "",
  );
  const [metadata, setMetadata] = typedField(
    "metadata",
    draft?.id,
    draft?.metadata ?? {},
  );
  const [notice, setNotice] = useState("");
  const [exemptionLocked, setExemptionLocked] = useState(false);
  const [referenceTimezone, setReferenceTimezone] = typedField(
    "timezone",
    obligation.id,
    detail.timezone_settings?.configured_value ?? "",
  );
  const refresh = () =>
    Promise.all([
      cache.invalidateQueries({
        queryKey: [
          "document-lifecycle",
          props.userId,
          props.audience.workspaceId,
        ],
      }),
      // Employee onboarding embeds this drawer and shows each document's
      // status in its own step list; nothing else observes this key.
      cache.invalidateQueries({
        queryKey: ["my-employee-onboarding", props.audience.workspaceId],
      }),
      // The account badge counts documents still to act on.
      cache.invalidateQueries({ queryKey: ["account-attention"] }),
      // BL-1014: a decision can move the person out of Onboarding; the
      // Employees list and the person's drawer show their status.
      cache.invalidateQueries({ queryKey: ["employees", props.audience.workspaceId] }),
      cache.invalidateQueries({ queryKey: ["employee-detail", props.audience.workspaceId] }),
    ]);
  // BL-828, BL-1028: someone changed this document or the person first
  // (another reviewer, a new upload); the database says so with its key.
  // Reload and say so instead of the server's "refresh required". Any other
  // 409 is a standing refusal ("changes are paused"): nothing to reload, its
  // own sentence stays.
  const conflict = async (failure: unknown) => {
    if (!changedMeanwhile(failure)) return;
    await refresh();
    props.onChanged(true);
  };
  const started = () => props.onChanged(false);
  const review = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: (decision: "approve" | "reject") =>
      reviewDocument(props.audience, obligation.id, {
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
      await refresh();
      forget("reason", "correction", "files");
    },
  });
  const upload = useMutation({
    onMutate: started,
    mutationFn: (file: File) =>
      uploadDocument(props.audience, obligation.id, obligation.revision, file),
    onSuccess: async () => {
      setFailedUpload(null);
      await refresh();
    },
    onError: async (failure, file) => {
      setFailedUpload(file);
      await conflict(failure);
    },
  });
  const submit = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: () =>
      submitDocument(props.audience, obligation.id, {
        revision: obligation.revision,
        submission_id: draft!.id,
        expiry_date: expiry || null,
        metadata,
      }),
    onSuccess: async () => {
      await refresh();
      forget("expiry", "metadata");
    },
  });
  const download = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: ({
      submissionId,
      fileId,
    }: {
      submissionId: string;
      fileId: string;
    }) => downloadDocument(props.audience, obligation.id, submissionId, fileId),
  });
  const timezone = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: () =>
      setDocumentTimezone(props.audience, obligation.id, {
        employee_revision: detail.timezone_settings!.employee_revision,
        timezone: referenceTimezone,
      }),
    onSuccess: async () => {
      await refresh();
      forget("timezone");
    },
  });
  const defer = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: () =>
      deferInitialDocument(props.audience, obligation.id, {
        revision: obligation.revision,
        reason: deferralReason,
      }),
    onSuccess: async () => {
      await refresh();
      forget("deferralReason");
    },
  });
  const acknowledge = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: () =>
      acknowledgeDocument(props.audience, obligation.id, {
        revision: obligation.revision,
        typed_name: signerName,
        content_digest: detail.policy!.content_digest,
        idempotency_key: signatureRequestId,
      }),
    onSuccess: async () => {
      await refresh();
      forget("policyRead", "signerName");
    },
  });
  const withdraw = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: () =>
      withdrawDocumentAcknowledgement(
        props.audience,
        obligation.id,
        obligation.revision,
      ),
    onSuccess: refresh,
  });
  const removeFile = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: (fileId: string) =>
      removeDocumentDraftFile(props.audience, obligation.id, {
        revision: obligation.revision,
        submission_id: draft!.id,
        file_id: fileId,
      }),
    onSuccess: refresh,
  });
  const extension = useMutation({
    onMutate: started,
    onError: conflict,
    mutationFn: () =>
      extendDocumentDeadline(props.audience, obligation.id, {
        revision: obligation.revision,
        additional_days: extensionDays,
        reason: extensionReason,
      }),
    onSuccess: async () => {
      await refresh();
      forget("extensionDays", "extensionReason");
    },
  });
  const busy =
    extension.isPending ||
    removeFile.isPending ||
    withdraw.isPending ||
    acknowledge.isPending ||
    defer.isPending ||
    review.isPending ||
    upload.isPending ||
    submit.isPending ||
    exemptionLocked ||
    timezone.isPending;
  const error =
    extension.error ??
    removeFile.error ??
    withdraw.error ??
    acknowledge.error ??
    defer.error ??
    review.error ??
    upload.error ??
    submit.error ??
    download.error ??
    timezone.error;
  const shownError =
    !error || changedMeanwhile(error)
      ? null
      : error instanceof RequestError && (error.status ?? 0) >= 500
        ? error === download.error
          ? "Couldn't open the file. Try again."
          : "Couldn't save. Try again."
        : errorText(error);
  const dirty =
    failedUpload !== null ||
    extensionReason !== "" ||
    policyRead ||
    signerName !== "" ||
    referenceTimezone !== (detail.timezone_settings?.configured_value ?? "") ||
    deferralReason !== (detail.initial_deferral?.reason ?? "") ||
    reason !== "" ||
    expiry !== (draft?.expiry_date ?? "") ||
    JSON.stringify(metadata) !== JSON.stringify(draft?.metadata ?? {}) ||
    JSON.stringify(files) !== JSON.stringify(savedFiles);
  const navigate = (action: () => void) => {
    if (busy) return;
    if (dirty) setPendingLeave(() => action);
    else action();
  };
  const canDecide =
    props.canReview &&
    !isObligationClosed(obligation.status) &&
    current &&
    ["pending_review", "accepted"].includes(current.state);
  return (
    <CatalogDrawer
      label={obligation.title}
      busy={busy}
      onClose={() => navigate(props.onClose)}
    >
      <div className="job-catalog-editor">
        <div className="job-editor-title">
          <div>
            <h2>{obligation.title}</h2>
            <p>{obligation.employee_name}</p>
          </div>
          <button
            type="button"
            className="job-icon-button"
            aria-label="Close document details"
            disabled={busy}
            onClick={() => navigate(props.onClose)}
          >
            <X size={17} />
          </button>
        </div>
        <div className="catalog-drawer-body document-detail-body">
          <p>{statusLabel(obligation)}</p>
          {obligation.tracks_expiry && !obligation.timezone && (
            <p role="note">
              An administrator needs to set this employee's document time zone
              before expiration dates can be checked.
            </p>
          )}
          {detail.timezone_settings?.can_manage && (
            <fieldset disabled={busy}>
              <legend>Document time zone</legend>
              <p>
                This employee has no active location. This time zone is used
                only for their document dates and reminders.
              </p>
              <TimezoneSelect
                value={referenceTimezone}
                onChange={setReferenceTimezone}
              />
              <button
                type="button"
                className="job-secondary-button"
                disabled={
                  busy ||
                  !referenceTimezone ||
                  referenceTimezone ===
                    detail.timezone_settings.configured_value
                }
                onClick={() => timezone.mutate()}
              >
                Save document time zone
              </button>
            </fieldset>
          )}
          {obligation.deadline_at && (
            <p>
              Deadline:{" "}
              <time dateTime={obligation.deadline_at}>
                {obligation.timezone
                  ? new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: obligation.timezone,
                    }).format(new Date(obligation.deadline_at)) +
                    ` (${obligation.timezone})`
                  : obligation.deadline_at}
              </time>
            </p>
          )}
          {obligation.rejection_reason && (
            <p role="note">{obligation.rejection_reason}</p>
          )}
          {obligation.suspended && (
            <p role="alert">
              Workspace access is restricted until the outstanding requirements
              are completed.
            </p>
          )}
          {detail.policy && (
            <section aria-label="Policy content">
              <article className="onboarding-document-content" tabIndex={0}>
                {detail.policy.content_text}
              </article>
              {detail.policy.evidence ? (
                <p>
                  Acknowledged by {detail.policy.evidence.typed_name} on{" "}
                  <time dateTime={detail.policy.evidence.executed_at}>
                    {detail.policy.evidence.executed_at}
                  </time>
                </p>
              ) : (
                props.audience.selfOnly &&
                !isObligationClosed(obligation.status) && (
                  <fieldset disabled={busy}>
                    <label className="onboarding-intent">
                      <input
                        type="checkbox"
                        checked={policyRead}
                        onChange={(e) => {
                          setPolicyRead(e.target.checked);
                          if (!e.target.checked) setSignerName("");
                        }}
                      />
                      <span>{detail.policy.intent_statement}</span>
                    </label>
                    {policyRead && (
                      <label className="job-field">
                        <span>Type your full name</span>
                        <input
                          value={signerName}
                          maxLength={161}
                          onChange={(e) => setSignerName(e.target.value)}
                        />
                      </label>
                    )}
                    <Button
                      type="button"
                      disabled={
                        busy ||
                        !policyRead ||
                        !sameSignerName(signerName, obligation.employee_name)
                      }
                      onClick={() => acknowledge.mutate()}
                    >
                      Acknowledge policy
                    </Button>
                  </fieldset>
                )
              )}
              {props.audience.selfOnly &&
                detail.policy.evidence &&
                detail.policy.can_withdraw && (
                  <button
                    type="button"
                    className="job-secondary-button"
                    disabled={busy}
                    onClick={() => withdraw.mutate()}
                  >
                    Withdraw acknowledgement
                  </button>
                )}
              {detail.policy.history
                .filter((entry) => entry.withdrawn_at)
                .map((entry, index) => (
                  <p key={index}>
                    Acknowledgement by {entry.typed_name} withdrawn on{" "}
                    {entry.withdrawn_at}
                  </p>
                ))}
              <button
                type="button"
                className="job-secondary-button"
                onClick={() => {
                  const policy = detail.policy!;
                  const text = [
                    obligation.title,
                    policy.content_text,
                    policy.intent_statement,
                    policy.evidence
                      ? `Acknowledged by ${policy.evidence.typed_name} at ${policy.evidence.executed_at}`
                      : "Not acknowledged",
                    `Content digest: ${policy.content_digest}`,
                  ].join("\n\n");
                  const url = URL.createObjectURL(
                    new Blob([text], { type: "text/plain;charset=utf-8" }),
                  );
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "policy-copy.txt";
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download policy copy
              </button>
            </section>
          )}
          {detail.submissions.map((version) => (
            <section key={version.id} aria-label={`Version ${version.version}`}>
              <h3>
                Version {version.version} · {versionStateLabel(version.state)}
              </h3>
              {version.expiry_date && <p>Expires {version.expiry_date}</p>}
              {Object.entries(version.metadata).map(([key, value]) => (
                <p key={key}>
                  {obligation.settings.extra_fields.find(
                    (field) => field.key === key,
                  )?.label ?? key}
                  : {String(value ?? "")}
                </p>
              ))}
              {version.files.map((file) => (
                <div key={file.id} className="document-file-row">
                  <button
                    type="button"
                    className="job-secondary-button"
                    disabled={file.decision === "discard" || download.isPending}
                    onClick={() =>
                      download.mutate({
                        submissionId: version.id,
                        fileId: file.id,
                      })
                    }
                  >
                    {file.filename}
                  </button>
                  {canDecide && current.id === version.id ? (
                    <>
                      <select
                        aria-label={`Decision for ${file.filename}`}
                        value={files.find((f) => f.id === file.id)?.decision}
                        disabled={busy}
                        onChange={(e) =>
                          setFiles(
                            files.map((f) =>
                              f.id === file.id
                                ? {
                                    ...f,
                                    decision: e.target.value as
                                      "keep" | "discard",
                                  }
                                : f,
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
                          setFiles(
                            files.map((f) =>
                              f.id === file.id
                                ? { ...f, note: e.target.value }
                                : f,
                            ),
                          )
                        }
                      />
                    </>
                  ) : (
                    <span>{fileDecisionLabel(file.decision)}</span>
                  )}
                  {props.audience.selfOnly && version.state === "draft" && (
                    <button
                      type="button"
                      className="job-secondary-button"
                      disabled={busy}
                      onClick={() => removeFile.mutate(file.id)}
                    >
                      Remove {file.filename}
                    </button>
                  )}
                </div>
              ))}
            </section>
          ))}
          {canDecide && (
            <fieldset disabled={busy}>
              <legend>Review decision</legend>
              <label className="job-field">
                <span>Rejection reason</span>
                <textarea
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label className="job-field">
                <span>Correction period</span>
                <select
                  value={correction}
                  onChange={(e) =>
                    setCorrection(e.target.value as "full" | "remaining")
                  }
                >
                  <option value="full">Full correction period</option>
                  <option
                    value="remaining"
                    disabled={!obligation.remaining_seconds}
                  >
                    Remaining time
                  </option>
                </select>
              </label>
            </fieldset>
          )}
          {props.audience.selfOnly &&
            obligation.kind === "document" &&
            acceptsUpload(obligation) && (
              <section>
                <h3>Upload a new version</h3>
                {obligation.exemption_locked && (
                  <p>
                    Optional for you; what you submit goes on file without
                    review.
                  </p>
                )}
                <p>
                  {obligation.accepted_formats
                    .map((format) => format.toUpperCase())
                    .join(", ")}
                  , up to 10 MiB. Uploading saves a draft; submit it when ready.
                </p>
                {failedUpload && (
                  <p role="alert">
                    {failedUpload.name} could not be uploaded.{" "}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => upload.mutate(failedUpload)}
                    >
                      Retry upload
                    </button>{" "}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setFailedUpload(null);
                        upload.reset();
                      }}
                    >
                      Remove failed upload
                    </button>
                  </p>
                )}
                <input
                  type="file"
                  aria-label="Upload document"
                  accept={acceptAttribute(obligation.accepted_formats)}
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload.mutate(file);
                    e.target.value = "";
                  }}
                />
                {draft && (
                  <>
                    <label className="job-field">
                      <span>
                        Expiration date
                        {obligation.tracks_expiry ? " (required)" : ""}
                      </span>
                      <input
                        type="date"
                        required={obligation.tracks_expiry}
                        value={expiry}
                        onChange={(e) => setExpiry(e.target.value)}
                      />
                    </label>
                    {obligation.settings.extra_fields.map((field) => (
                      <label className="job-field" key={field.key}>
                        <span>
                          {field.label}
                          {field.required ? " (required)" : ""}
                        </span>
                        <input
                          type={field.kind}
                          required={field.required}
                          value={String(metadata[field.key] ?? "")}
                          onChange={(e) =>
                            setMetadata({
                              ...metadata,
                              [field.key]: e.target.value,
                            })
                          }
                        />
                      </label>
                    ))}
                    <Button
                      type="button"
                      disabled={
                        busy ||
                        failedUpload !== null ||
                        !draft.files.some((file) => file.decision === "keep")
                      }
                      onClick={() => submit.mutate()}
                    >
                      Submit document
                    </Button>
                  </>
                )}
              </section>
            )}
          {detail.initial_deferral?.allowed &&
            !obligation.publication_paused && (
              <fieldset disabled={busy}>
                <legend>Provide this document later</legend>
                <p>
                  Explain why you cannot provide it yet. Your delivery period
                  begins when onboarding is approved.
                </p>
                <label className="job-field">
                  <span>Reason</span>
                  <textarea
                    value={deferralReason}
                    maxLength={500}
                    onChange={(e) => setDeferralReason(e.target.value)}
                  />
                </label>
                <Button
                  type="button"
                  disabled={
                    busy ||
                    !deferralReason.trim() ||
                    deferralReason === detail.initial_deferral.reason
                  }
                  onClick={() => defer.mutate()}
                >
                  Save reason
                </Button>
              </fieldset>
            )}
          {props.canReview &&
            !props.audience.selfOnly &&
            obligation.kind === "document" &&
            (obligation.exemption_locked ? (
              <p className="document-exemption-note">
                Owners aren't required to submit documents. Uploading is
                optional.
              </p>
            ) : (
              <DocumentExemptionAction
                obligation={obligation}
                audience={props.audience}
                userId={props.userId}
                disabled={busy || dirty}
                onLockChange={setExemptionLocked}
              />
            ))}
          {props.canReview &&
            !props.audience.selfOnly &&
            obligation.mode !== "optional" &&
            !obligation.suspended &&
            obligation.deadline_at &&
            Date.parse(obligation.deadline_at) > Date.now() &&
            ![
              "pending_review",
              "completed",
              "removed",
              "exempt",
              "paused",
            ].includes(obligation.status) && (
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
            )}
          <details>
            <summary>History</summary>
            {detail.history.map((event) => (
              <p key={event.id}>
                <time dateTime={event.occurred_at}>{event.occurred_at}</time> ·{" "}
                {event.action.replaceAll("document.", "").replaceAll("_", " ")}
                {typeof event.metadata.reason === "string" && (
                  <> · {event.metadata.reason}</>
                )}
              </p>
            ))}
          </details>
          {props.changed && !notice && (
            <p role="status">
              This document changed. You're seeing the latest version.
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
        </div>
        {/* Over the body's bottom edge, above the footer, which scrolls (UI-FIELDMSG). */}
        <WindowAlert between message={shownError} />
        <div className="job-editor-footer">
          <div>
            {props.onNext && (
              <Button
                type="button"
                className="job-secondary-button"
                disabled={busy}
                onClick={() => navigate(props.onNext!)}
              >
                Next
              </Button>
            )}
          </div>
          <div className="job-editor-actions">
            {canDecide && (
              <>
                <Button
                  type="button"
                  className="job-secondary-button"
                  disabled={busy || !reason.trim()}
                  onClick={() => review.mutate("reject")}
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  className="job-primary-button"
                  disabled={busy || !files.some((f) => f.decision === "keep")}
                  onClick={() => review.mutate("approve")}
                >
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={pendingLeave !== null}
        title="Discard unsaved changes?"
        description={`Your changes to ${obligation.title} have not been saved and will be lost.`}
        cancelLabel="Keep editing"
        confirmLabel="Discard"
        destructive
        onCancel={() => setPendingLeave(null)}
        onConfirm={() => {
          const leave = pendingLeave;
          setPendingLeave(null);
          leave?.();
        }}
      />
    </CatalogDrawer>
  );
}
