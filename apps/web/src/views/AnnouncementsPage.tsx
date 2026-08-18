import type {
  AnnouncementAudienceRole,
  AnnouncementInput,
  AnnouncementRecord,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Megaphone, Pencil, Plus, Send, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  getAnnouncements,
  saveAnnouncement,
  transitionAnnouncement,
} from "../communications/communications-data";

type StatusFilter = "active" | "draft" | "scheduled" | "cancelled" | "all";

export function AnnouncementsPage() {
  const { context } = useAuth();
  const { announcementId } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [editor, setEditor] = useState<AnnouncementRecord | "new" | null>(null);
  const [message, setMessage] = useState("");
  const workspaceId = context?.workspace.id ?? "";
  const query = useQuery({
    queryKey: ["announcements", workspaceId],
    queryFn: () => getAnnouncements(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const transition = useMutation({
    mutationFn: ({
      item,
      action,
    }: {
      item: AnnouncementRecord;
      action: "publish" | "cancel";
    }) => transitionAnnouncement(workspaceId, item.id, action, item.revision),
    onSuccess: async (result) => {
      setMessage(
        result.status === "cancelled"
          ? "Announcement cancelled."
          : `Announcement ${result.status} for ${result.recipient_count} recipients.`,
      );
      await client.invalidateQueries({ queryKey: ["announcements"] });
      await client.invalidateQueries({ queryKey: ["notifications"] });
      await client.invalidateQueries({ queryKey: ["workspace-dashboard"] });
    },
  });
  const selected =
    query.data?.announcements.find((item) => item.id === announcementId) ??
    null;
  const visible = useMemo(() => {
    const items = query.data?.announcements ?? [];
    if (filter === "all") return items;
    if (filter === "active") {
      return items.filter(
        (item) =>
          item.status === "published" ||
          (item.status === "scheduled" &&
            item.publish_at !== null &&
            Date.parse(item.publish_at) <= Date.now()),
      );
    }
    if (filter === "scheduled") {
      return items.filter(
        (item) =>
          item.status === "scheduled" &&
          item.publish_at !== null &&
          Date.parse(item.publish_at) > Date.now(),
      );
    }
    return items.filter((item) => item.status === filter);
  }, [filter, query.data?.announcements]);

  if (query.isLoading)
    return <AnnouncementState text="Loading announcements..." />;
  if (query.error || !query.data)
    return (
      <AnnouncementState
        text={
          query.error instanceof Error
            ? query.error.message
            : "Announcements unavailable"
        }
        error
      />
    );
  const model = query.data;

  return (
    <section
      className="announcements-page"
      aria-labelledby="announcements-title"
    >
      <header className="communications-header">
        <div>
          <p>Communication</p>
          <h1 id="announcements-title">Announcements</h1>
          <span>Publish clear updates to the right roles and locations.</span>
        </div>
        {model.can_manage ? (
          <button
            className="nf-button"
            type="button"
            onClick={() => setEditor("new")}
          >
            <Plus size={16} aria-hidden /> New announcement
          </button>
        ) : null}
      </header>
      <div
        className="communication-filters"
        role="tablist"
        aria-label="Announcement status"
      >
        {(["active", "draft", "scheduled", "cancelled", "all"] as const).map(
          (value) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
            >
              {value[0]!.toUpperCase() + value.slice(1)}
            </button>
          ),
        )}
      </div>
      {message ? (
        <p className="communication-message" role="status">
          {message}
        </p>
      ) : null}
      {transition.error ? (
        <p className="communication-error" role="alert">
          {transition.error.message}
        </p>
      ) : null}
      <div className="announcement-layout">
        <div className="announcement-list" aria-label="Announcements">
          {visible.length ? (
            visible.map((item) => (
              <button
                className={selected?.id === item.id ? "active" : ""}
                key={item.id}
                type="button"
                onClick={() => navigate(`/app/announcements/${item.id}`)}
              >
                <span className={`announcement-category ${item.category}`}>
                  <Megaphone size={16} aria-hidden />
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {audienceLabel(item)} ·{" "}
                    {formatDate(item.publish_at ?? item.created_at)}
                  </small>
                </span>
                <i data-status={item.status}>{item.status}</i>
              </button>
            ))
          ) : (
            <p className="communication-empty">
              No announcements in this view.
            </p>
          )}
        </div>
        <article className="announcement-detail">
          {selected ? (
            <>
              <header>
                <div>
                  <span
                    className={`announcement-category ${selected.category}`}
                  >
                    <Megaphone size={18} aria-hidden />
                  </span>
                  <div>
                    <p>{selected.category}</p>
                    <h2>{selected.title}</h2>
                  </div>
                </div>
                {selected.can_edit ? (
                  <button
                    className="icon-button"
                    aria-label="Edit announcement"
                    onClick={() => setEditor(selected)}
                  >
                    <Pencil size={17} aria-hidden />
                  </button>
                ) : null}
              </header>
              <p className="announcement-body">{selected.body}</p>
              <dl className="announcement-meta">
                <div>
                  <dt>Status</dt>
                  <dd>{selected.status}</dd>
                </div>
                <div>
                  <dt>Audience</dt>
                  <dd>{audienceLabel(selected)}</dd>
                </div>
                <div>
                  <dt>Author</dt>
                  <dd>{selected.author_name}</dd>
                </div>
                <div>
                  <dt>Published</dt>
                  <dd>
                    {selected.publish_at
                      ? formatDate(selected.publish_at)
                      : "Not published"}
                  </dd>
                </div>
              </dl>
              {selected.action_url ? (
                <button
                  className="text-action"
                  onClick={() => navigate(selected.action_url!)}
                >
                  Open related page
                </button>
              ) : null}
              {selected.can_publish || selected.can_cancel ? (
                <footer>
                  {selected.can_cancel ? (
                    <button
                      className="nf-button secondary"
                      disabled={transition.isPending}
                      onClick={() =>
                        transition.mutate({ item: selected, action: "cancel" })
                      }
                    >
                      Cancel announcement
                    </button>
                  ) : null}
                  {selected.can_publish ? (
                    <button
                      className="nf-button"
                      disabled={transition.isPending}
                      onClick={() =>
                        transition.mutate({ item: selected, action: "publish" })
                      }
                    >
                      {selected.publish_at &&
                      Date.parse(selected.publish_at) > Date.now() ? (
                        <CalendarClock size={16} />
                      ) : (
                        <Send size={16} />
                      )}
                      {selected.publish_at &&
                      Date.parse(selected.publish_at) > Date.now()
                        ? "Schedule"
                        : "Publish now"}
                    </button>
                  ) : null}
                </footer>
              ) : null}
            </>
          ) : (
            <div className="announcement-placeholder">
              <Megaphone size={28} aria-hidden />
              <h2>Select an announcement</h2>
              <p>Open an item to review its audience, status, and content.</p>
            </div>
          )}
        </article>
      </div>
      {editor ? (
        <AnnouncementEditor
          item={editor === "new" ? null : editor}
          locations={model.locations}
          onClose={() => setEditor(null)}
          onSaved={async (id) => {
            setEditor(null);
            setMessage("Draft saved.");
            await client.invalidateQueries({ queryKey: ["announcements"] });
            navigate(`/app/announcements/${id}`);
          }}
          workspaceId={workspaceId}
        />
      ) : null}
    </section>
  );
}

function AnnouncementEditor({
  item,
  locations,
  workspaceId,
  onClose,
  onSaved,
}: {
  item: AnnouncementRecord | null;
  locations: readonly { id: string; name: string }[];
  workspaceId: string;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AnnouncementInput>(() =>
    item
      ? {
          title: item.title,
          body: item.body,
          category: item.category,
          audience_roles: item.audience_roles,
          location_ids: item.location_ids,
          publish_at: item.publish_at,
          expires_at: item.expires_at,
          action_url: item.action_url,
        }
      : {
          title: "",
          body: "",
          category: "general",
          audience_roles: ["employee"],
          location_ids: [],
          publish_at: null,
          expires_at: null,
          action_url: null,
        },
  );
  const mutation = useMutation({
    mutationFn: () =>
      saveAnnouncement(workspaceId, {
        announcement_id: item?.id ?? null,
        expected_revision: item?.revision ?? null,
        announcement: draft,
      }),
    onSuccess: (result) => void onSaved(result.announcement_id),
  });
  const toggleRole = (role: AnnouncementAudienceRole) =>
    setDraft((current) => ({
      ...current,
      audience_roles: current.audience_roles.includes(role)
        ? current.audience_roles.filter((value) => value !== role)
        : [...current.audience_roles, role],
    }));
  const toggleLocation = (id: string) =>
    setDraft((current) => ({
      ...current,
      location_ids: current.location_ids.includes(id)
        ? current.location_ids.filter((value) => value !== id)
        : [...current.location_ids, id],
    }));
  return (
    <div className="communication-dialog-layer">
      <button
        className="communication-backdrop"
        aria-label="Close announcement editor"
        onClick={onClose}
      />
      <form
        className="announcement-editor"
        role="dialog"
        aria-labelledby="announcement-editor-title"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <header>
          <div>
            <p>Announcement</p>
            <h2 id="announcement-editor-title">
              {item ? "Edit draft" : "New draft"}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <label>
          Title
          <input
            value={draft.title}
            maxLength={120}
            required
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </label>
        <label>
          Message
          <textarea
            value={draft.body}
            maxLength={5000}
            required
            rows={8}
            onChange={(event) =>
              setDraft({ ...draft, body: event.target.value })
            }
          />
        </label>
        <div className="announcement-form-grid">
          <label>
            Category
            <select
              value={draft.category}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  category: event.target.value as AnnouncementInput["category"],
                })
              }
            >
              <option value="general">General</option>
              <option value="operations">Operations</option>
              <option value="schedule">Schedule</option>
            </select>
          </label>
          <label>
            Related page
            <input
              value={draft.action_url ?? ""}
              placeholder="/app/schedule"
              onChange={(event) =>
                setDraft({ ...draft, action_url: event.target.value || null })
              }
            />
          </label>
          <label>
            Publish at
            <input
              type="datetime-local"
              value={toLocalInput(draft.publish_at)}
              onChange={(event) =>
                setDraft({ ...draft, publish_at: toIso(event.target.value) })
              }
            />
          </label>
          <label>
            Expires at
            <input
              type="datetime-local"
              value={toLocalInput(draft.expires_at)}
              onChange={(event) =>
                setDraft({ ...draft, expires_at: toIso(event.target.value) })
              }
            />
          </label>
        </div>
        <fieldset>
          <legend>Roles</legend>
          <div className="announcement-options">
            {(["owner", "admin", "manager", "employee"] as const).map(
              (role) => (
                <label key={role}>
                  <input
                    type="checkbox"
                    checked={draft.audience_roles.includes(role)}
                    onChange={() => toggleRole(role)}
                  />{" "}
                  {role}
                </label>
              ),
            )}
          </div>
        </fieldset>
        <fieldset>
          <legend>
            Locations <span>None selected means all locations</span>
          </legend>
          <div className="announcement-options">
            {locations.map((location) => (
              <label key={location.id}>
                <input
                  type="checkbox"
                  checked={draft.location_ids.includes(location.id)}
                  onChange={() => toggleLocation(location.id)}
                />{" "}
                {location.name}
              </label>
            ))}
          </div>
        </fieldset>
        {mutation.error ? (
          <p className="communication-error" role="alert">
            {mutation.error.message}
          </p>
        ) : null}
        <footer>
          <button
            className="nf-button secondary"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="nf-button"
            type="submit"
            disabled={mutation.isPending || !draft.audience_roles.length}
          >
            {mutation.isPending ? "Saving..." : "Save draft"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function audienceLabel(item: AnnouncementRecord) {
  const roles = item.audience_roles
    .map((role) => role[0]!.toUpperCase() + role.slice(1))
    .join(", ");
  return item.location_names.length
    ? `${roles} · ${item.location_names.join(", ")}`
    : `${roles} · All locations`;
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}
function AnnouncementState({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  return (
    <section className="communication-state" role={error ? "alert" : "status"}>
      {text}
    </section>
  );
}
export default AnnouncementsPage;
