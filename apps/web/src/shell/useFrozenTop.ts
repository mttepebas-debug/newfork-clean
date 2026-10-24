import { useEffect } from "react";
import { stickyStack, type Band } from "./frozen-top";
import "./frozen-top.css";
import "./phone-page-top.css";
import "./phone-page-tabs.css";

// Every screen keeps its top in place (Mert 2026-10-16, "header ve tableri
// freeze yap bütün ekranlarda"): the page heading, then the tabs and bars
// under it, stick where they rest while the content scrolls under them. The
// heading keeps its size, on a phone too (Mert 2026-10-17, phone notes #4).
// List pages already scroll only their list (views/list-page-frozen.css).
// One hook per scrolling area: the app's main area, Settings' content and
// Account's content (a phone's Account scrolls the whole document). A window
// shorter than 560 px scrolls as before.

/** The page heading: the first one in the area is the piece everything else stacks under. */
const HEADINGS = ".catalog-page-header, .settings-page-header, .account-page-header";
/** What else stays above the content. */
const PIECES = [
  ".account-sidebar", // a phone's Account menu, above the page
  ".rp-directory", // Settings → Roles: the role tabs
  ".rp-mobile-selector", // … and a phone's role picker
  ".account-page > .requests-tabs", // Account → Documents
  ".sx-tabs", // Shift Hub
  ".employee-weekly-workspace > .weekly-preferences-tabs", // My Availability
].join(", ");
const AREAS = ".app-main, .settings-content, .account-content-scroll";
const TALL = "(min-height: 560px)";
/** A piece's place in the main area's sky (placeSky). */
const SKY = ["--frozen-sky-x", "--frozen-sky-y", "--frozen-sky-w"];

/** `area` scrolls; `root` (the area, or a box around it and what sits above it) holds the pieces. */
export function useFrozenTop(area: HTMLElement | null, root: HTMLElement | null = area) {
  useEffect(() => {
    if (!area || !root || typeof ResizeObserver === "undefined") return;
    const tall = window.matchMedia(TALL);
    let pieces: HTMLElement[] = [];
    let frame = 0;
    // Declared before measure() runs; set up at the end.
    let watched: ResizeObserver;
    const observed = new Set<HTMLElement>();

    // A phone's Account lets the document scroll (account.css). A sheet that holds the page still sets the area
    // to hidden: it still scrolls its page (Mert 2026-10-24, the heading stuck over the tabs).
    const documentScrolls = () => !/(auto|scroll|hidden)/.test(getComputedStyle(area).overflowY);
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
      for (const name of ["--frozen-top", "--frozen-gap", "--frozen-bg", ...SKY]) element.style.removeProperty(name);
    };

    const background = (element: HTMLElement) => {
      for (let node: HTMLElement | null = element.parentElement; node; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
      }
      return "var(--theme-surface)";
    };

    const bands = () => {
      const top = documentScrolls() ? 0 : area.getBoundingClientRect().top + area.clientTop;
      const offset = scrolled() - top;
      return pieces.map((piece): Band => {
        const box = piece.getBoundingClientRect();
        return { top: box.top + offset, bottom: box.bottom + offset };
      });
    };

    const place = (stack: ReturnType<typeof stickyStack>) => {
      pieces.forEach((piece, index) => {
        piece.style.setProperty("--frozen-top", `${stack.tops[index] ?? 0}px`);
        piece.style.setProperty("--frozen-gap", `${stack.gaps[index] ?? 0}px`);
      });
      scroller().style.scrollPaddingTop = pieces.length ? `${stack.bottom}px` : "";
    };

    // A page that pins its own top (data-frozen-own) has no piece here, but
    // its top frosts under the sky by the same mark (the phone Lineup).
    // Where each piece rests inside the main area's sky (styles.css, .app-main[data-slot]), so a stuck piece
    // carries that part of the sky instead of the flat page ground (frozen-top.css; Mert 2026-10-21 ~18:45,
    // "scroll yapınca header rengi griye dönüyor"). Measured with the pieces at rest.
    const placeSky = (rests: readonly Band[]) => {
      const painter = area.closest<HTMLElement>(".app-main");
      if (!painter) {
        for (const piece of pieces) for (const name of SKY) piece.style.removeProperty(name);
        return;
      }
      const sky = painter.getBoundingClientRect();
      const box = area.getBoundingClientRect();
      // Rests are measured from the top of the area's content; the sky from the top of the main area's.
      const down =
        painter === area ? 0 : box.top + area.clientTop - (sky.top + painter.clientTop) + painter.scrollTop;
      pieces.forEach((piece, index) => {
        const left = piece.getBoundingClientRect().left - (sky.left + painter.clientLeft);
        piece.style.setProperty("--frozen-sky-x", `${Math.round(left)}px`);
        piece.style.setProperty("--frozen-sky-y", `${Math.round((rests[index]?.top ?? 0) + down)}px`);
        piece.style.setProperty("--frozen-sky-w", `${painter.clientWidth}px`);
      });
    };

    const markScrolled = () => {
      if ((pieces.length || root.querySelector("[data-frozen-own]")) && scrolled() > 0) root.dataset.frozenScrolled = "";
      else delete root.dataset.frozenScrolled;
    };

    const measure = () => {
      frame = 0;
      // A short window, or a screen with no page heading yet (a loading
      // outline, a no-access card): nothing to measure, so nothing is laid
      // out again.
      if (!tall.matches || !root.querySelector(HEADINGS)) {
        if (!pieces.length) return;
        for (const piece of pieces) release(piece);
        pieces = [];
        markScrolled();
        place(stickyStack([]));
        return;
      }
      // Find and measure the pieces where they rest, and put the screen back
      // as it was, without the page's scroll anchoring answering the changes
      // in between.
      const box = scroller();
      box.style.overflowAnchor = "none";
      root.dataset.frozenMeasuring = "";
      const found = find();
      for (const piece of pieces) if (!found.includes(piece)) release(piece);
      pieces = found;
      const last = pieces[pieces.length - 1];
      for (const piece of pieces) {
        piece.dataset.frozenPiece = "";
        if (piece === last) piece.dataset.frozenLast = "";
        else delete piece.dataset.frozenLast;
        piece.style.setProperty("--frozen-bg", background(piece));
      }
      const rests = bands();
      place(stickyStack(rests));
      placeSky(rests);
      markScrolled();
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

    // Once the content moves, a hairline marks where it passes under the top.
    const onScroll = (event: Event) => {
      if (event.target !== document && event.target !== area) return;
      if ((event.target === document) !== documentScrolls()) return;
      markScrolled();
    };

    watched = new ResizeObserver(schedule);
    watched.observe(root);
    observed.add(root);
    const changed = new MutationObserver(schedule);
    changed.observe(root, { childList: true, subtree: true });
    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("scroll", onScroll, { passive: true });
    tall.addEventListener("change", schedule);
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      watched.disconnect();
      changed.disconnect();
      root.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("scroll", onScroll);
      tall.removeEventListener("change", schedule);
      for (const piece of pieces) release(piece);
      for (const name of ["frozenScrolled", "frozenMeasuring"]) delete root.dataset[name];
      area.style.scrollPaddingTop = "";
      document.documentElement.style.scrollPaddingTop = "";
    };
  }, [area, root]);
}
