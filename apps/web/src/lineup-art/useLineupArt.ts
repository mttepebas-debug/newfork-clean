import { useEffect, useState } from "react";

// AVATAR-IKON: the archive's SVGs (~370 KB) stay out of the main bundle. This file is the only one
// that loads ./art-svgs.generated, and only through import(), so Vite ships it as its own chunk.
// One promise per page: every LineupArt waits on the same load.

type Svgs = Record<string, string>;

let svgs: Svgs | null = null;
let loading: Promise<Svgs> | null = null;

function loadLineupArtSvgs(): Promise<Svgs> {
  loading ??= import("./art-svgs.generated").then(
    (module) => (svgs = module.artSvgs),
    (error: unknown) => {
      // A chunk that did not load (offline, a deploy in between): the next mount tries again.
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** The archive's SVGs by key; null until the chunk has loaded (or when it could not load). */
export function useLineupArtSvgs(): Svgs | null {
  const [loaded, setLoaded] = useState<Svgs | null>(svgs);
  useEffect(() => {
    if (loaded) return;
    let live = true;
    loadLineupArtSvgs().then(
      (value) => {
        if (live) setLoaded(value);
      },
      () => {
        // Initials stay; nothing to tell the person.
      },
    );
    return () => {
      live = false;
    };
  }, [loaded]);
  return loaded;
}
