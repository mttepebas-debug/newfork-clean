import { useState, type CSSProperties } from "react";
import type { Avatar } from "@newfork/shared";
import { LineupArt, lineupInitials } from "../lineup-art/LineupArt";
import "./member-avatar.css";

/**
 * AVATAR-IKON (design 4.3): a person's avatar in one workspace, in a circle. A photo shows as the
 * photo, a drawing as the drawing, nothing as the initials; a photo that cannot load (its signed
 * address ran out) or has no address falls back to the initials. Decorative: the name is written
 * beside it wherever it is used.
 */
export function MemberAvatar({
  avatar,
  name,
  size,
  className,
}: {
  readonly avatar: Avatar | null;
  readonly name: string;
  readonly size: number;
  readonly className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = avatar?.kind === "photo" && avatar.url && avatar.url !== failed ? avatar.url : null;
  const art = avatar?.kind === "art" ? avatar.art_key : null;
  const kind = photo ? "photo" : art ? "art" : "initials";
  const style = { "--member-avatar-size": `${size}px` } as CSSProperties;
  return (
    <span className={["member-avatar", `member-avatar--${kind}`, className].filter(Boolean).join(" ")} style={style} aria-hidden="true">
      {photo ? (
        <img src={photo} alt="" onError={() => setFailed(photo)} />
      ) : art ? (
        <LineupArt artKey={art} name={name} size={size} className="member-avatar-art" />
      ) : (
        lineupInitials(name) || "A"
      )}
    </span>
  );
}
