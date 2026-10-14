// Today's app on recorded data. Every request the real web app makes is
// answered from responses recorded on the real API and database (main, demo
// workspace "Harbor & Vine"). Reads replay; a save that was not recorded
// answers "saving is off here". The clock is held at the recording time.
import recordings from "./recordings.json";

export type Recorded = { s: number; b: string; h?: Record<string, string> };
export type Persona = {
  label: string;
  now: string;
  session: Record<string, unknown> | null;
  start: string;
  r: Record<string, Recorded>;
};

const all = recordings as unknown as Record<string, Persona>;
const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
export const personaKey = all[params.get("as") ?? ""] ? params.get("as")! : Object.keys(all)[0]!;
export const persona = all[personaKey]!;
export const startRoute = params.get("route") || persona.start;
export const personaNames = Object.fromEntries(Object.entries(all).map(([key, value]) => [key, value.label]));

export const API_BASE = "https://api.newfork.demo";
export const DB_BASE = "https://db.newfork.demo";

// --- clock -----------------------------------------------------------------
const RealDate = Date;
const offset = new RealDate(persona.now).getTime() - RealDate.now();
class HeldDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...(args as [string]));
  }
  static override now(): number {
    return RealDate.now() + offset;
  }
}
export function holdClock(): void {
  (globalThis as { Date: DateConstructor }).Date = HeldDate as unknown as DateConstructor;
}

// --- auth storage ----------------------------------------------------------
const stored = new Map<string, string>();
export const memoryStorage = {
  getItem(key: string): string | null {
    if (stored.has(key)) return stored.get(key)!;
    if (/auth-token$/.test(key) && persona.session) {
      const session = { ...persona.session, expires_at: Math.floor(HeldDate.now() / 1000) + 86_400, expires_in: 86_400 };
      return JSON.stringify(session);
    }
    return null;
  },
  setItem(key: string, value: string): void {
    stored.set(key, value);
  },
  removeItem(key: string): void {
    stored.set(key, "null");
  },
};

// --- requests --------------------------------------------------------------
function keyOf(method: string, channel: string, url: URL, body: string, accept: string): string {
  const query = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const search = query.length ? "?" + query.map(([k, v]) => `${k}=${v}`).join("&") : "";
  let key = `${method} ${channel}${url.pathname}${search}`;
  if (/vnd\.pgrst\.object/.test(accept)) key += " [one]";
  if (method !== "GET" && method !== "HEAD" && body) key += ` #${hash(body)}`;
  return key;
}

export function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

const keys = Object.keys(persona.r);
function nearest(key: string): Recorded | null {
  if (persona.r[key]) return persona.r[key]!;
  const [method, rest] = [key.slice(0, key.indexOf(" ")), key.slice(key.indexOf(" ") + 1)];
  const path = rest.split(/[?# ]/)[0]!;
  const one = key.includes(" [one]");
  if (method !== "GET" && method !== "HEAD") {
    // A read sent as POST (previews, checks) answers from the same path.
    if (!/preview|assess|check|candidates|impact|read|search|validate|resolve/i.test(path)) return null;
  }
  const wanted = new URLSearchParams(rest.includes("?") ? rest.slice(rest.indexOf("?") + 1).split(/[# ]/)[0] : "");
  let best: string | null = null;
  let score = -1;
  for (const candidate of keys) {
    if (!candidate.startsWith(`${method} ${path}`)) continue;
    const tail = candidate.slice(`${method} ${path}`.length);
    if (tail && !/^[?# ]/.test(tail)) continue;
    if (candidate.includes(" [one]") !== one) continue;
    const got = new URLSearchParams(tail.startsWith("?") ? tail.slice(1).split(/[# ]/)[0] : "");
    let s = 0;
    for (const [k, v] of wanted) if (got.get(k) === v) s += 2; else if (got.has(k)) s += 1;
    if (s > score) {
      score = s;
      best = candidate;
    }
  }
  return best ? persona.r[best]! : null;
}

export const missed: string[] = [];
let onBlocked: (text: string) => void = () => undefined;
export function whenBlocked(callback: (text: string) => void): void {
  onBlocked = callback;
}

function answer(recorded: Recorded): Response {
  const status = recorded.s;
  const empty = status === 204 || status === 304 || recorded.b === "";
  return new Response(empty && (status === 204 || status === 304) ? null : recorded.b, {
    status,
    headers: { "Content-Type": "application/json", ...(recorded.h ?? {}) },
  });
}

export function installFetch(): void {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const channel = href.startsWith(API_BASE) ? "api" : href.startsWith(DB_BASE) ? "db" : null;
    if (!channel) return original(input, init);
    const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    const body = typeof init.body === "string" ? init.body : "";
    const url = new URL(href);
    await new Promise((resolve) => setTimeout(resolve, 40));
    const key = keyOf(method, channel, url, body, headers.get("accept") ?? "");
    const found = nearest(key);
    if (found) return answer(found);
    missed.push(key);
    console.warn("[today's app] not recorded:", key);
    if (method === "GET" || method === "HEAD") {
      return new Response(JSON.stringify({ error: "Not part of this copy", reason: "demo.not_recorded" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    onBlocked("Saving is off in this copy of today's app. Nothing was changed.");
    return new Response(JSON.stringify({ error: "Saving is off in this copy of today's app.", reason: "demo.read_only" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  };
}

// Realtime and presence sockets stay quiet: nothing is live here.
export function quietSockets(): void {
  class QuietSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 0;
    url: string;
    protocol = "";
    binaryType = "blob";
    onopen: unknown = null;
    onclose: unknown = null;
    onerror: unknown = null;
    onmessage: unknown = null;
    constructor(url: string) {
      this.url = url;
    }
    send(): void {}
    close(): void {
      this.readyState = 3;
    }
    addEventListener(): void {}
    removeEventListener(): void {}
  }
  (window as unknown as { WebSocket: unknown }).WebSocket = QuietSocket;
}
