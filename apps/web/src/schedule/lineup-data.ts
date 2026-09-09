import {
  lineupPlacementPreviewSchema,
  lineupPlacementResultSchema,
  lineupNoteSchema,
  lineupSectionPlanSchema,
  lineupReminderResultSchema,
  type ScheduleLineupEntryInput,
} from "@newfork/shared";
import type { LineupSectionPlanInput } from "@newfork/shared";
import {
  lineupDestinationSchema,
  lineupProposalSchema,
  lineupOfferSchema,
} from "@newfork/shared";
import {
  scheduleLineupEntryMutationResultSchema,
  scheduleLineupEntryMoveInputSchema,
  scheduleLineupReadModelSchema,
  scheduleLineupSectionSchema,
  scheduleLineupSharePreviewSchema,
  scheduleLineupShareResultSchema,
  type ScheduleLineupEntryMoveInput,
  type ScheduleLineupSectionInput,
} from "@newfork/shared/schedule";
import {
  getTabWorkspaceId,
  supabaseClient,
  developmentBearerToken,
} from "../lib/supabase";
import {
  lineupCandidateSchema,
  lineupOperationPreviewSchema,
  lineupOperationsStateSchema,
  employeeLineupSnapshotSchema,
  type LineupTarget,
  type LineupOperation,
  type LineupNoteInput,
} from "@newfork/shared";

async function request(
  _workspaceId: string,
  path: string,
  init: RequestInit = {},
) {
  const token =
    developmentBearerToken() ??
    (await supabaseClient?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error("A current session is required for Line-up");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const tabWorkspaceId = getTabWorkspaceId() ?? _workspaceId;
  if (tabWorkspaceId) headers.set("X-Newfork-Workspace-Id", tabWorkspaceId);
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:9999" : "")}/schedule/lineups${path}`,
    {
      ...init,
      headers,
    },
  );
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok)
    throw new Error(
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : "Line-up operation failed",
    );
  return body;
}

