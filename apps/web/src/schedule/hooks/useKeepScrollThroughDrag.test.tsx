import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";

import { useKeepScrollThroughDrag } from "./useKeepScrollThroughDrag";

function Harness({ active }: { readonly active: boolean }) {
  const gridRef = useRef<HTMLDivElement>(null);
  useKeepScrollThroughDrag({ active, gridRef });
  return (
    <div className="schedule-grid-scroll" data-testid="scroll">
      <div ref={gridRef} />
    </div>
  );
}

describe("useKeepScrollThroughDrag", () => {
  it("brings the grid back to where the drag started once the hidden rows return", () => {
    const { rerender } = render(<Harness active={false} />);
    const scroll = screen.getByTestId("scroll");
    scroll.scrollTop = 400;
    scroll.scrollLeft = 120;
    fireEvent.scroll(scroll);

    rerender(<Harness active />);
    // The rows that cannot take the shift leave: the list is shorter and the
    // browser pulls the scroll up; the drag also scrolls sideways.
    scroll.scrollTop = 0;
    scroll.scrollLeft = 300;
    fireEvent.scroll(scroll);

    rerender(<Harness active={false} />);
    expect(scroll.scrollTop).toBe(400);
    expect(scroll.scrollLeft).toBe(300);
  });

  it("leaves the grid alone when no drag happened", () => {
    const { rerender } = render(<Harness active={false} />);
    const scroll = screen.getByTestId("scroll");
    scroll.scrollTop = 250;
    fireEvent.scroll(scroll);
    scroll.scrollTop = 90;
    fireEvent.scroll(scroll);

    rerender(<Harness active={false} />);
    expect(scroll.scrollTop).toBe(90);
  });
});
