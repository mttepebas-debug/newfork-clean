import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { NoAccessState, type NoAccessVariant } from "./NoAccessState";

function renderState(props: Parameters<typeof NoAccessState>[0] = {}) {
  return render(
    <MemoryRouter>
      <NoAccessState {...props} />
    </MemoryRouter>,
  );
}

describe("NoAccessState", () => {
  it.each<NoAccessVariant>(["card", "inline", "page"])(
    "%s says who can help and offers a green way home",
    (variant) => {
      renderState({ subject: "this schedule", variant });
      const region = screen.getByRole("region", {
        name: "You don't have access to this schedule",
      });
      expect(region.tagName).toBe("SECTION");
      expect(
        screen.getByText("To get access, ask your workspace owner or an admin."),
      ).toBeTruthy();
      const home = screen.getByRole("link", { name: "Back to Home" });
      expect(home.getAttribute("href")).toBe("/app");
      expect(home.className).toBe("nf-button no-access-home");
    },
  );

  it("defaults to the card and a generic subject", () => {
    const { container } = renderState();
    expect(container.querySelector(".no-access-card")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeTruthy();
  });

  it("only the page variant adds a white second way out", () => {
    renderState({ variant: "page" });
    expect(
      screen
        .getByRole("link", { name: "Switch workspace" })
        .classList.contains("secondary-button"),
    ).toBe(true);
  });

  it("never names the reason code", () => {
    const { container } = renderState({ variant: "page" });
    expect(container.textContent).not.toMatch(/authz|out_of_scope|403|404/);
  });
});