export async function getLineupOperations(
  workspaceId: string,
  date: string,
  locationId: string,
) {
  return lineupOperationsStateSchema.parse(
    await request(
      workspaceId,
      `/operations?${new URLSearchParams({ date, location_id: locationId })}`,
    ),
  );
}
export async function getEmployeeLineup(
  workspaceId: string,
  from: string,
  to: string,
) {
  return employeeLineupSnapshotSchema
    .array()
    .parse(
      await request(
        workspaceId,
        `/published?${new URLSearchParams({ from, to })}`,
      ),
    );
}
export async function recordLineupReceipt(
  workspaceId: string,
  snapshotId: string,
  action: "view" | "acknowledge",
) {
  return request(workspaceId, "/receipt", {
    method: "POST",
    body: JSON.stringify({ snapshot_id: snapshotId, action }),
  });
}
export async function getLineupCandidates(
  workspaceId: string,
  target: LineupTarget,
  sourceEntryId: string | null = null,
) {
  return lineupCandidateSchema.array().parse(
    await request(workspaceId, "/candidates", {
      method: "POST",
      body: JSON.stringify({ target, source_entry_id: sourceEntryId }),
    }),
  );
}
export async function previewLineupOperation(
  workspaceId: string,
  operation: LineupOperation,
) {
  return lineupOperationPreviewSchema.parse(
    await request(workspaceId, "/operations/preview", {
      method: "POST",
      body: JSON.stringify({ operation }),
    }),
  );
}
export async function applyLineupOperation(
  workspaceId: string,
  operation: LineupOperation,
  fingerprint: string,
  idempotencyKey: string,
  confirmAvailability?: boolean,
) {
  return request(workspaceId, "/operations", {
    method: "POST",
    body: JSON.stringify({
      operation,
      fingerprint,
      idempotency_key: idempotencyKey,
      ...(confirmAvailability === undefined
        ? {}
        : { confirm_availability: confirmAvailability }),
    }),
  });
}
export async function saveLineupNote(
  workspaceId: string,
  note: LineupNoteInput,
  noteId: string | null = null,
  revision: number | null = null,
) {
  return lineupNoteSchema.parse(
    await request(workspaceId, "/notes", {
      method: "POST",
      body: JSON.stringify({
        note,
        note_id: noteId,
        expected_revision: revision,
      }),
    }),
  );
}
export async function getLineup(
  workspaceId: string,
  date: string,
  locationIds: string[] = [],
) {
  const q = new URLSearchParams({ date });
  if (locationIds.length) q.set("location_ids", locationIds.join(","));
  return scheduleLineupReadModelSchema.parse(
    await request(workspaceId, `?${q}`),
  );
}
export async function saveLineupSection(
  workspaceId: string,
  section: ScheduleLineupSectionInput,
  sectionId: string | null,
  revision: number | null,
) {
  return scheduleLineupSectionSchema.parse(
    await request(workspaceId, `/sections${sectionId ? `/${sectionId}` : ""}`, {
      method: sectionId ? "PATCH" : "POST",
      body: JSON.stringify({ expected_revision: revision, section }),
    }),
  );
}
export async function archiveLineupSection(
  workspaceId: string,
  sectionId: string,
  revision: number,
) {
  await request(workspaceId, `/sections/${sectionId}`, {
    method: "DELETE",
    body: JSON.stringify({ expected_revision: revision }),
  });
}
export async function saveLineupEntry(
  workspaceId: string,
  locationId: string,
  date: string,
  entry: ScheduleLineupEntryInput,
  entryId: string | null,
  revision: number | null,
) {
  return scheduleLineupEntryMutationResultSchema.parse(
    await request(workspaceId, `/entries${entryId ? `/${entryId}` : ""}`, {
      method: entryId ? "PUT" : "POST",
      body: JSON.stringify({
        location_id: locationId,
        date,
        expected_revision: revision,
        entry,
      }),
    }),
  );
}
export async function deleteLineupEntry(
  workspaceId: string,
  entryId: string,
  revision: number,
) {
  return scheduleLineupEntryMutationResultSchema.parse(
    await request(workspaceId, `/entries/${entryId}`, {
      method: "DELETE",
      body: JSON.stringify({ expected_revision: revision }),
    }),
  );
}
export async function moveLineupEntry(
  workspaceId: string,
  move: ScheduleLineupEntryMoveInput,
) {
  return scheduleLineupEntryMutationResultSchema.parse(
    await request(workspaceId, "/entries/move", {
      method: "POST",
      body: JSON.stringify(scheduleLineupEntryMoveInputSchema.parse(move)),
    }),
  );
}
export async function saveLineupBrief(
  workspaceId: string,
  locationId: string,
  date: string,
  shiftTypeId: string,
  revision: number | null,
  brief: { out_of_stock: string; specials: string; pre_shift_notes: string },
) {
  return scheduleLineupEntryMutationResultSchema.parse(
    await request(workspaceId, `/briefs/${shiftTypeId}`, {
      method: "PUT",
      body: JSON.stringify({
        location_id: locationId,
        date,
        expected_revision: revision,
        ...brief,
      }),
    }),
  );
}
export async function previewLineupShare(
  workspaceId: string,
  date: string,
  locationIds: string[],
  shiftTypeIds?: string[],
) {
  return scheduleLineupSharePreviewSchema.parse(
    await request(workspaceId, "/share-preview", {
      method: "POST",
      body: JSON.stringify({
        date,
        location_ids: locationIds,
        shift_type_ids: shiftTypeIds,
      }),
    }),
  );
}
export async function shareLineup(
  workspaceId: string,
  date: string,
  locationIds: string[],
  fingerprint: string,
  shiftTypeIds?: string[],
) {
  return scheduleLineupShareResultSchema.parse(
    await request(workspaceId, "/share", {
      method: "POST",
      body: JSON.stringify({
        date,
        location_ids: locationIds,
        fingerprint,
        shift_type_ids: shiftTypeIds,
      }),
    }),
  );
}

