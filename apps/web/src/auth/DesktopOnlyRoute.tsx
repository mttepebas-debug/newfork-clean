import type { ReactNode } from "react";
import { usePhoneWidth } from "../lib/usePhoneWidth";
import "./desktop-only-route.css";

/**
 * A screen made on a computer (KARARLAR "Schedule telefonda tamamen kapalı"):
 * on a phone it says so in one line instead of opening.
 */
export function DesktopOnlyRoute({ message, children }: { readonly message: string; readonly children: ReactNode }) {
  const phone = usePhoneWidth();
  if (phone) return <p className="desktop-only-route" role="status">{message}</p>;
  return children;
}
