import * as Sentry from "@sentry/react";

/**
 * Temporary (BILDIRIM-15, Mert 2026-10-17): on Mert's iPhone (iOS 26.6.2, the Home Screen app) the
 * announcement reader opens white with only its Close button, at the top. WebKit on a computer draws it
 * right, so the phone itself is measured: where the reader's parts are, how the screen and its scroll
 * stand. Positions and sizes only, never the post or the person. Goes once the cause is fixed.
 */
export type ReaderLayout = Record<string, string | number | boolean | null>;

const PARTS = {
  backdrop: ".catalog-drawer-backdrop",
  dialog: ".announcement-reader[role=dialog]",
  frame: ".announcement-reader .ad",
  head: ".announcement-reader .ad-head",
  body: ".announcement-reader .ad-body",
  foot: ".announcement-reader .ad-foot",
} as const;

function describe(element: Element | null): string | null {
  if (!element) return null;
  const classes = typeof element.className === "string" ? element.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
  return classes ? `${element.tagName.toLowerCase()}.${classes}` : element.tagName.toLowerCase();
}

export function readerLayout(doc: Document = document, win: Window = window): ReaderLayout {
  const layout: ReaderLayout = {
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
    screenHeight: win.screen?.height ?? null,
    vvHeight: win.visualViewport?.height ?? null,
    vvOffsetTop: win.visualViewport?.offsetTop ?? null,
    vvPageTop: win.visualViewport?.pageTop ?? null,
    vvScale: win.visualViewport?.scale ?? null,
    scrollY: win.scrollY,
    docScrollTop: doc.documentElement.scrollTop,
    docScrollHeight: doc.documentElement.scrollHeight,
    docClientHeight: doc.documentElement.clientHeight,
    bodyScrollTop: doc.body.scrollTop,
    standalone: win.matchMedia?.("(display-mode: standalone)").matches ?? null,
    atTop: describe(doc.elementFromPoint?.(win.innerWidth / 2, 40) ?? null),
    atMiddle: describe(doc.elementFromPoint?.(win.innerWidth / 2, win.innerHeight / 2) ?? null),
  };
  for (const [name, selector] of Object.entries(PARTS)) {
    const element = doc.querySelector<HTMLElement>(selector);
    if (!element) {
      layout[`${name}`] = null;
      continue;
    }
    const box = element.getBoundingClientRect();
    const style = win.getComputedStyle(element);
    layout[`${name}Top`] = Math.round(box.top);
    layout[`${name}Height`] = Math.round(box.height);
    layout[`${name}ScrollTop`] = element.scrollTop;
    layout[`${name}ScrollHeight`] = element.scrollHeight;
    layout[`${name}Css`] = [style.display, style.position, style.height, style.overflowY, style.opacity, style.visibility, style.transform]
      .join(" ");
  }
  return layout;
}

/** The title is off the screen, or Close sits above where the title ends. */
export function readerLooksBroken(layout: ReaderLayout): boolean {
  const headTop = layout.headTop,
    headHeight = layout.headHeight,
    footTop = layout.footTop;
  if (typeof headTop !== "number" || typeof headHeight !== "number" || typeof footTop !== "number") return true;
  return headHeight === 0 || headTop + headHeight <= 0 || footTop < headTop + headHeight;
}

let sent = false;

/** Measures the open reader on an iPhone or iPad, twice, and sends it once per app start. */
export function probeReaderLayout(
  win: Window = window,
  report: (message: string, context: { level: "info" | "warning"; tags: Record<string, string>; extra: ReaderLayout }) => unknown = (
    message,
    context,
  ) => Sentry.captureMessage(message, context),
): () => void {
  if (sent || !/iPhone|iPad/.test(win.navigator.userAgent)) return () => undefined;
  let early: ReaderLayout | null = null;
  // A measurement that fails says so; the reader itself never feels it.
  const measure = (): ReaderLayout => {
    try {
      return readerLayout(win.document, win);
    } catch (error) {
      return { failed: error instanceof Error ? error.message : String(error) };
    }
  };
  const first = win.setTimeout(() => {
    early = measure();
  }, 300);
  const second = win.setTimeout(() => {
    if (sent) return;
    sent = true;
    const late = measure();
    const broken = readerLooksBroken(late);
    const extra: ReaderLayout = { ...late };
    for (const [key, value] of Object.entries(early ?? {})) extra[`early_${key}`] = value;
    report("announcement reader layout", {
      level: broken ? "warning" : "info",
      tags: { probe: "reader-layout", broken: String(broken) },
      extra,
    });
  }, 2_000);
  return () => {
    win.clearTimeout(first);
    win.clearTimeout(second);
  };
}

/** For tests: lets the next reader send again. */
export function resetReaderProbe() {
  sent = false;
}
