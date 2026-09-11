import type {
  NotificationRecord,
  OwnerSetupChecklistItemId,
  WorkspaceDashboard,
  WorkspaceLayoutInput,
  WorkspaceTodo,
  WorkspaceWidgetId,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Megaphone,
  Settings2,
  Users,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { safeAppActionUrl } from "../communications/action-url";
import {
  createWorkspaceTodo,
  getOwnerSetupChecklistProgress,
  getWorkspaceDashboard,
  markOwnerSetupChecklistItem,
  resolveWorkspaceTodo,
  saveWorkspaceLayout,
} from "../communications/communications-data";

import { getExchanges } from "../employee-hub/shift-exchanges/exchange-data";
import { CatalogPageHeader } from "./CatalogPageHeader";

const widgetLabels: Record<WorkspaceWidgetId, string> = {
  operations: "Today",
  pending_requests: "Pending requests",
  open_shifts: "Open shifts",
  announcements: "Announcements",
  todos: "Todos",
  notifications: "Notifications",
  quick_actions: "Quick actions",
};

export function WorkspacePage() {
  const { context } = useAuth();
  const client = useQueryClient();
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState<WorkspaceLayoutInput | null>(null);
  const [now, setNow] = useState(() => new Date());
  const workspaceId = context?.workspace.id ?? "";
  const query = useQuery({
    queryKey: ["workspace-dashboard", workspaceId],
    queryFn: () => getWorkspaceDashboard(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const exchanges = useQuery({
    queryKey: ["shift-exchanges", workspaceId, context?.userId, true],
    queryFn: () => getExchanges(workspaceId, true),
    enabled: Boolean(workspaceId && context?.permissions.includes("schedule.shift_change_requests.read")),
    refetchInterval: 60_000,
  });
  const saveMutation = useMutation({
    mutationFn: (layout: WorkspaceLayoutInput) =>
      saveWorkspaceLayout(workspaceId, layout),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["workspace-dashboard"] });
      setDraft(null);
      setCustomizing(false);
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (query.isLoading) return <PageState text="Loading Workspace..." />;
  if (query.error || !query.data) {
    return (
      <PageState
        text={
          query.error instanceof Error
            ? query.error.message
            : "Workspace unavailable"
        }
        error
      />
    );
  }
  const pendingExchanges = exchanges.isError ? 0 : exchanges.data?.cases.filter((item) => item.status === "open" && ["ready_for_manager", "awaiting_other_manager"].includes(item.stage)).length ?? 0;
  const model = { ...query.data, metrics: { ...query.data.metrics, pending_shift_change_count: query.data.metrics.pending_shift_change_count + pendingExchanges } };
  const layout = draft ?? model.layout;
  const hidden = new Set(layout.hidden_widget_ids);
  const updateLayout = (next: WorkspaceLayoutInput) => setDraft(next);
  const move = (id: WorkspaceWidgetId, offset: number) => {
    const index = layout.widget_order.indexOf(id);
    const target = index + offset;
    if (target < 0 || target >= layout.widget_order.length) return;
    const order = [...layout.widget_order];
    [order[index], order[target]] = [order[target]!, order[index]!];
    updateLayout({ ...layout, widget_order: order });
  };
  const toggle = (id: WorkspaceWidgetId) => {
    updateLayout({
      ...layout,
      hidden_widget_ids: hidden.has(id)
        ? layout.hidden_widget_ids.filter((item) => item !== id)
        : [...layout.hidden_widget_ids, id],
    });
  };

  return (
    <section className="workspace-page" aria-labelledby="workspace-title">
      <CatalogPageHeader
        eyebrow="TODAY'S WORK. ONE PLACE."
        title="Workspace"
        titleId="workspace-title"
        description={`Track today’s operations, open requests, announcements, todos, and quick actions. ${greeting(now)}, ${model.display_name} · ${formatNow(now)}.`}
        action={
          <div className="workspace-header-actions">
            {customizing ? (
              <>
                <button
                  className="nf-button secondary"
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setCustomizing(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="nf-button"
                  type="button"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate(layout)}
                >
                  {saveMutation.isPending ? "Saving..." : "Save layout"}
                </button>
              </>
            ) : (
              <button
                className="nf-button secondary"
                type="button"
                onClick={() => setCustomizing(true)}
              >
                <Settings2 size={16} aria-hidden /> Customize
              </button>
            )}
          </div>
        }
      />
      {saveMutation.error ? (
        <p className="workspace-error" role="alert">
          {saveMutation.error.message}
        </p>
      ) : null}
      {context?.membership.role === "owner" ||
      context?.membership.role === "admin" ? (
        <OwnerSetupChecklist workspaceId={context.workspace.id} />
      ) : null}
      <div className="workspace-grid">
        {layout.widget_order.map((id, index) => {
          if (hidden.has(id) && !customizing) return null;
          return (
            <article
              className={`workspace-widget${hidden.has(id) ? " is-hidden" : ""}`}
              key={id}
            >
              <header>
                <h2>{widgetLabels[id]}</h2>
                {customizing ? (
                  <div className="widget-controls">
                    <button
                      className="icon-button"
                      aria-label={`Move ${widgetLabels[id]} up`}
                      disabled={index === 0}
                      onClick={() => move(id, -1)}
                    >
                      <ArrowUp size={15} aria-hidden />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Move ${widgetLabels[id]} down`}
                      disabled={index === layout.widget_order.length - 1}
                      onClick={() => move(id, 1)}
                    >
                      <ArrowDown size={15} aria-hidden />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`${hidden.has(id) ? "Show" : "Hide"} ${widgetLabels[id]}`}
                      onClick={() => toggle(id)}
                    >
                      {hidden.has(id) ? (
                        <Eye size={15} />
                      ) : (
                        <EyeOff size={15} />
                      )}
                    </button>
                  </div>
                ) : null}
              </header>
              <Widget id={id} model={model} workspaceId={workspaceId} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

type ChecklistItem = {
  readonly id: OwnerSetupChecklistItemId;
  readonly label: string;
  readonly to: string | null;
  readonly required: boolean;
};

const ownerSetupChecklistItems: readonly ChecklistItem[] = [
  {
    id: "app_tour",
    label: "App tour",
    to: null,
    required: true,
  },
  {
    id: "scheduling_preferences",
    label: "Set scheduling preferences",
    to: "/app/settings/scheduling?checklist=setup",
    required: true,
  },
  {
    id: "employees",
    label: "Employees",
    to: "/app/employees",
    required: false,
  },
  {
    id: "kiosk",
    label: "Kiosk",
    to: "/app/settings/kiosk",
    required: false,
  },
  {
    id: "documents",
    label: "Documents",
    to: "/app/settings/documents",
    required: false,
  },
  {
    id: "schedule",
    label: "First schedule view",
    to: "/app/schedule",
    required: false,
  },
  {
    id: "billing",
    label: "Billing",
    to: "/account/workspaces?checklist=billing",
    required: false,
  },
];

function OwnerSetupChecklist({
  workspaceId,
}: {
  readonly workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["owner-setup-checklist", workspaceId];
  const progressQuery = useQuery({
    queryKey,
    queryFn: () => getOwnerSetupChecklistProgress(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const markMutation = useMutation({
    mutationFn: (id: OwnerSetupChecklistItemId) =>
      markOwnerSetupChecklistItem(workspaceId, id),
    onSuccess: async (progress) => {
      queryClient.setQueryData(queryKey, progress);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  if (progressQuery.isPending || progressQuery.data?.closed_at) return null;

  const visited = new Set(progressQuery.data?.completed_item_ids ?? []);
  const markVisited = (id: OwnerSetupChecklistItemId) => {
    if (!visited.has(id)) markMutation.mutate(id);
  };
  const requiredCount = ownerSetupChecklistItems.filter(
    (item) => item.required,
  ).length;
  const requiredVisitedCount = ownerSetupChecklistItems.filter(
    (item) => item.required && visited.has(item.id),
  ).length;

  return (
    <section className="owner-setup-checklist" aria-labelledby="setup-title">
      <header>
        <div>
          <h2 id="setup-title">Setup checklist</h2>
          <p>{requiredVisitedCount} of {requiredCount} required visits complete</p>
        </div>
      </header>
      {progressQuery.error || markMutation.error ? (
        <p className="workspace-error" role="alert">
          Setup checklist progress could not be saved.
        </p>
      ) : null}
      <div className="owner-setup-checklist-list">
        {ownerSetupChecklistItems.map((item) => {
          const done = visited.has(item.id);
          const content = (
            <>
              <span className="owner-setup-checklist-status" data-done={done}>
                {done ? <CheckCircle2 size={15} aria-hidden /> : null}
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.required ? "Required visit" : "Optional visit"}</small>
              </span>
              <ArrowRight size={15} aria-hidden />
            </>
          );
          return item.to ? (
            <Link
              className="owner-setup-checklist-item"
              key={item.id}
              to={item.to}
              onClick={() => markVisited(item.id)}
            >
              {content}
            </Link>
          ) : (
            <button
              className="owner-setup-checklist-item"
              key={item.id}
              type="button"
              onClick={() => markVisited(item.id)}
            >
              {content}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Widget({
  id,
  model,
  workspaceId,
}: {
  id: WorkspaceWidgetId;
  model: WorkspaceDashboard;
  workspaceId: string;
}) {
  if (id === "operations") {
    return (
      <div className="workspace-metrics">
        <Metric
          value={model.metrics.today_shift_count}
          label="Scheduled today"
        />
        <Metric
          value={model.metrics.today_open_shift_count}
          label="Open today"
        />
      </div>
    );
  }
  if (id === "pending_requests") {
    return (
      <div className="workspace-metrics">
        <Metric value={model.metrics.pending_time_off_count} label="Time off" />
        <Metric
          value={model.metrics.pending_shift_change_count}
          label="Shift changes"
        />
        <WidgetLink to="/app/schedule/requests">Review requests</WidgetLink>
      </div>
    );
  }
  if (id === "open_shifts") {
    return (
      <div className="workspace-focus-number">
        <strong>{model.metrics.today_open_shift_count}</strong>
        <span>unassigned shifts today</span>
        <WidgetLink to="/app/schedule">Open Schedule</WidgetLink>
      </div>
    );
  }
  if (id === "announcements") {
    return model.announcements.length ? (
      <div className="workspace-feed">
        {model.announcements.map((item) => (
          <Link to={`/app/announcements/${item.id}`} key={item.id}>
            <Megaphone size={16} aria-hidden />
            <span>
              <strong>{item.title}</strong>
              <small>{item.category}</small>
            </span>
            <ArrowRight size={15} aria-hidden />
          </Link>
        ))}
      </div>
    ) : (
      <EmptyWidget text="No active announcements" />
    );
  }
  if (id === "notifications") {
    return model.notifications.length ? (
      <div className="workspace-feed">
        {model.notifications.map((item) => (
          <NotificationPreview item={item} key={item.id} />
        ))}
        <WidgetLink to="/app/notifications">View all notifications</WidgetLink>
      </div>
    ) : (
      <EmptyWidget text="You're all caught up" />
    );
  }
  if (id === "todos") {
    return <TodoWidget todos={model.todos} workspaceId={workspaceId} />;
  }
  return (
    <div className="workspace-quick-actions">
      <WidgetLink to="/app/schedule">
        <CalendarDays size={16} /> Open Schedule
      </WidgetLink>
      <WidgetLink to="/app/employees">
        <Users size={16} /> View employees
      </WidgetLink>
      <WidgetLink to="/app/announcements">
        <Megaphone size={16} /> New announcement
      </WidgetLink>
    </div>
  );
}

function TodoWidget({
  todos,
  workspaceId,
}: {
  todos: WorkspaceDashboard["todos"];
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const createMutation = useMutation({
    mutationFn: (nextTitle: string) =>
      createWorkspaceTodo(workspaceId, {
        title: nextTitle,
        body: "",
        employee_id: null,
        due_at: null,
      }),
    onSuccess: async () => {
      setTitle("");
      await queryClient.invalidateQueries({ queryKey: ["workspace-dashboard"] });
    },
  });
  const resolveMutation = useMutation({
    mutationFn: (todoId: string) => resolveWorkspaceTodo(workspaceId, todoId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-dashboard"] });
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || createMutation.isPending) return;
    createMutation.mutate(title);
  };

  return (
    <div className="workspace-todos">
      <form className="workspace-todo-form" onSubmit={submit}>
        <input
          aria-label="New todo"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a todo"
          maxLength={160}
        />
        <button
          className="nf-button secondary"
          type="submit"
          disabled={!title.trim() || createMutation.isPending}
        >
          Add
        </button>
      </form>
      {createMutation.error || resolveMutation.error ? (
        <p className="workspace-error" role="alert">
          Todo update could not be saved.
        </p>
      ) : null}
      {todos.length ? (
        <div className="workspace-feed">
          {todos.map((item) => (
            <TodoPreview
              item={item}
              key={item.id}
              onResolve={(todoId) => resolveMutation.mutate(todoId)}
              resolving={resolveMutation.isPending}
            />
          ))}
        </div>
      ) : (
        <EmptyWidget text="No open todos" />
      )}
    </div>
  );
}

function TodoPreview({
  item,
  onResolve,
  resolving,
}: {
  item: WorkspaceTodo;
  onResolve: (todoId: string) => void;
  resolving: boolean;
}) {
  const content = (
    <>
      <CheckCircle2 size={16} aria-hidden />
      <span>
        <strong>{item.title}</strong>
        <small>
          {item.due_at ? `Due ${relativeTime(item.due_at)}` : item.body}
        </small>
      </span>
      <ArrowRight size={15} aria-hidden />
    </>
  );
  const actionUrl = safeAppActionUrl(item.action_url);
  if (actionUrl) return <Link to={actionUrl}>{content}</Link>;
  if (!item.system_generated) {
    return (
      <div className="workspace-todo-row">
        <div>{content}</div>
        <button
          className="icon-button"
          type="button"
          aria-label={`Resolve ${item.title}`}
          disabled={resolving}
          onClick={() => onResolve(item.id)}
        >
          <Check size={15} aria-hidden />
        </button>
      </div>
    );
  }
  return <div>{content}</div>;
}

function NotificationPreview({ item }: { item: NotificationRecord }) {
  const content = (
    <>
      <Bell size={16} aria-hidden />
      <span>
        <strong>{item.title}</strong>
        <small>{relativeTime(item.created_at)}</small>
      </span>
      <ArrowRight size={15} aria-hidden />
    </>
  );
  const actionUrl = safeAppActionUrl(item.action_url);
  return actionUrl ? (
    <Link to={actionUrl}>{content}</Link>
  ) : (
    <div>{content}</div>
  );
}
function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
function WidgetLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="widget-link" to={to}>
      {children}
      <ArrowRight size={15} aria-hidden />
    </Link>
  );
}
function EmptyWidget({ text }: { text: string }) {
  return <p className="workspace-empty">{text}</p>;
}
function PageState({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <section className="workspace-state" role={error ? "alert" : "status"}>
      {text}
    </section>
  );
}
function greeting(date: Date) {
  const hour = date.getHours();
  return hour < 12
    ? "Good morning"
    : hour < 18
      ? "Good afternoon"
      : "Good evening";
}
function formatNow(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
function relativeTime(iso: string) {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - Date.parse(iso)) / 60_000),
  );
  if (minutes < 60) return `${minutes || 1}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}
export default WorkspacePage;
