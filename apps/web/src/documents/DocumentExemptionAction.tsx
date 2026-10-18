import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DocumentObligation } from "@newfork/shared";
import { setDocumentExemption, type DocumentAudience } from "./document-data";
import { errorText } from "../settings/GeneralSettingsPage";
import { FieldNote } from "../shell/FieldNote";

/** Reuses the catalogue's inline confirmation and drawer-lock contract. */
export function DocumentExemptionAction({
  obligation,
  audience,
  userId,
  disabled,
  onLockChange,
}: {
  obligation: DocumentObligation;
  audience: DocumentAudience;
  userId: string;
  disabled: boolean;
  onLockChange: (locked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const cache = useQueryClient();
  const removing = obligation.status === "exempt";
  const title = removing ? "Remove exemption" : "Exempt from this document";
  const mutation = useMutation({
    mutationFn: () =>
      setDocumentExemption(audience, obligation.id, {
        revision: obligation.revision,
        exempt: !removing,
        reason: reason.trim(),
      }),
    onSuccess: async () => {
      setOpen(false);
      onLockChange(false);
      await cache.invalidateQueries({
        queryKey: ["document-lifecycle", userId, audience.workspaceId],
      });
    },
  });
  const dismiss = () => {
    setOpen(false);
    setReason("");
    mutation.reset();
    onLockChange(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  useEffect(() => {
    if (!open) return;
    cancel.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!mutation.isPending) {
        setOpen(false);
        setReason("");
        onLockChange(false);
        requestAnimationFrame(() => trigger.current?.focus());
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [open, mutation.isPending, onLockChange]);
  return (
    <div className="catalog-delete-action" data-confirming={open}>
      {!open ? (
        <button
          ref={trigger}
          type="button"
          className="job-secondary-button"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
            onLockChange(true);
          }}
        >
          {title}
        </button>
      ) : (
        <div className="catalog-delete-confirm" role="group" aria-label={title}>
          <div className="catalog-delete-copy">
            <strong>{title}</strong>
            <span>
              {removing
                ? "If this employee still needs the document, the full configured delivery period starts again. A valid approved version is kept."
                : "This document will no longer require completion or restrict access for this employee. Files and history are kept."}
            </span>
            <label className="job-field">
              <span>Reason</span>
              <textarea
                maxLength={500}
                value={reason}
                disabled={mutation.isPending}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <FieldNote
              id="document-exemption"
              error={mutation.error ? errorText(mutation.error) : null}
            />
          </div>
          <div className="catalog-delete-buttons">
            <button
              ref={cancel}
              type="button"
              className="job-secondary-button"
              disabled={mutation.isPending}
              onClick={dismiss}
            >
              Cancel
            </button>
            <button
              type="button"
              className="job-primary-button"
              disabled={mutation.isPending || !reason.trim()}
              onClick={() => mutation.mutate()}
            >
              {title}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
