import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lineupArt, lineupArtByKey } from "@newfork/shared";
import { LineupArtGrid, nextLineupArtSelection } from "./LineupArtGrid";

afterEach(cleanup);

const name = (key: string) => lineupArtByKey.get(key)!.name;

function tiles(role: "checkbox" | "radio" = "checkbox") {
  return within(screen.getByRole(role === "checkbox" ? "group" : "radiogroup", { name: "Icons" })).queryAllByRole(role);
}

/** The grid as a screen holds it: the selection lives in the parent. */
function Harness({
  mode = "multi",
  initial = [],
  suggested = [],
}: {
  mode?: "multi" | "single";
  initial?: string[];
  suggested?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(initial);
  return (
    <LineupArtGrid
      mode={mode}
      selected={selected}
      suggested={suggested}
      onToggle={(key) => setSelected((current) => nextLineupArtSelection(mode, current, key))}
    />
  );
}

describe("LineupArtGrid", () => {
  it("starts on Suggested when there are suggestions, and on All when there are none", () => {
    render(<Harness suggested={["001-server", "053-server-tray-ill"]} />);
    expect(screen.getByRole("button", { name: "Suggested" }).getAttribute("aria-pressed")).toBe("true");
    expect(tiles().map((tile) => tile.getAttribute("aria-label"))).toEqual([name("001-server"), name("053-server-tray-ill")]);
    cleanup();
    render(<Harness />);
    expect(screen.queryByRole("button", { name: "Suggested" })).toBeNull();
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    expect(tiles()).toHaveLength(lineupArt.length);
  });

  it("filters to people (person and team drawings), things, and all", () => {
    render(<Harness suggested={["001-server"]} />);
    fireEvent.click(screen.getByRole("button", { name: "People" }));
    const people = lineupArt.filter((item) => item.kind === "person" || item.kind === "team");
    expect(tiles()).toHaveLength(people.length);
    expect(screen.getByRole("checkbox", { name: name(people.find((item) => item.kind === "team")!.key) })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Things" }));
    const things = lineupArt.filter((item) => item.kind === "object");
    expect(tiles()).toHaveLength(things.length);
    expect(screen.getByRole("button", { name: "Things" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(tiles()).toHaveLength(lineupArt.length);
  });

  it("puts colour drawings first under All", () => {
    render(<Harness />);
    const styles = tiles().map((tile) => lineupArtByKey.get(tile.dataset.key!)!.style);
    expect(styles.indexOf("line")).toBe(styles.filter((style) => style === "color").length);
  });

  it("searches names and jobs: tray leaves the drawings with a tray", () => {
    render(<Harness suggested={["001-server"]} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search icons" }), { target: { value: "tray" } });
    const shown = tiles().map((tile) => lineupArtByKey.get(tile.dataset.key!)!);
    expect(shown.length).toBeGreaterThan(0);
    for (const item of shown) expect(`${item.name} ${item.jobs.join(" ")}`.toLowerCase()).toContain("tray");
    expect(shown.map((item) => item.key)).toContain("153-drinks-tray-obj");
    // A search looks through the whole archive: no filter is on while it shows.
    for (const filter of ["Suggested", "People", "Things", "All"])
      expect(screen.getByRole("button", { name: filter }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search icons" }), { target: { value: "zzzz" } });
    expect(tiles()).toHaveLength(0);
    expect(screen.getByText('No icons match "zzzz".')).toBeTruthy();
  });

  it("selects with a click and with the space bar, and moves with the arrow keys", () => {
    render(<Harness suggested={["001-server", "053-server-tray-ill", "079-cocktail-server-ill"]} />);
    const [first, second] = tiles();
    expect(first!.tabIndex).toBe(0);
    expect(second!.tabIndex).toBe(-1);
    fireEvent.click(first!);
    expect(first!.getAttribute("aria-checked")).toBe("true");
    first!.focus();
    fireEvent.keyDown(first!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(second);
    expect(second!.tabIndex).toBe(0);
    fireEvent.keyDown(second!, { key: " " });
    expect(second!.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(second!, { key: " " });
    expect(second!.getAttribute("aria-checked")).toBe("false");
    fireEvent.keyDown(second!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first!, { key: "End" });
    expect(document.activeElement).toBe(tiles().at(-1));
  });

  it("in single mode a second choice lets go of the first", () => {
    render(<Harness mode="single" initial={["001-server"]} />);
    const server = screen.getByRole("radio", { name: name("001-server") });
    expect(server.getAttribute("aria-checked")).toBe("true");
    expect(server.tabIndex).toBe(0);
    fireEvent.click(screen.getByRole("radio", { name: name("003-bartender") }));
    expect(screen.getByRole("radio", { name: name("003-bartender") }).getAttribute("aria-checked")).toBe("true");
    expect(server.getAttribute("aria-checked")).toBe("false");
    expect(tiles("radio").filter((tile) => tile.getAttribute("aria-checked") === "true")).toHaveLength(1);
  });

  it("keeps the order the icons were picked in, and drops one picked again", () => {
    expect(nextLineupArtSelection("multi", ["005-host"], "001-server")).toEqual(["005-host", "001-server"]);
    expect(nextLineupArtSelection("multi", ["005-host", "001-server"], "005-host")).toEqual(["001-server"]);
    expect(nextLineupArtSelection("single", ["005-host"], "001-server")).toEqual(["001-server"]);
    expect(nextLineupArtSelection("single", ["005-host"], "005-host")).toEqual(["005-host"]);
  });

  it("offers no more than the most it may hold, and nothing while disabled", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <LineupArtGrid mode="multi" selected={["001-server"]} suggested={[]} onToggle={onToggle} max={1} />,
    );
    const other = screen.getByRole("checkbox", { name: name("003-bartender") });
    expect(other.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(other);
    expect(onToggle).not.toHaveBeenCalled();
    // The one held can still be let go.
    fireEvent.click(screen.getByRole("checkbox", { name: name("001-server") }));
    expect(onToggle).toHaveBeenCalledWith("001-server");
    onToggle.mockClear();
    rerender(<LineupArtGrid mode="multi" selected={[]} suggested={[]} onToggle={onToggle} disabled />);
    fireEvent.click(screen.getByRole("checkbox", { name: name("003-bartender") }));
    fireEvent.keyDown(screen.getByRole("checkbox", { name: name("003-bartender") }), { key: " " });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("puts a lead tile before the drawings", () => {
    render(
      <LineupArtGrid
        mode="single"
        selected={[]}
        suggested={[]}
        onToggle={() => undefined}
        leadTile={<button type="button">Upload photo</button>}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "Icons" });
    expect(group.firstElementChild?.textContent).toBe("Upload photo");
  });
});
