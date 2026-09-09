import type { ReactNode } from "react";

export function AccountPageHeader({
  title,
  titleId,
  description,
  action,
}: {
  readonly title: string;
  readonly titleId: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <header className="account-page-header">
      <div>
        <h1 id={titleId}>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="account-header-action">{action}</div> : null}
    </header>
  );
}
