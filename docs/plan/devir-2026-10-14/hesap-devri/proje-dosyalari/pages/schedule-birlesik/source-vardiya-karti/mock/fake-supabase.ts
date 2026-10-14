// Stand-in for @supabase/supabase-js in the Schedule test page.
// Auth always has the demo owner signed in; table reads answer from the demo
// world; realtime channels connect and stay quiet; storage hands back nothing.
import { demoUser, tableRows } from "./world";

const session = {
  access_token: "demo-access-token",
  refresh_token: "demo-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24,
  user: demoUser,
};

type Row = Record<string, unknown>;

function queryBuilder(table: string) {
  let rows: Row[] = tableRows(table);
  let single: "one" | "maybe" | null = null;
  let head = false;
  let countMode = false;
  const builder: Record<string, unknown> = {};
  const chain = (fn?: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      fn?.(...args);
      return builder;
    };
  Object.assign(builder, {
    select: chain((_columns: unknown, options?: unknown) => {
      const opts = options as { count?: string; head?: boolean } | undefined;
      if (opts?.count) countMode = true;
      if (opts?.head) head = true;
    }),
    eq: chain((column: unknown, value: unknown) => {
      rows = rows.filter((row) => row[column as string] === value);
    }),
    neq: chain(), in: chain(), is: chain(), not: chain(), or: chain(),
    gte: chain(), lte: chain(), gt: chain(), lt: chain(), like: chain(), ilike: chain(),
    order: chain(), limit: chain(), range: chain(), filter: chain(), match: chain(),
    insert: chain(), update: chain(), upsert: chain(), delete: chain(),
    single: chain(() => { single = "one"; }),
    maybeSingle: chain(() => { single = "maybe"; }),
    then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
      const data = head ? null : single ? (rows[0] ?? null) : rows;
      return Promise.resolve({
        data,
        error: null,
        count: countMode ? rows.length : null,
        status: 200,
      }).then(resolve, reject);
    },
  });
  return builder;
}

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

export function createClient() {
  const listeners = new Set<(event: string, value: unknown) => void>();
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: demoUser }, error: null }),
      refreshSession: async () => ({ data: { session, user: demoUser }, error: null }),
      onAuthStateChange: (callback: (event: string, value: unknown) => void) => {
        listeners.add(callback);
        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
      },
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ data: { session, user: demoUser }, error: null }),
      signUp: async () => ({ data: { session, user: demoUser }, error: null }),
      updateUser: async () => ({ data: { user: demoUser }, error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      setSession: async () => ({ data: { session, user: demoUser }, error: null }),
      mfa: { listFactors: async () => ({ data: { all: [], totp: [] }, error: null }) },
    },
    from: (table: string) => queryBuilder(table),
    rpc: async () => ({ data: null, error: null }),
    channel,
    removeChannel: async () => "ok",
    removeAllChannels: async () => [],
    getChannels: () => [],
    realtime: { setAuth: () => undefined },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: null, error: { message: "Not in the test page" } }),
        createSignedUrls: async () => ({ data: [], error: null }),
        upload: async () => ({ data: null, error: { message: "Uploads are off in the test page" } }),
        remove: async () => ({ data: [], error: null }),
        download: async () => ({ data: null, error: { message: "Not in the test page" } }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
    functions: { invoke: async () => ({ data: null, error: null }) },
  };
}

export function isAuthRetryableFetchError(): boolean {
  return false;
}

export type SupabaseClient = ReturnType<typeof createClient>;
export type Session = typeof session;
export type User = typeof demoUser;
