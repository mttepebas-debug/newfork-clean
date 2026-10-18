import { useState } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";

import type { DocumentType } from "@newfork/shared";

import { CatalogDrawer } from "./CatalogDrawer";

import { errorText } from "./GeneralSettingsPage";

import {
  previewDocumentPublication,
  publishDocumentType,
} from "./documents-data";

import "./document-settings-editor.css";

import { isNoAccess } from "../lib/no-access";
import { LinesOutline, LoadError, RefreshError } from "../shell/LoadState";
import { WindowAlert } from "../shell/WindowAlert";

export function DocumentPublicationDialog({
  workspaceId,
  document,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  document: DocumentType;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");

  const action =
    document.publication_status === "published" ? "unpublish" : "publish";

  const label = action === "publish" ? "Publish" : "Unpublish";

  const preview = useQuery({
    queryKey: [
      "document-publication-preview",
      workspaceId,
      document.id,
      document.publication_revision,
    ],
    queryFn: () => previewDocumentPublication(workspaceId, document.id),
    staleTime: 0,
    gcTime: 0,
  });

  const mutation = useMutation({
    mutationFn: () =>
      publishDocumentType(
        workspaceId,
        document.id,
        {
          revision: preview.data!.revision,
          publication_revision: preview.data!.publication_revision,
          preview_token: preview.data!.preview_token,
          reason: reason.trim(),
        },
        action,
      ),
    onSuccess: async () => {
      await onSaved();
      onClose();
    },
  });

  return (
    <CatalogDrawer
      label={`${label} ${document.title}`}
      className="document-catalog-settings-page document-side-index"
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form
        className="job-catalog-editor document-side-index-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            preview.data &&
            preview.data.transition === action &&
            !preview.isFetching &&
            !preview.error &&
            !mutation.error &&
            reason.trim() &&
            !mutation.isPending
          )
            mutation.mutate();
        }}
      >
        <div className="job-editor-title">
          <div>
            <h2>
              {label} {document.title}
            </h2>
            <p>
              {action === "publish"
                ? "Review the actual employee impact before publishing."
                : "Pause this document while preserving files, approvals and history."}
            </p>
          </div>
        </div>

        <div className="document-side-index-panel">
          {preview.isPending && (
            <LinesOutline label="Loading publication impact" lines={4} />
          )}
          {/* Loading and error in the "B" look (Mert 2026-10-14): never the server's sentence. */}
          {preview.error && isNoAccess(preview.error) ? (
            <p role="alert">You don't have access to {label.toLowerCase()} this document.</p>
          ) : preview.error && !preview.data ? (
            <LoadError
              inset
              level={3}
              title="We couldn't load the publication impact"
              detail="The employee impact didn't load. Nothing was changed."
              retrying={preview.isFetching}
              onRetry={() => void preview.refetch()}
            />
          ) : preview.error ? (
            <RefreshError
              message={`The employee impact didn't refresh. Try again before you ${label.toLowerCase()}.`}
              retrying={preview.isFetching}
              onRetry={() => void preview.refetch()}
            />
          ) : null}

          {preview.data && (
            <>
              <section aria-label="Target audience">
                <h3>Who will be responsible</h3>
                <p>
                  {preview.data.target.operator === "and"
                    ? "Employees at the selected locations, with the selected jobs in the selected departments, match this document. All three filters must match together."
                    : "This existing document matches any of its selected location, department or job groups."}
                </p>
                <dl>
                  {(
                    [
                      ["locations", "location_ids", "Locations"],
                      ["departments", "department_ids", "Departments"],
                      ["jobs", "job_ids", "Jobs"],
                    ] as const
                  ).map(([key, ids, title]) => (
                    <div key={key}>
                      <dt>{title}</dt>
                      <dd>
                        {preview.data!.target[ids].length
                          ? preview
                              .data![key].filter((item) =>
                                preview.data!.target[ids].includes(item.id),
                              )
                              .map((item) => item.name)
                              .join(", ")
                          : `All ${title}`}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p>
                  Jobs apply across an employee's assigned locations. New hires
                  who match these same filters will also be responsible for this
                  document once it is published. Matching employees restored
                  from archive are included; individual exemptions and valid
                  approvals remain in effect.
                </p>
                {preview.data.named_people.length > 0 && (
                  <p>
                    Additional legacy employee targets:{" "}
                    {preview.data.named_people
                      .map((item) => item.name)
                      .join(", ")}
                    . These existing targets are retained separately from the
                    filters.
                  </p>
                )}
                <h3>Matching employees</h3>
                <ul>
                  {preview.data.employees
                    .filter((item) => item.matches_target)
                    .map((item) => (
                      <li key={item.requirement_id ?? item.employee_id}>
                        {item.employee_name}
                        {item.action === "exempt"
                          ? " — Exemption kept"
                          : item.action === "unchanged"
                            ? " — Existing responsibility and evidence unchanged"
                            : ""}
                      </li>
                    ))}
                </ul>
                {!preview.data.employees.some(
                  (item) => item.matches_target,
                ) && (
                  <p>
                    No current employees match these filters. Matching future
                    hires will still be included.
                  </p>
                )}
              </section>
              <p>
                {action === "publish"
                  ? "Matching employees receive the current document rules. Existing paused delivery periods restart in full; valid approvals and certificate expiration dates stay intact. Former targets close."
                  : "Uploads, submission, review, delivery countdowns and reminders pause. Access restrictions from other documents remain in effect."}
              </p>

              {(
                [
                  ["locations", "Locations in this preview"],
                  ["departments", "Departments in this preview"],
                  ["jobs", "Jobs in this preview"],
                ] as const
              ).map(([key, title]) => (
                <div key={key}>
                  <h3>{title}</h3>
                  <p>
                    {preview.data[key].map((item) => item.name).join(", ") ||
                      "None"}
                  </p>
                </div>
              ))}

              <h3>Changes to confirm</h3>

              <ul>
                {preview.data.employees
                  .filter((item) => item.action !== "unchanged")
                  .map((item) => (
                    <li key={item.requirement_id ?? item.employee_id}>
                      {item.employee_name} -{" "}
                      {item.action === "remove"
                        ? "Close former assignment"
                        : item.action === "pause"
                          ? "Pause"
                          : item.action === "exempt"
                            ? "Exemption kept"
                            : item.action}{" "}
                      -{" "}
                      {item.deadline_action === "restart"
                        ? "Full current delivery period; valid approval kept, pending review remains paused"
                        : item.deadline_action === "pause"
                          ? "Delivery period paused"
                          : item.deadline_action === "clear"
                            ? "No delivery countdown"
                            : "Current deadline kept"}
                    </li>
                  ))}
              </ul>

              {!preview.data.employees.some(
                (item) => item.action !== "unchanged",
              ) && (
                <p>
                  No current employee changes. Future matching assignments
                  follow the published rules.
                </p>
              )}

              <label className="job-field">
                <span>Reason</span>
                <textarea
                  value={reason}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={mutation.isPending}
                  required
                />
              </label>
            </>
          )}

          {mutation.error && (
            <button
              type="button"
              className="job-secondary-button"
              disabled={preview.isFetching}
              onClick={() => {
                mutation.reset();
                void preview.refetch();
              }}
            >
              Refresh impact
            </button>
          )}
        </div>

        {/* The server's sentence in the drawer's band, above the footer (UI-FIELDMSG-2). */}
        <WindowAlert between message={mutation.error ? errorText(mutation.error) : null} />
        <div className="job-editor-footer">
          <div className="job-editor-actions">
            <button
              className="job-secondary-button"
              type="button"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="job-primary-button"
              type="submit"
              disabled={
                !preview.data ||
                preview.data.transition !== action ||
                preview.isFetching ||
                !!preview.error ||
                !!mutation.error ||
                !reason.trim() ||
                mutation.isPending
              }
            >
              {mutation.isPending ? "Saving" : `Confirm ${action}`}
            </button>
          </div>
        </div>
      </form>
    </CatalogDrawer>
  );
}
