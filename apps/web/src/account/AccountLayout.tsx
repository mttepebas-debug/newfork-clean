import {
  ArrowLeft,
  Bell,
  LogOut,
  Palette,
  ShieldCheck,
  UserRound,
  Warehouse,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageOutline } from "../shell/LoadState";
import { useFrozenTop } from "../shell/useFrozenTop";
import { usePhonePageMenu } from "../shell/usePhonePageMenu";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import "./account.css";
import { requestAppNavigation } from "../shell/leave-guard";
import { workspaceReturnPath } from "../shell/last-app-page";
import { AccountAvatar } from "./AccountAvatar";
import { countAccountAttention, supabaseClient } from "../lib/supabase";

/**
 * `waiting` names which count belongs to a tab. Four of the five ask nothing of
 * anybody, so they carry no number and never will.
 */
const accountNav = [
  { to: "/account/profile", label: "Profile", icon: UserRound },
  { to: "/account/security", label: "Security", icon: ShieldCheck },
  { to: "/account/preferences", label: "Preferences", icon: Palette },
  {
    to: "/account/preferences/notifications",
    label: "Notifications",
    icon: Bell,
  },
  {
    to: "/account/workspaces",
    label: "Workspaces",
    icon: Warehouse,
    waiting: "workspaces",
  },
] as const;

export default function AccountLayout() {
  const { account, context, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const contentRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [content, setContent] = useState<HTMLElement | null>(null);
  const [grid, setGrid] = useState<HTMLElement | null>(null);
  const contentBox = useCallback((element: HTMLElement | null) => {
    contentRef.current = element;
    setContent(element);
  }, []);
  // On a phone the whole document scrolls and the Account menu stays above the page too.
  useFrozenTop(content, grid);
  // On a phone the menu sits under the page heading's line and Back and Sign
  // out make the 56 px top bar (Mert 2026-10-17).
  const menuSlot = usePhonePageMenu(content);
  // A number here means somebody is waiting for an answer. It closes when the
  // thing is done, not when the tab is opened, so it cannot be cleared by
  // looking at it.
  const attention = useQuery({
    queryKey: ["account-attention", account?.userId],
    queryFn: () =>
      supabaseClient
        ? countAccountAttention(supabaseClient)
        : { documents: 0, workspaces: 0 },
    enabled: Boolean(account),
  });
  const waiting = attention.data ?? { documents: 0, workspaces: 0 };

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
    const frame = window.requestAnimationFrame(() => {
      if (!window.matchMedia("(max-width: 820px)").matches) return;
      navRef.current
        ?.querySelector<HTMLElement>(".account-nav-item.active")
        ?.scrollIntoView({ block: "nearest", inline: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  const menu = (
    <nav ref={navRef} aria-label="Account">
      {accountNav.map((item) => {
        const Icon = item.icon;
        const count = "waiting" in item ? waiting[item.waiting] : 0;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/account/preferences"}
            className={({ isActive }) =>
              "account-nav-item" + (isActive ? " active" : "")
            }
            aria-label={
              count > 0
                ? `${item.label}, ${count} waiting on you`
                : undefined
            }
          >
            <Icon size={17} aria-hidden />
            {item.label}
            {count > 0 ? (
              <span className="account-nav-count" aria-hidden>
                {count}
              </span>
            ) : null}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="account-shell">
      <div className="account-layout-grid" ref={setGrid}>
        <aside className="account-sidebar" aria-label="Account navigation">
        <div className="account-identity">
          <AccountAvatar className="account-avatar" size={36} />
          <div>
            <strong>{account?.displayName ?? "Account"}</strong>
          </div>
        </div>
        {menuSlot ? null : menu}
        <div className="account-sidebar-footer">
          {context ? (
            <button
              type="button"
              className="account-nav-item"
              onClick={() =>
                requestAppNavigation(() =>
                  navigate(workspaceReturnPath(account?.userId, context.workspace.id)),
                )
              }
            >
              <ArrowLeft size={17} aria-hidden /> Back to workspace
            </button>
          ) : null}
          <button type="button" className="account-nav-item" onClick={() => requestAppNavigation(() => void signOut())}>
            <LogOut size={17} aria-hidden /> Sign out
          </button>
        </div>
        </aside>
        <main className="account-content-scroll" ref={contentBox}>
          <div className="account-main">
            <Suspense fallback={<PageOutline />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
        {menuSlot ? createPortal(menu, menuSlot) : null}
      </div>
    </div>
  );
}
