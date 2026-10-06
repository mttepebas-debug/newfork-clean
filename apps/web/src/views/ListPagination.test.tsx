import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListPagination, pageNumbers } from "./ListPagination";

describe("ListPagination", () => {
  it("shows 25 / 50 / 100 rows and the page numbers under a long list (K-S9)", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(
      <ListPagination
        total={120}
        page={1}
        pageSize={50}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Pages" });
    expect(within(nav).getByText("1–50 of 120")).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Page 1" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("button", { name: "Previous page" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(within(nav).getByRole("button", { name: "Page 3" }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    fireEvent.click(within(nav).getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);

    const rows = within(nav).getByRole("combobox", { name: "Rows per page" });
    expect([...(rows as HTMLSelectElement).options].map((option) => option.value)).toEqual(["25", "50", "100"]);
    fireEvent.change(rows, { target: { value: "25" } });
    expect(onPageSizeChange).toHaveBeenLastCalledWith(25);
  });

  it("draws nothing when everything fits on the smallest page", () => {
    const { container } = render(
      <ListPagination total={20} page={1} pageSize={50} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("keeps the first, last and neighbouring pages and folds the rest", () => {
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(1, 20)).toEqual([1, 2, 3, "gap", 20]);
    expect(pageNumbers(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pageNumbers(20, 20)).toEqual([1, "gap", 18, 19, 20]);
    expect(pageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
