import type { JSX } from "react";

export interface CascadeNoticePayload {
  readonly kind: "cascade_notice";
  readonly actor_user_id: string;
  readonly deleted_resource: {
    readonly type: "job" | "shift_type";
    readonly ids: readonly string[];
    readonly name: string;
  };
  readonly affected_op_ids: readonly string[];
  readonly affected_action: "stripped" | "deleted" | "mixed";
}

export const DEFAULT_CASCADE_ACTOR_NAME = "Admin";

// Shown when the broadcast's actor_user_id can't be matched to a known user in
// the current client context.
function resourceLabel(
  type: CascadeNoticePayload["deleted_resource"]["type"],
): string {
  return type === "shift_type" ? "shift type" : "job";
}

function actionLabel(action: CascadeNoticePayload["affected_action"]): string {
  if (action === "deleted") return "removed";
  if (action === "mixed") return "updated";
  return "adjusted";
}

export function formatCascadeNoticeToast(
  notice: CascadeNoticePayload,
  actorName?: string | null,
): string {
  const count = notice.affected_op_ids.length;
  const opLabel = count === 1 ? "pending edit" : "pending edits";
  const trimmedActor = actorName?.trim();
  const actor = trimmedActor ? trimmedActor : DEFAULT_CASCADE_ACTOR_NAME;
  return `${count} ${opLabel} ${actionLabel(notice.affected_action)} after ${actor} changed ${resourceLabel(
    notice.deleted_resource.type,
  )} "${notice.deleted_resource.name}".`;
}

export function CascadeNoticeToast({
  notice,
  actorName,
}: {
  readonly notice: CascadeNoticePayload;
  readonly actorName?: string | null;
}): JSX.Element {
  return <span>{formatCascadeNoticeToast(notice, actorName)}</span>;
}
