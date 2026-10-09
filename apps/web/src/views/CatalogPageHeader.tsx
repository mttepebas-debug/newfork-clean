import { Button } from "@newfork/ui";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import "./list-page.css";

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
        {description ? <p title={description}>{description}</p> : null}
      </div>
      {action ? <div className="catalog-page-actions">{action}</div> : null}
    </header>
  );
}

/** The white add button at the right end of a list page's filter row
 * (KARARLAR Genel → "Liste sayfalarının ortak dili"). */
export function ListAddButton({
  label,
  onClick,
  disabled,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Button className="list-add-button list-add-action" disabled={disabled} onClick={onClick}>
      <Plus size={14} strokeWidth={2} aria-hidden />
      {label}
    </Button>
  );
}
