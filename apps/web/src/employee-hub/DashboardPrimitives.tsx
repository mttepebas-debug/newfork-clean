import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
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
