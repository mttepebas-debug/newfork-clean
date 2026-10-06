import { Link } from "react-router";
import { openPrivacyChoices } from "../privacy/consent";
import { APP_LINKS, BRAND_NAME } from "../site/config";
import { FOOTER_NAV } from "../site/navigation";
import { Wordmark } from "./Wordmark";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <Link to="/" aria-label="Home">
            <Wordmark />
          </Link>
          <p>Restaurant scheduling and team operations for multi-location restaurants.</p>
          <div className="site-footer__app">
            <a href={APP_LINKS.signIn}>Log in</a>
            <a href={APP_LINKS.createAccount}>Create a workspace account</a>
          </div>
        </div>
        {FOOTER_NAV.map((column) => (
          <nav key={column.title} className="site-footer__column" aria-label={column.title}>
            <p className="site-footer__title">{column.title}</p>
            <ul>
              {column.links.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="container site-footer__base">
        {/* The year can differ between the build and a visit on Jan 1. */}
        <p suppressHydrationWarning>
          © {new Date().getFullYear()} {BRAND_NAME}. Made for restaurants in the United States.
        </p>
        <div className="site-footer__base-links">
          <Link to="/your-privacy-choices">Your privacy choices</Link>
          <button type="button" className="link-button" onClick={openPrivacyChoices}>
            Cookie settings
          </button>
        </div>
      </div>
    </footer>
  );
}
