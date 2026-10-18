import { useLayoutEffect, useRef, type ReactNode } from "react";
import { said } from "./FieldNote";
import "./window-alert.css";

/**
 * A window's or a drawer's own error (UI-FIELDMSG-2, Mert 2026-10-18): its
 * general error and every long message, never one under a field. A band laid
 * over the bottom edge of the window's body, just above its footer, full width,
 * wrapping, never cut. While it shows, the body right above it gets room equal
 * to the band's measured height: a body that scrolls gets that much more
 * padding-bottom and scroll-padding-bottom, so its last control can be
 * scrolled out from under the band; one that doesn't scroll gets it as
 * margin-bottom, so a short window grows by that height. Nothing it covers is
 * out of reach.
 *
 * Put it as the footer's first child: the footer's previous sibling is the
 * body. A footer that scrolls or clips its overflow, or whose own rules count
 * its children, would cut or upset it: there put it `between`, as the sibling
 * right before the footer, in a zero-height slot.
 */
export function WindowAlert({
  message,
  status,
  id,
  between = false,
}: {
  /** The error, read out at once. */
  readonly message: ReactNode;
  /** A held state said in the same band while there is no error, read politely. */
  readonly status?: ReactNode;
  readonly id?: string;
  readonly between?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = said(message) ? "alert" : said(status) ? "status" : null;
  useLayoutEffect(() => (shown && ref.current ? keepRoomUnder(ref.current) : undefined), [shown]);
  const band = shown ? (
    <div ref={ref} id={id} className="window-alert" role={shown}>
      {shown === "alert" ? message : status}
    </div>
  ) : null;
  return between ? <div className="window-alert-slot">{band}</div> : band;
}

/** Room above the band's anchor for as long as the band shows; returns the undo. */
function keepRoomUnder(band: HTMLElement): () => void {
  const anchor = band.parentElement;
  const room = anchor?.previousElementSibling;
  if (!anchor || !(room instanceof HTMLElement)) return () => {};
  const view = room.ownerDocument.defaultView;
  const scrolls = scrollsItself(room);
  const side = scrolls ? "paddingBottom" : "marginBottom";
  const before = { [side]: room.style[side], scrollPaddingBottom: room.style.scrollPaddingBottom };
  const base = parseFloat(view?.getComputedStyle(room)[side] ?? "") || 0;
  // A scrolling ancestor (a drawer that scrolls whole, footer and all) keeps
  // focus and scrolled-to controls above the band too.
  const outer = scrolls ? null : scrollingAncestor(anchor);
  const outerBefore = outer?.style.scrollPaddingBottom ?? "";

  let height = -1;
  const fit = () => {
    const next = Math.ceil(band.getBoundingClientRect().height);
    if (next === height) return;
    height = next;
    room.style[side] = `${base + height}px`;
    if (scrolls) room.style.scrollPaddingBottom = `${height}px`;
    if (outer) outer.style.scrollPaddingBottom = `${height}px`;
    // Whoever is typing in the body stays in sight above the band.
    const focused = room.ownerDocument.activeElement;
    if (focused instanceof HTMLElement && room.contains(focused) && focused !== room)
      focused.scrollIntoView?.({ block: "nearest" });
  };
  fit();
  const Observer = view?.ResizeObserver;
  const watch = Observer ? new Observer(fit) : null;
  watch?.observe(band);
  return () => {
    watch?.disconnect();
    room.style[side] = before[side] ?? "";
    if (scrolls) room.style.scrollPaddingBottom = before.scrollPaddingBottom;
    if (outer) outer.style.scrollPaddingBottom = outerBefore;
  };
}

function scrollsItself(element: HTMLElement): boolean {
  const overflow = element.ownerDocument.defaultView?.getComputedStyle(element).overflowY ?? "";
  return overflow === "auto" || overflow === "scroll";
}

function scrollingAncestor(element: HTMLElement): HTMLElement | null {
  for (let at = element.parentElement; at; at = at.parentElement) if (scrollsItself(at)) return at;
  return null;
}
