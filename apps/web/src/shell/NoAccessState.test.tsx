import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { NoAccessState } from "./NoAccessState";

function renderState(props: Parameters<typeof NoAccessState>[0] = {}) {
  return render(
    <MemoryRouter>
      <NoAccessState {...props} />
    </MemoryRouter>,
  );
}

describe("NoAccessState", () => {
  it("says who can help and offers a green way home", () => {
    renderState({ subject: "this schedule" });
    const region = screen.getByRole("region", {
      name: "You don't have access to this schedule",
    });
    expect(region.tagName).toBe("SECTION");
    expect(screen.getByText("Ask an admin for access.")).toBeTruthy();
    const home = screen.getByRole("link", { name: "Back to Home" });
    expect(home.getAttribute("href")).toBe("/app");
    expect(home.className).toBe("nf-button no-access-home");
  });

  it("defaults to a generic subject", () => {
    renderState();
    expect(
      screen.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeTruthy();
  });

  it("sends home where told", () => {
    renderState({ homeHref: "/app/schedule" });
    expect(
      screen.getByRole("link", { name: "Back to Home" }).getAttribute("href"),
    ).toBe("/app/schedule");
  });

  it("offers one way out and never names the reason code", () => {
    const { container } = renderState();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(container.textContent).not.toMatch(/authz|out_of_scope|403|404/);
  });

  it("names each card by its own heading when two share a page (BL-195)", () => {
    render(
      <MemoryRouter>
        <NoAccessState subject="this schedule" />
        <NoAccessState subject="these documents" />
      </MemoryRouter>,
    );
    const schedule = screen.getByRole("region", {
      name: "You don't have access to this schedule",
    });
    const documents = screen.getByRole("region", {
      name: "You don't have access to these documents",
    });
    expect(schedule.getAttribute("aria-labelledby")).not.toBe(
      documents.getAttribute("aria-labelledby"),
    );
  });
});
