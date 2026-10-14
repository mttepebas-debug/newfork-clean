import { Lock } from "lucide-react";
import { useId } from "react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { noAccessHomePath } from "../auth/resolveLanding";
import { pageName } from "./page-names";
import "./no-access.css";

/**
 * What a screen shows when it may not open: a guard that refuses the address
 * (ActionRoute, PermissionRoute, SettingsPageRoute) or the API's "you may not"
 * (`isNoAccess(error)`). One piece for every screen, and the whole screen:
 * nothing of the page shows around it, only the menus (Mert 2026-10-14, "C").
 * It never says whether the thing exists: an unknown target and an
 * out-of-scope one get the same answer (CLAUDE.md §9).
 */
export function NoAccessState({
  subject,
  homeHref = "/app",
}: {
  /**
   * Finishes "You don't have access to …". Left out, the page's menu name
   * ("Schedule"); a record inside a page passes its own ("this employee").
   */
  readonly subject?: string;
  /** Where "Back to Home" goes. Pass a page the person can open. */
  readonly homeHref?: string;
}) {
  const titleId = useId();
  const { pathname } = useLocation();
  return (
    <section className="no-access" aria-labelledby={titleId}>
      <span className="no-access-icon" aria-hidden>
        <Lock size={26} />
      </span>
      <div className="no-access-copy">
        <h2 id={titleId}>You don't have access to {subject ?? pageName(pathname)}</h2>
        <p>Ask an admin if you need it.</p>
      </div>
      <Link className="nf-button no-access-home" to={homeHref}>
        Back to Home
      </Link>
    </section>
  );
}

/** A guard's "no" for the address it was asked to open: the card, in place. */
export function NoAccessRoute({ subject }: { readonly subject?: string }) {
  const { context } = useAuth();
  const { pathname } = useLocation();
  return <NoAccessState subject={subject} homeHref={noAccessHomePath(context, pathname)} />;
}
