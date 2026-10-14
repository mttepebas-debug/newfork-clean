// Stand-in for @supabase/supabase-js on the atlas.
// Auth always has the atlas viewer signed in; table reads and writes answer
// from the demo world (an area registers its table in world.ts) with
// PostgREST's own semantics: filters, order, .select() after a write,
// .single(), and the error shape { code, message, hint, details }. Realtime
// channels connect and stay quiet; storage keeps files in this browser.
import { demoUser, tableRows, tableWrites } from "./world";
import { currentPage } from "../pages";

declare global {
  interface Window {
    /** Signed-out atlas pages: back to signed out when the app tries to leave. */
    __atlasSignOut?: () => void;
  }
}
import { domainStore } from "./store";

const session = {
  access_token: "demo-access-token",
  refresh_token: "demo-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24,
  user: demoUser,
};

type Row = Record<string, unknown>;
interface PgError { code: string; message: string; hint: string | null; details: string | null }

function pgError(value: unknown): PgError {
  if (value && typeof value === "object" && typeof (value as PgError).code === "string" && typeof (value as PgError).message === "string") {
    const error = value as Partial<PgError>;
    return { code: error.code!, message: error.message!, hint: error.hint ?? null, details: error.details ?? null };
  }
  console.error("[demo supabase]", value);
  return { code: "XX000", message: "Internal error", hint: null, details: null };
}

// ---------- filters ----------

function compare(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  return String(left) < String(right) ? -1 : 1;
}

/** A filter value as PostgREST reads it from the URL: "null", "true", numbers. */
function literal(raw: string): unknown {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

function same(cell: unknown, value: unknown): boolean {
  if (cell === value) return true;
  if (cell === null || cell === undefined || value === null || value === undefined) return false;
  return String(cell) === String(value);
}

function likePattern(pattern: string, flags: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, flags);
}

function listOf(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const text = String(raw).replace(/^\(|\)$/g, "");
  return text === "" ? [] : text.split(",").map((part) => literal(part.trim().replace(/^"|"$/g, "")));
}

function test(operator: string, cell: unknown, value: unknown): boolean {
  switch (operator) {
    case "eq": return same(cell, value);
    case "neq": return !same(cell, value);
    case "gt": return cell !== null && cell !== undefined && compare(cell, value) > 0;
    case "gte": return cell !== null && cell !== undefined && compare(cell, value) >= 0;
    case "lt": return cell !== null && cell !== undefined && compare(cell, value) < 0;
    case "lte": return cell !== null && cell !== undefined && compare(cell, value) <= 0;
    case "like": return typeof cell === "string" && likePattern(String(value), "").test(cell);
    case "ilike": return typeof cell === "string" && likePattern(String(value), "i").test(cell);
    case "is": {
      const wanted = typeof value === "string" ? literal(value) : value;
      return wanted === null ? cell === null || cell === undefined : cell === wanted;
    }
    case "in": return listOf(value).some((item) => same(cell, item));
    case "cs": {
      const wanted = listOf(typeof value === "string" ? value.replace(/^\{|\}$/g, "") : value);
      return Array.isArray(cell) && wanted.every((item) => cell.some((part) => same(part, item)));
    }
    case "ov": {
      const wanted = listOf(typeof value === "string" ? value.replace(/^\{|\}$/g, "") : value);
      return Array.isArray(cell) && wanted.some((item) => cell.some((part) => same(part, item)));
    }
    default:
      console.warn("[demo supabase] filter not understood:", operator);
      return true;
  }
}

/** One "column.operator.value" term of .or()/.not(), "not." and nesting included. */
function orTerm(term: string): (row: Row) => boolean {
  const nested = /^(and|or)\((.*)\)$/.exec(term);
  if (nested) {
    const parts = splitTop(nested[2]!).map(orTerm);
    return nested[1] === "and" ? (row) => parts.every((part) => part(row)) : (row) => parts.some((part) => part(row));
  }
  const [column, ...rest] = term.split(".");
  let negate = false;
  if (rest[0] === "not") { negate = true; rest.shift(); }
  const operator = rest.shift() ?? "eq";
  const value = literal(rest.join("."));
  return (row) => test(operator, row[column!], value) !== negate;
}

function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) { parts.push(current); current = ""; continue; }
    current += char;
  }
  if (current) parts.push(current);
  return parts.map((part) => part.trim());
}

