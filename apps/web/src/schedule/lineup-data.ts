import {
  scheduleLineupEntryMutationResultSchema,
  scheduleLineupEntryMoveInputSchema,
  scheduleLineupReadModelSchema,
  scheduleLineupSectionSchema,
  scheduleLineupSharePreviewSchema,
  scheduleLineupShareResultSchema,
  type ScheduleLineupEntryInput,
  type ScheduleLineupEntryMoveInput,
  type ScheduleLineupSectionInput,
} from "@newfork/shared/schedule";
import { supabaseClient } from "../lib/supabase";

async function request(
  _workspaceId: string,
  path: string,
  init: RequestInit = {},
) {
  if (!supabaseClient) throw new Error("Line-up storage is not configured");
  const token = (await supabaseClient.auth.getSession()).data.session
    ?.access_token;
  if (!token) throw new Error("A current session is required for Line-up");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? "http://localhost:9999"}/schedule/lineups${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
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
) {
  return scheduleLineupSharePreviewSchema.parse(
    await request(workspaceId, "/share-preview", {
      method: "POST",
      body: JSON.stringify({ date, location_ids: locationIds }),
    }),
  );
}
export async function shareLineup(
  workspaceId: string,
  date: string,
  locationIds: string[],
  fingerprint: string,
) {
  return scheduleLineupShareResultSchema.parse(
    await request(workspaceId, "/share", {
      method: "POST",
      body: JSON.stringify({ date, location_ids: locationIds, fingerprint }),
    }),
  );
}
