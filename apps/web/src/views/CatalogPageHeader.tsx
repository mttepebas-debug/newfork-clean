import type { ReactNode } from "react";

export function CatalogPageHeader({
  eyebrow,
  title,
  description,
  titleId,
  action,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description?: string;
  readonly titleId: string;
  readonly action?: ReactNode;
}) {
  return (
    <header className="catalog-page-header">
      <div className="catalog-page-heading">
        <span className="catalog-page-eyebrow">{eyebrow}</span>
        <h1 id={titleId}>
          {title}
          <span aria-hidden className="catalog-page-title-dot" />
        </h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="catalog-page-actions">{action}</div> : null}
    </header>
  );
}
