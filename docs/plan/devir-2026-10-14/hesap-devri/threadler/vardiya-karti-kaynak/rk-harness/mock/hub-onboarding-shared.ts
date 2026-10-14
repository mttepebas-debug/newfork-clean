// Shared pieces of the account-level pages (workspace hub, owner setup,
// employee welcome): the other workspaces the viewer's account knows, the
// context for a workspace other than Harbor & Vine, and a small stand-in for
// the supabase-js calls these pages make straight to the tables and storage.
import * as shared from "@newfork/shared";
import { supabaseClient } from "../../../src/lib/supabase";
import { ApiError, contextFor } from "./api";
import { storedFileUrl } from "./fake-supabase";
import { LOC, WORKSPACE_ID } from "./world";

export type Route = (method: string, path: string, handler: import("./api").Handler) => void;
export type Role = "owner" | "admin" | "manager" | "employee";

/** The other businesses in the demo (ids are fixed so saved state stays linked). */
export const OTHER = {
  saltline: { id: "5a17e1ae-0b5c-4c2e-9a71-3f0c8d2b7e41", name: "Saltline Oyster Bar" },
  cedar: { id: "cedae5b2-8b8f-4d1a-a0c4-6e2f9b1d3a52", name: "Cedar & Smoke BBQ" },
  pier9: { id: "9e19a7c1-2d4b-4f6a-8c3e-1b5d7f9a0c63", name: "Pier 9 Kitchen" },
  bayside: { id: "ba751de0-3c6e-4a8b-9d2f-4e6a8c0b2d74", name: "Bayside Grill" },
  corner: { id: "c0b1e7a5-4d8f-4b9c-ae31-5f7b9d1c3e85", name: "Corner Bistro" },
} as const;

export const HARBOR = { id: WORKSPACE_ID, name: "Harbor & Vine" };

export const nowIso = () => new Date().toISOString();
export const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

export function fail(status: number, error: string, extra: Record<string, unknown> = {}): never {
  throw new ApiError(status, { error, ...extra });
}

/** The workspace the tab asked for (the X-Newfork-Workspace-Id header the web sends). */
export function tabWorkspaceId(): string | null {
  try {
    return window.sessionStorage.getItem("newfork.tabWorkspaceId");
  } catch {
    return null;
  }
}

/** What /v1/context answers when the account has no active membership to open. */
export function noContext(): never {
  return fail(401, "Invalid session or membership");
}

/** A stable membership id per workspace, so the context fingerprint stays put. */
function membershipIdFor(workspaceId: string): string {
  return `${workspaceId.slice(0, 8)}-7a11-4b00-8c00-${workspaceId.slice(-12)}`;
}

/**
 * The context for a workspace other than Harbor & Vine: the same shape the
 * fallback builds, with the workspace, the role and the onboarding swapped.
 */
export function contextIn(
  workspace: { id: string; name: string },
  role: Role,
  onboarding: { status: "complete" | "incomplete"; currentStep: number; revision?: number },
) {
  if (workspace.id === WORKSPACE_ID && onboarding.status === "complete") return contextFor();
  const base = contextFor();
  const allLocations = role !== "manager" && role !== "employee";
  const permissions = shared.permissionsForRole(role);
  return {
    ...base,
    workspace: { ...base.workspace, id: workspace.id, name: workspace.name },
    membership: {
      ...base.membership,
      id: workspace.id === WORKSPACE_ID ? base.membership.id : membershipIdFor(workspace.id),
      workspaceId: workspace.id,
      role,
      allLocations,
    },
    permissions,
    // Owner-only actions stay with the owner.
    actions: role === "owner" ? base.actions : base.actions.filter((action: string) => action !== "workspace.setup"),
    onboarding: { revision: 1, ...onboarding },
    locationScope: { allLocations, locationIds: allLocations ? [] : workspace.id === WORKSPACE_ID ? [LOC.downtown] : [] },
  };
}

