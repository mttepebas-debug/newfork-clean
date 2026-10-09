import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowUpRight, RefreshCw } from "lucide-react";
export function CardHeading({
  title,
  icon,
  id,
  to,
}: {
  title: string;
  icon: ReactNode;
  id?: string;
  to?: string;
}) {
  return (
    <div className="eh-card-heading">
      <h2 id={id}>
        {icon}
        {title}
      </h2>
      {to && (
        <Link to={to} aria-label={`View all ${title.toLowerCase()}`}>
          View all
          <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  );
}
export function PanelError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="eh-panel-error" role="status">
      <p>This section couldn’t be loaded.</p>
      <button onClick={onRetry}>
        <RefreshCw size={14} />
        Try again
      </button>
    </div>
  );
}
