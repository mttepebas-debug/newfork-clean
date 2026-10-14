// Demo data for one area of the app (requests, employees, settings...), kept
// in this browser tab and in localStorage when the browser allows it. Each
// area owns its own store; "Reset demo data" reseeds every store.
// Data is reseeded when the week changes, so "this week" always has content.
import { mondayOf, todayIn } from "./time";
import { copyInto, onStore, post } from "../sync";

const ZONE = "America/New_York";
const reseeders: (() => void)[] = [];

export interface Store<T> {
  /** The live data; change it in place, then call save(). */
  readonly data: T;
  save(): void;
}

export function domainStore<T>(name: string, seed: () => T): Store<T> {
  const key = `newfork.atlas.${name}.v1`;
  const week = () => mondayOf(todayIn(ZONE));
  let data: T;
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as { week: string; data: T }) : null;
    data = parsed && parsed.week === week() ? parsed.data : structuredClone(seed());
  } catch {
    data = seed();
  }
  const store = {
    get data() { return data; },
    save() {
      try {
        window.localStorage.setItem(key, JSON.stringify({ week: week(), data }));
      } catch {
        // Storage blocked: the tab keeps its own copy.
      }
      post({ kind: "store", name, data });
    },
  };
  // PAGES: the other frame's save arrives here; same objects, new contents.
  onStore(name, (next) => {
    data = copyInto(data, next) as T;
    try {
      window.localStorage.setItem(key, JSON.stringify({ week: week(), data }));
    } catch {
      // Storage blocked: memory only.
    }
  });
  reseeders.push(() => { data = copyInto(data, structuredClone(seed())) as T; store.save(); });
  return store;
}

export function reseedAll(): void {
  for (const reseed of reseeders) reseed();
}
