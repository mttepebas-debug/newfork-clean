// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestAppNavigation } from "../../shell/leave-guard";
import { useScheduleLeaveGuard } from "./useScheduleLeaveGuard";

// Mert 2026-10-12: leaving Schedule with unsaved work asks; moving around
// Schedule itself (another week, day or filter) never does (KK-164).
function Host({ unsaved, signOut = vi.fn() }: { unsaved: boolean; signOut?: () => void }) {
  const guard = useScheduleLeaveGuard(unsaved);
  return (
    <>
      <a href="/app/schedule?date=2026-10-19" onClick={(event) => event.preventDefault()}>Next week</a>
      <a href="/app/employees" onClick={(event) => event.preventDefault()}>Employees</a>
      <button onClick={() => requestAppNavigation(signOut)}>Sign out</button>
      {guard.open ? (
        <div role="dialog">
          <button onClick={guard.stay}>Keep editing</button>
          <button onClick={() => guard.take()?.()}>Discard and leave</button>
        </div>
      ) : null}
    </>
  );
}

describe("leaving Schedule with unsaved work", () => {
  beforeEach(() => window.history.replaceState({ idx: 0 }, "", "/app/schedule?date=2026-10-12&mode=edit"));
  afterEach(cleanup);

  it("another week of Schedule is no departure", () => {
    render(<Host unsaved />);
    fireEvent.click(screen.getByRole("link", { name: "Next week" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("another page asks, and Keep editing stays", () => {
    render(<Host unsaved />);
    const followed = fireEvent.click(screen.getByRole("link", { name: "Employees" }));
    expect(followed).toBe(false);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a navigation made in code asks, and goes once the person leaves", () => {
    const signOut = vi.fn();
    render(<Host unsaved signOut={signOut} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("nothing unsaved: leaving is not asked about", () => {
    const signOut = vi.fn();
    render(<Host unsaved={false} signOut={signOut} />);
    fireEvent.click(screen.getByRole("link", { name: "Employees" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("Back within Schedule is no departure", () => {
    window.history.pushState({ idx: 1 }, "", "/app/schedule?date=2026-10-19&mode=edit");
    render(<Host unsaved />);
    window.history.replaceState({ idx: 0 }, "", "/app/schedule?date=2026-10-12&mode=edit");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate", { state: { idx: 0 } })); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Back to another page asks", () => {
    window.history.pushState({ idx: 1 }, "", "/app/schedule?date=2026-10-12&mode=edit");
    render(<Host unsaved />);
    const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
    window.history.replaceState({ idx: 0 }, "", "/app/employees");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate", { state: { idx: 0 } })); });
    expect(go).toHaveBeenCalledWith(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
    go.mockRestore();
  });
});
