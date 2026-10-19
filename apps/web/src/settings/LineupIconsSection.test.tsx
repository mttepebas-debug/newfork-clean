import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lineupArt, lineupArtByKey, suggestLineupArt } from "@newfork/shared";
import { LineupIconsSection, sameLineupIcons } from "./LineupIconsSection";
import { stubPhoneWidth } from "../lib/phone-width.test-util";

const name = (key: string) => lineupArtByKey.get(key)!.name;
const help = "Each person on this job gets one of these on the Lineup, unless they picked their own avatar.";
const empty = "No icons. People here get a team member icon on the Lineup.";

beforeEach(() => {
  // jsdom has no modal dialogs; the app's other sheets are tested the same way.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The drawer's side: the job's name and its icon list, as the drawer holds them. */
function Drawer({ isNew = false, initial = [] as string[], initialName = "" }) {
  const [jobName, setJobName] = useState(initialName);
  const [icons, setIcons] = useState<string[]>(initial);
  return (
    <>
      <label>
        Job name
        <input value={jobName} onChange={(event) => setJobName(event.target.value)} />
      </label>
      <output data-testid="icons">{icons.join(",")}</output>
      <LineupIconsSection value={icons} onChange={setIcons} jobName={jobName} isNew={isNew} />
    </>
  );
}
const icons = () => screen.getByTestId("icons").textContent;

describe("LineupIconsSection", () => {
  it("on a desktop shows the whole grid inside the section, with the count and the help line", () => {
    render(<Drawer initial={["001-server", "053-server-tray-ill"]} initialName="Server" />);
    const section = screen.getByRole("region", { name: "Lineup icons" });
    expect(within(section).getByText("2 selected")).toBeTruthy();
    expect(within(section).getByText(help)).toBeTruthy();
    const grid = within(section).getByRole("group", { name: "Icons" });
    expect(grid.closest(".lineup-icons-section")).toBe(section);
    expect(within(section).queryByRole("button", { name: "Choose icons" })).toBeNull();
    fireEvent.click(within(section).getByRole("button", { name: "All" }));
    fireEvent.click(within(grid).getByRole("checkbox", { name: name("003-bartender") }));
    expect(icons()).toBe("001-server,053-server-tray-ill,003-bartender");
    expect(within(section).getByText("3 selected")).toBeTruthy();
  });

  it("on a phone shows the chosen icons as tiles and picks in a sheet that Done closes", () => {
    stubPhoneWidth();
    render(<Drawer initial={["001-server"]} initialName="Server" />);
    const section = screen.getByRole("region", { name: "Lineup icons" });
    expect(within(section).queryByRole("group", { name: "Icons" })).toBeNull();
    expect(within(section).getByRole("listitem", { name: name("001-server") })).toBeTruthy();
    const choose = within(section).getByRole("button", { name: "Choose icons" });
    fireEvent.click(choose);
    const sheet = screen.getByRole("dialog", { name: "Lineup icons" });
    expect(sheet.hasAttribute("open")).toBe(true);
    const grid = within(sheet).getByRole("group", { name: "Icons" });
    // Suggested for "Server": the bartender's shaker is under All.
    fireEvent.click(within(sheet).getByRole("button", { name: "All" }));
    fireEvent.click(within(grid).getByRole("checkbox", { name: name("003-bartender") }));
    expect(within(sheet).getByText("2 selected")).toBeTruthy();
    // Nothing reaches the job until Done.
    expect(icons()).toBe("001-server");
    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(within(section).getByRole("button", { name: "Choose icons" }));
    expect(icons()).toBe("001-server,003-bartender");
    expect(within(section).getAllByRole("listitem")).toHaveLength(2);
  });

  it("on a phone Cancel leaves the job's icons as they were, and a tile's X removes it", () => {
    stubPhoneWidth();
    render(<Drawer initial={["001-server", "005-host"]} initialName="Server" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose icons" }));
    const sheet = screen.getByRole("dialog", { name: "Lineup icons" });
    fireEvent.click(within(sheet).getByRole("button", { name: "All" }));
    fireEvent.click(within(sheet).getByRole("checkbox", { name: name("001-server") }));
    expect(within(sheet).getByText("1 selected")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(icons()).toBe("001-server,005-host");
    fireEvent.click(screen.getByRole("button", { name: `Remove ${name("005-host")}` }));
    expect(icons()).toBe("001-server");
  });

  it("on a phone the sheet says so when the icons reach the most a job can have", () => {
    stubPhoneWidth();
    const keys = lineupArt.map((item) => item.key);
    render(<Drawer initial={keys.slice(0, 23)} initialName="Server" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose icons" }));
    const sheet = screen.getByRole("dialog", { name: "Lineup icons" });
    expect(within(sheet).queryByText("A job can have up to 24 icons.")).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "All" }));
    fireEvent.click(within(sheet).getByRole("checkbox", { name: name(keys[30]!) }));
    expect(within(sheet).getByText("24 selected")).toBeTruthy();
    expect(within(sheet).getByText("A job can have up to 24 icons.")).toBeTruthy();
  });

  it("on a phone names each chosen tile once", () => {
    stubPhoneWidth();
    render(<Drawer initial={["001-server"]} initialName="Server" />);
    const tile = screen.getByRole("listitem", { name: name("001-server") });
    // No title: it would be read again as the tile's description.
    expect(tile.getAttribute("title")).toBeNull();
    expect(tile.querySelector(".lineup-art")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("says what happens when a job has no icons", () => {
    render(<Drawer initialName="Dishwasher" />);
    const section = screen.getByRole("region", { name: "Lineup icons" });
    expect(within(section).getByText("0 selected")).toBeTruthy();
    expect(within(section).getByText(empty)).toBeTruthy();
    cleanup();
    stubPhoneWidth();
    render(<Drawer initialName="Dishwasher" />);
    expect(screen.getByText(empty)).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("on a new job suggests icons as the name is typed", () => {
    render(<Drawer isNew />);
    expect(icons()).toBe("");
    expect(screen.getByText(empty)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "Bartender" } });
    const suggested = suggestLineupArt("Bartender");
    expect(suggested.length).toBeGreaterThan(0);
    expect(icons()).toBe(suggested.join(","));
    expect(screen.getByText('Suggested for "Bartender". Change them any time.')).toBeTruthy();
    expect(screen.getByText(`${suggested.length} selected`)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "Host" } });
    expect(icons()).toBe(suggestLineupArt("Host").join(","));
    expect(screen.getByText('Suggested for "Host". Change them any time.')).toBeTruthy();
  });

  it("on a new job stops suggesting once the icons are touched", () => {
    render(<Drawer isNew />);
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "Bartender" } });
    const [first] = suggestLineupArt("Bartender");
    fireEvent.click(screen.getByRole("checkbox", { name: name(first!) }));
    const touched = suggestLineupArt("Bartender").filter((key) => key !== first).join(",");
    expect(icons()).toBe(touched);
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "Host" } });
    expect(icons()).toBe(touched);
    expect(screen.queryByText(/Suggested for/)).toBeNull();
  });

  it("does not suggest over an existing job's icons when its name changes", () => {
    render(<Drawer initial={["005-host"]} initialName="Host" />);
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "Bartender" } });
    expect(icons()).toBe("005-host");
    expect(screen.queryByText(/Suggested for/)).toBeNull();
  });

  it("compares icon lists in order", () => {
    expect(sameLineupIcons(["001-server", "005-host"], ["001-server", "005-host"])).toBe(true);
    expect(sameLineupIcons(["001-server", "005-host"], ["005-host", "001-server"])).toBe(false);
    expect(sameLineupIcons(["001-server"], ["001-server", "005-host"])).toBe(false);
    expect(sameLineupIcons([], [])).toBe(true);
  });
});
