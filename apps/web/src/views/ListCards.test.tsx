import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListCard, ListCards } from "./ListCards";

// KARARLAR Genel "telefonda liste sayfaları kart satırıyla" (2026-10-05):
// on a phone a list page shows one card per row instead of its table.
describe("ListCards", () => {
  it("draws one card per row: mark, title, status and the lines under it", () => {
    const onOpen = vi.fn();
    render(
      <ListCards label="Requests">
        <ListCard label="Ali Person, Time off, Oct 18" mark="A" title="Ali Person" status="Approved" lines={["Oct 18", null]} onOpen={onOpen} />
      </ListCards>,
    );
    const list = screen.getByRole("list", { name: "Requests" });
    const card = within(list).getByRole("button", { name: "Ali Person, Time off, Oct 18" });
    expect(card.textContent).toBe("AAli PersonApprovedOct 18");
    expect(card.querySelectorAll(".list-card-line")).toHaveLength(1);
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("lets the mark span every line, so it stays in the middle of the card", () => {
    render(
      <ListCards label="Requests">
        <ListCard label="x" mark="E" title="Emre" status="Needs review" lines={["When", "Decide by"]} onOpen={() => undefined} />
      </ListCards>,
    );
    expect((screen.getByRole("button").querySelector(".list-card-mark") as HTMLElement).style.gridRow).toBe("1 / span 3");
  });
});
