import type { CSSProperties } from "react";
import { useLineupArtSvgs } from "./useLineupArt";
import "./lineup-art.css";

/** The initials the Lineup circles show today (views/LineupPhone.tsx): first letters of two words. */
export function lineupInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * A drawing from the archive in a circle, or the person's initials while the drawings load, when the
 * key is null, or when the archive has no such key. Decorative: the name is always written beside it.
 * The SVGs are our own build-time files (scripts/lineup-art/gen.mjs), so they are inlined as they are.
 */
export function LineupArt({
  artKey,
  name,
  size,
  className,
  style: extra,
}: {
  readonly artKey: string | null;
  readonly name: string;
  readonly size: number;
  readonly className?: string;
  /** More custom properties for the circle (EmployeeLineup's --job ring). */
  readonly style?: CSSProperties;
}) {
  const svgs = useLineupArtSvgs();
  // Only the archive's own entries: a key like "constructor" must not find what every object inherits.
  const own = artKey && svgs && Object.hasOwn(svgs, artKey) ? svgs[artKey] : undefined;
  const svg = typeof own === "string" ? own : undefined;
  const style = { ...extra, "--lineup-art-size": `${size}px` } as CSSProperties;
  const classes = ["lineup-art", svg ? "lineup-art--drawing" : "lineup-art--initials", className].filter(Boolean).join(" ");
  return (
    <span className={classes} style={style} aria-hidden="true" data-art-key={svg ? artKey : undefined}>
      {svg ? <span className="lineup-art-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : lineupInitials(name)}
    </span>
  );
}
