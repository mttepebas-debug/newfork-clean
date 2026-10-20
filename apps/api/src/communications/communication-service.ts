import {
  announcementDetailSchema,
  announcementListSchema,
  announcementPreviewSchema,
  announcementSavedSchema,
  announcementStateResultSchema,
  importantDateListSchema,
  ownerSetupChecklistProgressSchema,
  workspaceDashboardSchema,
  managerHomeSchema,
  workspaceManualTodoInputSchema,
  workspaceTodoSchema,
  type AnnouncementDetail,
  type AnnouncementDraft,
  type AnnouncementIntent,
  type AnnouncementList,
  type AnnouncementPreview,
  type AnnouncementSaved,
  type AnnouncementStateAction,
  type AnnouncementStateResult,
  type ImportantDateList,
  type OwnerSetupChecklistItemId,
  type OwnerSetupChecklistProgress,
  type WorkspaceDashboard,
  type ManagerHome,
  type WorkspaceLayoutInput,
  type WorkspaceManualTodoInput,
  type WorkspaceTodo,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rpcFailure } from "../http-error";

const savedResultSchema = z.object({
  status: z.literal("saved"),
  affected: z.coerce.number().int().nonnegative().optional(),
});

const acknowledgedResultSchema = z.object({
  status: z.literal("saved"),
  acknowledged_at: z.string().datetime({ offset: true }),
});

export interface CommunicationService {
  getAnnouncements(input: ActorInput): Promise<AnnouncementList>;
  /** One post for the drawer; people, shifts, acknowledgements and History for whoever may change it. */
  getAnnouncement(input: ActorInput & { announcementId: string }): Promise<AnnouncementDetail>;
  /** Important Dates, under Announcements. */
  getImportantDates(input: ActorInput): Promise<ImportantDateList>;
  /** What keeps the drawer from going out and the shifts it would change; writes nothing. */
  previewAnnouncement(
    input: ActorInput & { announcementId: string | null; intent: AnnouncementIntent; announcement: AnnouncementDraft },
  ): Promise<AnnouncementPreview>;
  /** Save draft, Schedule, Publish, or Save changes. */
  saveAnnouncement(
    input: ActorInput & {
      announcementId: string | null;
      expectedRevision: number | null;
      intent: AnnouncementIntent;
      announcement: AnnouncementDraft;
    },
  ): Promise<AnnouncementSaved>;
  /** Unschedule, Unpublish, Archive, Bring back, Remind. */
  setAnnouncementState(
    input: ActorInput & {
      announcementId: string;
      expectedRevision: number;
      action: AnnouncementStateAction;
      bringBack: string[];
    },
  ): Promise<AnnouncementStateResult>;
  acknowledgeAnnouncement(
    input: ActorInput & { announcementId: string },
  ): Promise<z.infer<typeof acknowledgedResultSchema>>;
  getWorkspace(input: ActorInput): Promise<WorkspaceDashboard>;
  /** The managers' Home, "Locations first" (YONETICI-HOME). */
  getManagerHome(input: ActorInput): Promise<ManagerHome>;
  saveWorkspaceLayout(
    input: ActorInput & { layout: WorkspaceLayoutInput },
  ): Promise<z.infer<typeof savedResultSchema>>;
  createWorkspaceTodo(
    input: ActorInput & { todo: WorkspaceManualTodoInput },
  ): Promise<WorkspaceTodo>;
  resolveWorkspaceTodo(
    input: ActorInput & { todoId: string },
  ): Promise<WorkspaceTodo>;
  getOwnerSetupChecklistProgress(
    input: ActorInput,
  ): Promise<OwnerSetupChecklistProgress>;
  markOwnerSetupChecklistItem(
    input: ActorInput & { itemId: OwnerSetupChecklistItemId },
  ): Promise<OwnerSetupChecklistProgress>;
  setOwnerSetupChecklistClosed(
    input: ActorInput & { closed: boolean },
  ): Promise<OwnerSetupChecklistProgress>;
}

interface ActorInput {
  readonly actorUserId: string;
  readonly workspaceId: string;
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export function createCommunicationService(options: {
  url: string;
  serviceRoleKey: string;
}): CommunicationService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return createCommunicationServiceWithClient(client);
}

