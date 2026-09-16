import {
  ArrowLeft,
  Bell,
  FileText,
  LogOut,
  Palette,
  ShieldCheck,
  UserRound,
  Warehouse,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import "./account.css";
import { requestAvailabilityNavigation } from "../availability/availability-navigation";
import { AccountAvatar } from "./AccountAvatar";

const accountNav = [
  { to: "/account/profile", label: "Profile", icon: UserRound },
  { to: "/account/security", label: "Security", icon: ShieldCheck },
  { to: "/account/preferences", label: "Preferences", icon: Palette },
  {
    to: "/account/preferences/notifications",
    label: "Notifications",
    icon: Bell,
  },
  { to: "/account/workspaces", label: "Workspaces", icon: Warehouse },
  { to: "/account/documents", label: "Documents", icon: FileText },
] as const;

export default function AccountLayout() {
  const { account, context, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const contentRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);

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

  return (
    <div className="account-shell">
      <div className="account-layout-grid">
        <aside className="account-sidebar" aria-label="Account navigation">
        <div className="account-identity">
          <AccountAvatar globalUrl={account?.avatarUrl} name={account?.displayName ?? "Account"} className="account-avatar" />
          <div>
            <strong>{account?.displayName ?? "Account"}</strong>
          </div>
        </div>
        <nav ref={navRef} aria-label="Account">
          {accountNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/account/preferences"}
                className={({ isActive }) =>
                  "account-nav-item" + (isActive ? " active" : "")
                }
              >
                <Icon size={17} aria-hidden />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="account-sidebar-footer">
          {context ? (
            <button
              type="button"
              className="account-nav-item"
              onClick={() => requestAvailabilityNavigation(() => navigate("/app"))}
            >
              <ArrowLeft size={17} aria-hidden /> Back to workspace
            </button>
          ) : null}
          <button type="button" className="account-nav-item" onClick={() => requestAvailabilityNavigation(() => void signOut())}>
            <LogOut size={17} aria-hidden /> Sign out
          </button>
        </div>
        </aside>
        <main className="account-content-scroll" ref={contentRef}>
          <header className="account-overview-header">
            <div>
              <span className="account-eyebrow">Personal settings</span>
              <h1>Account</h1>
              <p>Manage the details and preferences that follow you across every workspace.</p>
            </div>
          </header>
          <div className="account-main">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
