import { useRef, type ComponentType } from "react";
import { NavLink, useLocation } from "react-router";
import { LogOut, MoreHorizontal, X } from "lucide-react";
import "./phone-nav.css";

export interface PhoneNavLink {
  readonly to: string;
  readonly label: string;
  readonly icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  readonly exact?: boolean;
  /** What waits on the person there; a number only when something does. */
  readonly count?: number;
}

function isActive(pathname: string, link: PhoneNavLink): boolean {
  return link.exact
    ? pathname === link.to
    : pathname === link.to || pathname.startsWith(`${link.to}/`);
}

/**
 * The phone's bottom bar (720px and below) and the More sheet it opens, one
 * for management and the employee view alike (BL-192; CALISAN-MORE, Mert
 * 2026-10-17): the same bar, the same sheet rising from the bottom, every row
 * the same height, Sign out last. Above 720px it draws nothing and the
 * sidebar stays.
 */
export function PhoneNav({
  label,
  bar,
  more,
  onSignOut,
}: {
  readonly label: string;
  readonly bar: readonly PhoneNavLink[];
  readonly more: readonly PhoneNavLink[];
  readonly onSignOut: () => void;
}) {
  const { pathname } = useLocation();
  const sheet = useRef<HTMLDialogElement>(null);
  const close = () => sheet.current?.close();
  const moreActive = !bar.some((link) => isActive(pathname, link));
  const activeClass = ({ isActive: active }: { isActive: boolean }) => (active ? "active" : "");

  return (
    <>
      <nav className="phone-bar" aria-label={label}>
        {bar.map(({ to, label: name, icon: Icon, exact }) => (
          <NavLink key={to} to={to} end={exact} className={activeClass}>
            <Icon size={21} aria-hidden />
            <span>{name}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={moreActive ? "active" : ""}
          aria-haspopup="dialog"
          onClick={() => sheet.current?.showModal()}
        >
          <MoreHorizontal size={21} aria-hidden />
          <span>More</span>
        </button>
      </nav>
      <dialog
        ref={sheet}
        className="phone-more"
        aria-label="More"
        onKeyDown={(event) => {
          // Pages listen for Escape too (the schedule grid cancels it); the
          // sheet answers first so Escape always closes it.
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
        onClick={(event) => {
          // A tap on the backdrop (the dialog box itself, not its content) closes it.
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="phone-more-body">
          <header>
            <strong>More</strong>
            <button type="button" className="phone-more-close" aria-label="Close" onClick={close}>
              <X size={20} aria-hidden />
            </button>
          </header>
          <nav aria-label="More pages">
            {more.map(({ to, label: name, icon: Icon, exact, count }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                onClick={close}
                className={activeClass}
                aria-label={count ? `${name}, ${count} waiting on you` : undefined}
              >
                <span className="phone-more-icon">
                  <Icon size={20} aria-hidden />
                </span>
                <span className="phone-more-label">{name}</span>
                {count ? (
                  <span className="nav-item-count" aria-hidden>
                    {count}
                  </span>
                ) : null}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => {
                close();
                onSignOut();
              }}
            >
              <span className="phone-more-icon">
                <LogOut size={20} aria-hidden />
              </span>
              <span className="phone-more-label">Sign out</span>
            </button>
          </nav>
        </div>
      </dialog>
    </>
  );
}
