import type {
  NotificationRecord,
  WorkspaceDashboard,
  WorkspaceLayoutInput,
  WorkspaceWidgetId,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bell,
  CalendarDays,
  Eye,
  EyeOff,
  Megaphone,
  Settings2,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  getWorkspaceDashboard,
  saveWorkspaceLayout,
} from "../communications/communications-data";

const widgetLabels: Record<WorkspaceWidgetId, string> = {
  operations: "Today",
  pending_requests: "Pending requests",
  open_shifts: "Open shifts",
  announcements: "Announcements",
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
  const model = query.data;
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
      <header className="workspace-header">
        <div>
          <p>
            {greeting(now)}, {model.display_name}
          </p>
          <h1 id="workspace-title">Workspace</h1>
          <span>{formatNow(now)}</span>
        </div>
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
      </header>
      {saveMutation.error ? (
        <p className="workspace-error" role="alert">
          {saveMutation.error.message}
        </p>
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
              <Widget id={id} model={model} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Widget({
  id,
  model,
}: {
  id: WorkspaceWidgetId;
  model: WorkspaceDashboard;
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
  return item.action_url ? (
    <Link to={item.action_url}>{content}</Link>
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
