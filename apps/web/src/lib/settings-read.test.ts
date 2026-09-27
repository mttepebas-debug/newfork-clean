import { afterEach, describe, expect, it, vi } from "vitest";
import { listDocumentTypes } from "../settings/documents-data";
import {
  listDepartments,
  listImportantDates,
  listJobs,
  listLocations,
  listShiftLabels,
  listShiftTypes,
} from "../settings/organization-data";
import { loadRoleWorkspace } from "../settings/roles-data";
import { listSignatureSettings } from "../settings/signature-templates-data";
import { isNoAccess } from "./no-access";
import { RequestError } from "./request-error";
import { apiRequest } from "./supabase";

vi.mock("./supabase", () => ({ apiRequest: vi.fn(), supabaseClient: {} }));

const workspace = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const reads: Array<[string, () => Promise<unknown>, string, unknown]> = [
  ["Locations", () => listLocations(workspace), "locations", []],
  ["Jobs (departments)", () => listDepartments(workspace), "jobs", { departments: [], jobs: [] }],
  ["Jobs (jobs)", () => listJobs(workspace), "jobs", { departments: [], jobs: [] }],
  ["Shift types", () => listShiftTypes(workspace), "shift-types", []],
  ["Shift labels", () => listShiftLabels(workspace), "shift-labels", []],
  ["Important dates", () => listImportantDates(workspace), "important-dates", { dates: [], locations: [] }],
  ["Roles", () => loadRoleWorkspace(workspace), "roles", { permissions: [], roles: [] }],
  ["Documents", () => listDocumentTypes(workspace), "document-types", []],
  ["Acknowledgements", () => listSignatureSettings(workspace), "acknowledgements", { policies: [], templates: [], versions: [] }],
];

describe("Settings reads go through the API (FB-6.1.9)", () => {
  afterEach(() => vi.mocked(apiRequest).mockReset());

  // Locations, departments and jobs are also the setup wizard's reads.
  it.each(reads)("%s reads its own settings endpoint", async (_page, read, kind, body) => {
    vi.mocked(apiRequest).mockResolvedValue(body);
    await read();
    expect(apiRequest).toHaveBeenCalledWith({}, `/v1/workspaces/${workspace}/settings/${kind}`);
  });

  it.each(reads)("%s passes the API's no on as a no", async (_page, read) => {
    vi.mocked(apiRequest).mockRejectedValue(
      new RequestError("Not allowed", "authz.missing_permission", undefined, 403),
    );
    expect(isNoAccess(await read().catch((error: unknown) => error))).toBe(true);
  });
});
