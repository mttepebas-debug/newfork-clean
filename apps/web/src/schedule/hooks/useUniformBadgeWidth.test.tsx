import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createRef } from "react";

import { useUniformBadgeWidth } from "./useUniformBadgeWidth";

describe("useUniformBadgeWidth", () => {
  it("keeps the reference-app hook import backed by the schedule measurer", () => {
    const containerRef = createRef<HTMLDivElement>();
    const { result, rerender } = renderHook(
      ({ shifts, extraDeps }) =>
        useUniformBadgeWidth({
          containerRef,
          shifts,
          extraDeps,
        }),
      {
        initialProps: {
          shifts: [{ id: "shift-1" }],
          extraDeps: ["weekly"],
        },
      },
    );

    expect(result.current).toBe(126);

    rerender({
      shifts: [{ id: "shift-1" }, { id: "shift-2" }],
      extraDeps: ["daily"],
    });

    expect(result.current).toBe(126);
  });
});
