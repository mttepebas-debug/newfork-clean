import type { ReactNode } from "react";
import "./list-cards.css";

// KARARLAR Genel "telefonda liste sayfaları kart satırıyla" (2026-10-05) and
// Employees G2 (2026-10-07): on a phone a list page shows one card per row
// instead of its table. A card is one button: a round mark, the title with the
// status at its right, and short lines under the title. The page draws its
// table and these cards together; list-cards.css shows the cards only on a phone.

export function ListCards({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <ul className="list-cards" aria-label={label}>
      {children}
    </ul>
  );
}

export function ListCard({
  label,
  mark,
  title,
  status,
  lines,
  onOpen,
}: {
  /** What a screen reader says for the whole card. */
  readonly label: string;
  readonly mark: ReactNode;
  readonly title: ReactNode;
  readonly status: ReactNode;
  /** Lines under the title; an empty one is left out. */
  readonly lines: readonly (ReactNode | null)[];
  readonly onOpen: () => void;
}) {
  const shown = lines.filter((line) => line !== null && line !== "");
  return (
    <li>
      <button type="button" className="list-card" aria-label={label} onClick={onOpen}>
        <span
          className="list-card-mark"
          style={{ gridRow: `1 / span ${1 + shown.length}` }}
          aria-hidden
        >
          {mark}
        </span>
        <span className="list-card-title">{title}</span>
        <span className="list-card-status">{status}</span>
        {shown.map((line, index) => (
          <small key={index} className="list-card-line">
            {line}
          </small>
        ))}
      </button>
    </li>
  );
}