// ---------------------------------------------------------------------------
// supabase-js stand-in for a few tables and the document upload bucket. The
// shared fake answers reads only; these pages also write (owner setup saves
// locations, departments and jobs straight to the tables, and onboarding
// uploads a file to a signed URL), so the client is wrapped here.

export type TableError = { code: string; message: string; hint?: string | null; details?: string | null };
export type TableResult = { data: unknown; error: TableError | null };
export interface TableOp {
  op: "select" | "insert" | "update" | "upsert" | "delete";
  values: Record<string, unknown> | null;
  filters: Record<string, unknown>;
  single: "one" | "maybe" | null;
}
export type TableHandler = (op: TableOp) => TableResult;

const tableHandlers = new Map<string, TableHandler>();
let patched = false;

/**
 * A file uploaded to the onboarding bucket, as a blob: URL a new window can
 * open (the shared fake storage keeps it as a data URL, which browsers refuse
 * to open as a page).
 */
export async function uploadedFileUrl(path: string): Promise<string | null> {
  const stored = storedFileUrl(shared.employeeOnboardingDocumentBucket, path);
  if (!stored) return null;
  try {
    return URL.createObjectURL(await (await fetch(stored)).blob());
  } catch {
    return null;
  }
}

export function handleTable(table: string, handler: TableHandler): void {
  tableHandlers.set(table, handler);
  patchClient();
}

/** Let the signed-URL upload of an onboarding document succeed in the browser. */
export function acceptUploads(): void {
  patchClient();
}

function tableBuilder(table: string, handler: TableHandler) {
  const op: TableOp = { op: "select", values: null, filters: {}, single: null };
  const builder: Record<string, unknown> = {};
  const chain = (fn?: (...args: unknown[]) => void) => (...args: unknown[]) => {
    fn?.(...args);
    return builder;
  };
  Object.assign(builder, {
    select: chain(),
    insert: chain((values) => { op.op = "insert"; op.values = values as Record<string, unknown>; }),
    upsert: chain((values) => { op.op = "upsert"; op.values = values as Record<string, unknown>; }),
    update: chain((values) => { op.op = "update"; op.values = values as Record<string, unknown>; }),
    delete: chain(() => { op.op = "delete"; }),
    eq: chain((column, value) => { op.filters[column as string] = value; }),
    neq: chain(), in: chain(), is: chain(), order: chain(), limit: chain(), range: chain(), match: chain(),
    single: chain(() => { op.single = "one"; }),
    maybeSingle: chain(() => { op.single = "maybe"; }),
    then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
      // A little latency, like the network.
      return new Promise((done) => setTimeout(done, 40))
        .then(() => {
          const result = handler(op);
          return { ...result, count: null, status: result.error ? 400 : 200, statusText: "" };
        })
        .then(resolve, reject);
    },
  });
  void table;
  return builder;
}

function patchClient(): void {
  if (patched || !supabaseClient) return;
  patched = true;
  const client = supabaseClient as unknown as {
    from: (table: string) => unknown;
    storage: { from: (bucket: string) => Record<string, unknown> };
  };
  const originalFrom = client.from.bind(client);
  client.from = (table: string) => {
    const handler = tableHandlers.get(table);
    return handler ? tableBuilder(table, handler) : originalFrom(table);
  };
  const originalBucket = client.storage.from.bind(client.storage);
  client.storage.from = (bucket: string) => {
    const base = originalBucket(bucket) as { upload: (path: string, body: Blob, options?: { upsert?: boolean; contentType?: string }) => Promise<unknown> };
    return {
      ...base,
      // The signed upload lands in the same browser storage as a plain upload.
      uploadToSignedUrl: (path: string, _token: string, file: Blob, options?: { contentType?: string; upsert?: boolean }) =>
        base.upload(path, file, { contentType: options?.contentType, upsert: options?.upsert }),
    };
  };
}
