import { LineupArt } from "../lineup-art/LineupArt";

// The person's circle on a lineup row, the phone's and the desktop's (LINEUP-EDIT W1): her Lineup drawing
// (AVATAR-IKON slice 4), her initials without one.
export function LineupPersonCircle({ name, artKey }: { readonly name: string; readonly artKey: string | null }) {
  return <LineupArt artKey={artKey} name={name} size={38} className="lineup-phone-avatar" />;
}
