import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router";
import { initials } from "./home-model";

export type DeckNotice = {
  id: string;
  title: string;
  body: string;
  author: string;
  when: string;
  /** null: it asks nobody to confirm. */
  ack: "asked" | "done" | null;
};

/**
 * Team notices as a small deck: fling the top card sideways for the next one
 * (navigation only, nothing is changed), or use the arrows; a tap opens it.
 */
// A notice opens in the interface the deck sits in (EMPLOYEE-ANNOUNCEMENTS).
export function HomeNoticeDeck({ notices, base }: { notices: DeckNotice[]; base: string }) {
  const [order, setOrder] = useState(() => notices.map((_, i) => i));
  const [drag, setDrag] = useState<{ dx: number; flying: number } | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number; t: number; moved: boolean; axis: "x" | null } | null>(null);
  const dragged = useRef(false);
  const deck = useRef<HTMLDivElement>(null);
  // A fresh list (a notice came or went) starts from the top again.
  const key = notices.map((item) => item.id).join();
  const lastKey = useRef(key);
  if (lastKey.current !== key) {
    lastKey.current = key;
    setOrder(notices.map((_, i) => i));
  }
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const advance = (dir: 1 | -1) => {
    if (notices.length < 2) return;
    navigator.vibrate?.(8);
    if (dir > 0) {
      const width = (deck.current?.offsetWidth ?? 320) + 80;
      setDrag({ dx: -width, flying: 1 });
      window.setTimeout(() => {
        setOrder((current) => [...current.slice(1), current[0]!]);
        setDrag(null);
      }, reduce ? 0 : 240);
    } else setOrder((current) => [current[current.length - 1]!, ...current.slice(0, -1)]);
  };
  const onDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now(), moved: false, axis: null };
  };
  const onMove = (event: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        g.axis = "x";
        deck.current?.setPointerCapture?.(g.id);
      } else if (Math.abs(dy) > 8) {
        gesture.current = null;
        return;
      } else return;
    }
    g.moved = true;
    setDrag({ dx, flying: 0 });
  };
  const onUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.moved || !drag) {
      setDrag(null);
      return;
    }
    dragged.current = true;
    window.setTimeout(() => (dragged.current = false), 80);
    const speed = Math.abs(drag.dx) / Math.max(1, performance.now() - g.t);
    if (Math.abs(drag.dx) > 90 || (speed > 0.65 && Math.abs(drag.dx) > 30)) {
      const width = (deck.current?.offsetWidth ?? 320) + 80;
      setDrag({ dx: Math.sign(drag.dx) * width, flying: 1 });
      navigator.vibrate?.(8);
      window.setTimeout(() => {
        setOrder((current) => [...current.slice(1), current[0]!]);
        setDrag(null);
      }, reduce ? 0 : 240);
    } else setDrag(null);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      advance(event.key === "ArrowRight" ? 1 : -1);
    }
  };
  const top = order[0];
  return (
    <div className="dl-dk-wrap">
      <div
        className="dl-deck"
        data-own-drag=""
        ref={deck}
        aria-roledescription="carousel"
        aria-label="Team notices"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          gesture.current = null;
          setDrag(null);
        }}
        onKeyDown={onKey}
      >
        {order.map((index, rank) => {
          const item = notices[index]!;
          const isTop = rank === 0;
          const pull = isTop || !drag ? rank : Math.max(0, rank - Math.min(1, Math.abs(drag.dx) / 150));
          return (
            <article
              key={item.id}
              className={`dl-dk${isTop ? " is-top" : ""}${drag && !drag.flying && rank < 2 ? " is-drag" : ""}`}
              style={
                {
                  "--r": Math.min(pull, 3),
                  "--x": isTop && drag ? `${drag.dx}px` : "0px",
                  "--rot": isTop && drag ? `${(drag.flying ? Math.sign(drag.dx) * 14 : drag.dx * 0.055).toFixed(2)}deg` : "0deg",
                } as CSSProperties
              }
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${notices.length}`}
              aria-hidden={!isTop}
            >
              <Link
                className="dl-dk-in"
                to={`${base}/${item.id}`}
                tabIndex={isTop ? 0 : -1}
                onClick={(event) => {
                  if (dragged.current) event.preventDefault();
                }}
                draggable={false}
              >
                <span className="dl-dk-by">
                  <span className="dl-av dl-av-sm" aria-hidden>
                    {initials(item.author)}
                  </span>
                  <span>
                    {item.author} · {item.when}
                  </span>
                </span>
                <b className="dl-dk-t">{item.title}</b>
                <span className="dl-dk-b">{item.body}</span>
                {item.ack ? (
                  <span className={`dl-dk-ack${item.ack === "done" ? " is-done" : ""}`}>
                    {item.ack === "done" ? "Read" : "Please confirm you read this"}
                  </span>
                ) : null}
              </Link>
            </article>
          );
        })}
      </div>
      {notices.length > 1 ? (
        <div className="dl-dk-nav">
          <span className="dl-dk-dots" aria-hidden>
            {notices.map((item, index) => (
              <i key={item.id} className={index === top ? "is-on" : ""} />
            ))}
          </span>
          <span className="dl-dk-btns">
            <button type="button" onClick={() => advance(-1)} aria-label="Previous notice">
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={() => advance(1)} aria-label="Next notice">
              <ChevronRight size={18} />
            </button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