/** .select("a,b,alias:c,embedded(...)"): the columns asked for. */
function project(row: Row, columns: string | null): Row {
  if (!columns || columns.trim() === "*" || columns.trim() === "") return { ...row };
  const out: Row = {};
  for (const item of splitTop(columns.replace(/\s+/g, ""))) {
    if (item === "*") { Object.assign(out, row); continue; }
    const embedded = /^(?:([a-zA-Z_][\w]*):)?([a-zA-Z_][\w]*)(?:![\w]+)?\(/.exec(item);
    if (embedded) {
      const name = embedded[2]!;
      if (name in row) out[embedded[1] ?? name] = row[name];
      continue;
    }
    const [alias, source] = item.includes(":") ? item.split(":") : [item, item];
    const column = source!.split("::")[0]!;
    out[alias!] = row[column] ?? null;
  }
  return out;
}

// ---------- the query builder ----------

type Operation = "select" | "insert" | "update" | "upsert" | "delete";

function queryBuilder(table: string) {
  let operation: Operation = "select";
  let payload: Row[] = [];
  let returning = false;
  let columns: string | null = "*";
  let single: "one" | "maybe" | null = null;
  let head = false;
  let countMode = false;
  let onConflict = "id";
  let ignoreDuplicates = false;
  let throwOnError = false;
  const filters: ((row: Row) => boolean)[] = [];
  const orders: { column: string; ascending: boolean; nullsFirst: boolean }[] = [];
  let limit: number | null = null;
  let offset = 0;

  const builder: Record<string, unknown> = {};
  const chain = (fn: (...args: any[]) => void) => (...args: any[]) => { fn(...args); return builder; };
  const where = (operator: string) => chain((column: string, value: unknown) => {
    filters.push((row) => test(operator, row[column], value));
  });

  Object.assign(builder, {
    select: chain((cols?: string, options?: { count?: string; head?: boolean }) => {
      columns = cols ?? "*";
      if (operation !== "select") returning = true;
      if (options?.count) countMode = true;
      if (options?.head) head = true;
    }),
    insert: chain((values: Row | Row[]) => { operation = "insert"; payload = Array.isArray(values) ? values : [values]; }),
    upsert: chain((values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
      operation = "upsert";
      payload = Array.isArray(values) ? values : [values];
      onConflict = options?.onConflict ?? onConflict;
      ignoreDuplicates = options?.ignoreDuplicates ?? false;
    }),
    update: chain((values: Row) => { operation = "update"; payload = [values]; }),
    delete: chain(() => { operation = "delete"; }),
    eq: where("eq"), neq: where("neq"), gt: where("gt"), gte: where("gte"), lt: where("lt"), lte: where("lte"),
    like: where("like"), ilike: where("ilike"), is: where("is"), in: where("in"),
    contains: where("cs"), overlaps: where("ov"),
    not: chain((column: string, operator: string, value: unknown) => {
      filters.push((row) => !test(operator, row[column], value));
    }),
    filter: chain((column: string, operator: string, value: unknown) => {
      const negate = operator.startsWith("not.");
      const op = negate ? operator.slice(4) : operator;
      filters.push((row) => test(op, row[column], typeof value === "string" ? literal(value) : value) !== negate);
    }),
    match: chain((query: Row) => {
      for (const [column, value] of Object.entries(query)) filters.push((row) => same(row[column], value));
    }),
    or: chain((expression: string) => {
      const parts = splitTop(expression).map(orTerm);
      filters.push((row) => parts.some((part) => part(row)));
    }),
    order: chain((column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => {
      const ascending = options?.ascending ?? true;
      orders.push({ column, ascending, nullsFirst: options?.nullsFirst ?? !ascending });
    }),
    limit: chain((count: number) => { limit = count; }),
    range: chain((from: number, to: number) => { offset = from; limit = to - from + 1; }),
    single: chain(() => { single = "one"; }),
    maybeSingle: chain(() => { single = "maybe"; }),
    abortSignal: chain(() => undefined),
    returns: chain(() => undefined),
    throwOnError: chain(() => { throwOnError = true; }),
    then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
      return Promise.resolve()
        .then(() => {
          const result = run();
          if (throwOnError && result.error) throw result.error;
          return result;
        })
        .then(resolve, reject);
    },
  });

  const matches = (row: Row) => filters.every((filter) => filter(row));

  function shape(rows: Row[], status: number) {
    let out = rows;
    for (const { column, ascending, nullsFirst } of [...orders].reverse()) {
      out = [...out].sort((a, b) => {
        const left = a[column];
        const right = b[column];
        const leftNull = left === null || left === undefined;
        const rightNull = right === null || right === undefined;
        if (leftNull !== rightNull) return leftNull === nullsFirst ? -1 : 1;
        const order = compare(left, right);
        return ascending ? order : -order;
      });
    }
    const count = countMode ? out.length : null;
    if (offset || limit !== null) out = out.slice(offset, limit === null ? undefined : offset + limit);
    const projected = out.map((row) => project(row, columns));
    if (head) return { data: null, error: null, count, status, statusText: "OK" };
    if (single) {
      if (projected.length === 1) return { data: projected[0], error: null, count, status, statusText: "OK" };
      if (projected.length === 0 && single === "maybe") return { data: null, error: null, count, status, statusText: "OK" };
      return {
        data: null,
        error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", hint: null, details: `The result contains ${projected.length} rows` },
        count, status: 406, statusText: "Not Acceptable",
      };
    }
    return { data: projected, error: null, count, status, statusText: "OK" };
  }

  function run() {
    const writes = tableWrites(table);
    try {
      if (operation === "select") return shape(tableRows(table).filter(matches), 200);
      if (operation === "insert") {
        const saved = payload.map((values) => writes?.insert ? writes.insert({ ...values }) : { ...values });
        return returning ? shape(saved, 201) : { data: null, error: null, count: null, status: 201, statusText: "Created" };
      }
      if (operation === "upsert") {
        const keys = onConflict.split(",").map((key) => key.trim());
        const saved: Row[] = [];
        for (const values of payload) {
          const existing = tableRows(table).find((row) => keys.every((key) => same(row[key], values[key])));
          if (existing && ignoreDuplicates) continue;
          if (existing) saved.push(writes?.update ? writes.update(existing, { ...values }) : { ...existing, ...values });
          else saved.push(writes?.insert ? writes.insert({ ...values }) : { ...values });
        }
        return returning ? shape(saved, 201) : { data: null, error: null, count: null, status: 201, statusText: "Created" };
      }
      if (operation === "update") {
        const targets = tableRows(table).filter(matches);
        const saved = targets.map((row) => writes?.update ? writes.update(row, { ...payload[0] }) : { ...row, ...payload[0] });
        return returning ? shape(saved, 200) : { data: null, error: null, count: null, status: 204, statusText: "No Content" };
      }
      const targets = tableRows(table).filter(matches);
      for (const row of targets) writes?.remove?.(row);
      return returning ? shape(targets, 200) : { data: null, error: null, count: null, status: 204, statusText: "No Content" };
    } catch (thrown) {
      const error = pgError(thrown);
      const status = error.code === "42501" ? 403 : error.code === "23505" ? 409 : error.code.startsWith("PGRST") ? 406 : 400;
      return { data: null, error, count: null, status, statusText: "Error" };
    }
  }

  return builder;
}

// ---------- realtime ----------

function channel(name: string) {
  const presence: Record<string, unknown[]> = {};
  const api: Record<string, unknown> = {
    topic: `realtime:${name}`,
    on: () => api,
    subscribe: (callback?: (status: string) => void) => {
      setTimeout(() => callback?.("SUBSCRIBED"), 0);
      return api;
    },
    track: async (payload: unknown) => {
      presence[demoUser.id] = [payload];
      return "ok";
    },
    untrack: async () => "ok",
    presenceState: () => presence,
    send: async () => "ok",
    unsubscribe: async () => "ok",
  };
  return api;
}

// ---------- storage ----------

// Files people add (a schedule logo, an avatar), as data URLs in this browser.
const files = domainStore<Record<string, { url: string; type: string; size: number }>>("supabase-storage", () => ({}));
const STORAGE_BASE = "https://storage.newfork.demo/object";

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** The URL a stored file opens at (a data URL in this browser), or null when it is gone. */
export function storedFileUrl(name: string, path: string): string | null {
  return files.data[`${name}/${path}`]?.url ?? null;
}

// A seeded file that was never uploaded in this browser still opens: a short text placeholder.
function placeholderUrl(name: string, path: string): string {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(`Demo file\n${name}/${path}\n\nThis file is a stand-in; nothing was uploaded in this browser.`)}`;
}

function bucket(name: string) {
  const key = (path: string) => `${name}/${path}`;
  const url = (path: string) => files.data[key(path)]?.url ?? placeholderUrl(name, path);
  const upload = async (path: string, body: Blob, options?: { upsert?: boolean; contentType?: string }) => {
    if (files.data[key(path)] && !options?.upsert)
      return { data: null, error: { message: "The resource already exists", statusCode: "409" } };
    const dataUrl = await readAsDataUrl(body);
    files.data[key(path)] = { url: dataUrl, type: options?.contentType ?? body.type, size: body.size };
    files.save();
    return { data: { path, id: crypto.randomUUID(), fullPath: key(path) }, error: null };
  };
  return {
    upload,
    uploadToSignedUrl: async (path: string, _token: string, body: Blob, options?: { upsert?: boolean; contentType?: string }) => {
      const result = await upload(path, body, options);
      return result.error ? result : { data: { path, fullPath: key(path) }, error: null };
    },
    createSignedUploadUrl: async (path: string) => ({
      data: { signedUrl: `${STORAGE_BASE}/upload/sign/${name}/${path}?token=demo`, token: `demo-${crypto.randomUUID()}`, path },
      error: null,
    }),
    remove: async (paths: string[]) => {
      const removed = paths.filter((path) => files.data[key(path)]).map((path) => ({ name: path }));
      for (const path of paths) delete files.data[key(path)];
      files.save();
      return { data: removed, error: null };
    },
    createSignedUrl: async (path: string) => ({ data: { signedUrl: url(path) }, error: null }),
    createSignedUrls: async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: url(path), error: null })),
      error: null,
    }),
    download: async (path: string) => ({ data: await (await fetch(url(path))).blob(), error: null }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: url(path) } }),
  };
}

export function createClient(..._args: unknown[]) {
  const listeners = new Set<(event: string, value: unknown) => void>();
  // Sign-in and public pages start signed out; every other page is signed in.
  let current: typeof session | null = currentPage().signedOut ? null : session;
  const emit = (event: string) => queueMicrotask(() => listeners.forEach((listener) => listener(event, current)));
  const signIn = async (credentials?: { password?: string }) => {
    // PAGES "wrong password" scenario: this one password is refused, like the real server.
    if (credentials?.password === "wrong-password") {
      return { data: { session: null, user: null }, error: { name: "AuthApiError", message: "Invalid login credentials", status: 400, code: "invalid_credentials" } };
    }
    current = session;
    emit("SIGNED_IN");
    return { data: { session, user: demoUser }, error: null };
  };
  window.__atlasSignOut = () => {
    if (!current) return;
    current = null;
    emit("SIGNED_OUT");
  };
  return {
    auth: {
      getSession: async () => ({ data: { session: current }, error: null }),
      getUser: async () => current
        ? { data: { user: demoUser }, error: null }
        : { data: { user: null }, error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 } },
      refreshSession: async () => ({ data: { session: current, user: current ? demoUser : null }, error: null }),
      onAuthStateChange: (callback: (event: string, value: unknown) => void) => {
        listeners.add(callback);
        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
      },
      signOut: async () => {
        window.__atlasSignOut?.();
        return { error: null };
      },
      signInWithPassword: signIn,
      // A new account has no session until its email is confirmed, like the
      // hosted project (SEC-003): the page shows "Check your email".
      signUp: async () => ({ data: { session: null, user: demoUser }, error: null }),
      verifyOtp: signIn,
      updateUser: async () => ({ data: { user: demoUser }, error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      setSession: signIn,
      mfa: { listFactors: async () => ({ data: { all: [], totp: [] }, error: null }) },
    },
    from: (table: string) => queryBuilder(table),
    rpc: async () => ({ data: null, error: null }),
    channel,
    removeChannel: async () => "ok",
    removeAllChannels: async () => [],
    getChannels: () => [],
    realtime: { setAuth: () => undefined },
    storage: { from: (name: string) => bucket(name) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  };
}

export function isAuthRetryableFetchError(): boolean {
  return false;
}

export type SupabaseClient = ReturnType<typeof createClient>;
export type Session = typeof session;
export type User = typeof demoUser;
