import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Search } from "lucide-react";
import { lineupArt, lineupArtByKey, type LineupArtItem } from "@newfork/shared";
import { LineupArt } from "./LineupArt";
import "./lineup-art-grid.css";

// AVATAR-IKON: the archive as a grid of square tiles, with filters and a search (Mert, 19 Oct: the
// job drawer's "Lineup icons", desktop B and the phone's sheet A; later the avatar window). The
// selection lives with the screen: the grid says which tile was picked, nextLineupArtSelection
// says what that does to the list.

type Filter = "suggested" | "people" | "things" | "all";
const filters: readonly (readonly [Filter, string])[] = [
  ["suggested", "Suggested"],
  ["people", "People"],
  ["things", "Things"],
  ["all", "All"],
];

let ordered: readonly LineupArtItem[] | null = null;
/** The archive with the colour drawings first, then the line icons, each by number. */
function orderedArt(): readonly LineupArtItem[] {
  ordered ??= [...lineupArt].sort((a, b) => (a.style === b.style ? a.no - b.no : a.style === "color" ? -1 : 1));
  return ordered;
}

function fold(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function shown(filter: Filter, query: string, suggested: readonly string[]): readonly LineupArtItem[] {
  const search = fold(query);
  if (search) return orderedArt().filter((item) => fold(`${item.name} ${item.jobs.join(" ")}`).includes(search));
  if (filter === "suggested")
    return suggested.flatMap((key) => {
      const item = lineupArtByKey.get(key);
      return item ? [item] : [];
    });
  if (filter === "people") return orderedArt().filter((item) => item.kind === "person" || item.kind === "team");
  if (filter === "things") return orderedArt().filter((item) => item.kind === "object");
  return orderedArt();
}

/** What picking `key` does: multi adds it at the end or lets it go; single keeps only it. */
export function nextLineupArtSelection(mode: "multi" | "single", selected: readonly string[], key: string): string[] {
  if (mode === "single") return [key];
  return selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key];
}

export function LineupArtGrid({
  mode,
  selected,
  onToggle,
  suggested,
  leadTile,
  label = "Icons",
  max,
  disabled = false,
}: {
  readonly mode: "multi" | "single";
  readonly selected: readonly string[];
  readonly onToggle: (key: string) => void;
  readonly suggested: readonly string[];
  /** A tile before the drawings (the avatar window's "Upload photo"). */
  readonly leadTile?: ReactNode;
  readonly label?: string;
  /** Multi: the most the list may hold; the other tiles rest until one is let go. */
  readonly max?: number;
  readonly disabled?: boolean;
}) {
  // Until a filter is chosen the grid opens on Suggested when there is a suggestion, else on All;
  // a "New job" whose name brings its first suggestion moves to Suggested with it.
  const [chosen, setChosen] = useState<Filter | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const tilesRef = useRef<HTMLDivElement>(null);
  const filter: Filter =
    chosen === "suggested" && !suggested.length ? "all" : (chosen ?? (suggested.length ? "suggested" : "all"));
  const searching = Boolean(query.trim());
  const items = shown(filter, query, suggested);
  const full = mode === "multi" && max !== undefined && selected.length >= max;
  const tabStop =
    items.find((item) => item.key === active)?.key ??
    items.find((item) => selected.includes(item.key))?.key ??
    items[0]?.key;

  function resting(key: string): boolean {
    return disabled || (full && !selected.includes(key));
  }
  function pick(key: string) {
    setActive(key);
    if (!resting(key)) onToggle(key);
  }
  function move(event: KeyboardEvent<HTMLDivElement>, index: number) {
    const tiles = Array.from(tilesRef.current?.querySelectorAll<HTMLElement>("[data-key]") ?? []);
    let next = index;
    if (event.key === "ArrowRight") next = index + 1;
    else if (event.key === "ArrowLeft") next = index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tiles.length - 1;
    else {
      // A row is the tiles that sit as high as the first one.
      const top = tiles[0]?.offsetTop;
      const split = tiles.findIndex((tile) => tile.offsetTop !== top);
      const columns = split > 0 ? split : tiles.length;
      next = index + (event.key === "ArrowDown" ? columns : -columns);
    }
    event.preventDefault();
    const tile = tiles[next];
    if (!tile) return;
    setActive(tile.dataset.key ?? null);
    tile.focus();
  }

  return (
    <div className="lineup-art-picker">
      <div className="lineup-art-tools">
        <div className="lineup-art-filters" role="group" aria-label="Show icons">
          {filters
            .filter(([value]) => value !== "suggested" || suggested.length)
            .map(([value, text]) => (
              <button
                type="button"
                key={value}
                aria-pressed={!searching && filter === value}
                onClick={() => {
                  setChosen(value);
                  setQuery("");
                }}
              >
                {text}
              </button>
            ))}
        </div>
        <label className="lineup-art-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            aria-label="Search icons"
            placeholder="Search: bartender, tray, pizza"
            value={query}
            onKeyDown={(event) => {
              // Inside a form, Enter in a search box would send it.
              if (event.key === "Enter") event.preventDefault();
            }}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div
        ref={tilesRef}
        className="lineup-art-tiles"
        role={mode === "single" ? "radiogroup" : "group"}
        aria-label={label}
        aria-disabled={disabled || undefined}
      >
        {leadTile}
        {items.map((item, index) => {
          const on = selected.includes(item.key);
          return (
            <div
              key={item.key}
              data-key={item.key}
              className="lineup-art-tile"
              role={mode === "single" ? "radio" : "checkbox"}
              aria-checked={on}
              aria-label={item.name}
              aria-disabled={resting(item.key) || undefined}
              title={item.name}
              tabIndex={item.key === tabStop ? 0 : -1}
              onClick={() => pick(item.key)}
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  pick(item.key);
                } else if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                  move(event, index);
              }}
            >
              <LineupArt artKey={item.key} name={item.name} size={40} />
              {on && (
                <span className="lineup-art-tile-check" aria-hidden="true">
                  <Check size={12} strokeWidth={3.2} />
                </span>
              )}
            </div>
          );
        })}
        {!items.length && searching && <p className="lineup-art-empty">No icons match "{query.trim()}".</p>}
      </div>
    </div>
  );
}
