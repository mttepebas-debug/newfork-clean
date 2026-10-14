import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ListOutline, LoadError, LoadingOutline, Skeleton } from "./LoadState";

// Loading and error, one look everywhere (Mert 2026-10-14, "B").

describe("LoadingOutline", () => {
  it("is one status that reads its label and hides the grey bars", () => {
    render(
      <LoadingOutline label="Loading lineups">
        <Skeleton width={120} height={14} />
      </LoadingOutline>,
    );
    const status = screen.getByRole("status");
    // aria-busy would make some screen readers skip the label.
    expect(status.hasAttribute("aria-busy")).toBe(false);
    expect(status.textContent).toBe("Loading lineups");
    const bar = status.querySelector(".nf-skeleton") as HTMLElement;
    expect(bar.closest("[aria-hidden]")).toBeTruthy();
    expect(bar.style.width).toBe("120px");
    expect(bar.style.height).toBe("14px");
  });

  it("draws a list outline with the asked rows and columns", () => {
    render(<ListOutline label="Loading requests" rows={3} columns={5} />);
    const status = screen.getByRole("status");
    expect(status.querySelectorAll(".nf-list-outline-row")).toHaveLength(3);
    expect(status.querySelector(".nf-list-outline-row")!.querySelectorAll(".nf-skeleton")).toHaveLength(5);
  });
});

describe("LoadError", () => {
  it("names what failed, says nothing changed, and tries again", () => {
    const onRetry = vi.fn();
    render(
      <LoadError
        title="We couldn't load the lineup"
        detail="Wednesday, October 14 didn't load. Nothing was changed."
        onRetry={onRetry}
      />,
    );
    const card = screen.getByRole("alert", { name: "We couldn't load the lineup" });
    expect(card.textContent).toContain("Check your connection, then try again.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("holds the button while the retry is on its way", () => {
    render(<LoadError title="We couldn't load requests" detail="Requests didn't load." onRetry={() => undefined} retrying />);
    const button = screen.getByRole("button", { name: "Trying again…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("leaves out the help line and the button when there is nothing to retry", () => {
    render(<LoadError title="We couldn't open this document" detail="The link has expired." />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Check your connection, then try again.")).toBeNull();
  });
});
