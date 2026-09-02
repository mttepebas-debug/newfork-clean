import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { useScheduleMode } from "./useScheduleMode";

function wrapper(initialEntry: string) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

describe("useScheduleMode", () => {
  it("defaults to preview when the URL has no mode", () => {
    const { result } = renderHook(() => useScheduleMode(), {
      wrapper: wrapper("/app/schedule"),
    });

    expect(result.current.mode).toBe("preview");
    expect(result.current.isEditMode).toBe(false);
  });

  it("reads edit mode from the URL", () => {
    const { result } = renderHook(() => useScheduleMode(), {
      wrapper: wrapper("/app/schedule?mode=edit"),
    });

    expect(result.current.mode).toBe("edit");
    expect(result.current.isEditMode).toBe(true);
  });

  it("writes and clears the mode query param", () => {
    const { result } = renderHook(() => useScheduleMode(), {
      wrapper: wrapper("/app/schedule?locations=l1"),
    });

    act(() => result.current.setMode("edit"));
    expect(result.current.mode).toBe("edit");

    act(() => result.current.setMode("preview"));
    expect(result.current.mode).toBe("preview");
  });

  it("exposes the requested preview draft immediately after leaving edit mode", () => {
    const { result } = renderHook(() => useScheduleMode(), {
      wrapper: wrapper("/app/schedule?mode=edit&draft=draft-a"),
    });

    act(() => result.current.setMode("preview", "draft-b"));

    expect(result.current.mode).toBe("preview");
    expect(result.current.isEditMode).toBe(false);
    expect(result.current.activeDraftId).toBe("draft-b");
  });
});
