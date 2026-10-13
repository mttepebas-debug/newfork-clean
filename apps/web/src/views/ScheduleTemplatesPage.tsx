import type { ScheduleTemplateSummary } from "@newfork/shared/schedule";
import { ConfirmButton, useToast } from "@newfork/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Layers,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import {
  deleteScheduleTemplate,
  listScheduleTemplates,
  renameScheduleTemplate,
  ScheduleRequestError,
} from "../schedule/schedule-data";

import { isNoAccess } from "../lib/no-access";
import { scheduleRefusalReason } from "../schedule/lib/scheduleRefusalReason";
import { NoAccessState } from "../shell/NoAccessState";
import { noAccessHomePath } from "../auth/resolveLanding";
function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ScheduleTemplatesPage() {
  const { context } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManageTemplates = can(context, "schedule.templates");
  const [renameTarget, setRenameTarget] =
    useState<ScheduleTemplateSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const workspaceId = context?.workspace.id ?? null;
  const templatesQuery = useQuery({
    queryKey: ["schedule-templates", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => listScheduleTemplates(workspaceId!),
  });
  const templates = templatesQuery.data?.templates ?? [];

  async function refreshTemplates() {
    await queryClient.invalidateQueries({
      queryKey: ["schedule-templates", workspaceId],
    });
  }

  function openRename(template: ScheduleTemplateSummary) {
    setRenameTarget(template);
    setRenameValue(template.name);
    setRenameError(null);
  }

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !renameTarget) return;
    const nextName = renameValue.trim();
    if (!nextName) return;
    setRenaming(true);
    setRenameError(null);
    try {
      await renameScheduleTemplate(
        workspaceId,
        renameTarget.id,
        nextName,
        renameTarget.revision,
      );
      toast.success("Template renamed", {
        dedupeKey: `schedule-template-renamed:${renameTarget.id}`,
        description: nextName,
      });
      setRenameTarget(null);
      await refreshTemplates();
    } catch (error) {
      setRenameError(templateMutationError(error, "rename"));
    } finally {
      setRenaming(false);
    }
  }

  async function confirmDelete(template: ScheduleTemplateSummary) {
    if (!workspaceId) return;
    setDeletingId(template.id);
    try {
      await deleteScheduleTemplate(workspaceId, template.id, template.revision);
      toast.success("Template deleted", {
        dedupeKey: `schedule-template-deleted:${template.id}`,
        description: template.name,
      });
      await refreshTemplates();
    } catch (error) {
      toast.error("Template could not be deleted", {
        dedupeKey: `schedule-template-delete-failed:${template.id}`,
        description: templateMutationError(error, "delete"),
      });
    } finally {
      setDeletingId(null);
    }
  }

  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(templatesQuery.error))
    return (
      <NoAccessState
        subject="schedule templates"
        homeHref={noAccessHomePath(context, "/app/schedule/templates")}
      />
    );
  return (
    <main className="schedule-templates-page">
      <div className="page-header schedule-templates-header">
        <div>
          <p className="eyebrow">Schedule</p>
          <h1>
            <Layers size={24} aria-hidden />
            Schedule templates
          </h1>
          <p>
            Reusable weekly patterns saved from schedule drafts and published
            weeks.
          </p>
        </div>
        <Link className="secondary-command" to="/app/schedule">
          <ArrowLeft size={15} aria-hidden />
          Back to schedule
        </Link>
      </div>

      {templatesQuery.isPending ? (
        <section className="schedule-template-page-state" role="status">
          <Loader2 size={18} aria-hidden />
          Loading templates
        </section>
      ) : templatesQuery.isError ? (
        <section className="schedule-template-page-state error" role="alert">
          <strong>Templates could not be loaded.</strong>
          <button type="button" onClick={() => void templatesQuery.refetch()}>
            Retry
          </button>
        </section>
      ) : templates.length === 0 ? (
        <section className="schedule-template-page-empty">
          <strong>No templates yet</strong>
          <span>
            Open the schedule page, build a week, then save the current schedule
            as a template.
          </span>
        </section>
      ) : (
        <section className="schedule-template-table-wrap">
          <table className="schedule-template-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Shifts</th>
                <th>Open slots</th>
                <th>Created by</th>
                <th>Updated</th>
                {canManageTemplates ? <th aria-label="Template actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => {
                const deleting = deletingId === template.id;
                return (
                  <tr key={template.id} data-template-row>
                    <td>
                      <strong>{template.name}</strong>
                    </td>
                    <td>{template.shift_count}</td>
                    <td>{template.open_slot_count}</td>
                    <td>{template.created_by_name}</td>
                    <td>{shortDate(template.updated_at)}</td>
                    {canManageTemplates ? (
                      <td>
                        <div className="schedule-template-row-actions">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Rename template ${template.name}`}
                            onClick={() => openRename(template)}
                          >
                            <Pencil size={15} aria-hidden />
                          </button>
                          <ConfirmButton
                            unstyled
                            className="icon-button danger"
                            aria-label={`Delete template ${template.name}`}
                            confirmName={`Confirm delete template ${template.name}`}
                            disabled={deleting}
                            confirmLabel={<CheckCircle2 size={15} aria-hidden />}
                            onConfirm={() => void confirmDelete(template)}
                          >
                            {deleting ? (
                              <Loader2 size={15} aria-hidden />
                            ) : (
                              <Trash2 size={15} aria-hidden />
                            )}
                          </ConfirmButton>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {renameTarget ? (
        <div
          className="schedule-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !renaming) {
              setRenameTarget(null);
            }
          }}
        >
          <form
            className="schedule-template-rename-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-template-rename-title"
            onSubmit={submitRename}
          >
            <header>
              <div>
                <span>Template</span>
                <h2 id="schedule-template-rename-title">Rename template</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close rename template"
                disabled={renaming}
                onClick={() => setRenameTarget(null)}
              >
                <X size={17} aria-hidden />
              </button>
            </header>
            <label>
              Template name
              <input
                value={renameValue}
                maxLength={80}
                autoFocus
                onChange={(event) => setRenameValue(event.target.value)}
              />
            </label>
            {renameError ? <p role="alert">{renameError}</p> : null}
            <footer>
              <button
                type="button"
                disabled={renaming}
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-command"
                disabled={renaming || !renameValue.trim()}
              >
                {renaming ? "Renaming..." : "Rename"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function templateMutationError(
  error: unknown,
  action: "rename" | "delete",
): string {
  if (error instanceof ScheduleRequestError) {
    const status =
      error.body && typeof error.body === "object" && "status" in error.body
        ? String(error.body.status)
        : "";
    if (status === "name_taken") {
      return "A template with this name already exists.";
    }
    // BL-1044: the key, not any 409, says another tab renamed or deleted it.
    if (scheduleRefusalReason(error) === "schedule.template_changed") {
      return "This template changed. Refresh and try again.";
    }
  }
  return action === "rename"
    ? "The template could not be renamed. Try again."
    : "The template could not be deleted.";
}
