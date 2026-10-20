import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmButton } from "./ConfirmButton";

describe("ConfirmButton", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("arms on the first click and confirms on the second", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton
        aria-label="Remove photo for Ada"
        confirmLabel="Confirm remove"
        onConfirm={onConfirm}
      >
        Remove photo
      </ConfirmButton>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove photo for Ada" }));
    expect(onConfirm).not.toHaveBeenCalled();

    const armed = screen.getByRole("button", { name: "Confirm remove" });
    expect(armed.className).toContain("is-armed");

    fireEvent.click(armed);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Remove photo for Ada" }).className,
    ).not.toContain("is-armed");
  });

  it("announces the armed state through a live region", () => {
    render(
      <ConfirmButton confirmLabel="Confirm decline" onConfirm={vi.fn()}>
        Decline
      </ConfirmButton>,
    );
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");

    fireEvent.click(screen.getByRole("button"));
    expect(status.textContent).toBe("Confirm decline");

    fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
    expect(status.textContent).toBe("");
  });

  it("does not confirm on the second click of a double-click", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton confirmLabel="Confirm delete" onConfirm={onConfirm}>
        Discard
      </ConfirmButton>,
    );
    const button = screen.getByRole("button");

    fireEvent.click(button, { detail: 1 });
    fireEvent.click(button, { detail: 2 });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(button.textContent).toBe("Confirm delete");
  });

  // A phone counts two taps half a second apart as a double-click (detail 2): the second tap someone meant, after the
  // words changed, confirms (Mert 2026-10-20, "kesinlikle düzeltilsin"); only a quick double-click stays one gesture.
  it("confirms a second tap that comes after the words changed, inside the double-click time", () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(
      <ConfirmButton confirmLabel="Click again to call off" onConfirm={onConfirm}>
        Call off
      </ConfirmButton>,
    );
    const button = screen.getByRole("button");

    fireEvent.click(button, { detail: 1 });
    act(() => {
      vi.advanceTimersByTime(450);
    });
    fireEvent.click(button, { detail: 2 });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe("Call off");
  });

  it("does not arm again on the third click of a triple-click", () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(
      <ConfirmButton confirmLabel="Confirm delete" onConfirm={onConfirm}>
        Discard
      </ConfirmButton>,
    );
    const button = screen.getByRole("button");

    fireEvent.click(button, { detail: 1 });
    act(() => {
      vi.advanceTimersByTime(450);
    });
    fireEvent.click(button, { detail: 2 });
    fireEvent.click(button, { detail: 3 });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe("Discard");
  });

  it("disarms on Escape, on blur and after the timeout", () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(
      <ConfirmButton confirmLabel="Confirm revoke" onConfirm={onConfirm}>
        Revoke
      </ConfirmButton>,
    );
    const button = screen.getByRole("button");

    // An unarmed button leaves Escape alone (a window may close on it).
    expect(fireEvent.keyDown(button, { key: "Escape" })).toBe(true);
    fireEvent.click(button);
    // Armed, Escape only disarms: its default goes too, or a native <dialog>
    // around the button gets a cancel for the same key and closes.
    expect(fireEvent.keyDown(button, { key: "Escape" })).toBe(false);
    expect(button.textContent).toBe("Revoke");

    fireEvent.click(button);
    fireEvent.blur(button);
    expect(button.textContent).toBe("Revoke");

    fireEvent.click(button);
    act(() => {
      vi.advanceTimersByTime(3200);
    });
    expect(button.textContent).toBe("Revoke");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("gives an icon-only button its armed name and keeps its own classes", () => {
    render(
      <ConfirmButton
        unstyled
        className="icon-button"
        aria-label="Delete template Lunch"
        confirmLabel={<svg />}
        confirmName="Confirm delete template Lunch"
        onConfirm={vi.fn()}
      >
        <svg />
      </ConfirmButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete template Lunch" }));

    const armed = screen.getByRole("button", { name: "Confirm delete template Lunch" });
    expect(armed.className).toBe("icon-button is-armed");
    expect(armed.getAttribute("title")).toBe("Confirm delete template Lunch");
    expect(armed.getAttribute("data-confirming")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Confirm delete template Lunch");
  });
});
