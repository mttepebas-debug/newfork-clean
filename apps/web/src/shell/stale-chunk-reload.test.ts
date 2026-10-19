import { describe, expect, it, vi } from "vitest";
import {
  STALE_CHUNK_RELOAD_KEY,
  STALE_CHUNK_RELOAD_WINDOW_MS,
  installStaleChunkReload,
} from "./stale-chunk-reload";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

function brokenStorage(): Storage {
  const fail = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail };
}

function preloadError(target: EventTarget): Event {
  const event = new Event("vite:preloadError", { cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function setup(storage: () => Storage, start = 1_000_000) {
  const target = new EventTarget();
  const reload = vi.fn();
  let clock = start;
  const dispose = installStaleChunkReload({
    target,
    storage,
    reload,
    now: () => clock,
  });
  return {
    target,
    reload,
    dispose,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("installStaleChunkReload", () => {
  // BL-1075: the error is never swallowed. Swallowed, the import comes back
  // undefined and React.lazy reads .default of it: a white page. It goes on to
  // the page's error card while the reload is on its way.
  it("reloads once and lets the error go on to the page's error card when a chunk of an old build is gone", () => {
    const storage = memoryStorage();
    const { target, reload } = setup(() => storage);

    const event = preloadError(target);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
    expect(storage.getItem(STALE_CHUNK_RELOAD_KEY)).toBe("1000000");
  });

  it("does not reload twice when several chunks fail on the same page", () => {
    const storage = memoryStorage();
    const { target, reload } = setup(() => storage);

    preloadError(target);
    const second = preloadError(target);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
  });

  it("lets the error through after a reload less than 10 s ago, so it reaches Sentry", () => {
    const storage = memoryStorage();
    storage.setItem(STALE_CHUNK_RELOAD_KEY, String(1_000_000 - (STALE_CHUNK_RELOAD_WINDOW_MS - 1)));
    const { target, reload } = setup(() => storage);

    const event = preloadError(target);

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("reloads again when the last reload was 10 s or more ago", () => {
    const storage = memoryStorage();
    storage.setItem(STALE_CHUNK_RELOAD_KEY, String(1_000_000 - STALE_CHUNK_RELOAD_WINDOW_MS));
    const { target, reload } = setup(() => storage);

    const event = preloadError(target);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it("still reloads exactly once when storage throws", () => {
    const { target, reload } = setup(brokenStorage);

    preloadError(target);
    preloadError(target);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("still reloads exactly once when storage itself cannot be reached", () => {
    const { target, reload } = setup(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    preloadError(target);
    preloadError(target);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("stops listening once disposed", () => {
    const { target, reload, dispose } = setup(memoryStorage);

    dispose();
    const event = preloadError(target);

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
