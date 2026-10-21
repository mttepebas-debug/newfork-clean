import type { ExchangeReadModel } from "@newfork/shared";
import { AlertTriangle, Check, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import { firstName } from "./Release";
import { Hand, ShiftTicket } from "./ShiftTicket";

// Available Shifts as a deck (plan 06:43; mockup moment 8): one released shift at a
// time. Right, the green button or the right arrow key asks for it; left, the white
// button or the left arrow key passes ("Not for me", plan 04:52). The card turns
// and its label shows; with reduced motion it just goes.

export type DeckOpportunity = ExchangeReadModel["opportunities"][number];
export type DeckChoice = "take" | "pass";

const THRESHOLD = 100;
const LEAVE_MS = 260;

export function ReleaseDeck({
  cards,
  disabled,
  onChoose,
}: {
  cards: readonly DeckOpportunity[];
  disabled: boolean;
  /** Resolves once the choice is saved; a refusal puts the card back. */
  onChoose: (card: DeckOpportunity, choice: DeckChoice) => Promise<unknown>;
}) {
  const [leaving, setLeaving] = useState<{ id: string; choice: DeckChoice } | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(0);
  const topRef = useRef<HTMLElement>(null);
  // The card on its way out keeps its place (and key) so it can animate away.
  const visible = cards.slice(0, leaving ? 4 : 3);
  const waiting = visible.filter((card) => card.case_id !== leaving?.id);
  const top = waiting[0];
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    setDx(0);
  }, [top?.case_id]);
  // Saved: the card left the list, so the deck is done with it.
  useEffect(() => {
    if (leaving && !cards.some((card) => card.case_id === leaving.id)) setLeaving(null);
  }, [cards, leaving]);

  const choose = (choice: DeckChoice) => {
    if (!top || disabled || leaving) return;
    const card = top;
    setLeaving({ id: card.case_id, choice });
    const settle = () =>
      onChoose(card, choice).then(
        () => topRef.current?.focus({ preventScroll: true }),
        () => setLeaving(null),
      );
    setDx(0);
    if (reduce) void settle();
    else window.setTimeout(() => void settle(), LEAVE_MS);
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (disabled || leaving) return;
    start.current = event.clientX;
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (dragging) setDx(event.clientX - start.current);
  };
  const onPointerEnd = () => {
    if (!dragging) return;
    setDragging(false);
    if (dx > THRESHOLD) choose("take");
    else if (dx < -THRESHOLD) choose("pass");
    else setDx(0);
  };

  const left = cards.length - (leaving ? 1 : 0);
  let depth = 0;
  return (
    <div className="sx-deck-area">
      {/* While it holds cards the deck is a group, so a phone's tab swipe (useTabSwipe) leaves it its own
          sideways swipe; an empty deck has none, and a swipe on it changes the tab. */}
      <div className="sx-deck" data-own-drag="" {...(visible.length ? { role: "group", "aria-label": "Released shifts" } : {})}>
        {left === 0 && !leaving ? (
          <div className="sx-deck-empty">
            <b>You’re all caught up</b>
            New shifts your teammates release show up here.
          </div>
        ) : null}
        {visible
          .map((card) => {
            const out = card.case_id === leaving?.id;
            const at = out ? 0 : depth++;
            const isTop = !out && at === 0;
            return (
              <DeckCard
                key={card.case_id}
                ref={isTop ? topRef : undefined}
                card={card}
                depth={at}
                interactive={isTop}
                dragging={isTop && dragging}
                style={out ? (reduce ? { opacity: 0, zIndex: 11 } : leaveStyle(leaving!.choice)) : isTop && dx ? dragStyle(dx, reduce) : undefined}
                verdict={out ? leaving!.choice : isTop ? (dx > 30 ? "take" : dx < -30 ? "pass" : null) : null}
                verdictStrength={out ? 1 : Math.min(1, Math.abs(dx) / 90)}
                onPointerDown={isTop ? onPointerDown : undefined}
                onPointerMove={isTop ? onPointerMove : undefined}
                onPointerUp={isTop ? onPointerEnd : undefined}
                onPointerCancel={isTop ? onPointerEnd : undefined}
                onKeyDown={
                  isTop
                    ? (event) => {
                        if (event.key === "ArrowRight") {
                          event.preventDefault();
                          choose("take");
                        } else if (event.key === "ArrowLeft") {
                          event.preventDefault();
                          choose("pass");
                        }
                      }
                    : undefined
                }
              />
            );
          })
          .reverse()}
      </div>
      <div className="sx-deck-actions">
        <button type="button" disabled={!top || disabled || Boolean(leaving)} onClick={() => choose("pass")}>
          Not for me
        </button>
        <button type="button" className="sx-primary" disabled={!top || disabled || Boolean(leaving)} onClick={() => choose("take")}>
          {top?.eligibility.availability_warning ? "Take it anyway" : "I’ll take it"}
        </button>
      </div>
      <p className="sx-deck-hint" aria-live="polite">
        {left ? `Swipe right to take · left to pass · ${left} left` : "Nothing left to look at"}
      </p>
    </div>
  );
}

