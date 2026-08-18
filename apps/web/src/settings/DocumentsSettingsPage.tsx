import {
  documentFormatSchema,
  documentTypeInputSchema,
  type DocumentFormat,
  type DocumentType,
  type DocumentTypeInput,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  listDocumentTypes,
  reorderDocumentTypes,
  saveDocumentType,
  setDocumentTypeArchived,
} from "./documents-data";

const defaultDraft: DocumentTypeInput = {
  title: "",
  description: "",
  required_at_onboarding: false,
  requires_review: true,
  accepted_formats: ["pdf", "jpeg", "png", "webp"],
  tracks_expiry: false,
  expiry_warning_days: 30,
};

const formatLabels: Record<DocumentFormat, string> = {
  pdf: "PDF",
  jpeg: "JPEG",
  png: "PNG",
  webp: "WebP",
};

export default function DocumentsSettingsPage() {
  const { context } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const canManage = context?.permissions.includes("documents.manage") ?? false;
  const queryKey = ["document-types", workspaceId];
  const query = useQuery({
    queryKey,
    queryFn: () => listDocumentTypes(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<DocumentType | "new" | null>(null);
  const [draft, setDraft] = useState<DocumentTypeInput>(defaultDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveDocumentType(
        workspaceId,
        draft,
        editing && editing !== "new" ? editing.id : undefined,
      ),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
      setFormError(null);
    },
    onError: (error) => setFormError(errorText(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setDocumentTypeArchived(workspaceId, id, archived),
    onSuccess: refresh,
    onError: (error) => setFormError(errorText(error)),
  });
  const reorderMutation = useMutation({
    mutationFn: (ids: readonly string[]) =>
      reorderDocumentTypes(workspaceId, ids),
    onSuccess: refresh,
    onError: (error) => setFormError(errorText(error)),
  });

  const openEditor = (documentType?: DocumentType): void => {
    setEditing(documentType ?? "new");
    setDraft(
      documentType ? documentTypeInputSchema.parse(documentType) : defaultDraft,
    );
    setFormError(null);
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setFormError(null);
    const parsed = documentTypeInputSchema.safeParse(draft);
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Check the document fields",
      );
      return;
    }
    saveMutation.mutate();
  };
  const toggleFormat = (format: DocumentFormat, checked: boolean): void => {
    setDraft((current) => ({
      ...current,
      accepted_formats: checked
        ? [...new Set([...current.accepted_formats, format])]
        : current.accepted_formats.filter((item) => item !== format),
    }));
  };

  const items = query.data ?? [];
  const active = items.filter((item) => !item.archived_at);
  const visible = items.filter((item) => showArchived || !item.archived_at);
  const move = (id: string, offset: -1 | 1): void => {
    const index = active.findIndex((item) => item.id === id);
    const next = index + offset;
    if (index < 0 || next < 0 || next >= active.length) return;
    const ids = active.map((item) => item.id);
    [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    reorderMutation.mutate(ids);
  };

  return (
    <section
      className="settings-page"
      aria-labelledby="documents-settings-title"
    >
      <SettingsHeader
        icon={<FileText size={21} aria-hidden />}
        title="Documents"
        description="Document requirements that Phase 4 onboarding will snapshot for each employee."
        action={
          canManage ? (
            <Button type="button" onClick={() => openEditor()}>
              <Plus size={16} aria-hidden />
              Add document type
            </Button>
          ) : undefined
        }
      />
      <label className="archive-filter">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
        Show archived
      </label>

      {editing ? (
        <form
          className="entity-editor"
          onSubmit={submit}
          aria-label={
            editing === "new" ? "Add document type" : `Edit ${editing.title}`
          }
        >
          <div className="entity-editor-heading">
            <div>
              <strong>
                {editing === "new" ? "New document type" : "Edit document type"}
              </strong>
              <span>
                Configure metadata only; employee files are not stored in this
                phase.
              </span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close document editor"
              title="Close"
              onClick={() => setEditing(null)}
            >
              <X size={17} aria-hidden />
            </button>
          </div>
          <div className="document-fields">
            <label className="form-field">
              <span>Name</span>
              <input
                value={draft.title}
                maxLength={80}
                required
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field document-description-field">
              <span>Description</span>
              <textarea
                value={draft.description}
                maxLength={240}
                rows={3}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            <fieldset className="document-options">
              <legend>Workflow</legend>
              <label>
                <input
                  type="checkbox"
                  checked={draft.required_at_onboarding}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      required_at_onboarding: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>Required during onboarding</strong>
                  <small>
                    Missing documents will block employee activation in Phase 4.
                  </small>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.requires_review}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      requires_review: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>Manager review required</strong>
                  <small>Uploads enter a review state before completion.</small>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.tracks_expiry}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      tracks_expiry: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>Track expiration</strong>
                  <small>
                    Employees provide an expiry date with their upload.
                  </small>
                </span>
              </label>
            </fieldset>
            <fieldset className="document-options document-formats">
              <legend>Accepted formats</legend>
              {documentFormatSchema.options.map((format) => (
                <label key={format}>
                  <input
                    type="checkbox"
                    checked={draft.accepted_formats.includes(format)}
                    onChange={(event) =>
                      toggleFormat(format, event.target.checked)
                    }
                  />
                  <span>
                    <strong>{formatLabels[format]}</strong>
                  </span>
                </label>
              ))}
            </fieldset>
            {draft.tracks_expiry ? (
              <label className="form-field expiry-warning-field">
                <span>Warn before expiry</span>
                <div className="number-suffix-input">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={draft.expiry_warning_days}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        expiry_warning_days: Number(event.target.value),
                      }))
                    }
                  />
                  <span>days</span>
                </div>
              </label>
            ) : null}
          </div>
          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="entity-editor-actions">
            <Button
              className="secondary-button"
              type="button"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving" : "Save document type"}
            </Button>
          </div>
        </form>
      ) : null}

      {!editing && formError ? (
        <p className="settings-state error" role="alert">
          {formError}
        </p>
      ) : null}
      {query.isLoading ? (
        <p className="settings-state">Loading document types...</p>
      ) : null}
      {query.error ? (
        <p className="settings-state error" role="alert">
          {errorText(query.error)}
        </p>
      ) : null}
      {!query.isLoading && !query.error && visible.length === 0 ? (
        <div className="settings-empty">
          <FileText size={22} aria-hidden />
          <strong>
            {showArchived
              ? "No archived document types"
              : "No document types yet"}
          </strong>
          <p>
            Define only the upload requirements your onboarding process actually
            needs.
          </p>
        </div>
      ) : null}
      {visible.length > 0 ? (
        <div className="entity-list" aria-label="Document types">
          {visible.map((item) => (
            <div
              className="entity-row document-type-row"
              key={item.id}
              data-archived={Boolean(item.archived_at)}
            >
              <span className="entity-marker document-marker" aria-hidden>
                <FileText size={16} />
              </span>
              <div className="entity-summary">
                <strong>{item.title}</strong>
                <span>
                  {item.accepted_formats
                    .map((format) => formatLabels[format])
                    .join(", ")}
                  {item.tracks_expiry
                    ? ` · ${item.expiry_warning_days}-day expiry warning`
                    : ""}
                </span>
                <small>
                  {[
                    item.required_at_onboarding ? "Required" : "Optional",
                    item.requires_review ? "Review required" : "No review",
                  ].join(" · ")}
                </small>
              </div>
              {item.archived_at ? (
                <span className="status-label">Archived</span>
              ) : null}
              {canManage ? (
                <div className="row-actions">
                  {!item.archived_at ? (
                    <>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={
                          active[0]?.id === item.id || reorderMutation.isPending
                        }
                        aria-label={`Move ${item.title} up`}
                        title="Move up"
                        onClick={() => move(item.id, -1)}
                      >
                        <ArrowUp size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={
                          active.at(-1)?.id === item.id ||
                          reorderMutation.isPending
                        }
                        aria-label={`Move ${item.title} down`}
                        title="Move down"
                        onClick={() => move(item.id, 1)}
                      >
                        <ArrowDown size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Edit ${item.title}`}
                        title="Edit"
                        onClick={() => openEditor(item)}
                      >
                        <Pencil size={16} aria-hidden />
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${item.archived_at ? "Restore" : "Archive"} ${item.title}`}
                    title={item.archived_at ? "Restore" : "Archive"}
                    onClick={() =>
                      archiveMutation.mutate({
                        id: item.id,
                        archived: !item.archived_at,
                      })
                    }
                  >
                    {item.archived_at ? (
                      <RotateCcw size={16} aria-hidden />
                    ) : (
                      <Archive size={16} aria-hidden />
                    )}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
