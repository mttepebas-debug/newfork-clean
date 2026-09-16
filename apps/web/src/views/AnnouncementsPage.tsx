import {
  announcementInputSchema,
  type AnnouncementInput,
  type AnnouncementList,
  type AnnouncementRecord,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  Megaphone,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { safeAppActionUrl } from "../communications/action-url";
import {
  acknowledgeAnnouncement,
  getAnnouncements,
  saveAnnouncement,
  transitionAnnouncement,
} from "../communications/communications-data";
import { CatalogDrawer } from "../settings/CatalogDrawer";
import { CatalogRowMenu } from "../settings/CatalogRowMenu";
import { CatalogSortButton } from "./CatalogSortButton";
import { CatalogPageHeader } from "./CatalogPageHeader";
import "../settings/jobs-settings.css";
import "./announcements-catalog.css";

type StatusFilter = "all" | "draft" | "scheduled" | "published";
type SortKey = "title" | "audience" | "author" | "status" | "date";
type Option = { id: string; name: string };
const roles = ["owner", "admin", "manager", "employee"] as const;
const roleOptions = roles.map((id) => ({ id, name: capitalize(id) }));

export function AnnouncementsPage() {
  const { context } = useAuth();
  const { announcementId } = useParams();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [locationId, setLocationId] = useState("");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: "date",
    descending: true,
  });
  const [message, setMessage] = useState("");
  const workspaceId = context?.workspace.id ?? "";
  const query = useQuery({
    queryKey: ["announcements", workspaceId],
    queryFn: () => getAnnouncements(workspaceId),
    enabled: Boolean(workspaceId),
  });
  // Employees only follow published updates addressed to them (read-only).
  const reader = query.data ? !query.data.can_manage : false;
  const selected = query.data?.announcements.find(
    (item) => item.id === announcementId,
  );
  const visible = useMemo(() => {
    const value = (item: AnnouncementRecord) =>
      sort.key === "date"
        ? (item.publish_at ?? item.created_at)
        : sort.key === "audience"
          ? audienceLabel(item)
          : sort.key === "author"
            ? item.author_name
            : sort.key === "status" && reader
              ? (item.acknowledged_at ?? "")
              : item[sort.key];
    return (query.data?.announcements ?? [])
      .filter(
        (item) =>
          (showArchived ? isArchived(item) : !isArchived(item)) &&
          (showArchived || filter === "all" || item.status === filter) &&
          (!locationId || item.location_ids.includes(locationId)) &&
          `${item.title} ${item.body} ${audienceLabel(item)}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      )
      .sort(
        (a, b) =>
          (String(value(a)).localeCompare(String(value(b)), undefined, {
            numeric: true,
            sensitivity: "base",
          }) || a.id.localeCompare(b.id)) * (sort.descending ? -1 : 1),
      );
  }, [query.data, filter, locationId, search, showArchived, sort, reader]);
  const locationOptions = reader
    ? [
        ...new Map(
          (query.data?.announcements ?? []).flatMap((item) =>
            item.location_ids.map(
              (id, index) =>
                [id, { id, name: item.location_names[index] ?? id }] as const,
            ),
          ),
        ).values(),
      ]
    : (query.data?.locations ?? []);
  const activeStatusCounts = useMemo(
    () =>
      (query.data?.announcements ?? []).reduce(
        (counts, item) => {
          if (!isArchived(item) && item.status in counts) {
            counts[item.status as keyof typeof counts] += 1;
          }
          return counts;
        },
        { draft: 0, scheduled: 0 },
      ),
    [query.data?.announcements],
  );
  const close = () => {
    setAdding(false);
    if (announcementId)
      navigate("/app/announcements", {
        replace: true,
        preventScrollReset: true,
      });
  };
  const open = (item: AnnouncementRecord) =>
    navigate(`/app/announcements/${item.id}`, { preventScrollReset: true });

  return (
    <section
      className="settings-page jobs-settings-page announcements-page announcements-catalog-page"
      aria-labelledby="announcements-title"
    >
      <CatalogPageHeader
        eyebrow="THE RIGHT UPDATE. THE RIGHT PEOPLE."
        title="Announcements"
        titleId="announcements-title"
        description={
          query.data?.can_manage
            ? "Create, schedule, and publish updates for the right teams."
            : "Updates your managers have shared with your team."
        }
        action={
          query.data?.can_manage ? (
            <Button
              className="job-primary-button"
              onClick={() => setAdding(true)}
            >
              <Plus size={16} aria-hidden />
              Add announcement
            </Button>
          ) : null
        }
      />
      <div className="job-catalog-toolbar catalog-toolbar">
        {!reader && (
          <div className="announcement-toolbar-controls catalog-toolbar-status-row">
            <div
              className="catalog-status-tabs"
              role="tablist"
              aria-label="Announcement status"
            >
              {(["all", "draft", "scheduled", "published"] as const)
                .filter(
                  (value) =>
                    query.data?.can_manage ||
                    value === "all" ||
                    value === "published",
                )
                .map((value) => {
                  const count =
                    value === "draft" || value === "scheduled"
                      ? activeStatusCounts[value]
                      : 0;
                  return (
                    <button
                      type="button"
                      key={value}
                      role="tab"
                      aria-selected={!showArchived && filter === value}
                      aria-label={
                        count
                          ? `${capitalize(value)} (${count})`
                          : capitalize(value)
                      }
                      className={
                        !showArchived && filter === value ? "active" : ""
                      }
                      onClick={() => {
                        setShowArchived(false);
                        setFilter(value);
                      }}
                    >
                      <span>{capitalize(value)}</span>
                      {count ? (
                        <span
                          className="announcement-status-tab-count"
                          aria-hidden="true"
                        >
                          {count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              {query.data?.can_manage && (
                <button
                  type="button"
                  role="tab"
                  className={showArchived ? "active" : ""}
                  aria-selected={showArchived}
                  onClick={() => setShowArchived(true)}
                >
                  <Archive size={14} aria-hidden />
                  Archived
                </button>
              )}
            </div>
          </div>
        )}
        <div className="catalog-toolbar-filter-row">
          <select
            className="toolbar-filter-select"
            aria-label="Filter announcements by location"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">All locations</option>
            {locationOptions.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          <label className="job-search toolbar-search">
            <Search size={16} aria-hidden />
            <input
              aria-label="Search announcements"
              placeholder="Search announcements"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
      </div>
      {message && (
        <p className="announcement-catalog-message" role="status">
          {message}
        </p>
      )}
      {query.isLoading && (
        <p className="settings-state">Loading announcements...</p>
      )}
      {query.error && (
        <p className="settings-state error" role="alert">
          {query.error.message}
        </p>
      )}
      {!query.isLoading && !query.error && (
        <>
          <div className="job-catalog" role="table" aria-label="Announcements">
            <div
              className="job-column-headings catalog-column-headings announcement-catalog-row"
              data-reader={reader}
              role="row"
            >
              {(reader
                ? ([
                    ["title", "Announcement"],
                    ["date", "Published date"],
                    ["author", "Published by"],
                    ["status", "Status"],
                  ] as const)
                : ([
                    ["title", "Announcement"],
                    ["audience", "Audience"],
                    ["status", "Status"],
                    ["date", "Publish date"],
                  ] as const)
              ).map(([key, label]) => (
                <div
                  key={key}
                  role="columnheader"
                  aria-sort={
                    sort.key === key
                      ? sort.descending
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  <CatalogSortButton
                    label={label}
                    active={sort.key === key}
                    onClick={() =>
                      setSort({
                        key,
                        descending: sort.key === key ? !sort.descending : false,
                      })
                    }
                  />
                </div>
              ))}
              <span role="columnheader" aria-label="Actions" />
            </div>
            {visible.length ? (
              visible.map((item) => (
                <div
                  className="job-catalog-row announcement-catalog-row"
                  role="row"
                  key={item.id}
                  data-archived={isArchived(item)}
                  data-reader={reader}
                  onClick={(event) => {
                    if (
                      !(event.target as HTMLElement).closest("button,details,a")
                    ) {
                      event.currentTarget
                        .querySelector<HTMLButtonElement>(".job-row-identity")
                        ?.focus({ preventScroll: true });
                      open(item);
                    }
                  }}
                >
                  <div role="cell">
                    <button
                      className="job-row-identity"
                      type="button"
                      onClick={() => open(item)}
                    >
                      <Megaphone
                        size={17}
                        className="announcement-catalog-marker"
                        aria-hidden
                      />
                      <span className="job-name-stack">
                        <span className="job-row-name" title={item.title}>
                          {item.title}
                        </span>
                        <span
                          className="announcement-row-preview"
                          title={item.body}
                        >
                          {item.body}
                        </span>
                        <span className="job-mobile-meta">
                          {reader ? item.author_name : statusLabel(item)} ·{" "}
                          {formatDate(item.publish_at ?? item.created_at)}
                        </span>
                      </span>
                    </button>
                  </div>
                  {reader ? (
                    <>
                      <span role="cell" className="announcement-date-cell">
                        {formatDate(
                          item.published_at ??
                            item.publish_at ??
                            item.created_at,
                        )}
                      </span>
                      <span
                        role="cell"
                        className="announcement-audience-cell"
                        title={item.author_name}
                      >
                        {item.author_name}
                      </span>
                      <span role="cell" className="announcement-status-cell">
                        <AcknowledgeControl
                          item={item}
                          workspaceId={workspaceId}
                        />
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        role="cell"
                        className="announcement-audience-cell"
                        title={audienceLabel(item)}
                      >
                        {audienceLabel(item)}
                      </span>
                      <span role="cell" className="announcement-status-cell">
                        <span
                          className="announcement-status"
                          data-status={
                            isArchived(item) ? "archived" : item.status
                          }
                        >
                          {statusLabel(item)}
                        </span>
                      </span>
                      <span role="cell" className="announcement-date-cell">
                        {item.publish_at
                          ? formatDate(item.publish_at)
                          : "Not published"}
                      </span>
                    </>
                  )}
                  <div role="cell">
                    <CatalogRowMenu name={item.title}>
                      <button type="button" onClick={() => open(item)}>
                        {item.can_edit
                          ? "Edit announcement"
                          : "View announcement"}
                      </button>
                      {item.can_cancel && !isArchived(item) && (
                        <button
                          type="button"
                          className="job-danger-text"
                          onClick={() =>
                            navigate(`/app/announcements/${item.id}?delete=1`, {
                              preventScrollReset: true,
                            })
                          }
                        >
                          Delete
                        </button>
                      )}
                    </CatalogRowMenu>
                  </div>
                </div>
              ))
            ) : (
              <div className="settings-empty">
                <Megaphone size={22} aria-hidden />
                <strong>
                  {search || filter !== "all" || locationId || showArchived
                    ? "No matching announcements"
                    : "No announcements yet"}
                </strong>
                <p>
                  {search || filter !== "all" || locationId || showArchived
                    ? "Try another search or status."
                    : reader
                      ? "Updates your managers share with your locations will appear here."
                      : "Create an announcement to share an update with your team."}
                </p>
              </div>
            )}
          </div>
        </>
      )}
      {announcementId && !selected && !query.isLoading && !query.error && (
        <p className="settings-state">
          This announcement is no longer available.
        </p>
      )}
      {query.data && (adding || selected) && (
        <AnnouncementEditor
          key={adding ? "new" : selected!.id}
          item={adding ? null : selected!}
          model={query.data}
          workspaceId={workspaceId}
          onClose={close}
          onDone={setMessage}
        />
      )}
    </section>
  );
}

function draftFrom(item: AnnouncementRecord | null): AnnouncementInput {
  return {
    title: item?.title ?? "",
    body: item?.body ?? "",
    category: item?.category ?? "general",
    audience_roles:
      item?.audience_roles.length === 4
        ? []
        : [...(item?.audience_roles ?? [])],
    location_ids: [...(item?.location_ids ?? [])],
    department_ids: [...(item?.department_ids ?? [])],
    job_ids: [...(item?.job_ids ?? [])],
    publish_at: item?.publish_at ?? null,
    expires_at: item?.expires_at ?? null,
    action_url: item?.action_url ?? null,
  };
}
function comparable(draft: AnnouncementInput) {
  return JSON.stringify({
    ...draft,
    title: draft.title.trim(),
    body: draft.body.trim(),
    action_url: draft.action_url?.trim() || null,
    audience_roles:
      draft.audience_roles.length === 4 ? [] : [...draft.audience_roles].sort(),
    location_ids: [...draft.location_ids].sort(),
    department_ids: [...(draft.department_ids ?? [])].sort(),
    job_ids: [...(draft.job_ids ?? [])].sort(),
  });
}
function AnnouncementEditor({
  item,
  model,
  workspaceId,
  onClose,
  onDone,
}: {
  item: AnnouncementRecord | null;
  model: AnnouncementList;
  workspaceId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [initialItem] = useState(item);
  const [baseline] = useState(() => draftFrom(item));
  const [draft, setDraft] = useState(baseline);
  const [confirmDelete, setConfirmDelete] = useState(() =>
    new URLSearchParams(window.location.search).has("delete"),
  );
  const editable = item ? item.can_edit : model.can_manage;
  const changed = comparable(draft) !== comparable(baseline);
  const parsed = announcementInputSchema.safeParse(draft);
  const refresh = async () => {
    await Promise.all(
      ["announcements", "notifications", "workspace-dashboard"].map((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    );
  };
  const save = useMutation({
    mutationFn: () =>
      saveAnnouncement(workspaceId, {
        announcement_id: item?.id ?? null,
        expected_revision: initialItem?.revision ?? null,
        announcement: announcementInputSchema.parse(draft),
      }),
    onSuccess: async () => {
      await refresh();
      onDone(
        item?.status === "scheduled"
          ? "Scheduled announcement updated."
          : "Announcement saved as a draft.",
      );
      onClose();
    },
  });
  const transition = useMutation({
    mutationFn: (action: "publish" | "cancel") =>
      transitionAnnouncement(
        workspaceId,
        item!.id,
        action,
        initialItem!.revision,
      ),
    onSuccess: async (result, action) => {
      await refresh();
      onDone(
        action === "cancel"
          ? "Announcement deleted and archived."
          : `${capitalize(result.status)} for ${result.recipient_count} recipients.`,
      );
      onClose();
    },
  });
  const busy = save.isPending || transition.isPending;
  const canSave = editable && parsed.success && (!item || changed) && !busy;
  const canDelete = item && item.can_cancel && !isArchived(item);
  const actionUrl = safeAppActionUrl(item?.action_url ?? null);
  const update = <K extends keyof AnnouncementInput>(
    key: K,
    value: AnnouncementInput[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <CatalogDrawer
      label={
        item
          ? editable
            ? "Edit announcement"
            : "Announcement"
          : "Add announcement"
      }
      className="announcements-catalog-page"
      onClose={onClose}
      busy={busy}
    >
      <form
        className="job-catalog-editor"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave && !confirmDelete) save.mutate();
        }}
      >
        <div className="job-editor-title">
          <div>
            <h2>
              {item
                ? editable
                  ? "Edit announcement"
                  : "Announcement"
                : "New announcement"}
            </h2>
            <p>
              {item
                ? `${statusLabel(item)} · ${item.author_name}`
                : "Write your update and choose who receives it."}
            </p>
          </div>
          <button
            className="job-icon-button"
            type="button"
            aria-label="Close announcement"
            disabled={busy}
            onClick={onClose}
          >
            <X size={17} aria-hidden />
          </button>
        </div>
        <div className="catalog-drawer-body">
          <fieldset
            className="announcement-catalog-fields"
            disabled={busy || !editable}
          >
            <label className="job-field announcement-field-wide">
              <span>Title</span>
              <input
                required
                maxLength={120}
                value={draft.title}
                placeholder="What is the update about?"
                onChange={(event) => update("title", event.target.value)}
              />
            </label>
            <label className="job-field announcement-field-wide">
              <span>Message</span>
              <textarea
                required
                rows={3}
                maxLength={5000}
                value={draft.body}
                placeholder="Share the details your team needs."
                onChange={(event) => {
                  update("body", event.target.value);
                  event.target.style.height = "auto";
                  event.target.style.height = `${event.target.scrollHeight}px`;
                }}
                ref={(element) => {
                  if (element) {
                    element.style.height = "auto";
                    element.style.height = `${element.scrollHeight}px`;
                  }
                }}
              />
            </label>
            <label className="job-field">
              <span>Category</span>
              <select
                value={draft.category}
                onChange={(event) =>
                  update(
                    "category",
                    event.target.value as AnnouncementInput["category"],
                  )
                }
              >
                <option value="general">General</option>
                <option value="operations">Operations</option>
                <option value="schedule">Schedule</option>
              </select>
            </label>
            <label className="job-field">
              <span>
                Publish at <small>Optional</small>
              </span>
              <input
                type="datetime-local"
                value={toLocalInput(draft.publish_at)}
                onChange={(event) =>
                  update("publish_at", toIso(event.target.value))
                }
              />
            </label>
            <label className="job-field">
              <span>
                Expires at <small>Optional</small>
              </span>
              <input
                type="datetime-local"
                value={toLocalInput(draft.expires_at)}
                onChange={(event) =>
                  update("expires_at", toIso(event.target.value))
                }
              />
            </label>
          </fieldset>
          <section
            className="announcement-audience-section"
            aria-label="Audience"
          >
            <div className="announcement-audience-heading">
              <h3>Audience</h3>
              <span className="announcement-all-badge">
                {!draft.audience_roles.length &&
                !draft.location_ids.length &&
                !draft.department_ids?.length &&
                !draft.job_ids?.length
                  ? "Everyone"
                  : "Filtered audience"}
              </span>
            </div>
            <p>
              Leave a filter on All to include everyone in that group. Selected
              filters apply together.
            </p>
            <div className="announcement-audience-grid">
              <AudiencePicker
                label="Roles"
                options={roleOptions}
                selected={draft.audience_roles}
                disabled={busy || !editable}
                onChange={(ids) =>
                  update(
                    "audience_roles",
                    ids as AnnouncementInput["audience_roles"],
                  )
                }
              />
              <AudiencePicker
                label="Locations"
                options={withExisting(
                  model.locations,
                  item?.location_ids,
                  item?.location_names,
                )}
                selected={draft.location_ids}
                disabled={busy || !editable}
                onChange={(ids) => update("location_ids", ids)}
              />
              <AudiencePicker
                label="Departments"
                options={withExisting(
                  model.departments ?? [],
                  item?.department_ids,
                  item?.department_names,
                )}
                selected={draft.department_ids ?? []}
                disabled={busy || !editable}
                onChange={(ids) => update("department_ids", ids)}
              />
              <AudiencePicker
                label="Jobs"
                options={withExisting(
                  model.jobs ?? [],
                  item?.job_ids,
                  item?.job_names,
                )}
                selected={draft.job_ids ?? []}
                disabled={busy || !editable}
                onChange={(ids) => update("job_ids", ids)}
              />
            </div>
          </section>
          {!editable && actionUrl && (
            <button
              className="job-text-button"
              type="button"
              onClick={() => navigate(actionUrl)}
            >
              Open related page
            </button>
          )}
          {changed && item?.can_publish && (
            <p className="announcement-catalog-hint">
              Save your changes before publishing.
            </p>
          )}
          {(save.error || transition.error) && (
            <p className="form-error" role="alert">
              {save.error?.message ?? transition.error?.message}
            </p>
          )}
        </div>
        <div className="job-editor-footer">
          {canDelete ? (
            <div className="catalog-delete-action">
              <button
                className="catalog-delete-trigger"
                type="button"
                aria-label={
                  confirmDelete ? "Confirm delete announcement" : "Delete"
                }
                title={confirmDelete ? "Click again to delete" : undefined}
                data-confirming={confirmDelete}
                disabled={busy}
                onClick={() => {
                  if (confirmDelete) {
                    transition.mutate("cancel");
                    return;
                  }
                  setConfirmDelete(true);
                }}
              >
                {transition.isPending ? (
                  "Deleting..."
                ) : confirmDelete ? (
                  <>
                    <CheckCircle2 size={14} aria-hidden />
                    Click again to delete
                  </>
                ) : (
                  <>
                    <Trash2 size={14} aria-hidden />
                    Delete
                  </>
                )}
              </button>
            </div>
          ) : null}
          <div className="job-editor-actions">
            <Button
              className="job-secondary-button"
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              {editable ? "Cancel" : "Close"}
            </Button>
            {item && !editable && item.status !== "draft" && (
              <AcknowledgeControl item={item} workspaceId={workspaceId} />
            )}
            {item?.can_publish && !confirmDelete && (
              <Button
                className="job-secondary-button"
                type="button"
                disabled={busy || changed}
                onClick={() => transition.mutate("publish")}
              >
                <Send size={14} aria-hidden />
                {item.publish_at && Date.parse(item.publish_at) > Date.now()
                  ? "Schedule"
                  : "Publish"}
              </Button>
            )}
            {editable && (
              <Button
                className="job-primary-button"
                type="submit"
                disabled={!canSave || confirmDelete}
              >
                {save.isPending
                  ? "Saving..."
                  : item
                    ? "Save changes"
                    : "Save draft"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </CatalogDrawer>
  );
}

function AcknowledgeControl({
  item,
  workspaceId,
}: {
  item: AnnouncementRecord;
  workspaceId: string;
}) {
  const client = useQueryClient();
  const acknowledge = useMutation({
    mutationFn: () => acknowledgeAnnouncement(workspaceId, item.id),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["announcements", workspaceId] }),
  });
  if (item.acknowledged_at)
    return (
      <span
        className="announcement-acknowledged"
        role="img"
        aria-label="Acknowledged"
        title={`Acknowledged ${formatDate(item.acknowledged_at)}`}
      >
        <CheckCircle2 size={18} aria-hidden />
      </span>
    );
  return (
    <button
      type="button"
      className="announcement-acknowledge-button"
      disabled={acknowledge.isPending}
      title={acknowledge.error?.message}
      onClick={() => acknowledge.mutate()}
    >
      {acknowledge.isPending ? "Saving..." : "Acknowledge"}
    </button>
  );
}

function AudiencePicker({
  label,
  options,
  selected,
  disabled,
  onChange,
}: {
  label: string;
  options: readonly Option[];
  selected: readonly string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const visible = options.filter((option) =>
    option.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const selectedNames = options
    .filter((option) => selected.includes(option.id))
    .map((option) => option.name)
    .join(", ");
  return (
    <details
      className="announcement-audience-picker"
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary>
        <span>
          <strong>{label}</strong>
          <span className="announcement-picker-value" title={selectedNames}>
            {selected.length
              ? selectedNames || `${selected.length} selected`
              : `All ${label.toLowerCase()}`}
          </span>
        </span>
        <span className="announcement-all-badge">
          {selected.length || "All"}
        </span>
        <ChevronDown size={14} aria-hidden />
      </summary>
      <div className="announcement-picker-content">
        {options.length > 6 && (
          <label className="announcement-picker-search">
            <Search size={14} aria-hidden />
            <input
              aria-label={`Search ${label.toLowerCase()}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
            />
          </label>
        )}
        <div className="announcement-picker-options">
          <label className="announcement-all-option">
            <input
              type="checkbox"
              checked={!selected.length}
              disabled={disabled}
              onChange={() => onChange([])}
            />
            <span>All {label.toLowerCase()}</span>
          </label>
          {visible.map((option) => (
            <label key={option.id}>
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                disabled={disabled}
                onChange={() =>
                  onChange(
                    selected.includes(option.id)
                      ? selected.filter((id) => id !== option.id)
                      : [...selected, option.id],
                  )
                }
              />
              <span title={option.name}>{option.name}</span>
            </label>
          ))}
          {!visible.length && (
            <p>{options.length ? "No matches" : "No options available"}</p>
          )}
        </div>
      </div>
    </details>
  );
}
function withExisting(
  options: readonly Option[],
  ids: readonly string[] = [],
  names: readonly string[] = [],
): Option[] {
  return [
    ...options,
    ...ids
      .filter((id) => !options.some((option) => option.id === id))
      .map((id) => ({
        id,
        name: names[ids.indexOf(id)] ?? "Archived selection",
      })),
  ];
}
function audienceLabel(item: AnnouncementRecord) {
  const labels = [
    item.audience_roles.length && item.audience_roles.length < 4
      ? item.audience_roles.map(capitalize).join(", ")
      : "All roles",
    item.location_names.length
      ? item.location_names.join(", ")
      : "All locations",
    item.department_names?.length
      ? item.department_names.join(", ")
      : "All departments",
    item.job_names?.length ? item.job_names.join(", ") : "All jobs",
  ];
  return labels.join(" · ");
}
function isArchived(item: AnnouncementRecord) {
  return Boolean(item.archived_at) || item.status === "cancelled";
}
function statusLabel(item: AnnouncementRecord) {
  return isArchived(item) ? "Archived" : capitalize(item.status);
}
function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}
export default AnnouncementsPage;
