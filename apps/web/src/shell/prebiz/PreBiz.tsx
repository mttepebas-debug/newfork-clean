import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { useSearchParams } from "react-router";
import { useAuth } from "../../auth/AuthContext";
import "./prebiz.css";

export type PreBizShellVariant = "a" | "b";

/**
 * UI-PRE-001 Faz 1: the landing frame is chosen by eye, so both candidates
 * render on the real pages behind `?shell=a|b`. DEV only; the pick becomes
 * the implementation and this switch is deleted.
 */
export function useDevShellVariant(): PreBizShellVariant | null {
  const [params] = useSearchParams();
  if (!import.meta.env.DEV) return null;
  const value = params.get("shell");
  return value === "a" || value === "b" ? value : null;
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
  variant,
  titleId,
  eyebrow,
  title,
  description,
  children,
}: {
  readonly variant: PreBizShellVariant;
  readonly titleId: string;
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  const stage = (
    <section className="pb-stage" aria-labelledby={titleId}>
      {eyebrow ? <p className="pb-eyebrow">{eyebrow}</p> : null}
      <h1 id={titleId}>{title}</h1>
      {description ? <p className="pb-description">{description}</p> : null}
      {children}
    </section>
  );

  if (variant === "a") {
    return (
      <main className="pb pb-shell-a">
        <header className="pb-topbar">
          <span className="pb-brand">NEWFORK</span>
          <AccountBlock />
        </header>
        {stage}
      </main>
    );
  }
  return (
    <main className="pb pb-shell-b">
      <aside className="pb-side">
        <span className="pb-brand">NEWFORK</span>
        <AccountBlock />
      </aside>
      {stage}
    </main>
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
          {role ? <span className="pb-row-role">{role}</span> : null}
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
