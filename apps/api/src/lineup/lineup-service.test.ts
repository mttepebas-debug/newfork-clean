import { describe, expect, it, vi } from "vitest";
import { lineupService } from "./lineup-service";
import {
  acknowledgement,
  candidatesResult,
  editResult,
  lineupDay,
  myLineups,
  sectionsResult,
  shareResult,
  unpublishResult,
} from "./lineup-fixtures";

const actor = { actorUserId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5", workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd" };
const lineup = {
  location_id: "b340777a-a901-40c5-a3c8-4727ceeb55c7",
  service_date: "2028-09-11",
  shift_type_id: "c31b6d2a-4a25-4404-8fb0-bd9903551d4c",
};

function client(data: unknown) {
  return { rpc: vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data, error: null })) };
}

describe("lineup service", () => {
  it("sends a share with its command id, kind and payload apart", async () => {
    const rpc = client(shareResult);
    const result = await lineupService(rpc).command({
      ...actor,
      command: { command_id: shareResult.command_id, kind: "share", lineups: [lineup], ask_ack: true },
    });
    expect(rpc.rpc).toHaveBeenCalledWith("lineup_command_service", {
      actor_user_id: actor.actorUserId, target_workspace_id: actor.workspaceId,
      command_id: shareResult.command_id, kind: "share", payload: { lineups: [lineup], ask_ack: true },
    });
    expect(result).toEqual(shareResult);
  });

  it("sends an edit with its command id apart and the rest as the payload (LINEUP-EDIT L2a)", async () => {
    const rpc = client(editResult);
    const edit = {
      command_id: editResult.command_id, action: "set_row" as const, ...lineup,
      row: { source_shift_id: "be50320c-52d9-4f54-9684-372461ec9a95", starts: "15:30", ends: "22:00" },
    };
    const result = await lineupService(rpc).edit({ ...actor, edit });
    const { command_id: _command, ...payload } = edit;
    expect(rpc.rpc).toHaveBeenCalledWith("lineup_edit_service", {
      actor_user_id: actor.actorUserId, target_workspace_id: actor.workspaceId, command_id: editResult.command_id, payload,
    });
    expect(result).toEqual(editResult);
  });

  it("sends a change to a location's sections as the payload (LINEUP-EDIT L2b)", async () => {
    const rpc = client(sectionsResult);
    const change = { action: "add" as const, location_id: lineup.location_id, name: "Terrace" };
    const result = await lineupService(rpc).sections({ ...actor, change });
    expect(rpc.rpc).toHaveBeenCalledWith("lineup_sections_service", {
      actor_user_id: actor.actorUserId, target_workspace_id: actor.workspaceId, payload: change,
    });
    expect(result).toEqual(sectionsResult);
  });

  it("asks who may join a department as the payload (LINEUP-EDIT L3a)", async () => {
    const rpc = client(candidatesResult);
    const query = { ...lineup, department_id: "40000000-0000-4000-8000-000000000001" };
    expect(await lineupService(rpc).candidates({ ...actor, query })).toEqual(candidatesResult);
    expect(rpc.rpc).toHaveBeenCalledWith("get_lineup_candidates_service", {
      actor_user_id: actor.actorUserId, target_workspace_id: actor.workspaceId, payload: query,
    });
  });

  it("sends an unpublish with no ask", async () => {
    const rpc = client(unpublishResult);
    await lineupService(rpc).command({
      ...actor, command: { command_id: unpublishResult.command_id, kind: "unpublish", lineups: [lineup] },
    });
    expect(rpc.rpc.mock.calls[0]?.[1]).toMatchObject({ kind: "unpublish", payload: { lineups: [lineup] } });
  });

  it("reads the employee's published lineups of a day", async () => {
    const rpc = client(myLineups);
    expect(await lineupService(rpc).myLineups({ ...actor, date: "2028-09-11" })).toEqual(myLineups);
    expect(rpc.rpc).toHaveBeenCalledWith("get_my_lineups_service", {
      actor_user_id: actor.actorUserId, target_workspace_id: actor.workspaceId, target_date: "2028-09-11",
    });
  });

  it("reads the manager's day: every reachable location unless she chose some", async () => {
    const rpc = client(lineupDay);
    expect(await lineupService(rpc).day({ ...actor, date: "2028-09-11" })).toEqual(lineupDay);
    expect(rpc.rpc).toHaveBeenCalledWith("get_lineup_day_service", {
      actor_user_id: actor.actorUserId, target_workspace_id: actor.workspaceId, target_date: "2028-09-11",
      target_location_ids: null, target_shift_type_ids: null,
    });
    await lineupService(rpc).day({ ...actor, date: "2028-09-11", locationIds: [lineup.location_id], shiftTypeIds: [lineup.shift_type_id] });
    expect(rpc.rpc.mock.calls[1]?.[1]).toMatchObject({
      target_location_ids: [lineup.location_id], target_shift_type_ids: [lineup.shift_type_id],
    });
  });

  it("acknowledges a version", async () => {
    const rpc = client(acknowledgement);
    expect(await lineupService(rpc).acknowledge({ ...actor, versionId: acknowledgement.version_id })).toEqual(acknowledgement);
    expect(rpc.rpc).toHaveBeenCalledWith("acknowledge_lineup_service", {
      actor_user_id: actor.actorUserId, target_workspace_id: actor.workspaceId, version_id: acknowledgement.version_id,
    });
  });

  it("turns the core's no into 404 and 403, and keeps a lineup refusal's key", async () => {
    const refusing = (code: string, hint: string) => ({ rpc: vi.fn(async () => ({ data: null, error: { message: "Not allowed", code, hint } })) });
    await expect(lineupService(refusing("42501", "authz.not_member")).myLineups({ ...actor, date: "2028-09-11" }))
      .rejects.toMatchObject({ statusCode: 404 });
    await expect(lineupService(refusing("42501", "authz.out_of_scope")).acknowledge({ ...actor, versionId: acknowledgement.version_id }))
      .rejects.toMatchObject({ statusCode: 403, reason: "authz.out_of_scope" });
    await expect(lineupService(refusing("22023", "lineup.week_not_published")).command({
      ...actor, command: { command_id: shareResult.command_id, kind: "share", lineups: [lineup], ask_ack: false },
    })).rejects.toMatchObject({ statusCode: 400, reason: "lineup.week_not_published" });
  });
});