export async function getLineupDestinations(workspaceId: string) {
  return lineupDestinationSchema
    .array()
    .parse(await request(workspaceId, "/destinations"));
}
export async function getLineupProposals(
  workspaceId: string,
  date: string,
  locationId: string,
) {
  return lineupProposalSchema
    .array()
    .parse(
      await request(
        workspaceId,
        `/proposals?${new URLSearchParams({ date, location_id: locationId })}`,
      ),
    );
}
export async function submitLineupProposal(
  workspaceId: string,
  kind: "offer" | "transfer",
  operation: LineupOperation,
  fingerprint: string,
  key: string,
) {
  return request(workspaceId, "/proposals", {
    method: "POST",
    body: JSON.stringify({
      kind,
      operation,
      fingerprint,
      idempotency_key: key,
    }),
  });
}
export async function actOnLineupProposal(
  workspaceId: string,
  id: string,
  response: "confirm" | "cancel" | "preview",
  details: {
    target_entry_id?: string;
    fingerprint?: string;
    confirm_availability?: boolean;
  } = {},
) {
  return request(workspaceId, "/proposals/action", {
    method: "POST",
    body: JSON.stringify({ id, response, ...details }),
  });
}
export async function getLineupOffers(workspaceId: string) {
  return lineupOfferSchema.array().parse(await request(workspaceId, "/offers"));
}
export async function respondToLineupOffer(
  workspaceId: string,
  id: string,
  response: "accept" | "decline",
  availabilityFingerprint?: string,
) {
  return request(workspaceId, "/offers/respond", {
    method: "POST",
    body: JSON.stringify({
      id,
      response,
      ...(response === "accept" && availabilityFingerprint
        ? { availability_fingerprint: availabilityFingerprint }
        : {}),
    }),
  });
}

export async function retryLineupNotifications(
  workspaceId: string,
  date: string,
  locationId: string,
) {
  return request(workspaceId, "/notifications/retry", {
    method: "POST",
    body: JSON.stringify({ date, location_id: locationId }),
  });
}

export async function remindLineupRecipients(
  workspaceId: string,
  date: string,
  locationId: string,
  snapshotId: string,
): Promise<{ sent: number }> {
  return lineupReminderResultSchema.parse(
    await request(workspaceId, "/notifications/remind", {
      method: "POST",
      body: JSON.stringify({
        date,
        location_id: locationId,
        snapshot_id: snapshotId,
      }),
    }),
  );
}

export async function saveLineupSectionPlan(
  workspaceId: string,
  plan: LineupSectionPlanInput,
) {
  return lineupSectionPlanSchema.omit({ lead_name: true }).parse(
    await request(workspaceId, "/section-plan", {
      method: "POST",
      body: JSON.stringify(plan),
    }),
  );
}

export async function getLineupSharedExport(
  workspaceId: string,
  date: string,
  locationId: string,
) {
  return scheduleLineupReadModelSchema.parse(
    await request(
      workspaceId,
      `/shared-export?${new URLSearchParams({ date, location_id: locationId })}`,
    ),
  );
}

export type LineupPlacementBatch = {
  date: string;
  location_id: string;
  entries: {
    id: string;
    expected_revision: number | null;
    entry: ScheduleLineupEntryInput;
  }[];
};
export async function previewLineupPlacements(
  workspaceId: string,
  batch: LineupPlacementBatch,
) {
  return lineupPlacementPreviewSchema.parse(
    await request(workspaceId, "/placements/preview", {
      method: "POST",
      body: JSON.stringify(batch),
    }),
  );
}
export async function applyLineupPlacements(
  workspaceId: string,
  batch: LineupPlacementBatch,
  fingerprint: string,
  idempotencyKey: string,
): Promise<{ entries: { entry_id: string; entry_revision: number }[] }> {
  return lineupPlacementResultSchema.parse(
    await request(workspaceId, "/placements", {
      method: "POST",
      body: JSON.stringify({
        ...batch,
        fingerprint,
        idempotency_key: idempotencyKey,
      }),
    }),
  );
}
