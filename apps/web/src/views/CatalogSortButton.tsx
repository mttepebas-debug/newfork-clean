import { ArrowUpDown } from "lucide-react";

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
      <ArrowUpDown className="catalog-sort-icon" size={12} aria-hidden />
    </button>
  );
}
