import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LinesOutline, ListOutline, LoadError, LoadingOutline, RefreshError, Skeleton } from "./LoadState";

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

  it("shows the card's own buttons in place of Try again and its help line (BL-1075)", () => {
    render(
      <LoadError
        title="Something went wrong"
        detail="This page could not open. Nothing was changed."
        actions={<button type="button">Reload page</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Reload page" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByText("Check your connection, then try again.")).toBeNull();
  });

  it("leaves out the help line and the button when there is nothing to retry", () => {
    render(<LoadError title="We couldn't open this document" detail="The link has expired." />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Check your connection, then try again.")).toBeNull();
  });
});

describe("inset pieces", () => {
  it("draws list rows without a frame or header inside a list that has them", () => {
    render(<ListOutline label="Loading requests" rows={2} inset />);
    const status = screen.getByRole("status");
    expect(status.className).toContain("inset");
    expect(status.querySelector(".nf-list-outline-head")).toBeNull();
    expect(status.querySelectorAll(".nf-list-outline-row")).toHaveLength(2);
  });

  it("gives an inset card that can take focus on its heading", () => {
    const ref = { current: null as HTMLHeadingElement | null };
    render(<LoadError title="We couldn't load this request" detail="The request didn't load. Nothing was changed." inset headingRef={ref} />);
    const card = screen.getByRole("region", { name: "We couldn't load this request" });
    expect(card.className).toBe("load-error inset");
    // Focus reads it; it is not a live alert as well.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(ref.current?.tabIndex).toBe(-1);
  });

  it("titles the card one level below a drawer's own title", () => {
    render(<LoadError title="We couldn't load this announcement" detail="It didn't load. Nothing was changed." inset level={3} />);
    expect(screen.getByRole("heading", { level: 3, name: "We couldn't load this announcement" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("titles the card an h4 under a section that has an h3", () => {
    render(<LoadError title="We couldn't check document requirements" detail="It didn't load. Nothing was changed." inset level={4} />);
    expect(screen.getByRole("heading", { level: 4, name: "We couldn't check document requirements" })).toBeTruthy();
  });

  it("outlines a few lines for a panel", () => {
    render(<LinesOutline label="Loading shift details" lines={2} />);
    expect(screen.getByRole("status").querySelectorAll(".nf-skeleton")).toHaveLength(2);
  });
});

describe("RefreshError", () => {
  it("is one alert line over a list that stays, with Try again", () => {
    const retry = vi.fn();
    render(<RefreshError message="The employee list didn't refresh. This is the last list that loaded." onRetry={retry} />);
    const line = screen.getByRole("alert");
    expect(line.textContent).toContain("The employee list didn't refresh. This is the last list that loaded.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("holds the button while the retry is on its way", () => {
    render(<RefreshError message="It didn't refresh." onRetry={() => {}} retrying />);
    const button = screen.getByRole("button", { name: "Trying again…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
