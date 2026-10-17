import { useEffect } from "react";
import { foldPoint, nextFolded, stickyStack, type Band } from "./frozen-top";
import "./frozen-top.css";

// Every screen keeps its top in place (Mert 2026-10-16, "header ve tableri
// freeze yap bütün ekranlarda"): the page heading, then the tabs and bars
// under it, stick where they rest while the content scrolls under them. On a
// phone the heading folds to one line once the page has moved (Mert's "B").
// List pages already scroll only their list (views/list-page-frozen.css);
// here their heading only folds. One hook per scrolling area: the app's main
// area, Settings' content and Account's content (a phone's Account scrolls
// the whole document). A window shorter than 560 px scrolls as before.

/** The page heading: the first one in the area is the piece everything else stacks under. */
const HEADINGS = ".catalog-page-header, .settings-page-header, .account-page-header";
/** What else stays above the content. */
const PIECES = [
  ".account-sidebar", // a phone's Account menu, above the page
  ".eh-context-bar", // Employee Hub's workspace bar, above the greeting
  ".rp-directory", // Settings → Roles: the role tabs
  ".rp-mobile-selector", // … and a phone's role picker
  ".account-page > .requests-tabs", // Account → Documents
  ".sx-tabs", // Shift Hub
  ".employee-weekly-workspace > .weekly-preferences-tabs", // My Availability
].join(", ");
const AREAS = ".app-main, .settings-content, .account-content-scroll";
const TALL = "(min-height: 560px)";
const PHONE = "(max-width: 720px)";

type Fold = "page" | "frame" | null;

