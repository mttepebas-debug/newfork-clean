import { ArrowUpRight, X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Link } from "react-router";
import "./request-drawer.css";

// Mert, 2026-10-11: every Requests drawer (time off, cover, open shift) speaks
// the Important Dates drawer's language: a header with the type and the status,
// underline tabs, hairline sections, and a footer that holds the decision.

export type DrawerTone = "warn" | "ok" | "red" | "grey";
export type DrawerTab<Key extends string> = { key: Key; label: string; count?: number };
export type DrawerNotice = { text: string; tone?: "warning" | "error" };

export function RequestDrawer<Key extends string>({
  title,
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
  children,
}: {
  title: string;
  /** A second word after the title (time off names its type); left out when the title says it. */
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
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="rd">
      <header className="rd-head">
        <div className="rd-head-row">
          <h2>
            {title}
            {type ? (
              <>
                {" "}
                <span className="rd-type">{type}</span>
              </>
            ) : null}{" "}
            {status ? <span className={`rd-chip ${status.tone}`}>{status.label}</span> : null}
          </h2>
          <button type="button" className="rd-close" aria-label="Close details" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </div>
        {sub || scheduleHref ? (
          <p className="rd-sub">
            {sub ? <span>{sub}</span> : null}
            {scheduleHref ? (
              <Link to={scheduleHref}>
                Open in Schedule <ArrowUpRight size={14} aria-hidden />
              </Link>
            ) : null}
          </p>
        ) : null}
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
          aria-label="Request sections"
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            const at = tabs.findIndex((item) => item.key === tab);
            const next = tabs[(at + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]!;
            event.preventDefault();
            onTab(next.key);
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
              onClick={() => onTab(item.key)}
            >
              {item.label}
              {item.count ? <span className="rd-badge">{item.count}</span> : null}
            </button>
          ))}
        </div>
      </header>
      <div className="rd-body" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`}>
        {children}
      </div>
      {footer ? <footer className="rd-foot">{footer}</footer> : null}
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
