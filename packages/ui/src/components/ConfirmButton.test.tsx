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
        confirmLabel="Click again to remove"
        onConfirm={onConfirm}
      >
        Remove photo
      </ConfirmButton>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove photo for Ada" }));
    expect(onConfirm).not.toHaveBeenCalled();

    const armed = screen.getByRole("button", { name: "Click again to remove" });
    expect(armed.className).toContain("is-armed");

    fireEvent.click(armed);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Remove photo for Ada" }).className,
    ).not.toContain("is-armed");
  });

  it("disarms on Escape, on blur and after the timeout", () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(
      <ConfirmButton confirmLabel="Click again to revoke" onConfirm={onConfirm}>
        Revoke
      </ConfirmButton>,
    );
    const button = screen.getByRole("button");

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Escape" });
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
});
