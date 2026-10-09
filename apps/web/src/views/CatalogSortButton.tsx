import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

// The arrow is always drawn; which one shows is read from the heading's own
// aria-sort in CSS, so the screen and the screen reader cannot disagree (BL-663).
export function CatalogSortButton({
  active,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="catalog-sort-button"
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="catalog-sort-label">{label}</span>
      <ArrowUpDown className="catalog-sort-icon catalog-sort-icon--none" size={12} aria-hidden />
      <ArrowUp className="catalog-sort-icon catalog-sort-icon--ascending" size={12} aria-hidden />
      <ArrowDown className="catalog-sort-icon catalog-sort-icon--descending" size={12} aria-hidden />
    </button>
  );
}
