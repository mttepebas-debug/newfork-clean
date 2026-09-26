import { Lock } from "lucide-react";
import { Link } from "react-router";
import "./no-access.css";

/**
 * What a screen shows when the API says "you may not" (`isNoAccess(error)`).
 * One piece for every screen. It never says whether the thing exists: an
 * unknown target and an out-of-scope one get the same answer (CLAUDE.md §9).
 */
// ponytail: `variant` exists only while the user picks one (FB-6.1.9); the
// losers and the prop are deleted after the choice.
export type NoAccessVariant = "card" | "inline" | "page";

export function NoAccessState({
  subject = "this page",
  homeHref = "/app",
  variant = "card",
}: {
  /** Finishes "You don't have access to …", e.g. "this schedule". */
  readonly subject?: string;
  readonly homeHref?: string;
  readonly variant?: NoAccessVariant;
}) {
  return (
    <section
      className={`no-access no-access-${variant}`}
      aria-labelledby="no-access-title"
    >
      <span className="no-access-icon" aria-hidden>
        <Lock size={variant === "inline" ? 18 : variant === "page" ? 26 : 22} />
      </span>
      <div className="no-access-copy">
        <h2 id="no-access-title">You don't have access to {subject}</h2>
        <p>Your role or your locations don't include it.</p>
        <p className="no-access-help">
          To get access, ask your workspace owner or an admin.
        </p>
      </div>
      <div className="no-access-actions">
        <Link className="nf-button no-access-home" to={homeHref}>
          Back to Home
        </Link>
        {variant === "page" ? (
          <Link className="nf-button secondary-button" to="/workspaces">
            Switch workspace
          </Link>
        ) : null}
      </div>
    </section>
  );
}
