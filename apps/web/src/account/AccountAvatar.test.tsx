import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountAvatar } from "./AccountAvatar";
describe("account avatar precedence", () => {
  it("uses workspace photo, then global photo, then initials including failed-image fallback", () => {
    const view = render(<AccountAvatar workspaceUrl="https://example.test/work.png" globalUrl="https://example.test/global.png" name="Test User" className="avatar" />);
    expect(view.container.querySelector("img")?.src).toBe("https://example.test/work.png");
    fireEvent.error(view.container.querySelector("img")!);
    expect(view.container.querySelector("img")?.src).toBe("https://example.test/global.png");
    fireEvent.error(view.container.querySelector("img")!);
    expect(screen.getByText("TU")).toBeTruthy();
    view.rerender(<AccountAvatar globalUrl="https://example.test/replaced.png" name="Test User" className="avatar" />);
    expect(view.container.querySelector("img")?.src).toBe("https://example.test/replaced.png");
  });
  it("uses global avatar when a workspace photo is removed", () => {
    const view = render(<AccountAvatar globalUrl="https://example.test/global.png" name="Test User" className="avatar" />);
    expect(view.container.querySelector("img")?.src).toBe("https://example.test/global.png");
    view.rerender(<AccountAvatar name="Test User" className="avatar" />);
    expect(screen.getByText("TU")).toBeTruthy();
  });
});
