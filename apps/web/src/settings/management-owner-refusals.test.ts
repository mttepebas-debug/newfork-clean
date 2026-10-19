import { managementAndOwnerRefusals } from "@newfork/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import { saveJob, setDepartmentArchived, setJobArchived } from "./organization-data";

// Settings → Jobs still archives and saves straight to the tables, so the
// database's refusal reaches this module rather than the API (BL-218).
const storage = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabaseClient: storage }));
const chain = { update: vi.fn(), insert: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn(), then: undefined as unknown };
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const ownerJob = {
  id: "40000000-0000-4000-8000-000000000001",
  workspace_id: workspaceId,
  department_id: "30000000-0000-4000-8000-000000000001",
  name: "Owner",
  color: "#4478A8",
  archived_at: null,
  system_key: "owner",
  lineup_icons: ["007-gm"],
};
const kept = {
  code: "23514",
  message: "Management and Owner are kept; rename them instead",
  hint: "catalog.system_record",
};
let answer: { data: unknown; error: unknown };

beforeEach(() => {
  vi.clearAllMocks();
  answer = { data: null, error: null };
  storage.from.mockReturnValue(chain);
  for (const step of [chain.update, chain.insert, chain.eq, chain.select]) step.mockReturnValue(chain);
  chain.single.mockImplementation(async () => answer);
  // The archive writes await the builder itself.
  chain.then = (resolve: (value: unknown) => unknown) => resolve(answer);
});

describe("Settings → Jobs writes the database refuses (BL-218)", () => {
  it.each([
    ["archiving Management", () => setDepartmentArchived(workspaceId, ownerJob.department_id, true)],
    ["archiving the Owner job", () => setJobArchived(workspaceId, ownerJob.id, true)],
    ["moving the Owner job out of Management", () => saveJob(workspaceId, { name: "Owner", color: "#4478A8", department_id: null }, ownerJob.id)],
  ])("answers %s with the readable sentence and its key", async (_case, write) => {
    answer = { data: null, error: kept };
    const failure = await write().then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(RequestError);
    expect(failure).toMatchObject({
      message: managementAndOwnerRefusals["catalog.system_record"],
      reason: "catalog.system_record",
    });
  });

  it("keeps any other refusal as it was", async () => {
    answer = { data: null, error: { code: "42501", message: "Access denied" } };
    const failure = await setJobArchived(workspaceId, ownerJob.id, true).then(() => null, (error: unknown) => error);
    expect(failure).toMatchObject({ message: "Access denied" });
    expect((failure as RequestError).reason).toBeUndefined();
  });

  it("reads the saved job back with its system key and its Lineup drawings (AVATAR-IKON)", async () => {
    answer = { data: ownerJob, error: null };
    expect(await saveJob(workspaceId, { name: "Owner", color: "#4478A8", department_id: ownerJob.department_id }, ownerJob.id)).toEqual(ownerJob);
    expect(chain.select).toHaveBeenCalledWith(expect.stringContaining("system_key"));
    expect(chain.select).toHaveBeenCalledWith(expect.stringContaining("lineup_icons"));
  });

  // AVATAR-IKON: the browser may give a new job its drawings, but has no grant to change them later;
  // the job drawer's save changes them through the API.
  it("never writes the drawings of a job it renames", async () => {
    answer = { data: ownerJob, error: null };
    const details = { name: "Owner", color: "#4478A8", department_id: ownerJob.department_id };
    await saveJob(workspaceId, { ...details, lineup_icons: ["001-server"] }, ownerJob.id);
    expect(chain.update).toHaveBeenCalledWith({ ...details, updated_at: expect.any(String) });
    await saveJob(workspaceId, { ...details, lineup_icons: ["001-server"] });
    expect(chain.insert).toHaveBeenCalledWith({ ...details, lineup_icons: ["001-server"], workspace_id: workspaceId });
  });
});
