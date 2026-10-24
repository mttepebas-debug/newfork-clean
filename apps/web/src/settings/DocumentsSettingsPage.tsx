import { tabLineRef } from "../shell/useTabSwipe";
import { CatalogDrawer } from "./CatalogDrawer";
import { SettingsListHeader } from "./SettingsListHeader";
import {
  defaultDocumentLifecycleSettings,
  documentTypeInputSchema,
  type DocumentType,
  type DocumentTypeInput,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { CatalogSortButton, nextCatalogSort } from "../views/CatalogSortButton";
import { CatalogArchiveButton, CatalogRowMenu } from "./CatalogRowMenu";
import { errorText } from "./GeneralSettingsPage";
import {
  ListAddButton,
} from "../views/CatalogPageHeader";
import {
  listDocumentTypes,
  previewDocumentPublication,
  reorderDocumentTypes,
  saveDocumentType,
  setDocumentTypeArchived,
} from "./documents-data";
import "./jobs-settings.css";
import { DocumentPublicationDialog } from "./DocumentPublicationDialog";
import { DocumentSettingsEditor } from "./DocumentSettingsEditor";
import { formatsLabel } from "../documents/document-rules";

import { isNoAccess } from "../lib/no-access";
import { ListOutline, LoadError, RefreshError } from "../shell/LoadState";
import { NoAccessState } from "../shell/NoAccessState";
import { noAccessHomePath } from "../auth/resolveLanding";
import { onTabListKeyDown } from "../lib/tab-list-keys";
const defaultDraft: DocumentTypeInput = {
  title: "",
  description: "",
  required_at_onboarding: false,
  requires_review: true,
  accepted_formats: ["pdf", "jpeg", "png", "webp"],
  tracks_expiry: false,
  expiry_warning_days: 30,
  expiry_schedule_impact: "track_only",
  lifecycle_settings: {
    ...defaultDocumentLifecycleSettings,
    assignment_scope: "all_active",
  },
};

type SortKey = "title" | "description" | "publication_status" | "published_at";

type RequirementFilter = "" | "required" | "conditional" | "optional";

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function editableDocument(document: DocumentType): DocumentTypeInput {
  return documentTypeInputSchema.parse({
    ...document,
    lifecycle_settings: document.lifecycle_settings ?? {
      ...defaultDocumentLifecycleSettings,
      mode: document.required_at_onboarding ? "required" : "optional",
      assignment_scope: "all_active",
    },
  });
}

export default function DocumentsSettingsPage() {
  const { context } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const canReadSettings = can(context, "settings.documents.read");
  const canManage = can(context, "settings.documents.write");
  const queryKey = ["document-types", workspaceId];
  const query = useQuery({
    queryKey,
    queryFn: () => listDocumentTypes(workspaceId),
    enabled: Boolean(workspaceId) && canReadSettings,
  });
  const [status, setStatus] = useState<
    "all" | "draft" | "published" | "archived"
  >("all");
  const [publication, setPublication] = useState<DocumentType | null>(null);
  const [requirementFilter, setRequirementFilter] =
    useState<RequirementFilter>("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{
    key: SortKey;
    descending: boolean;
  } | null>(null);
  const [editing, setEditing] = useState<DocumentType | "new" | null>(null);
  const [draft, setDraft] = useState<DocumentTypeInput>(defaultDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
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
    // Archiving a published document pauses what people are asked for (BL-821).
    onSuccess: async () => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["document-lifecycle"] });
    },
    onError: (error) => setFormError(errorText(error)),
  });
  const reorderMutation = useMutation({
    mutationFn: (ids: readonly string[]) =>
      reorderDocumentTypes(workspaceId, ids),
    onSuccess: refresh,
    onError: (error) => setFormError(errorText(error)),
  });

  const openEditor = (documentType?: DocumentType): void => {
    if (!canManage || !query.isSuccess || saveMutation.isPending || applyBusy)
      return;
    setEditing(documentType ?? "new");
    setDraft(documentType ? editableDocument(documentType) : defaultDraft);
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

  const items = query.data ?? [];
  const active = items.filter((item) => !item.archived_at);
  const visible = items
    .filter(
      (item) =>
        (status === "archived"
          ? Boolean(item.archived_at)
          : !item.archived_at) &&
        (status === "all" ||
          status === "archived" ||
          item.publication_status === status) &&
        (!requirementFilter ||
          documentRequirementKey(item) === requirementFilter) &&
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
  const readOnly =
    editing !== null &&
    editing !== "new" &&
    editing.publication_status === "published";
  const documentBaseline =
    editing && editing !== "new" ? editableDocument(editing) : null;
  const canSave =
    query.isSuccess &&
    !saveMutation.isPending &&
    !applyBusy &&
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
  // Same sortable heading as Employees → Documents (CatalogSortButton).
  const sortColumn = (key: SortKey, label: string, className?: string) => {
    const selected = sort?.key === key;
    return (
      <span
        className={className}
        role="columnheader"
        aria-sort={
          selected ? (sort.descending ? "descending" : "ascending") : "none"
        }
      >
        <CatalogSortButton
          active={selected}
          label={label}
          onClick={() =>
            setSort(nextCatalogSort(sort, key))
          }
        />
      </span>
    );
  };

  const addButton = canManage ? (
    <ListAddButton
      label="New document"
      shortLabel="Add"
      disabled={!query.isSuccess || saveMutation.isPending || applyBusy}
      onClick={() => openEditor()}
    />
  ) : null;

  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(query.error))
    return (
      <NoAccessState
        homeHref={noAccessHomePath(context, "/app/settings/documents")}
      />
    );
  return (
    <section
      className="settings-page jobs-settings-page document-catalog-settings-page list-page"
      aria-labelledby="documents-settings-title"
    >
      <SettingsListHeader
        icon={<FileText size={21} aria-hidden />}
        title="Documents"
        titleId="documents-settings-title"
        description="Set up the documents employees need to upload, with review and expiry rules."
      />
      {publication && (
        <DocumentPublicationDialog
          workspaceId={workspaceId}
          document={publication}
          onClose={() => setPublication(null)}
          onSaved={async () => {
            await refresh();
            await queryClient.invalidateQueries({
              queryKey: ["document-lifecycle"],
            });
          }}
        />
      )}
      {canReadSettings ? (
        <>
          <div className="job-catalog-toolbar catalog-toolbar document-catalog-toolbar">
            <div className="catalog-toolbar-status-row">
              <div
                className="catalog-status-tabs"
                ref={tabLineRef}
                role="tablist"
                onKeyDown={onTabListKeyDown}
                aria-label="Document status"
              >
                {(["all", "draft", "published", "archived"] as const).map(
                  (value) => (
                    <button
                      type="button"
                      role="tab"
                      key={value}
                      aria-selected={status === value}
                      tabIndex={status === value ? 0 : -1}
                      className={status === value ? "active" : ""}
                      onClick={() => setStatus(value)}
                    >
                      {value[0]!.toUpperCase() + value.slice(1)}
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="catalog-toolbar-filter-row">
              <select
                className="toolbar-filter-select"
                aria-label="Filter by requirement"
                value={requirementFilter}
                onChange={(event) =>
                  setRequirementFilter(event.target.value as RequirementFilter)
                }
              >
                <option value="">All requirements</option>
                <option value="required">Required</option>
                <option value="conditional">Conditional</option>
                <option value="optional">Optional</option>
              </select>
              <label className="job-search toolbar-search">
                <Search size={16} aria-hidden />
                <input
                  aria-label="Search document types"
                  placeholder="Search by name or description"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              {addButton}
            </div>
          </div>

          {editing ? (
            <CatalogDrawer
              label={
                editing === "new"
                  ? "Add document type"
                  : `Edit ${editing.title}`
              }
              className="document-catalog-settings-page document-side-index"
              onClose={() => setEditing(null)}
              busy={saveMutation.isPending || applyBusy}
            >
              <DocumentSettingsEditor
                value={draft}
                onChange={setDraft}
                workspaceId={workspaceId}
                documentId={editing === "new" ? undefined : editing.id}
                busy={saveMutation.isPending || applyBusy}
                readOnly={readOnly}
                saving={saveMutation.isPending}
                saveDisabled={!query.isSuccess}
                dirty={editing === "new" || !sameJson(draft, documentBaseline)}
                issues={parsedDraft.success ? [] : parsedDraft.error.issues}
                error={formError}
                onSubmit={submit}
                onClose={() => setEditing(null)}
                onBusyChange={setApplyBusy}
              />
            </CatalogDrawer>
          ) : null}

          {!editing && formError ? (
            <p className="settings-state error" role="alert">
              {formError}
            </p>
          ) : null}
          {query.isLoading ? (
            <ListOutline label="Loading document types" rows={5} columns={3} />
          ) : null}
          {query.error && !query.data ? (
            <LoadError
              title="We couldn't load document types"
              detail="Document types didn't load. Nothing was changed."
              retrying={query.isFetching}
              onRetry={() => void query.refetch()}
            />
          ) : null}
          {query.error && query.data ? (
            <RefreshError
              message="Document types didn't refresh. This is the last list that loaded."
              retrying={query.isFetching}
              onRetry={() => void query.refetch()}
            />
          ) : null}
          {query.data ? (
            <div className="job-catalog" aria-label="Document types">
              <div className="job-column-headings catalog-column-headings document-catalog-row">
                {sortColumn("title", "Document name")}
                {sortColumn(
                  "description",
                  "Description",
                  "document-catalog-optional document-description-cell",
                )}
                {sortColumn(
                  "publication_status",
                  "Status",
                  "document-catalog-optional",
                )}
                {sortColumn(
                  "published_at",
                  "Published",
                  "document-catalog-optional",
                )}
                <span />
              </div>
              {visible.length === 0 ? (
                <div className="catalog-table-empty">
                  <span className="catalog-table-empty-icon" aria-hidden>
                    <FileText size={22} />
                  </span>
                  <h2>
                    {items.length
                      ? "No document types match these filters."
                      : "No document types"}
                  </h2>
                  <p>
                    {items.length
                      ? "Try another status or clear your search."
                      : "Add the first document requirement to get started."}
                  </p>
                  {!items.length && canManage ? (
                    <ListAddButton
                      label="New document"
                      disabled={saveMutation.isPending || applyBusy}
                      onClick={() => openEditor()}
                    />
                  ) : null}
                </div>
              ) : null}
              {visible.map((item) => (
                <div
                  className="job-catalog-row document-catalog-row"
                  key={item.id}
                  data-archived={Boolean(item.archived_at)}
                  data-editable={
                    canManage && !saveMutation.isPending && !applyBusy
                  }
                  onClick={(event) => {
                    if (
                      (event.target as Element).closest(
                        "button, a, input, select, textarea, label, summary, details, [role='button'], [role='checkbox'], [contenteditable='true']",
                      )
                    )
                      return;
                    event.currentTarget
                      .querySelector<HTMLButtonElement>(".job-row-identity")
                      ?.focus({ preventScroll: true });
                    openEditor(item);
                  }}
                >
                  <button
                    type="button"
                    className="job-row-identity"
                    disabled={!canManage || saveMutation.isPending || applyBusy}
                    onClick={() => openEditor(item)}
                  >
                    <span className="document-catalog-marker" aria-hidden>
                      <FileText size={16} />
                    </span>
                    <span className="job-name-stack">
                      <span className="job-row-name" title={item.title}>
                        {item.title}
                      </span>
                      <span className="job-mobile-meta">
                        {documentStatusLabel(item)}
                        {publishedAtLabel(item)
                          ? ` - ${publishedAtLabel(item)}`
                          : ""}
                        {" - "}
                        {formatsLabel(item.accepted_formats)}
                      </span>
                    </span>
                  </button>
                  <span
                    className="job-department-cell document-description-cell"
                    title={item.description}
                  >
                    {item.description || "No description"}
                  </span>
                  <span className="job-department-cell">
                    <span
                      className="list-chip"
                      data-tone={documentStatusLabel(item) === "Published" ? "green" : "gray"}
                    >
                      {documentStatusLabel(item)}
                    </span>
                  </span>
                  <span className="job-department-cell">
                    {publishedAtLabel(item) ? (
                      // BL-856: the cell cuts the time off; hovering reads it whole.
                      <time
                        dateTime={item.published_at ?? undefined}
                        title={publishedAtLabel(item)}
                      >
                        {publishedAtLabel(item)}
                      </time>
                    ) : (
                      "-"
                    )}
                  </span>
                  {canManage ? (
                    <CatalogRowMenu name={item.title}>
                      <button
                        type="button"
                        disabled={saveMutation.isPending || applyBusy}
                        onClick={() => openEditor(item)}
                      >
                        {item.publication_status === "published"
                          ? "View document type"
                          : "Edit document type"}
                      </button>
                      {!item.archived_at && item.publication_status && (
                        <button
                          type="button"
                          onClick={() => setPublication(item)}
                        >
                          {item.publication_status === "published"
                            ? "Unpublish"
                            : "Publish"}
                        </button>
                      )}
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
                      <DocumentArchiveButton
                        workspaceId={workspaceId}
                        item={item}
                        disabled={archiveMutation.isPending}
                        onToggle={() =>
                          archiveMutation.mutate({
                            id: item.id,
                            archived: !item.archived_at,
                          })
                        }
                      />
                    </CatalogRowMenu>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

// Archiving a published document does what Unpublish does (BL-821, Mert
// 2026-10-19): the confirming click says how many people stop being asked.
function DocumentArchiveButton({
  workspaceId,
  item,
  disabled,
  onToggle,
}: {
  workspaceId: string;
  item: DocumentType;
  disabled: boolean;
  onToggle: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const published = !item.archived_at && item.publication_status === "published";
  const impact = useQuery({
    queryKey: ["document-types", workspaceId, "archive-impact", item.id],
    queryFn: () => previewDocumentPublication(workspaceId, item.id),
    enabled: armed && published,
    staleTime: 0,
  });
  const stopped =
    impact.data?.employees.filter((person) => person.action === "pause").length ?? 0;
  return (
    <CatalogArchiveButton
      archived={Boolean(item.archived_at)}
      disabled={disabled}
      confirmLabel={
        published && stopped > 0
          ? `Confirm archive: stops it for ${stopped} ${stopped === 1 ? "person" : "people"}`
          : undefined
      }
      onArmedChange={setArmed}
      onToggle={onToggle}
    />
  );
}

function documentRequirementKey(item: DocumentType): RequirementFilter {
  if (item.lifecycle_settings?.mode === "conditional") return "conditional";
  return item.required_at_onboarding ? "required" : "optional";
}

function documentStatusLabel(item: DocumentType): string {
  if (item.archived_at) return "Archived";
  return item.publication_status === "published" ? "Published" : "Draft";
}

// Publication keeps published_at on unpublish, so a republish shows the newest
// time while a draft shows none.
function publishedAtLabel(item: DocumentType): string {
  if (item.publication_status !== "published" || !item.published_at) return "";
  return new Date(item.published_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function compareDocument(
  a: DocumentType,
  b: DocumentType,
  key: SortKey,
): number {
  const tiebreak = (): number =>
    a.title.localeCompare(b.title, undefined, {
      sensitivity: "base",
      numeric: true,
    }) || a.id.localeCompare(b.id);
  if (key === "title" || key === "description")
    return (
      a[key].localeCompare(b[key], undefined, {
        sensitivity: "base",
        numeric: true,
      }) || tiebreak()
    );
  if (key === "publication_status")
    return (
      documentStatusLabel(a).localeCompare(documentStatusLabel(b)) || tiebreak()
    );
  return (
    (b.published_at ?? "").localeCompare(a.published_at ?? "") || tiebreak()
  );
}
