import type { ReactNode } from "react";

/**
 * One Daylight Home section (home-daylight.css): a heading with its count and
 * link, then its card; it rises into view as the page scrolls (home-motion.ts).
 * Both Homes draw their sections with it: the employee's and the managers'.
 */
export function HomeSection({
  name,
  title,
  count,
  warn,
  link,
  bare,
  hideEmpty,
  children,
}: {
  name: string;
  title?: string;
  count?: number;
  /** The count in red: something in it cannot wait (a missing required document). */
  warn?: boolean;
  link?: ReactNode;
  /** No heading and no card of its own (the phone alerts card brings its own). */
  bare?: boolean;
  /** Hidden while its card is empty. */
  hideEmpty?: boolean;
  children: ReactNode;
}) {
  const id = `dl-sec-${name}`;
  return (
    <section className={`dl-sec dl-sec-${name}${hideEmpty ? " is-hide-empty" : ""}${bare ? " is-bare" : ""}`} data-rise aria-labelledby={title ? id : undefined}>
      {title ? (
        <header className="dl-sh">
          <h2 id={id}>{title}</h2>
          {count ? <span className={`dl-cnt${warn ? " is-warn" : ""}`}>{count}</span> : null}
          {link}
        </header>
      ) : null}
      {bare ? children : <div className="dl-card">{children}</div>}
    </section>
  );
}
