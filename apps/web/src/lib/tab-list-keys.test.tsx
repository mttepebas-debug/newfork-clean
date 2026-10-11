import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { onTabListKeyDown } from "./tab-list-keys";

function Tabs({ off }: { off?: string }) {
  const [tab, setTab] = useState("a");
  return (
    <div role="tablist" aria-label="Sample" onKeyDown={onTabListKeyDown}>
      {["a", "b", "c"].map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={tab === value}
          tabIndex={tab === value ? 0 : -1}
          disabled={value === off}
          onClick={() => setTab(value)}
        >
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// BL-602: ← → Home End move along a tab list and choose the tab.
describe("tab list keys", () => {
  it("moves and chooses with the arrow keys, wrapping, and Home / End", () => {
    render(<Tabs />);
    const a = screen.getByRole("tab", { name: "A" });
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    const b = screen.getByRole("tab", { name: "B" });
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute("aria-selected")).toBe("true");
    expect(b.tabIndex).toBe(0);
    expect(a.tabIndex).toBe(-1);
    fireEvent.keyDown(b, { key: "End" });
    expect(document.activeElement?.textContent).toBe("C");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement?.textContent).toBe("A");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement?.textContent).toBe("C");
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(screen.getByRole("tab", { name: "A" }).getAttribute("aria-selected")).toBe("true");
  });
  it("skips a disabled tab", () => {
    render(<Tabs off="b" />);
    const a = screen.getByRole("tab", { name: "A" });
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(document.activeElement?.textContent).toBe("C");
    expect(screen.getByRole("tab", { name: "B" }).getAttribute("aria-selected")).toBe("false");
  });
});
