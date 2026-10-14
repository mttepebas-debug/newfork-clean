import { CloudOff, RotateCw } from "lucide-react";
import { useId, type CSSProperties, type ReactNode } from "react";
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

/** Rows of a list page while it loads: a header bar and `rows` lines. */
export function ListOutline({ label, rows = 6, columns = 4 }: { readonly label: string; readonly rows?: number; readonly columns?: number }) {
  return (
    <LoadingOutline label={label} className="nf-list-outline">
      <div className="nf-list-outline-head" />
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

/** The card a screen shows when its data did not load. */
export function LoadError({
  title,
  detail,
  onRetry,
  retrying = false,
  className,
}: {
  /** e.g. "We couldn't load the lineup". */
  readonly title: string;
  /** One sentence: what did not load, and that nothing was changed. */
  readonly detail: string;
  readonly onRetry?: () => void;
  /** True while the retry is on its way. */
  readonly retrying?: boolean;
  readonly className?: string;
}) {
  const titleId = useId();
  return (
    <section className={className ? `load-error ${className}` : "load-error"} role="alert" aria-labelledby={titleId}>
      <span className="load-error-icon" aria-hidden>
        <CloudOff size={22} />
      </span>
      <div className="load-error-copy">
        <h2 id={titleId}>{title}</h2>
        <p>{detail}</p>
        {onRetry ? <p className="load-error-help">Check your connection, then try again.</p> : null}
      </div>
      {onRetry ? (
        <button type="button" className="load-error-retry" disabled={retrying} onClick={onRetry}>
          <RotateCw size={16} aria-hidden className={retrying ? "spinning" : undefined} />
          <span>{retrying ? "Trying again…" : "Try again"}</span>
        </button>
      ) : null}
    </section>
  );
}