export function createCommunicationServiceWithClient(
  client: RpcClient,
): CommunicationService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw rpcFailure(error);
    return data;
  }
  const actorArgs = (input: ActorInput) => ({
    actor_user_id: input.actorUserId,
    target_workspace_id: input.workspaceId,
  });
  return {
    async getAnnouncements(input) {
      return announcementListSchema.parse(
        await rpc("get_announcements_service", actorArgs(input)),
      );
    },
    async getAnnouncement(input) {
      return announcementDetailSchema.parse(
        await rpc("get_announcement_service", {
          ...actorArgs(input),
          target_announcement_id: input.announcementId,
        }),
      );
    },
    async getImportantDates(input) {
      return importantDateListSchema.parse(
        await rpc("get_important_dates_service", actorArgs(input)),
      );
    },
    async previewAnnouncement(input) {
      return announcementPreviewSchema.parse(
        await rpc("preview_announcement_service", {
          ...actorArgs(input),
          target_announcement_id: input.announcementId,
          target_payload: { ...input.announcement, intent: input.intent },
        }),
      );
    },
    async saveAnnouncement(input) {
      return announcementSavedSchema.parse(
        await rpc("save_announcement_service", {
          ...actorArgs(input),
          target_announcement_id: input.announcementId,
          target_expected_revision: input.expectedRevision,
          target_payload: input.announcement,
          target_intent: input.intent,
        }),
      );
    },
    async setAnnouncementState(input) {
      return announcementStateResultSchema.parse(
        await rpc("set_announcement_state_service", {
          ...actorArgs(input),
          target_announcement_id: input.announcementId,
          target_expected_revision: input.expectedRevision,
          target_action: input.action,
          target_bring_back: input.bringBack,
        }),
      );
    },
    async acknowledgeAnnouncement(input) {
      return acknowledgedResultSchema.parse(
        await rpc("acknowledge_announcement_service", {
          ...actorArgs(input),
          target_announcement_id: input.announcementId,
        }),
      );
    },
    async getWorkspace(input) {
      return workspaceDashboardSchema.parse(
        await rpc("get_workspace_dashboard_service", actorArgs(input)),
      );
    },
    async getManagerHome(input) {
      return managerHomeSchema.parse(await rpc("get_manager_home_service", actorArgs(input)));
    },
    async saveWorkspaceLayout(input) {
      return savedResultSchema.parse(
        await rpc("save_workspace_layout_service", {
          ...actorArgs(input),
          target_widget_order: input.layout.widget_order,
          target_hidden_widget_ids: input.layout.hidden_widget_ids,
        }),
      );
    },
    async createWorkspaceTodo(input) {
      const todo = workspaceManualTodoInputSchema.parse(input.todo);
      return workspaceTodoSchema.parse(
        await rpc("create_workspace_todo_service", {
          ...actorArgs(input),
          todo_title: todo.title,
          todo_body: todo.body,
          target_employee_id: todo.employee_id,
          target_due_at: todo.due_at,
        }),
      );
    },
    async resolveWorkspaceTodo(input) {
      return workspaceTodoSchema.parse(
        await rpc("resolve_workspace_todo_service", {
          ...actorArgs(input),
          target_todo_id: input.todoId,
        }),
      );
    },
    async getOwnerSetupChecklistProgress(input) {
      return ownerSetupChecklistProgressSchema.parse(
        await rpc(
          "get_owner_setup_checklist_progress_service",
          actorArgs(input),
        ),
      );
    },
    async markOwnerSetupChecklistItem(input) {
      return ownerSetupChecklistProgressSchema.parse(
        await rpc("mark_owner_setup_checklist_item_service", {
          ...actorArgs(input),
          target_item_id: input.itemId,
        }),
      );
    },
    async setOwnerSetupChecklistClosed(input) {
      return ownerSetupChecklistProgressSchema.parse(
        await rpc("set_owner_setup_checklist_closed_service", {
          ...actorArgs(input),
          should_close: input.closed,
        }),
      );
    },
  };
}
