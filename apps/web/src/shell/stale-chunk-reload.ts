// After a new deploy, a tab still running the old build asks for lazy chunks
// that no longer exist; the SPA fallback answers with index.html and the page
// goes blank. Vite reports every failed dynamic import (React.lazy included)
// as `vite:preloadError`, so one listener covers them all: reload once to pick
// up the new build. A second failure within the window is a real error and
// does not reload again, so it cannot loop.
//
// The error itself is never swallowed (BL-1075): a cancelled event makes Vite's
// import come back undefined, React.lazy then reads `.default` of it and the
// page went white. It goes on to the page's error card (CrashBoundary) and to
// Sentry, while the reload is on its way.

export const STALE_CHUNK_RELOAD_KEY = "nf.stale-chunk-reload-at";
export const STALE_CHUNK_RELOAD_WINDOW_MS = 10_000;

type Options = {
  target?: EventTarget;
  storage?: () => Storage;
  reload?: () => void;
  now?: () => number;
};

function readMark(storage: () => Storage): number | null {
  try {
    const raw = storage().getItem(STALE_CHUNK_RELOAD_KEY);
    const at = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function writeMark(storage: () => Storage, at: number): void {
  try {
    storage().setItem(STALE_CHUNK_RELOAD_KEY, String(at));
  } catch {
    // No storage: the in-page flag still limits this page to one reload.
  }
}

export function installStaleChunkReload({
  target = window,
  storage = () => window.sessionStorage,
  reload = () => window.location.reload(),
  now = Date.now,
}: Options = {}): () => void {
  let reloading = false;

  const onPreloadError = () => {
    if (reloading) return;
    const at = now();
    const last = readMark(storage);
    if (last !== null && at - last >= 0 && at - last < STALE_CHUNK_RELOAD_WINDOW_MS) return;
    reloading = true;
    writeMark(storage, at);
    reload();
  };

  target.addEventListener("vite:preloadError", onPreloadError);
  return () => target.removeEventListener("vite:preloadError", onPreloadError);
}
