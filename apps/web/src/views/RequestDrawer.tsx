import { ArrowUpRight, X } from "lucide-react";
import { useId, useRef, type PointerEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { useListPhoneWidth } from "../lib/usePhoneWidth";
import { WindowAlert } from "../shell/WindowAlert";
import "./request-drawer.css";

// Mert, 2026-10-11: every Requests drawer (time off, cover, open shift) speaks
// the Important Dates drawer's language: a header with the type and the status,
// underline tabs, hairline sections, and a footer that holds the decision.
// Mert, 2026-10-23: on a phone the Requests review drawers (.requests-review-drawer) are a card from the
// bottom with a handle: pulled down by its head, or a tap on the dimmed list, it closes.

export type DrawerTone = "warn" | "ok" | "red" | "grey";
export type DrawerTab<Key extends string> = {
  key: Key;
  label: string;
  count?: number;
  /** Opt-in: the tab's spoken name ("Files, 2 files"); the badge is then left out of it. */
  name?: string;
};
export type DrawerNotice = { text: string; tone?: "warning" | "error" };

export function RequestDrawer<Key extends string>({
  icon,
  title,
  kicker,
  type,
  status,
  sub,
  scheduleHref,
  tabs,
  tab,
  onTab,
  notice,
  onClose,
  footer,
  footerAlert,
  strip,
  focusTitle = false,
  tabsLabel = "Request sections",
  homeEndTabs = false,
  closeRefused = false,
  children,
}: {
  /** The request's kind, left of the title; the sub line then sits under the title too. */
  icon?: ReactNode;
  title: string;
  /** What the drawer is, under the title ("Time off request"). */
  kicker?: string;
  /** A second word after the title; left out when the title says it. */
  type?: string;
  /** Left out for a request that closed without a decision. */
  status?: { label: string; tone: DrawerTone };
  sub?: ReactNode;
  scheduleHref?: string;
  tabs: DrawerTab<Key>[];
  tab: Key;
  onTab: (tab: Key) => void;
  notice?: DrawerNotice | null;
  onClose: () => void;
  footer?: ReactNode;
  /**
   * The decision's error: laid over the body's bottom edge above the footer,
   * so neither moves (UI-FIELDMSG). The footer scrolls, so it sits between.
   */
  footerAlert?: ReactNode;
  /**
   * Opt-in (Documents, A2 Tur 6): a row above the head row, on the head's sky (Previous / Next and its own X);
   * the head row then has no X.
   */
  strip?: ReactNode;
  /** Opt-in: the title takes the drawer's first focus (CatalogDrawer) and can end in an ellipsis. */
  focusTitle?: boolean;
  /** The tablist's name. */
  tabsLabel?: string;
  /** Opt-in: Home and End move to the first and the last tab, as the arrows move to the next. */
  homeEndTabs?: boolean;
  /** Opt-in: a pull past the threshold puts the card back instead of closing it (the drawer is busy). */
  closeRefused?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const phone = useListPhoneWidth();
  const root = useRef<HTMLDivElement>(null);
  const pull = useRef<{ sheet: HTMLElement; y: number; dy: number } | null>(null);
  const sheet = () => (phone ? root.current?.closest<HTMLElement>(".requests-review-drawer") ?? null : null);
  const subLine =
    sub || scheduleHref ? (
      <p className="rd-sub">
        {sub ? <span>{sub}</span> : null}
        {scheduleHref ? (
          <Link to={scheduleHref}>
            Open in Schedule <ArrowUpRight size={14} aria-hidden />
          </Link>
        ) : null}
      </p>
    ) : null;

  // The card follows the finger down; past a quarter of its height (at most 140 px) it closes.
  function release() {
    const held = pull.current;
    pull.current = null;
    if (!held) return;
    held.sheet.classList.remove("is-dragging");
    held.sheet.classList.add("is-settling");
    if (held.dy > Math.min(140, held.sheet.offsetHeight / 4) && !closeRefused) {
      held.sheet.style.transform = "translateY(100%)";
      window.setTimeout(onClose, 180);
    } else {
      held.sheet.style.transform = "";
    }
  }
  const pullHandlers = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      const card = sheet();
      if (!card || (event.target as HTMLElement).closest("button, a, input, textarea, select")) return;
      event.preventDefault();
      card.classList.remove("is-settling");
      card.classList.add("is-dragging");
      pull.current = { sheet: card, y: event.clientY, dy: 0 };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const held = pull.current;
      if (!held) return;
      held.dy = Math.max(0, event.clientY - held.y);
      held.sheet.style.transform = held.dy ? `translateY(${held.dy}px)` : "";
    },
    onPointerUp: release,
    onPointerCancel: release,
  };

  // On a phone the card keeps its height when a shorter tab opens, so the head does not jump.
  function switchTo(key: Key) {
    const card = sheet();
    if (card) card.style.minHeight = `${card.offsetHeight}px`;
    onTab(key);
  }

  return (
    <div className="rd" ref={root}>
      <header className="rd-head" {...pullHandlers}>
        <span className="rd-grab" aria-hidden />
        {strip}
        <div className="rd-head-row">
          {icon ? <span className="rd-head-icon">{icon}</span> : null}
          <div className="rd-head-text">
            <h2 {...(focusTitle ? { tabIndex: -1, "data-drawer-autofocus": "" } : {})}>
              {focusTitle ? <span className="rd-title">{title}</span> : title}
              {type ? (
                <>
                  {" "}
                  <span className="rd-type">{type}</span>
                </>
              ) : null}{" "}
              {status ? <span className={`rd-chip ${status.tone}`}>{status.label}</span> : null}
            </h2>
            {kicker ? <p className="rd-kicker">{kicker}</p> : null}
            {icon ? subLine : null}
          </div>
          {strip ? null : (
            <button type="button" className="rd-close" aria-label="Close details" onClick={onClose}>
              <X size={18} aria-hidden />
            </button>
          )}
        </div>
        {icon ? null : subLine}
        {notice ? (
          <p
            className={notice.tone ? `request-drawer-notice ${notice.tone}` : "request-drawer-notice"}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        ) : null}
        <div
          className="rd-tabs"
          role="tablist"
          aria-label={tabsLabel}
          onKeyDown={(event) => {
            const ends = homeEndTabs && (event.key === "Home" || event.key === "End");
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && !ends) return;
            const at = tabs.findIndex((item) => item.key === tab);
            const next = ends
              ? tabs[event.key === "Home" ? 0 : tabs.length - 1]!
              : tabs[(at + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]!;
            event.preventDefault();
            switchTo(next.key);
            event.currentTarget.querySelector<HTMLElement>(`[data-tab="${next.key}"]`)?.focus();
          }}
        >
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`${id}-tab-${item.key}`}
              data-tab={item.key}
              aria-selected={item.key === tab}
              aria-controls={`${id}-panel`}
              tabIndex={item.key === tab ? 0 : -1}
              aria-label={item.name}
              onClick={() => switchTo(item.key)}
            >
              {item.label}
              {item.count ? (
                <span className="rd-badge" aria-hidden={item.name ? true : undefined}>
                  {item.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </header>
      <div className="rd-body" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`}>
        {children}
      </div>
      {footer ? (
        <>
          <WindowAlert between message={footerAlert} />
          <footer className="rd-foot">{footer}</footer>
        </>
      ) : null}
    </div>
  );
}

/** One hairline section; a named one is a region, titled like its siblings. */
export function DrawerSection({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="rd-sec" aria-labelledby={title ? id : undefined}>
      {title ? (
        <div className="rd-sec-head">
          <h3 id={id}>{title}</h3>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function DrawerField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rd-field">
      <span className="rd-label">{label}</span>
      <div className="rd-value">{children}</div>
    </div>
  );
}
