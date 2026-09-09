import { CatalogDrawer } from "./CatalogDrawer";
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
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileText,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { CatalogRowMenu } from "./CatalogRowMenu";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  listDocumentTypes,
  reorderDocumentTypes,
  saveDocumentType,
  setDocumentTypeArchived,
} from "./documents-data";
import "./jobs-settings.css";

const defaultDraft: DocumentTypeInput = {
  title: "",
  description: "",
  required_at_onboarding: false,
  requires_review: true,
  accepted_formats: ["pdf", "jpeg", "png", "webp"],
  tracks_expiry: false,
  expiry_warning_days: 30,
  expiry_schedule_impact: "track_only",
};

const formatLabels: Record<DocumentFormat, string> = {
  pdf: "PDF",
  jpeg: "JPEG",
  png: "PNG",
  webp: "WebP",
};

type SortKey = "title" | "required_at_onboarding" | "requires_review";

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function expiryImpactLabel(
  impact: DocumentType["expiry_schedule_impact"],
): string {
  if (impact === "block") return "Hard conflict";
  if (impact === "warn") return "Soft conflict";
  return "Todo only";
}

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
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{
    key: SortKey;
    descending: boolean;
  } | null>(null);
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
    if (!canManage || saveMutation.isPending) return;
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
    if (!canSave) return;
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
  const visible = items
    .filter(
      (item) =>
        (showArchived || !item.archived_at) &&
        `${item.title} ${item.description}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => {
      if (!sort) return 0;
      const comparison = compareDocument(a, b, sort.key);
      return sort.descending ? -comparison : comparison;
    });
  const parsedDraft = documentTypeInputSchema.safeParse(draft);
  const documentBaseline =
    editing && editing !== "new"
      ? documentTypeInputSchema.parse(editing)
      : null;
  const canSave =
    !saveMutation.isPending &&
    Boolean(editing) &&
    parsedDraft.success &&
    (editing === "new" ||
      Boolean(
        documentBaseline && !sameJson(parsedDraft.data, documentBaseline),
      ));
  const move = (id: string, offset: -1 | 1): void => {
    const index = active.findIndex((item) => item.id === id);
    const next = index + offset;
    if (index < 0 || next < 0 || next >= active.length) return;
    const ids = active.map((item) => item.id);
    [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    reorderMutation.mutate(ids);
  };
  const sortColumn = (key: SortKey, label: string) => {
    const selected = sort?.key === key;
    const Icon = selected
      ? sort.descending
        ? ArrowDown
        : ArrowUp
      : ArrowUpDown;
    return (
      <button
        type="button"
        className="job-sort-button"
        aria-label={`Sort by ${label}`}
        aria-pressed={selected}
        onClick={() =>
          setSort({ key, descending: selected ? !sort.descending : false })
        }
      >
        {label}
        <Icon size={13} />
      </button>
    );
  };

  return (
    <section
      className="settings-page jobs-settings-page document-catalog-settings-page"
      aria-labelledby="documents-settings-title"
    >
      <SettingsHeader
        icon={<FileText size={21} aria-hidden />}
        title="Documents"
        description="Set up the documents employees need to upload, with review and expiry rules."
        action={
          canManage ? (
            <Button
              className="job-primary-button"
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => openEditor()}
            >
              <Plus size={16} aria-hidden />
              Add document type
            </Button>
          ) : undefined
        }
      />
      <div className="job-catalog-toolbar">
        <label className="job-search">
          <Search size={16} aria-hidden />
          <input
            aria-label="Search document types"
            placeholder="Search by name or description"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="job-archive-filter">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
      </div>

      {editing ? (
        <CatalogDrawer
          label={
            editing === "new" ? "Add document type" : `Edit ${editing.title}`
          }
          className="document-catalog-settings-page"
          onClose={() => setEditing(null)}
          busy={saveMutation.isPending}
        >
          <form
            className="job-catalog-editor"
            onSubmit={submit}
            aria-label={
              editing === "new" ? "Add document type" : `Edit ${editing.title}`
            }
          >
            <div className="job-editor-title">
              <div>
                <h2>
                  {editing === "new"
                    ? "New document type"
                    : "Edit document type"}
                </h2>
                <p>
                  Configure metadata only; employee files are not stored in this
                  phase.
                </p>
              </div>
              <button
                type="button"
                className="job-icon-button"
                aria-label="Close document editor"
                title="Close"
                disabled={saveMutation.isPending}
                onClick={() => setEditing(null)}
              >
                <X size={17} aria-hidden />
              </button>
            </div>
            <div className="catalog-drawer-body">
              <fieldset
                className="document-catalog-fields"
                disabled={saveMutation.isPending}
              >
                <label className="job-field">
                  <span>Name</span>
                  <input
                    value={draft.title}
                    maxLength={80}
                    required
                    placeholder="Enter document type name"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="job-field document-description-field">
                  <span>Description</span>
                  <textarea
                    value={draft.description}
                    maxLength={240}
                    rows={3}
                    placeholder="Short instructions for this requirement"
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
                        Missing documents will block employee activation.
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
                      <small>
                        Uploads enter a review state before completion.
                      </small>
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
                          expiry_schedule_impact: event.target.checked
                            ? current.expiry_schedule_impact
                            : "track_only",
                        }))
                      }
                    />
                    <span>
                      <strong>Track expiration</strong>
                      <small>
                        Employees provide an expiry date with upload.
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
                  <>
                    <label className="job-field expiry-warning-field">
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
                    <label className="job-field expiry-impact-field">
                      <span>Expired document schedule impact</span>
                      <select
                        value={draft.expiry_schedule_impact}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            expiry_schedule_impact: event.target
                              .value as DocumentTypeInput["expiry_schedule_impact"],
                          }))
                        }
                      >
                        <option value="track_only">Todo only</option>
                        <option value="warn">Soft conflict</option>
                        <option value="block">Hard conflict</option>
                      </select>
                    </label>
                  </>
                ) : null}
              </fieldset>
              {formError ? (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              ) : null}
            </div>
            <div className="job-editor-footer">
              <span />
              <div className="job-editor-actions">
                <Button
                  className="job-secondary-button"
                  type="button"
                  disabled={saveMutation.isPending}
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="job-primary-button"
                  type="submit"
                  disabled={!canSave}
                >
                  {saveMutation.isPending ? "Saving" : "Save document type"}
                </Button>
              </div>
            </div>
          </form>
        </CatalogDrawer>
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
        <div className="job-empty-state">
          <h2>{search ? "No matches found" : "No document types"}</h2>
          <p>
            {search
              ? "Try another name or clear your search."
              : "Add the first document requirement to get started."}
          </p>
        </div>
      ) : null}
      {visible.length > 0 ? (
        <div className="job-catalog" aria-label="Document types">
          <div className="job-column-headings document-catalog-row">
            {sortColumn("title", "Document type")}
            {sortColumn("required_at_onboarding", "Workflow")}
            {sortColumn("requires_review", "Review")}
            {sort ? (
              <button
                type="button"
                className="job-icon-button"
                aria-label="Clear column sorting"
                onClick={() => setSort(null)}
              >
                <X size={14} />
              </button>
            ) : (
              <span />
            )}
          </div>
          {visible.map((item) => (
            <div
              className="job-catalog-row document-catalog-row"
              key={item.id}
              data-archived={Boolean(item.archived_at)}
            >
              <button
                type="button"
                className="job-row-identity"
                disabled={!canManage || saveMutation.isPending}
                onClick={() => openEditor(item)}
              >
                <span className="document-catalog-marker" aria-hidden>
                  <FileText size={16} />
                </span>
                <span className="job-name-stack">
                  <span className="job-row-name" title={item.title}>
                    {item.title}
                  </span>
                  <span
                    className="document-catalog-description"
                    title={item.description}
                  >
                    {item.description || "No description"}
                  </span>
                  <span className="job-mobile-meta">
                    {documentWorkflowLabel(item)} -{" "}
                    {item.accepted_formats
                      .map((format) => formatLabels[format])
                      .join(", ")}
                  </span>
                </span>
                {item.archived_at && (
                  <span className="job-archived-label">Archived</span>
                )}
              </button>
              <span className="job-department-cell">
                {documentWorkflowLabel(item)}
              </span>
              <span className="job-department-cell">
                {item.tracks_expiry
                  ? expiryImpactLabel(item.expiry_schedule_impact)
                  : item.requires_review
                    ? "Review required"
                    : "No review"}
              </span>
              {canManage ? (
                <CatalogRowMenu name={item.title}>
                  <button
                    type="button"
                    disabled={saveMutation.isPending}
                    onClick={() => openEditor(item)}
                  >
                    Edit document type
                  </button>
                  {!item.archived_at && (
                    <>
                      <button
                        type="button"
                        disabled={
                          reorderMutation.isPending ||
                          Boolean(search.trim() || sort) ||
                          active[0]?.id === item.id
                        }
                        onClick={() => move(item.id, -1)}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        disabled={
                          reorderMutation.isPending ||
                          Boolean(search.trim() || sort) ||
                          active.at(-1)?.id === item.id
                        }
                        onClick={() => move(item.id, 1)}
                      >
                        Move down
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={item.archived_at ? undefined : "job-danger-text"}
                    disabled={archiveMutation.isPending}
                    onClick={() =>
                      archiveMutation.mutate({
                        id: item.id,
                        archived: !item.archived_at,
                      })
                    }
                  >
                    {item.archived_at ? "Restore" : "Archive"}
                  </button>
                </CatalogRowMenu>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function documentWorkflowLabel(item: DocumentType): string {
  return [
    item.required_at_onboarding ? "Required" : "Optional",
    item.requires_review ? "Review required" : "No review",
  ].join(" - ");
}

function compareDocument(
  a: DocumentType,
  b: DocumentType,
  key: SortKey,
): number {
  if (key === "title")
    return (
      a.title.localeCompare(b.title, undefined, {
        sensitivity: "base",
        numeric: true,
      }) || a.id.localeCompare(b.id)
    );
  const av = Number(Boolean(a[key]));
  const bv = Number(Boolean(b[key]));
  return bv - av || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}
