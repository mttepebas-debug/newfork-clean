// Demo backend for the Workspace home (the manager's dashboard): today's
// counts, the newest announcements and notifications, the shared todo list,
// the per-person layout and the owner's setup checklist. Mirrors
// get_workspace_dashboard_service and the todo / layout / checklist services
// in supabase/schema.sql.
import { ApiError, type Handler } from "./api";
import { domainStore } from "./store";
import { addDays, iso, localInstant, mondayOf, todayIn, uuid } from "./time";
import { viewerRole } from "./viewer";
import type { Role } from "../pages";
import { LOC, WORKSPACE_ID, ZONE, viewer, world } from "./world";
import { activeAnnouncements, latestNotices, unreadNoticeCount } from "./communications-service";
import { profileName } from "./account-service";
import { records as timeOffRecords } from "./requests-time-off";

type Route = (method: string, path: string, handler: Handler) => void;

const widgets = ["operations", "pending_requests", "open_shifts", "announcements", "todos", "notifications", "quick_actions"] as const;
type Widget = (typeof widgets)[number];
const checklistItems = ["app_tour", "scheduling_preferences", "employees", "documents", "schedule", "billing"] as const;
type ChecklistItem = (typeof checklistItems)[number];

interface Todo {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "action_required";
  status: "open" | "resolved";
  system_generated: boolean;
  source_type: string;
  source_id: string;
  source_key: string;
  employee_id: string | null;
  location_id: string | null;
  due_at: string | null;
  action_url: string | null;
  created_at: string;
  created_by: string | null;
}

interface WorkspaceData {
  todos: Todo[];
  layouts: Partial<Record<Role, { widget_order: Widget[]; hidden_widget_ids: Widget[] }>>;
  checklist: { completed_item_ids: ChecklistItem[]; closed_at: string | null };
}

const nowIso = () => new Date().toISOString();
const hoursFromNow = (hours: number) => iso(Date.now() + hours * 3_600_000);

function fail(status: number, error: string, reason?: string): never {
  throw new ApiError(status, reason ? { error, reason } : { error });
}

function seed(): WorkspaceData {
  const thisWeek = mondayOf(todayIn(ZONE));
  const employee = (name: string) => world.employees.find((item) => item.display_name === name)?.id ?? null;
  const todo = (fields: Partial<Todo> & Pick<Todo, "title" | "body" | "severity" | "source_type" | "source_key">, hoursAgo: number): Todo => ({
    id: uuid(),
    status: "open",
    system_generated: true,
    source_id: uuid(),
    employee_id: null,
    location_id: null,
    due_at: null,
    action_url: null,
    created_at: iso(Date.now() - hoursAgo * 3_600_000),
    created_by: null,
    ...fields,
  });
  return {
    todos: [
      todo({
        title: "Food handler card expires soon", body: "Luis Hernandez · expires in 14 days", severity: "warning",
        source_type: "employee_document", source_key: "document_expiring", employee_id: employee("Luis Hernandez"), location_id: LOC.downtown,
        action_url: "/app/employees/documents",
      }, 27),
      todo({
        title: "Publish next week's Downtown schedule", body: "\"Next week plan\" is still a draft. Staff see it once it is published.", severity: "action_required",
        source_type: "schedule_draft", source_key: "draft_unpublished", location_id: LOC.downtown,
        // Overdue: the screen words a due time only as "… ago" (see the report).
        due_at: iso(localInstant(addDays(todayIn(ZONE), -1), "18:00", ZONE)), action_url: "/app/schedule",
      }, 20),
      todo({
        title: "Order to-go containers", body: "We're down to two sleeves of the large ones.", severity: "info",
        source_type: "manual", source_key: "manual", system_generated: false, created_by: viewer.userId, due_at: hoursFromNow(-3),
      }, 5),
      todo({
        title: "Restock the Uptown bar garnish station", body: "Lemons, limes and cocktail cherries before Friday close.", severity: "info",
        source_type: "manual", source_key: "manual", system_generated: false, location_id: LOC.uptown, created_by: null,
      }, 48),
    ],
    layouts: {},
    checklist: { completed_item_ids: ["app_tour", "scheduling_preferences", "employees"], closed_at: null },
  };
}

const store = domainStore("workspace", seed);

/** The locations this person reads the Schedule of. */
function places(): string[] {
  return viewerRole === "owner" ? world.locations.map((location) => location.id) : [LOC.downtown];
}

function requireDashboard(): void {
  // workspace.todos: workspace.manage, which employees do not have.
  if (viewerRole === "employee") fail(403, "Not allowed", "authz.missing_permission");
}

/** A todo tied to a person or place the reader does not reach stays out of sight. */
function readable(todo: Todo): boolean {
  if (viewerRole === "owner") return true;
  if (todo.employee_id) {
    const employee = world.employees.find((item) => item.id === todo.employee_id);
    return Boolean(employee?.location_ids.some((id) => places().includes(id)));
  }
  return !todo.location_id || places().includes(todo.location_id);
}

function todoRecord(todo: Todo) {
  return {
    id: todo.id,
    workspace_id: WORKSPACE_ID,
    title: todo.title,
    body: todo.body,
    severity: todo.severity,
    status: todo.status,
    system_generated: todo.system_generated,
    source_type: todo.source_type,
    source_id: todo.source_id,
    source_key: todo.source_key,
    employee_id: todo.employee_id,
    due_at: todo.due_at,
    action_url: todo.action_url,
    created_at: todo.created_at,
  };
}

