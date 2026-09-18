import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { useSearchParams } from "react-router";
import { useAuth } from "../../auth/AuthContext";
import "./prebiz.css";

/**
 * UI-PRE-001 Faz 1: the kit renders on the real pages only in DEV behind
 * `?shell=b` (the two-panel frame the user picked over the top-bar one).
 * Slice D1 makes it the only path and deletes this switch.
 */
export function useDevKit(): boolean {
  const [params] = useSearchParams();
  return import.meta.env.DEV && params.get("shell") === "b";
}

/** The account and its way out. Every screen before a business shows this one block. */
export function AccountBlock() {
  const { account, signOut } = useAuth();
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

export function PreBizFrame({
  titleId,
  title,
  description,
  children,
}: {
  readonly titleId: string;
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="pb">
      <aside className="pb-side">
        <span className="pb-brand">NEWFORK</span>
        <AccountBlock />
      </aside>
      {/* The stage is the main landmark, so "skip to main" lands on the heading. */}
      <main className="pb-stage" aria-labelledby={titleId}>
        <h1 id={titleId}>{title}</h1>
        {description ? <p className="pb-description">{description}</p> : null}
        {children}
      </main>
    </div>
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

export function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="pb-section">
      <h2>{title}</h2>
      <div className="pb-list" role="list">
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
  children,
}: {
  readonly name: string;
  readonly role?: string;
  readonly badge?: ReactNode;
  readonly error?: string | null;
  readonly children: ReactNode;
}) {
  return (
    <div className="pb-row" role="listitem">
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
