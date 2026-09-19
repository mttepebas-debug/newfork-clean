import type {
  DocumentDetail,
  EmployeeOnboardingRequirement,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, UploadCloud } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { errorText } from "../settings/GeneralSettingsPage";
import { WizardBar } from "../shell/prebiz/PreBiz";
import {
  acknowledgeDocument,
  deferInitialDocument,
  documentQueryKey,
  downloadDocument,
  getDocument,
  removeDocumentDraftFile,
  submitDocument,
  uploadDocument,
  withdrawDocumentAcknowledgement,
  type DocumentAudience,
} from "../documents/document-data";
import {
  acceptAttribute,
  isObligationClosed,
  sameSignerName,
} from "../documents/document-rules";

/**
 * One document or policy, as onboarding shows it. The in-app drawer serves a
 * manager reviewing someone else's file and carries ten actions for it; this
 * page carries the four an employee has on their own document, so neither has to
 * hide most of itself behind flags.
 */
export function OnboardingDocumentStep({
  workspaceId,
  userId,
  requirement,
  badge,
  back,
  onDone,
}: {
  readonly workspaceId: string;
  readonly userId: string;
  readonly requirement: EmployeeOnboardingRequirement;
  readonly badge: ReactNode;
  readonly back: { readonly label: string; readonly go: () => void };
  readonly onDone: () => Promise<void>;
}) {
  const audience: DocumentAudience = { workspaceId, selfOnly: true };
  const query = useQuery({
    queryKey: documentQueryKey(audience, userId, requirement.id),
    queryFn: () => getDocument(audience, requirement.id),
  });
  return (
    <div className="onboarding-step">
      {/* The only way back is the one in the bar: two of them, one above the
          heading and one below the page, read as two different exits. */}
      <header className="onboarding-step-heading">
        <h1>{requirement.title}</h1>
        <div>{requirement.description}</div>
      </header>
      {badge}
      {query.data ? (
        <DocumentBody
          audience={audience}
          userId={userId}
          detail={query.data}
          back={back}
          onDone={onDone}
        />
      ) : (
        <>
          {query.error ? (
            <p className="form-error" role="alert">
              {errorText(query.error)}
            </p>
          ) : (
            <p role="status">Loading…</p>
          )}
          <WizardBar back={{ label: back.label, onClick: back.go }}>
            <span />
          </WizardBar>
        </>
      )}
    </div>
  );
}