function layoutOf(role: Role) {
  return store.data.layouts[role] ?? { widget_order: [...widgets], hidden_widget_ids: [] };
}

function todayShifts() {
  const mine = places();
  return world.publications
    .filter((publication) => mine.includes(publication.location_id))
    .flatMap((publication) => publication.shifts)
    .filter((shift) => shift.scheduled_date === todayIn(ZONE));
}

function pendingTimeOff(): number {
  // The Requests page's own store (mock/requests-time-off.ts); world.time_off when it is not there.
  try {
    return timeOffRecords().filter((record) => record.status === "pending"
      && (viewerRole === "owner" || record.locations.some((id) => places().includes(id)))).length;
  } catch {
    return world.time_off.filter((item) => item.status === "pending").length;
  }
}

function checklist() {
  return {
    workspace_id: WORKSPACE_ID,
    user_id: viewer.userId,
    completed_item_ids: store.data.checklist.completed_item_ids,
    closed_at: store.data.checklist.closed_at,
  };
}

export function workspaceRoutes(route: Route): void {
  const base = "/v1/workspaces/:workspaceId/workspace";

  route("GET", base, () => {
    requireDashboard();
    const shifts = todayShifts();
    const todos = store.data.todos
      .filter((todo) => todo.status === "open" && readable(todo))
      .sort((left, right) => (left.due_at ?? "9999") < (right.due_at ?? "9999") ? -1 : (left.due_at ?? "9999") > (right.due_at ?? "9999") ? 1 : left.created_at < right.created_at ? -1 : 1);
    return {
      workspace_id: WORKSPACE_ID,
      display_name: profileName(),
      metrics: {
        today_shift_count: shifts.length,
        today_open_shift_count: shifts.filter((shift) => !shift.employee_id).length,
        pending_time_off_count: pendingTimeOff(),
        unread_notification_count: unreadNoticeCount(),
      },
      today_ends_at: iso(localInstant(addDays(todayIn(ZONE), 1), "00:00", ZONE)),
      announcements: activeAnnouncements(5),
      notifications: latestNotices(5),
      todos: todos.slice(0, 5).map(todoRecord),
      layout: layoutOf(viewerRole),
    };
  });

  route("PUT", `${base}/layout`, ({ body }) => {
    requireDashboard();
    const order: string[] = Array.isArray(body?.widget_order) ? body.widget_order : [];
    const hidden: string[] = Array.isArray(body?.hidden_widget_ids) ? body.hidden_widget_ids : [];
    if (order.length !== widgets.length || new Set(order).size !== widgets.length || !order.every((id) => (widgets as readonly string[]).includes(id))
      || !hidden.every((id) => (widgets as readonly string[]).includes(id))) {
      fail(400, "Valid workspace layout required");
    }
    store.data.layouts[viewerRole] = { widget_order: order as Widget[], hidden_widget_ids: [...new Set(hidden)] as Widget[] };
    store.save();
    return { status: "saved", affected: 1 };
  });

  route("POST", `${base}/todos`, ({ body }) => {
    requireDashboard();
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 160 || (body?.body ?? "").length > 1000) fail(400, "Valid workspace todo required");
    const todo: Todo = {
      id: uuid(), title, body: (body?.body ?? "").trim(), severity: "info", status: "open", system_generated: false,
      source_type: "manual", source_id: uuid(), source_key: "manual", employee_id: body?.employee_id ?? null, location_id: null,
      due_at: body?.due_at ?? null, action_url: null, created_at: nowIso(), created_by: viewer.userId,
    };
    store.data.todos.push(todo);
    store.save();
    return todoRecord(todo);
  });

  route("POST", `${base}/todos/:todoId/resolve`, ({ params }) => {
    requireDashboard();
    const todo = store.data.todos.find((item) => item.id === params.todoId);
    if (!todo || !readable(todo)) fail(404, "Not found", "authz.out_of_scope");
    // A system todo resolves itself when its cause goes away.
    if (todo.system_generated) fail(400, "This todo closes on its own when the work is done.");
    todo.status = "resolved";
    store.save();
    return todoRecord(todo);
  });

  route("GET", `${base}/setup-checklist`, () => {
    // settings.general.read: owner and managers; employees are refused.
    if (viewerRole === "employee") fail(403, "Workspace management required", "authz.missing_permission");
    return checklist();
  });

  route("PATCH", `${base}/setup-checklist`, ({ body }) => {
    if (viewerRole !== "owner") fail(403, "Workspace management required", "authz.missing_permission");
    if (body?.itemId === undefined && body?.closed === undefined) fail(400, "Valid setup checklist update required");
    if (body?.itemId !== undefined) {
      if (!(checklistItems as readonly string[]).includes(body.itemId)) fail(400, "Valid setup checklist update required");
      if (!store.data.checklist.completed_item_ids.includes(body.itemId)) store.data.checklist.completed_item_ids.push(body.itemId);
    } else {
      store.data.checklist.closed_at = body.closed ? nowIso() : null;
    }
    store.save();
    return checklist();
  });
}
