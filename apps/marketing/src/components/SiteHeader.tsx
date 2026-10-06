import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, NavLink as RouterNavLink, useLocation } from "react-router";
import { APP_LINKS } from "../site/config";
import { isGroup, PRIMARY_NAV, type NavGroup } from "../site/navigation";
import { Wordmark } from "./Wordmark";

const HOVER_OPEN_MS = 90;
const HOVER_CLOSE_MS = 220;

function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

function MenuPanel({ group, id, onNavigate }: { readonly group: NavGroup; readonly id: string; readonly onNavigate: () => void }) {
  return (
    <div className="nav-panel" id={id}>
      <div className="nav-panel__columns">
        {group.columns.map((column) => (
          <div key={column.title} className="nav-panel__column">
            <p className="nav-panel__title">{column.title}</p>
            <ul>
              {column.links.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="nav-panel__link" onClick={onNavigate}>
                    <span className="nav-panel__label">{link.label}</span>
                    {link.description ? <span className="nav-panel__desc">{link.description}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {group.feature ? (
        <Link to={group.feature.to} className="nav-panel__feature" onClick={onNavigate}>
          <span className="nav-panel__label">{group.feature.label} →</span>
          {group.feature.description ? <span className="nav-panel__desc">{group.feature.description}</span> : null}
        </Link>
      ) : null}
    </div>
  );
}

function DesktopNav() {
  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const navRef = useRef<HTMLElement | null>(null);
  const baseId = useId();
  const location = useLocation();

  const close = useCallback(() => setOpen(null), []);
  useEffect(close, [location.pathname, location.hash, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const button = navRef.current?.querySelector<HTMLButtonElement>(`[data-group="${open}"]`);
      setOpen(null);
      button?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const hover = (id: string | null, delay: number) => (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(id), delay);
  };

  return (
    <nav ref={navRef} className="site-nav" aria-label="Main">
      <ul className="site-nav__list">
        {PRIMARY_NAV.map((item) =>
          isGroup(item) ? (
            <li
              key={item.id}
              className="site-nav__item"
              onPointerEnter={hover(item.id, HOVER_OPEN_MS)}
              onPointerLeave={hover(null, HOVER_CLOSE_MS)}
            >
              <button
                type="button"
                className="site-nav__trigger"
                data-group={item.id}
                aria-expanded={open === item.id}
                aria-controls={`${baseId}-${item.id}`}
                onClick={() => setOpen((current) => (current === item.id ? null : item.id))}
              >
                {item.label}
                <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10">
                  <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
              <div className="site-nav__dropdown" hidden={open !== item.id}>
                <MenuPanel group={item} id={`${baseId}-${item.id}`} onNavigate={close} />
              </div>
            </li>
          ) : (
            <li key={item.to} className="site-nav__item">
              <RouterNavLink to={item.to} className="site-nav__link">
                {item.label}
              </RouterNavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}

function MobileMenu() {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const location = useLocation();
  const id = useId();

  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sheet = sheetRef.current;
    sheet?.querySelector<HTMLElement>("a, button, summary")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      const focusable = [...sheet.querySelectorAll<HTMLElement>("a[href], button, summary")].filter(
        (element) => element.offsetParent !== null,
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="mobile-menu">
      <button
        ref={buttonRef}
        type="button"
        className="mobile-menu__button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="mobile-menu__icon" aria-hidden="true">
          <i />
          <i />
        </span>
        {open ? "Close" : "Menu"}
      </button>
      <div
        ref={sheetRef}
        id={id}
        className="mobile-menu__sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        hidden={!open}
      >
        <nav aria-label="Main">
          <ul className="mobile-menu__list">
            {PRIMARY_NAV.map((item) =>
              isGroup(item) ? (
                <li key={item.id}>
                  <details className="mobile-menu__group">
                    <summary>{item.label}</summary>
                    {item.columns.map((column) => (
                      <div key={column.title} className="mobile-menu__column">
                        <p className="mobile-menu__title">{column.title}</p>
                        <ul>
                          {column.links.map((link) => (
                            <li key={link.to}>
                              <Link to={link.to} onClick={() => setOpen(false)}>
                                {link.label}
                                {link.description ? <span>{link.description}</span> : null}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {item.feature ? (
                      <Link className="mobile-menu__feature" to={item.feature.to} onClick={() => setOpen(false)}>
                        {item.feature.label} →
                      </Link>
                    ) : null}
                  </details>
                </li>
              ) : (
                <li key={item.to}>
                  <Link className="mobile-menu__link" to={item.to} onClick={() => setOpen(false)}>
                    {item.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>
        <div className="mobile-menu__actions">
          <a className="btn btn--primary btn--block" href={APP_LINKS.createAccount}>
            Get started
          </a>
          <a className="btn btn--secondary btn--block" href={APP_LINKS.signIn}>
            Log in
          </a>
        </div>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const scrolled = useScrolled();
  return (
    <header className={scrolled ? "site-header is-scrolled" : "site-header"}>
      <div className="site-header__inner container">
        <Link to="/" className="site-header__brand" aria-label="Home">
          <Wordmark />
        </Link>
        <DesktopNav />
        <div className="site-header__actions">
          <a className="site-header__login" href={APP_LINKS.signIn}>
            Log in
          </a>
          <a className="btn btn--primary btn--small" href={APP_LINKS.createAccount}>
            Get started
          </a>
        </div>
        <MobileMenu />
      </div>
    </header>
  );
}
