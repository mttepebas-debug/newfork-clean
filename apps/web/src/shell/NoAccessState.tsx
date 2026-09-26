import { Lock } from "lucide-react";
import { Link } from "react-router";
import "./no-access.css";

/**
 * What a screen shows when the API says "you may not" (`isNoAccess(error)`).
 * One piece for every screen. It never says whether the thing exists: an
 * unknown target and an out-of-scope one get the same answer (CLAUDE.md §9).
 */
export function NoAccessState({
  subject = "this page",
  homeHref = "/app",
}: {
  /** Finishes "You don't have access to …", e.g. "this schedule". */
  readonly subject?: string;
  /** Where "Back to Home" goes. Pass a page the person can open. */
  readonly homeHref?: string;
}) {
  return (
    <section className="no-access" aria-labelledby="no-access-title">
      <span className="no-access-icon" aria-hidden>
        <Lock size={22} />
      </span>
      <div className="no-access-copy">
        <h2 id="no-access-title">You don't have access to {subject}</h2>
        <p>Your role or your locations don't include it.</p>
        <p className="no-access-help">Ask an admin for access.</p>
      </div>
      <Link className="nf-button no-access-home" to={homeHref}>
        Back to Home
      </Link>
    </section>
  );
}
