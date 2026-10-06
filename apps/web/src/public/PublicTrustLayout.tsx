import { ArrowRight } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router";
import { useAuth } from "../auth/AuthContext";

const trustLinks = [
  { label: "Privacy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
  { label: "Cookies", to: "/cookies" },
  { label: "Accessibility", to: "/accessibility" },
  { label: "Contact", to: "/contact" },
] as const;

export default function PublicTrustLayout() {
  const { authenticated, context } = useAuth();
  const appDestination = context
    ? "/app"
    : authenticated
      ? "/account/workspaces"
      : "/sign-in";

  return (
    <div className="public-trust-shell">
      <header className="public-trust-header">
        <div className="public-trust-header-inner">
          <Link className="public-trust-brand" to="/">
            NEWFORK
          </Link>
          <nav aria-label="Trust pages">
            {trustLinks.map((link) => (
              <NavLink
                className={({ isActive }) => (isActive ? "active" : undefined)}
                key={link.to}
                to={link.to}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <Link className="public-trust-app-link" to={appDestination}>
            {authenticated ? "Open workspace" : "Sign in"}
            <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </header>

      <main className="public-trust-main">
        <Outlet />
      </main>

      <footer className="public-trust-footer">
        <div>
          <strong>Newfork</strong>
          <p>Restaurant scheduling and team operations.</p>
        </div>
        <nav aria-label="Trust and legal">
          {trustLinks.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
          <Link to="/your-privacy-choices">Your privacy choices</Link>
        </nav>
      </footer>
    </div>
  );
}
