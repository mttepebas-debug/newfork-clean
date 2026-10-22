import type { KindOfLeave } from "@newfork/shared";
import { Ellipsis, Plane, Thermometer, User } from "lucide-react";

const icons = { vacation: Plane, sick: Thermometer, personal: User, other: Ellipsis } as const;

export function LeaveIcon({ kind, size = 16 }: { kind: KindOfLeave; size?: number }) {
  const Icon = icons[kind];
  return <Icon size={size} aria-hidden className="tor-i" />;
}
