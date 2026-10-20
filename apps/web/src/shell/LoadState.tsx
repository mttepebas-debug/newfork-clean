import { CloudOff, RotateCw } from "lucide-react";
import { useId, type CSSProperties, type ReactNode, type RefObject } from "react";
import "./load-state.css";

/**
 * Loading and error, one look on every screen (Mert 2026-10-14, "B"):
 * while a screen loads it shows a grey outline of what is coming, at the same
 * size, so nothing moves when the data lands; when it fails it shows one
 * centered card from the same family as NoAccessState.
 */

/** One grey bar of a loading outline. */
export function Skeleton({
  width,
  height = 10,
  className,
  style,
}: {
  readonly width: number | string;
  readonly height?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
}) {
  return <i className={className ? `nf-skeleton ${className}` : "nf-skeleton"} style={{ ...style, width, height }} aria-hidden />;
}

/**
 * Wraps a screen's loading outline. The outline itself is hidden from screen
 * readers; they hear `label` once.
 */
export function LoadingOutline({
  label,
  className,
  children,
}: {
  /** e.g. "Loading lineups". */
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={className ? `nf-loading ${className}` : "nf-loading"} role="status">
      <span className="sr-only">{label}</span>
      <div aria-hidden>{children}</div>
    </div>
  );
}

/**
 * Rows of a list while it loads. Framed with a header bar by default; `inset`
 * draws only the rows, for a list whose frame and header are already there.
 */
export function ListOutline({
  label,
  rows = 6,
  columns = 4,
  inset = false,
}: {
  readonly label: string;
  readonly rows?: number;
  readonly columns?: number;
  readonly inset?: boolean;
}) {
  return (
    <LoadingOutline label={label} className={inset ? "nf-list-outline inset" : "nf-list-outline"}>
      {inset ? null : <div className="nf-list-outline-head" />}
      {Array.from({ length: rows }, (_, row) => (
        <div className="nf-list-outline-row" key={row} style={{ gridTemplateColumns: `2fr repeat(${columns - 1}, 1fr)` }}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} width={column === 0 ? `${70 - row * 6}%` : "55%"} />
          ))}
        </div>
      ))}
    </LoadingOutline>
  );
}

/**
 * A page whose code is still on its way (its first visit): a title bar and a
 * list frame inside the page area, so the menu around it stays where it is.
 */
export function PageOutline() {
  return (
    <LoadingOutline label="Loading page" className="nf-page-outline">
      <Skeleton width={200} height={18} className="on-page" />
      <div className="nf-list-outline-frame">
        <div className="nf-list-outline-head" />
        {Array.from({ length: 6 }, (_, row) => (
          <div className="nf-list-outline-row" key={row} style={{ gridTemplateColumns: "2fr repeat(3, 1fr)" }}>
            {Array.from({ length: 4 }, (_, column) => (
              <Skeleton key={column} width={column === 0 ? `${70 - row * 6}%` : "55%"} />
            ))}
          </div>
        ))}
      </div>
    </LoadingOutline>
  );
}

/** A few lines of text while a panel, drawer or expanded row loads. */
export function LinesOutline({ label, lines = 3 }: { readonly label: string; readonly lines?: number }) {
  return (
    <LoadingOutline label={label} className="nf-lines-outline">
      {Array.from({ length: lines }, (_, line) => (
        <Skeleton key={line} width={`${88 - line * 18}%`} height={line === 0 ? 14 : 10} />
      ))}
    </LoadingOutline>
  );
}

/** The card a screen shows when its data did not load. */
export function LoadError({
  title,
  detail,
  onRetry,
  actions,
  retrying = false,
  inset = false,
  headingRef,
  level = 2,
  className,
}: {
  /** e.g. "We couldn't load the lineup". */
  readonly title: string;
  /** One sentence: what did not load, and that nothing was changed. */
  readonly detail: string;
  readonly onRetry?: () => void;
  /**
   * The card's own buttons, in place of Try again and its help line: a page
   * that broke while it drew offers Reload page and Back to Home (BL-1075).
   */
  readonly actions?: ReactNode;
  /** True while the retry is on its way. */
  readonly retrying?: boolean;
  /**
   * Inside a frame that is already there (a list, a drawer, an expanded row):
   * no border of its own and less height.
   */
  readonly inset?: boolean;
  /**
   * Set when the screen moves focus to the card's heading: the focus reads it,
   * so it is not also a live alert (it would be read twice, button and all).
   */
  readonly headingRef?: RefObject<HTMLHeadingElement | null>;
  /** 3 inside a drawer or panel whose own title is an h2; 4 under an h3. */
  readonly level?: 2 | 3 | 4;
  readonly className?: string;
}) {
  const titleId = useId();
  const Heading = level === 4 ? "h4" : level === 3 ? "h3" : "h2";
  const classes = ["load-error", inset ? "inset" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <section className={classes} role={headingRef ? undefined : "alert"} aria-labelledby={titleId}>
      <span className="load-error-icon" aria-hidden>
        <CloudOff size={22} />
      </span>
      <div className="load-error-copy">
        <Heading id={titleId} ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
          {title}
        </Heading>
        <p>{detail}</p>
        {onRetry && !actions ? <p className="load-error-help">Check your connection, then try again.</p> : null}
      </div>
      {actions ? (
        <div className="load-error-actions">{actions}</div>
      ) : onRetry ? (
        <button type="button" className="load-error-retry" disabled={retrying} onClick={onRetry}>
          <RotateCw size={16} aria-hidden className={retrying ? "spinning" : undefined} />
          <span>{retrying ? "Trying again…" : "Try again"}</span>
        </button>
      ) : null}
    </section>
  );
}

/**
 * A list that loaded once and then failed to refresh keeps showing; this line
 * sits above it and says so.
 */
export function RefreshError({
  message,
  onRetry,
  retrying = false,
  className,
}: {
  /** e.g. "The employee list didn't refresh. This is the last list that loaded." */
  readonly message: string;
  readonly onRetry: () => void;
  readonly retrying?: boolean;
  readonly className?: string;
}) {
  return (
    <div className={className ? `load-refresh ${className}` : "load-refresh"} role="alert">
      <span>{message}</span>
      <button type="button" className="load-error-retry" disabled={retrying} onClick={onRetry}>
        <RotateCw size={15} aria-hidden className={retrying ? "spinning" : undefined} />
        <span>{retrying ? "Trying again…" : "Try again"}</span>
      </button>
    </div>
  );
}
