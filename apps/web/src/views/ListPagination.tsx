import { ChevronLeft, ChevronRight } from "lucide-react";
import "./list-page.css";

export const LIST_PAGE_SIZES = [25, 50, 100] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZES)[number];
export const DEFAULT_LIST_PAGE_SIZE: ListPageSize = 50;

/** First, last and the three around the current page; a lone hidden page is shown instead of a gap. */
export function pageNumbers(current: number, last: number): (number | "gap")[] {
  if (last <= 7) return Array.from({ length: last }, (_, index) => index + 1);
  const start = Math.min(Math.max(current - 1, 1), last - 2);
  const pages: (number | "gap")[] = [];
  for (let page = 1; page <= last; page += 1) {
    const shown = page === 1 || page === last || (page >= start && page <= start + 2);
    const loneGap = (page === 2 && start === 3) || (page === last - 1 && start + 2 === last - 2);
    if (shown || loneGap) pages.push(page);
    else if (pages.at(-1) !== "gap") pages.push("gap");
  }
  return pages;
}

// The bar under every list table (KARARLAR "Liste sayfalarının ortak dili" →
// Sayfalama, K-S9): rows per page 25 / 50 / 100, default 50, and page numbers.
// Data stays the caller's: it passes the total and gets page / size changes back.
export function ListPagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (size: ListPageSize) => void;
}) {
  // ponytail: nothing to choose when the list fits on the smallest page.
  if (total <= LIST_PAGE_SIZES[0]) return null;
  const last = Math.max(1, Math.ceil(total / pageSize));
  const first = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <nav className="list-pagination" aria-label="Pages">
      <label className="list-pagination-size">
        <span>Rows per page</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value) as ListPageSize)}
        >
          {LIST_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <span className="list-pagination-range">{`${first}–${end} of ${total}`}</span>
      <div className="list-pagination-pages">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={14} aria-hidden />
        </button>
        {pageNumbers(page, last).map((item, index) =>
          item === "gap" ? (
            <span key={`gap-${index}`} className="list-pagination-gap" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-label={`Page ${item}`}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= last}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight size={14} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
