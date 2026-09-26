import { useId, type ReactNode } from "react";
import type { WorkspaceSummary } from "@newfork/shared";
import { ChevronLeft, LogOut } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import "./prebiz.css";

/** The account and its way out. Every screen before a business shows this one block. */
export function AccountBlock() {
  const { account, authenticated, signOut } = useAuth();
  // Sign-in is in this frame too, and a visitor with no session has nothing to
  // sign out of. A session with no account loaded keeps the way out anyway.
  if (!account && !authenticated) return null;
  return (
    <div className="pb-account">
      <span className="pb-account-id">
        {account?.displayName ? <strong>{account.displayName}</strong> : null}
        <span>{account?.email ?? "Signed in"}</span>
      </span>
      <button
        className="pb-btn pb-btn-secondary"
        type="button"
        onClick={() => void signOut()}
      >
        <LogOut size={15} aria-hidden /> Sign out
      </button>
    </div>
  );
}

// BL-137 link colour, DEV only: `?variant=quiet` on the first load shows the
// trust-link grey instead of green until reload. Delete once one is chosen.
const quietLinks =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("variant") === "quiet";

export function PreBizFrame({
  titleId,
  title,
  description,
  /** A screen that is one column of fields, not a list: the stage narrows to it. */
  narrow,
  children,
}: {
  readonly titleId: string;
  readonly title: string;
  readonly description?: string;
  readonly narrow?: boolean;
  readonly children?: ReactNode;
}) {
  return (
    // A gate screen has no steps to carry, so the frame is a thin bar instead
    // of the wizard's side panel: nothing is left holding an empty column.
    <div className={quietLinks ? "pb-gate pb-links-quiet" : "pb-gate"}>
      <header className="pb-topbar">
        <span className="pb-brand">NEWFORK</span>
        <AccountBlock />
      </header>
      {/* The stage is the main landmark, so "skip to main" lands on the heading. */}
      <main
        className={narrow ? "pb-stage pb-stage-narrow" : "pb-stage"}
        aria-labelledby={titleId}
      >
        {/* Pages show "Checking…" first and then swap this title; without a
            live region a screen reader never hears that the page is ready. */}
        <h1 id={titleId} aria-live="polite">
          {title}
        </h1>
        {description ? <p className="pb-description">{description}</p> : null}
        {children}
      </main>
    </div>
  );
}

/**
 * How every wizard step ends: the way back on the left, the one green step
 * forward on the right. It sticks to the bottom of a long form, so the step
 * never hides its own action below the fold.
 */
export function WizardBar({
  back,
  error,
  children,
}: {
  readonly back?: { readonly label: string; readonly onClick: () => void };
  readonly error?: string | null;
  readonly children: ReactNode;
}) {
  return (
    <footer className="pb-bar">
      {back ? (
        <button
          type="button"
          className="pb-btn pb-btn-secondary"
          onClick={back.onClick}
        >
          <ChevronLeft size={15} aria-hidden /> {back.label}
        </button>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="pb-bar-end">{children}</div>
    </footer>
  );
}

export type BadgeTone = "neutral" | "progress" | "success" | "danger";

export function StatusBadge({
  tone = "neutral",
  children,
}: {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
}) {
  return <span className={`pb-badge pb-badge-${tone}`}>{children}</span>;
}

/** The role as a row shows it. One map, so every screen says the same word. */
export const roleLabel: Record<WorkspaceSummary["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  employee: "Employee",
};

export function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  // A page can hold several lists; the heading names each one for a screen reader.
  const headingId = useId();
  return (
    <div className="pb-section">
      <h2 id={headingId}>{title}</h2>
      <div className="pb-list" role="list" aria-labelledby={headingId}>
        {children}
      </div>
    </div>
  );
}

/** One business, one line: name, "Role · status", then its actions. Same on every screen. */
export function BusinessRow({
  name,
  role,
  badge,
  error,
  current,
  children,
}: {
  readonly name: string;
  readonly role?: string;
  readonly badge?: ReactNode;
  readonly error?: string | null;
  /** The business this tab is working in; the row is tinted and announced as current. */
  readonly current?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div
      className="pb-row"
      role="listitem"
      aria-current={current ? "true" : undefined}
    >
      <div className="pb-row-text">
        <strong title={name}>{name}</strong>
        <span className="pb-row-meta">
          {role ? <span>{role}</span> : null}
          {badge}
        </span>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="pb-row-actions">{children}</div>
    </div>
  );
}