function dragStyle(dx: number, reduce: boolean): CSSProperties {
  return {
    transform: `translateX(${dx}px) rotate(${reduce ? 0 : dx / 20}deg)`,
    borderColor: dx > 30 ? "var(--theme-accent)" : dx < -30 ? "var(--theme-danger-strong)" : undefined,
  };
}
function leaveStyle(choice: DeckChoice): CSSProperties {
  const sign = choice === "take" ? 1 : -1;
  return { transform: `translateX(${sign * 520}px) rotate(${sign * 16}deg)`, opacity: 0, zIndex: 11 };
}

function DeckCard({
  card,
  depth,
  dragging = false,
  style,
  verdict,
  verdictStrength = 1,
  interactive,
  ref,
  ...handlers
}: {
  card: DeckOpportunity;
  depth: number;
  interactive: boolean;
  dragging?: boolean;
  style?: CSSProperties;
  verdict: DeckChoice | null;
  verdictStrength?: number;
  ref?: Ref<HTMLElement>;
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  // An open shift the manager offered on publishing is nobody's yet (Mert, 2026-10-20).
  const offered = !card.shift.employee_name;
  const owner = card.shift.employee_name ?? "A teammate";
  const warning = Boolean(card.eligibility.availability_warning);
  const top = interactive;
  return (
    <article
      ref={ref}
      className="sx-w sx-dcard"
      data-depth={depth}
      data-dragging={dragging || undefined}
      style={{ zIndex: top ? 10 : 9 - depth, ...style }}
      tabIndex={top ? 0 : -1}
      aria-hidden={top ? undefined : true}
      aria-label={top ? `${offered ? "Your manager is offering this open shift." : `${owner} can’t make this shift.`} Right arrow takes it, left arrow passes.` : undefined}
      {...handlers}
    >
      <span className="sx-verdict" data-verdict="take" style={{ opacity: verdict === "take" ? verdictStrength : 0 }} aria-hidden>
        <Check /> Take
      </span>
      <span className="sx-verdict" data-verdict="pass" style={{ opacity: verdict === "pass" ? verdictStrength : 0 }} aria-hidden>
        <X /> Pass
      </span>
      <header className="sx-w-head">
        <h3>Open shift</h3>
      </header>
      <p className="sx-w-names">
        {offered ? <i>Offered by your manager</i> : <>{owner} <i>can’t make it</i></>}
      </p>
      <div className="sx-w-body">
        <ShiftTicket shift={card.shift} hand={<Hand from={offered ? "Open" : firstName(owner)} to="you" />} />
        {card.note ? (
          <p className="sx-q">
            <b>{firstName(owner)}</b>“{card.note}”
          </p>
        ) : null}
        <div className="sx-cks" data-one>
          {warning ? (
            <span className="sx-ck" data-tone="warn">
              <AlertTriangle aria-hidden />
              <span>
                <strong>Outside your availability</strong>
                <small>Taking it does not change your weekly hours</small>
              </span>
            </span>
          ) : (
            <span className="sx-ck" data-tone="ok">
              <Check aria-hidden />
              <span>
                <strong>Fits your availability</strong>
                <small>No conflict with your week</small>
              </span>
            </span>
          )}
        </div>
        <p className="sx-dcard-foot">Your manager picks who gets it.</p>
      </div>
    </article>
  );
}