/** `area` scrolls; `root` (the area, or a box around it and what sits above it) holds the pieces. */
export function useFrozenTop(area: HTMLElement | null, root: HTMLElement | null = area) {
  useEffect(() => {
    if (!area || !root || typeof ResizeObserver === "undefined") return;
    const tall = window.matchMedia(TALL);
    const phone = window.matchMedia(PHONE);
    let pieces: HTMLElement[] = [];
    let open = stickyStack([], false);
    let shut = stickyStack([], true);
    let point = foldPoint(0, 0);
    let fold: Fold = null;
    let frame = 0;
    // Declared before measure() runs; set up at the end.
    let watched: ResizeObserver;
    const observed = new Set<HTMLElement>();

    // A phone's Account lets the document scroll (account.css).
    const documentScrolls = () => !/(auto|scroll)/.test(getComputedStyle(area).overflowY);
    const scroller = () => (documentScrolls() ? document.documentElement : area);
    const scrolled = () => (documentScrolls() ? window.scrollY : area.scrollTop);

    const find = () => {
      const whole = documentScrolls();
      // A page that holds its own top (the phone Lineup, data-frozen-own) is left alone.
      const ours = (element: Element) =>
        !element.closest('dialog, [role="dialog"], [aria-modal="true"], [data-frozen-own]') &&
        element.getBoundingClientRect().height > 0 &&
        (whole || element.parentElement?.closest(AREAS) === area);
      const heading = [...root.querySelectorAll<HTMLElement>(HEADINGS)].find(ours);
      if (!heading) return [];
      const found = [heading, ...root.querySelectorAll<HTMLElement>(PIECES)].filter(
        (element) => ours(element) && (whole || !element.matches(".account-sidebar")),
      );
      return found
        .filter((element, index) => found.indexOf(element) === index && !found.some((other) => other !== element && other.contains(element)))
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    };

    const release = (element: HTMLElement) => {
      delete element.dataset.frozenPiece;
      delete element.dataset.frozenLast;
      for (const name of ["--frozen-top", "--frozen-gap", "--frozen-bg", "--frozen-fold-mb"]) element.style.removeProperty(name);
    };

    const background = (element: HTMLElement) => {
      for (let node: HTMLElement | null = element.parentElement; node; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
      }
      return "var(--theme-surface)";
    };

    const place = () => {
      const stack = fold ? shut : open;
      pieces.forEach((piece, index) => {
        piece.style.setProperty("--frozen-top", `${stack.tops[index] ?? 0}px`);
        piece.style.setProperty("--frozen-gap", `${stack.gaps[index] ?? 0}px`);
      });
      if (fold) root.dataset.frozenFolded = fold;
      else delete root.dataset.frozenFolded;
      scroller().style.scrollPaddingTop = pieces.length ? `${stack.bottom}px` : "";
    };

    const bands = () => {
      const top = documentScrolls() ? 0 : area.getBoundingClientRect().top + area.clientTop;
      const offset = scrolled() - top;
      return pieces.map((piece): Band => {
        const box = piece.getBoundingClientRect();
        return { top: box.top + offset, bottom: box.bottom + offset };
      });
    };

    const measure = () => {
      frame = 0;
      // A short window, or a screen with no page heading yet (a loading
      // outline, a no-access card): nothing to measure, so nothing is laid
      // out again.
      if (!tall.matches || !root.querySelector(HEADINGS)) {
        if (!pieces.length && !fold) return;
        for (const piece of pieces) release(piece);
        pieces = [];
        fold = null;
        delete root.dataset.frozenScrolled;
        place();
        return;
      }
      // Find and measure the pieces where they rest, open and then folded, and
      // put the screen back as it was, all without the page's scroll anchoring
      // answering the changes in between.
      const box = scroller();
      box.style.overflowAnchor = "none";
      root.dataset.frozenMeasuring = "";
      delete root.dataset.frozenFolded;
      const found = tall.matches ? find() : [];
      for (const piece of pieces) if (!found.includes(piece)) release(piece);
      // Another screen starts open.
      if (found[0] !== pieces[0]) fold = null;
      pieces = found;
      const last = pieces[pieces.length - 1];
      for (const piece of pieces) {
        piece.dataset.frozenPiece = "";
        if (piece === last) piece.dataset.frozenLast = "";
        else delete piece.dataset.frozenLast;
        piece.style.setProperty("--frozen-bg", background(piece));
      }
      const opened = bands();
      const margin = last ? parseFloat(getComputedStyle(last).marginBottom) || 0 : 0;
      let folded = opened;
      if (last && phone.matches) {
        root.dataset.frozenFolded = "page";
        folded = bands();
      }
      open = stickyStack(opened, false);
      shut = stickyStack(folded, true);
      point = foldPoint(open.bottom, shut.bottom);
      if (!last || !phone.matches) fold = null;
      else if (fold === "page" && !nextFolded(true, scrolled(), point)) fold = null;
      if (!last) delete root.dataset.frozenScrolled;
      // Folded while the page scrolls, the last piece's margin keeps the page
      // its length, so the content does not jump.
      last?.style.setProperty("--frozen-fold-mb", `${open.bottom + margin - (folded[folded.length - 1]?.bottom ?? 0)}px`);
      place();
      delete root.dataset.frozenMeasuring;
      void box.offsetHeight;
      box.style.overflowAnchor = "";
      // Watch the pieces' size; a newly watched element reports once, so only
      // the new ones are added (re-adding all would measure every frame).
      const keep = new Set<HTMLElement>([root, ...pieces]);
      for (const element of observed) if (!keep.has(element)) watched.unobserve(element);
      for (const element of keep) if (!observed.has(element)) watched.observe(element);
      observed.clear();
      for (const element of keep) observed.add(element);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    const onScroll = (event: Event) => {
      if (!pieces.length) return;
      const target = event.target;
      let by: Fold = null;
      let y = 0;
      if (target === document || target === area) {
        if ((target === document) !== documentScrolls()) return;
        by = "page";
        y = scrolled();
        if (y > 0) root.dataset.frozenScrolled = "";
        else delete root.dataset.frozenScrolled;
      } else if (target instanceof HTMLElement && root.contains(target) && target.closest(".list-page, .acknowledgement-page, .employee-schedule-board")) {
        // A list page scrolls only its list (Employee Hub → Schedule only its
        // grid): the heading folds over it.
        by = "frame";
        y = target.scrollTop;
      } else return;
      if (!phone.matches) return;
      const wanted = nextFolded(fold !== null, y, by === "page" ? point : foldPoint(0, 0));
      const next: Fold = wanted ? (fold ?? by) : null;
      if (next !== fold && (fold === null || fold === by)) {
        fold = next;
        place();
      }
    };

    watched = new ResizeObserver(schedule);
    watched.observe(root);
    observed.add(root);
    const changed = new MutationObserver(schedule);
    changed.observe(root, { childList: true, subtree: true });
    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("scroll", onScroll, { passive: true });
    tall.addEventListener("change", schedule);
    phone.addEventListener("change", schedule);
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      watched.disconnect();
      changed.disconnect();
      root.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("scroll", onScroll);
      tall.removeEventListener("change", schedule);
      phone.removeEventListener("change", schedule);
      for (const piece of pieces) release(piece);
      for (const name of ["frozenFolded", "frozenScrolled", "frozenMeasuring"]) delete root.dataset[name];
      area.style.scrollPaddingTop = "";
      document.documentElement.style.scrollPaddingTop = "";
    };
  }, [area, root]);
}
