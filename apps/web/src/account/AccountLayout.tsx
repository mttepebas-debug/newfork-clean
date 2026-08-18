import { ArrowLeft, LogOut, Palette, UserRound, Warehouse } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";

const accountNav = [
  { to: "/account/profile", label: "Profile", icon: UserRound },
  { to: "/account/preferences", label: "Preferences", icon: Palette },
  { to: "/account/workspaces", label: "Workspaces", icon: Warehouse },
] as const;

export default function AccountLayout() {
  const { account, context, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="account-shell">
      <aside className="account-sidebar" aria-label="Account navigation">
        <div className="account-identity">
          <span className="account-avatar" aria-hidden>
            {account?.displayName.slice(0, 1).toUpperCase() ?? "A"}
          </span>
          <div>
            <strong>{account?.displayName ?? "Account"}</strong>
            <span>{account?.email}</span>
          </div>
        </div>
        <nav aria-label="Account">
          {accountNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
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
              onClick={() => navigate("/app")}
            >
              <ArrowLeft size={17} aria-hidden /> Back to workspace
            </button>
          ) : null}
          <button type="button" className="account-nav-item" onClick={signOut}>
            <LogOut size={17} aria-hidden /> Sign out
          </button>
        </div>
      </aside>
      <main className="account-main">
        <Outlet />
      </main>
    </div>
  );
}
