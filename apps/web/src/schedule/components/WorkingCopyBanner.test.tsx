import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkingCopyBanner } from "./WorkingCopyBanner";

afterEach(cleanup);

describe("WorkingCopyBanner", () => {
  it("shows the live-edit warning and wires discard", () => {
    const onDiscard = vi.fn();

    render(<WorkingCopyBanner onDiscard={onDiscard} />);

    expect(
      screen.getByText(
        "You are editing the live schedule. Changes apply only when you publish.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("disables discard while the session is being discarded", () => {
    const onDiscard = vi.fn();

    render(<WorkingCopyBanner isDiscarding onDiscard={onDiscard} />);

    const discardButton = screen.getByRole("button", { name: "Discard" });
    expect(discardButton).toHaveProperty("disabled", true);

    fireEvent.click(discardButton);

    expect(onDiscard).not.toHaveBeenCalled();
  });
});
