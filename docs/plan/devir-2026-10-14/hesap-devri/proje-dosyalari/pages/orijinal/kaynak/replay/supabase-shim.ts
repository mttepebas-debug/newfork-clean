// The real supabase-js, with its session kept in memory (the persona's) and no
// token refresh, so the app signs in as the recorded person inside a frame.
import { createClient as createRealClient } from "@supabase/supabase-js-real";
import { memoryStorage } from "./replay";

export * from "@supabase/supabase-js-real";

export function createClient(url: string, key: string, options: Record<string, any> = {}) {
  return createRealClient(url, key, {
    ...options,
    auth: { ...(options.auth ?? {}), storage: memoryStorage, autoRefreshToken: false, detectSessionInUrl: false, persistSession: true },
  });
}
