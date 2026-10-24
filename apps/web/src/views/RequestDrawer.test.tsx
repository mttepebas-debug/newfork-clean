import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogDrawer } from "../settings/CatalogDrawer";
import { RequestDrawer, type DrawerTab } from "./RequestDrawer";

type Key = "details" | "files" | "history";
const tabs: DrawerTab<Key>[] = [
  { key: "details", label: "Details" },
  { key: "files", label: "Files", count: 2 },
  { key: "history", label: "History" },
];

function Drawer(props: Partial<Parameters<typeof RequestDrawer<Key>>[0]>) {
  return (
    <RequestDrawer<Key>
      title="Maria Lopez"
      status={{ label: "Needs review", tone: "warn" }}
      kicker="Food Handler Card"
      tabs={tabs}
      tab="details"
      onTab={vi.fn()}
      onClose={vi.fn()}
      {...props}
    >
      <input aria-label="Why" />
    </RequestDrawer>
  );
}

// Time off, swaps and the notification drawers keep today's head; the Documents drawer opts in (K1).
describe("RequestDrawer without the opt-ins", () => {
  it("draws the head as before", () => {
    render(<Drawer />);
    const head = document.querySelector(".rd-head")!;
    expect(within(head as HTMLElement).getByRole("button", { name: "Close details" }).closest(".rd-head-row")).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Request sections" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Files 2" })).toBeTruthy();
    const title = screen.getByRole("heading", { level: 2, name: "Maria Lopez Needs review" });
    expect(title.hasAttribute("tabindex")).toBe(false);
    expect(title.hasAttribute("data-drawer-autofocus")).toBe(false);
  });
  it("moves between tabs with the arrows only", () => {
    const onTab = vi.fn();
    render(<Drawer onTab={onTab} />);
    const details = screen.getByRole("tab", { name: "Details" });
    fireEvent.keyDown(details, { key: "End" });
    fireEvent.keyDown(details, { key: "Home" });
    expect(onTab).not.toHaveBeenCalled();
    fireEvent.keyDown(details, { key: "ArrowLeft" });
    expect(onTab).toHaveBeenCalledWith("history");
  });
});

describe("RequestDrawer opt-ins (Documents)", () => {
  it("draws a strip above the head row, which then carries no X of its own", () => {
    render(
      <Drawer
        strip={
          <div className="strip">
            <button type="button">Next: Ana Ruiz</button>
          </div>
        }
      />,
    );
    const head = document.querySelector(".rd-head")!;
    const strip = head.querySelector(".strip")!;
    expect(strip.nextElementSibling?.classList.contains("rd-head-row")).toBe(true);
    expect(screen.queryByRole("button", { name: "Close details" })).toBeNull();
  });
  it("gives the title the drawer's first focus, before any field in the body", () => {
    render(
      <CatalogDrawer label="Maria Lopez · Food Handler Card" onClose={vi.fn()}>
        <Drawer focusTitle />
      </CatalogDrawer>,
    );
    const title = screen.getByRole("heading", { level: 2, name: "Maria Lopez Needs review" });
    expect(title.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(title);
    expect(title.querySelector(".rd-title")?.textContent).toBe("Maria Lopez");
  });
  it("names the tablist and a tab as asked, the badge left out of the tab's name", () => {
    render(<Drawer tabsLabel="Document sections" tabs={[tabs[0]!, { ...tabs[1]!, name: "Files, 2 files" }, tabs[2]!]} />);
    expect(screen.getByRole("tablist", { name: "Document sections" })).toBeTruthy();
    const files = screen.getByRole("tab", { name: "Files, 2 files" });
    expect(files.querySelector(".rd-badge")?.getAttribute("aria-hidden")).toBe("true");
  });
  it("moves to the first and last tab with Home and End", () => {
    const onTab = vi.fn();
    render(<Drawer onTab={onTab} homeEndTabs />);
    const details = screen.getByRole("tab", { name: "Details" });
    fireEvent.keyDown(details, { key: "End" });
    expect(onTab).toHaveBeenLastCalledWith("history");
    fireEvent.keyDown(details, { key: "Home" });
    expect(onTab).toHaveBeenLastCalledWith("details");
  });
});

// The phone's card follows the finger down; a close that is refused (the drawer is busy) puts it back.
describe("RequestDrawer pull to close on a phone", () => {
  const matchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = matchMedia;
    vi.useRealTimers();
  });
  function phone() {
    window.matchMedia = ((query: string) => ({
      matches: query === "(max-width: 720px)",
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  }
  function pull(head: Element, by: number) {
    const at = (type: string, y: number) =>
      head.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y }));
    at("pointerdown", 100);
    at("pointermove", 100 + by);
    at("pointerup", 100 + by);
  }
  it("closes once pulled far enough", () => {
    phone();
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <div className="requests-review-drawer">
        <Drawer onClose={onClose} />
      </div>,
    );
    pull(document.querySelector(".rd-head")!, 200);
    act(() => vi.advanceTimersByTime(200));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("snaps back without closing while the close is refused", () => {
    phone();
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <div className="requests-review-drawer">
        <Drawer onClose={onClose} closeRefused />
      </div>,
    );
    pull(document.querySelector(".rd-head")!, 200);
    act(() => vi.advanceTimersByTime(200));
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLElement>(".requests-review-drawer")!.style.transform).toBe("");
  });
});
