import {
  type DocumentDetail,
  type DocumentReviewCommand,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@newfork/ui";
import { X } from "lucide-react";
import { useState } from "react";
import { CatalogDrawer } from "../settings/CatalogDrawer";
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
import {
  acceptAttribute,
  isObligationClosed,
  sameSignerName,
} from "./document-rules";

export function DocumentReviewDrawer(props: {
  audience: DocumentAudience;
  userId: string;
  requirementId: string;
  canReview: boolean;
  onClose: () => void;
  onNext?: () => void;
}) {
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
        key={`${query.data.obligation.id}:${query.data.obligation.revision}`}
        {...props}
        detail={query.data}
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
          <p role={query.error ? "alert" : undefined}>
            {query.error ? errorText(query.error) : "Loading document…"}
          </p>
        </div>
      </div>
    </CatalogDrawer>
  );
}

function DocumentDetailContent({
  detail,
  ...props
}: {
  detail: DocumentDetail;
  audience: DocumentAudience;
  userId: string;
  requirementId: string;
  canReview: boolean;
  onClose: () => void;
  onNext?: () => void;
}) {
  const cache = useQueryClient();
  const obligation = detail.obligation;
  const current = detail.submissions.find(
    (s) => s.id === obligation.submitted_id,
  );
  const draft = detail.submissions.find((s) => s.state === "draft");
  const [policyRead, setPolicyRead] = useState(false);
  const [failedUpload, setFailedUpload] = useState<File | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signatureRequestId] = useState(() => crypto.randomUUID());
  const [deferralReason, setDeferralReason] = useState(
    detail.initial_deferral?.reason ?? "",
  );
  const [extensionDays, setExtensionDays] = useState(1);
  const [extensionReason, setExtensionReason] = useState("");
  const [reason, setReason] = useState("");
  const [correction, setCorrection] = useState<"full" | "remaining">("full");
  const [files, setFiles] = useState<DocumentReviewCommand["files"]>(
    (current?.files ?? []).map((f) => ({
      id: f.id,
      decision: f.decision,
      note: f.note,
    })),
  );
  const [expiry, setExpiry] = useState(draft?.expiry_date ?? "");
  const [metadata, setMetadata] = useState<
    Record<string, string | number | null>
  >(draft?.metadata ?? {});
  const [notice, setNotice] = useState("");
  const [exemptionLocked, setExemptionLocked] = useState(false);
  const [referenceTimezone, setReferenceTimezone] = useState(
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
    ]);
  const review = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      reviewDocument(props.audience, obligation.id, {
        revision: obligation.revision,
        submission_id: current!.id,
        decision,
        reason,
        correction_period: correction,
        files,
      }),
    onSuccess: async () => {
      setNotice("Decision saved");
      await refresh();
    },
  });
  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadDocument(props.audience, obligation.id, obligation.revision, file),
    onSuccess: async () => {
      setFailedUpload(null);
      await refresh();
    },
    onError: (_error, file) => setFailedUpload(file),
  });
  const submit = useMutation({
    mutationFn: () =>
      submitDocument(props.audience, obligation.id, {
        revision: obligation.revision,
        submission_id: draft!.id,
        expiry_date: expiry || null,
        metadata,
      }),
    onSuccess: refresh,
  });
  const download = useMutation({
    mutationFn: ({
      submissionId,
      fileId,
    }: {
      submissionId: string;
      fileId: string;
    }) => downloadDocument(props.audience, obligation.id, submissionId, fileId),
  });
  const timezone = useMutation({
    mutationFn: () =>
      setDocumentTimezone(props.audience, obligation.id, {
        employee_revision: detail.timezone_settings!.employee_revision,
        timezone: referenceTimezone,
      }),
    onSuccess: refresh,
  });
  const defer = useMutation({
    mutationFn: () =>
      deferInitialDocument(props.audience, obligation.id, {
        revision: obligation.revision,
        reason: deferralReason,
      }),
    onSuccess: refresh,
  });
  const acknowledge = useMutation({
    mutationFn: () =>
      acknowledgeDocument(props.audience, obligation.id, {
        revision: obligation.revision,
        typed_name: signerName,
        content_digest: detail.policy!.content_digest,
        idempotency_key: signatureRequestId,
      }),
    onSuccess: refresh,
  });
  const withdraw = useMutation({
    mutationFn: () =>
      withdrawDocumentAcknowledgement(
        props.audience,
        obligation.id,
        obligation.revision,
      ),
    onSuccess: refresh,
  });
  const removeFile = useMutation({
    mutationFn: (fileId: string) =>
      removeDocumentDraftFile(props.audience, obligation.id, {
        revision: obligation.revision,
        submission_id: draft!.id,
        file_id: fileId,
      }),
    onSuccess: refresh,
  });
  const extension = useMutation({
    mutationFn: () =>
      extendDocumentDeadline(props.audience, obligation.id, {
        revision: obligation.revision,
        additional_days: extensionDays,
        reason: extensionReason,
      }),
    onSuccess: refresh,
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
    JSON.stringify(files) !==
      JSON.stringify(
        (current?.files ?? []).map((f) => ({
          id: f.id,
          decision: f.decision,
          note: f.note,
        })),
      );
  const navigate = (action: () => void) => {
    if (
      !busy &&
      (!dirty || window.confirm("Discard unsaved document changes?"))
    )
      action();
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
          <p>{obligation.status.replaceAll("_", " ")}</p>
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
                This employee has no active primary location. This time zone is
                used only for their document dates and reminders.
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
                Version {version.version} · {version.state.replaceAll("_", " ")}
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
                          setFiles((items) =>
                            items.map((f) =>
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
                          setFiles((items) =>
                            items.map((f) =>
                              f.id === file.id
                                ? { ...f, note: e.target.value }
                                : f,
                            ),
                          )
                        }
                      />
                    </>
                  ) : (
                    <span>{file.decision}</span>
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
            !isObligationClosed(obligation.status) && (
              <section>
                <h3>Upload a new version</h3>
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
                            setMetadata((v) => ({
                              ...v,
                              [field.key]: e.target.value,
                            }))
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
                An owner is not asked for the documents they ask of everyone
                else. This one is listed here, never required.
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
          {notice && <p role="status">{notice}</p>}
          {error && (
            <p role="alert" className="form-error">
              {errorText(error)}
            </p>
          )}
        </div>
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
    </CatalogDrawer>
  );
}
