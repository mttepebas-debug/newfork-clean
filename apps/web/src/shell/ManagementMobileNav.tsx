import { useRef, type ComponentType } from "react";
import { NavLink, useLocation } from "react-router";
import { LogOut, MoreHorizontal, X } from "lucide-react";
import { CurrentUserAvatar } from "../account/AccountAvatar";
import "./management-mobile-nav.css";

export interface MobileNavLink {
  readonly to: string;
  readonly label: string;
  readonly icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  readonly exact?: boolean;
}

// The first pages sit in the bar; the rest, Account and Sign out open under More.
const barSlots = 4;

function isActive(pathname: string, link: MobileNavLink): boolean {
  return link.exact
    ? pathname === link.to
    : pathname === link.to || pathname.startsWith(`${link.to}/`);
}

/**
 * Phone navigation (720px and below) for owner, admin and manager: a bottom
 * bar in the shape of the Employee Hub bar (BL-192). The links are the
 * sidebar's own permission-filtered list, so a page the person cannot open
 * never shows here either. Above 720px it draws nothing and the sidebar stays.
 */
export function ManagementMobileNav({
  links,
  onSignOut,
}: {
  readonly links: readonly MobileNavLink[];
  readonly onSignOut: () => void;
}) {
  const { pathname } = useLocation();
  const sheet = useRef<HTMLDialogElement>(null);
  const close = () => sheet.current?.close();
  const primary = links.slice(0, barSlots);
  const more = links.slice(barSlots);
  const moreActive = !primary.some((link) => isActive(pathname, link));

  const item = (link: MobileNavLink, onClick?: () => void) => {
    const Icon = link.icon;
    return (
      <NavLink
        key={link.to}
        to={link.to}
        end={link.exact}
        onClick={onClick}
        className={({ isActive: active }) => (active ? "active" : "")}
      >
        <Icon size={21} aria-hidden />
        <span>{link.label}</span>
      </NavLink>
    );
  };

  return (
    <>
      <nav className="mm-bar" aria-label="Main navigation">
        {primary.map((link) => item(link))}
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
        className="mm-sheet"
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
        <div className="mm-sheet-body">
          <header>
            <strong>More</strong>
            <button type="button" className="mm-icon-button" aria-label="Close" onClick={close}>
              <X size={20} aria-hidden />
            </button>
          </header>
          <nav aria-label="More pages">
            {more.map((link) => item(link, close))}
            <NavLink
              to="/account/profile"
              onClick={close}
              className={({ isActive: active }) => (active ? "active" : "")}
            >
              <CurrentUserAvatar />
              <span>Account</span>
            </NavLink>
            <button
              type="button"
              onClick={() => {
                close();
                onSignOut();
              }}
            >
              <LogOut size={20} aria-hidden />
              <span>Sign out</span>
            </button>
          </nav>
        </div>
      </dialog>
    </>
  );
}
