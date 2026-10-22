import { useEffect } from "react";

/**
 * Home's location chips (.mh-filter) stick under the bar. Once the page passes under them they carry the part
 * of Home's sky (.dl-sky) they rest on, over the page ground, instead of a grey frost (manager-home.css; Mert
 * 2026-10-21 ~18:45, as every page's frozen top). This writes where they rest in the sky: measured from the
 * heading above them, so a stuck row still gets its resting place. The sky drifts as the page scrolls
 * (home-motion.ts), so its own layout box, not its drawn place, is the reference.
 */
export function useHomeFilterSky(root: HTMLElement | null) {
  useEffect(() => {
    if (!root || typeof ResizeObserver === "undefined") return;
    const place = () => {
      const filter = root.querySelector<HTMLElement>(".mh-filter");
      const sky = root.querySelector<HTMLElement>(".dl-sky");
      if (!filter || !sky) return;
      const skyBox = sky.getBoundingClientRect();
      const host = (sky.offsetParent as HTMLElement | null) ?? root;
      const skyTop = host.getBoundingClientRect().top + sky.offsetTop;
      const above = filter.previousElementSibling;
      const parent = filter.parentElement!;
      const restTop = above
        ? above.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(filter).marginTop) || 0)
        : parent.getBoundingClientRect().top + (parseFloat(getComputedStyle(parent).paddingTop) || 0);
      filter.style.setProperty("--mh-sky-x", `${Math.round(filter.getBoundingClientRect().left - skyBox.left)}px`);
      filter.style.setProperty("--mh-sky-y", `${Math.round(restTop - skyTop)}px`);
      filter.style.setProperty("--mh-sky-w", `${Math.round(sky.offsetWidth || skyBox.width)}px`);
    };
    const watched = new ResizeObserver(place);
    watched.observe(root);
    const changed = new MutationObserver(place);
    changed.observe(root, { childList: true, subtree: true });
    place();
    return () => {
      watched.disconnect();
      changed.disconnect();
    };
  }, [root]);
}