function DocumentBody({
  audience,
  userId,
  detail,
  back,
  onDone,
}: {
  readonly audience: DocumentAudience;
  readonly userId: string;
  readonly detail: DocumentDetail;
  readonly back: { readonly label: string; readonly go: () => void };
  readonly onDone: () => Promise<void>;
}) {
  const cache = useQueryClient();
  const obligation = detail.obligation;
  const closed = isObligationClosed(obligation.status);
  const draft = detail.submissions.find((item) => item.state === "draft");
  const submitted = detail.submissions.find(
    (item) => item.id === obligation.submitted_id,
  );
  const shown = draft ?? submitted;
  // These live outside anything a refetch replaces, so an upload or a removal
  // never wipes an expiry date or an extra field the employee already typed.
  const [expiry, setExpiry] = useState(draft?.expiry_date ?? "");
  const [metadata, setMetadata] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(draft?.metadata ?? {}).map(([key, value]) => [
        key,
        String(value ?? ""),
      ]),
    ),
  );
  const [policyRead, setPolicyRead] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signatureRequestId] = useState(() => crypto.randomUUID());
  const [deferralReason, setDeferralReason] = useState(
    detail.initial_deferral?.reason ?? "",
  );
  const [failedUpload, setFailedUpload] = useState<File | null>(null);
  const uploadId = useId();
  const signerId = useId();
  const refresh = () =>
    Promise.all([
      cache.invalidateQueries({
        queryKey: ["document-lifecycle", userId, audience.workspaceId],
      }),
      cache.invalidateQueries({
        queryKey: ["my-employee-onboarding", audience.workspaceId],
      }),
    ]);

  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadDocument(audience, obligation.id, obligation.revision, file),
    onSuccess: async () => {
      setFailedUpload(null);
      await refresh();
    },
    onError: (_error, file) => setFailedUpload(file),
  });
  const removeFile = useMutation({
    mutationFn: (fileId: string) =>
      removeDocumentDraftFile(audience, obligation.id, {
        revision: obligation.revision,
        submission_id: draft!.id,
        file_id: fileId,
      }),
    onSuccess: refresh,
  });
  const submit = useMutation({
    mutationFn: () =>
      submitDocument(audience, obligation.id, {
        revision: obligation.revision,
        submission_id: draft!.id,
        expiry_date: expiry || null,
        metadata,
      }),
    onSuccess: refresh,
  });
  const acknowledge = useMutation({
    mutationFn: () =>
      acknowledgeDocument(audience, obligation.id, {
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
        audience,
        obligation.id,
        obligation.revision,
      ),
    onSuccess: refresh,
  });
  const defer = useMutation({
    mutationFn: () =>
      deferInitialDocument(audience, obligation.id, {
        revision: obligation.revision,
        reason: deferralReason,
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
    }) => downloadDocument(audience, obligation.id, submissionId, fileId),
  });

  const busy =
    upload.isPending ||
    removeFile.isPending ||
    submit.isPending ||
    acknowledge.isPending ||
    withdraw.isPending ||
    defer.isPending;
  const error =
    upload.error ??
    removeFile.error ??
    submit.error ??
    acknowledge.error ??
    withdraw.error ??
    defer.error ??
    download.error;

  const extraFields = obligation.settings.extra_fields;
  const missingField = extraFields.find(
    (field) => field.required && !String(metadata[field.key] ?? "").trim(),
  );
  // The server rejects a submission that is missing either of these; the button
  // says so up front instead of letting the save fail.
  const canSubmit =
    draft !== undefined &&
    failedUpload === null &&
    draft.files.some((file) => file.decision === "keep") &&
    (!obligation.tracks_expiry || expiry !== "") &&
    missingField === undefined;
  const canAcknowledge =
    policyRead && sameSignerName(signerName, obligation.employee_name);

  const act = async (run: () => Promise<unknown>) => {
    await run();
    await onDone();
  };
  const primary =
    detail.policy && !detail.policy.evidence && !closed
      ? {
          label: "Acknowledge and continue",
          disabled: !canAcknowledge,
          run: () => act(() => acknowledge.mutateAsync()),
        }
      : obligation.kind === "document" && !closed && draft
        ? {
            label: "Submit and continue",
            disabled: !canSubmit,
            run: () => act(() => submit.mutateAsync()),
          }
        : { label: "Continue", disabled: false, run: onDone };

  return (
    <>
      {obligation.rejection_reason ? (
        <p className="onboarding-attention" role="note">
          {obligation.rejection_reason}
        </p>
      ) : null}
      {obligation.deadline_at ? (
        <p className="onboarding-note">
          Due{" "}
          <time dateTime={obligation.deadline_at}>
            {formatDeadline(obligation.deadline_at, obligation.timezone)}
          </time>
        </p>
      ) : null}
      {obligation.tracks_expiry && !obligation.timezone ? (
        <p className="onboarding-note" role="note">
          Ask your manager to set your time zone; until they do, the expiry date
          on this document cannot be checked.
        </p>
      ) : null}

      {detail.policy ? (
        <section className="pb-doc-block" aria-label="What you are confirming">
          <article className="onboarding-document-content onboarding-policy-text">
            {detail.policy.content_text}
          </article>
          {detail.policy.evidence ? (
            <p className="onboarding-note">
              Signed by {detail.policy.evidence.typed_name} on{" "}
              <time dateTime={detail.policy.evidence.executed_at}>
                {formatDay(detail.policy.evidence.executed_at)}
              </time>
              .
            </p>
          ) : closed ? null : (
            <fieldset className="onboarding-privacy-options" disabled={busy}>
              <legend>Confirm</legend>
              <label className="onboarding-intent">
                <input
                  type="checkbox"
                  checked={policyRead}
                  onChange={(event) => {
                    setPolicyRead(event.target.checked);
                    if (!event.target.checked) setSignerName("");
                  }}
                />
                <span>{detail.policy.intent_statement}</span>
              </label>
              {policyRead ? (
                <div className="onboarding-field">
                  <label htmlFor={signerId}>
                    Type your name as {obligation.employee_name}
                  </label>
                  <input
                    id={signerId}
                    value={signerName}
                    maxLength={161}
                    onChange={(event) => setSignerName(event.target.value)}
                  />
                </div>
              ) : null}
            </fieldset>
          )}
          {detail.policy.evidence && detail.policy.can_withdraw ? (
            <button
              type="button"
              className="pb-btn pb-btn-secondary"
              disabled={busy}
              onClick={() => withdraw.mutate()}
            >
              Undo my confirmation
            </button>
          ) : null}
        </section>
      ) : null}

      {obligation.kind === "document" && !closed ? (
        <section className="pb-doc-block" aria-label="Your file">
          <label className="onboarding-upload" htmlFor={uploadId}>
            <UploadCloud size={26} aria-hidden />
            <strong>{draft ? "Add another file" : "Choose a file"}</strong>
            <span>
              {obligation.accepted_formats
                .map((format) => format.toUpperCase())
                .join(", ")}
              , up to 10 MB. A photo of the document is fine.
            </span>
            <input
              id={uploadId}
              type="file"
              accept={acceptAttribute(obligation.accepted_formats)}
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload.mutate(file);
                event.target.value = "";
              }}
            />
          </label>
          {failedUpload ? (
            <p className="onboarding-attention" role="alert">
              {failedUpload.name} did not upload.
              <button
                type="button"
                className="pb-btn pb-btn-secondary"
                disabled={busy}
                onClick={() => upload.mutate(failedUpload)}
              >
                Try again
              </button>
              <button
                type="button"
                className="pb-btn pb-btn-secondary"
                disabled={busy}
                onClick={() => {
                  setFailedUpload(null);
                  upload.reset();
                }}
              >
                Drop it
              </button>
            </p>
          ) : null}
          {shown?.files.length ? (
            <ul className="onboarding-file-list">
              {shown.files.map((file) => (
                <li key={file.id}>
                  <button
                    type="button"
                    className="pb-btn pb-btn-secondary"
                    disabled={file.decision === "discard" || download.isPending}
                    onClick={() =>
                      download.mutate({
                        submissionId: shown.id,
                        fileId: file.id,
                      })
                    }
                  >
                    {file.filename}
                  </button>
                  {shown.state === "draft" ? (
                    <button
                      type="button"
                      className="pb-btn pb-btn-secondary"
                      disabled={busy}
                      onClick={() => removeFile.mutate(file.id)}
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {draft ? (
            <div className="onboarding-form-grid">
              {obligation.tracks_expiry ? (
                <DateField
                  label="Expiry date on the document"
                  value={expiry}
                  onChange={setExpiry}
                />
              ) : null}
              {extraFields.map((field) => (
                <ExtraField
                  key={field.key}
                  label={
                    field.required ? field.label : `${field.label} (optional)`
                  }
                  kind={field.kind}
                  required={field.required}
                  value={String(metadata[field.key] ?? "")}
                  onChange={(value) =>
                    setMetadata((current) => ({
                      ...current,
                      [field.key]: value,
                    }))
                  }
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {detail.initial_deferral?.allowed && !obligation.publication_paused ? (
        <fieldset className="onboarding-privacy-options" disabled={busy}>
          <legend>Don't have it yet?</legend>
          <p>
            Tell your manager why. The clock on it starts once your onboarding
            is approved.
          </p>
          <div className="onboarding-field">
            <label htmlFor={`${uploadId}-reason`}>Reason</label>
            <textarea
              id={`${uploadId}-reason`}
              value={deferralReason}
              maxLength={500}
              onChange={(event) => setDeferralReason(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="pb-btn pb-btn-secondary"
            disabled={
              busy ||
              !deferralReason.trim() ||
              deferralReason === detail.initial_deferral.reason
            }
            onClick={() => defer.mutate()}
          >
            Save reason
          </button>
        </fieldset>
      ) : null}

      <WizardBar
        back={{ label: back.label, onClick: back.go }}
        error={error ? errorText(error) : null}
      >
        <button
          type="button"
          className="pb-btn pb-btn-primary"
          disabled={busy || primary.disabled}
          onClick={() => void primary.run()}
        >
          {busy ? "Saving" : primary.label}
          <ArrowRight size={17} aria-hidden />
        </button>
      </WizardBar>
    </>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="onboarding-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="date"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ExtraField({
  label,
  kind,
  required,
  value,
  onChange,
}: {
  readonly label: string;
  readonly kind: string;
  readonly required: boolean;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="onboarding-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={kind}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function formatDeadline(value: string, timezone: string | null): string {
  const format = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timezone ? { timeZone: timezone } : {}),
  });
  return format.format(new Date(value));
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}
