import { readFileSync } from "node:fs";
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

  it("never shows a page past the end, and a new page size starts again at page 1", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(
      <ListPagination total={120} page={3} pageSize={100} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />,
    );
    const nav = screen.getByRole("navigation", { name: "Pages" });
    expect(within(nav).getByText("101–120 of 120")).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Page 2" }).getAttribute("aria-current")).toBe("page");

    fireEvent.change(within(nav).getByRole("combobox", { name: "Rows per page" }), { target: { value: "25" } });
    expect(onPageSizeChange).toHaveBeenLastCalledWith(25);
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it("keeps the way back to page 1 when the list shrinks under one small page", () => {
    render(<ListPagination total={20} page={2} pageSize={25} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Page 1" })).toBeTruthy();
  });

  it("keeps the first, last and neighbouring pages and folds the rest", () => {
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(1, 20)).toEqual([1, 2, 3, "gap", 20]);
    expect(pageNumbers(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pageNumbers(20, 20)).toEqual([1, "gap", 18, 19, 20]);
    expect(pageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

// On a phone the bar is one row whatever the page count or range: a second
// page number or a longer "26–39 of 39" wrapped it into two rows, and Rows per
// page jumped up (Mert 2026-10-20). The range says where you are; back and
// next move.
describe("ListPagination on a phone", () => {
  const css = readFileSync("src/views/list-page.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const phone = [...css.matchAll(/@media \(max-width: 720px\) \{([\s\S]*?)\n\}/g)].map((match) => match[1]!).join("\n");
  const rule = (selector: RegExp) =>
    [...phone.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, head]) => selector.test(head!)).map(([, , body]) => body!).join(";");

  it("keeps the bar on one row", () => {
    expect(rule(/^\s*\.list-pagination\s*$/m)).toMatch(/flex-wrap\s*:\s*nowrap/);
    expect(rule(/\.list-pagination-range/)).toMatch(/white-space\s*:\s*nowrap/);
  });

  it("leaves only back and next, no page numbers", () => {
    expect(rule(/\.list-pagination-pages button\[aria-label\^="Page "\]/)).toMatch(/display\s*:\s*none/);
    expect(rule(/\.list-pagination-gap/)).toMatch(/display\s*:\s*none/);
  });

  // Employees ends with the bar: under it sat the page's 34 px bottom, so the
  // band from the list to the tab bar read thick (Mert 2026-10-21). The bar
  // keeps its 12 above; the same 12 under it, nothing else.
  it("keeps Employees' bar a slim band: 12 under it, as above it", () => {
    expect(rule(/^\s*\.list-pagination\s*$/m)).not.toMatch(/margin-top/);
    expect(rule(/\.employees-page\.list-page\.list-page:has\(> \.list-pagination\)/)).toMatch(/padding-bottom\s*:\s*12px/);
  });
});
