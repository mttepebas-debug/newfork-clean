import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditIdleTimer } from "./useEditIdleTimer";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useEditIdleTimer", () => {
  it("shows a warning countdown and times out at the reference thresholds", () => {
    const onWarning = vi.fn();
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useEditIdleTimer({
        enabled: true,
        warningMs: 15 * 60 * 1000,
        timeoutMs: 20 * 60 * 1000,
        onWarning,
        onTimeout,
      }),
    );

    expect(result.current).toBeNull();
    act(() => vi.advanceTimersByTime(15 * 60 * 1000));
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(300);

    act(() => vi.advanceTimersByTime(299 * 1000));
    expect(result.current).toBe(1);
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(0);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("resets warning and timeout on user activity", () => {
    const onActivity = vi.fn();
    const onWarning = vi.fn();
    const onTimeout = vi.fn();
    const { result } = renderHook(() =>
      useEditIdleTimer({
        enabled: true,
        warningMs: 100,
        timeoutMs: 200,
        onActivity,
        onWarning,
        onTimeout,
      }),
    );

    act(() => vi.advanceTimersByTime(90));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "A" }));
    });
    act(() => vi.advanceTimersByTime(90));

    expect(result.current).toBeNull();
    expect(onActivity).toHaveBeenCalledTimes(2);
    expect(onWarning).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("clears the countdown when disabled", () => {
    const onTimeout = vi.fn();
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useEditIdleTimer({
          enabled,
          warningMs: 100,
          timeoutMs: 200,
          onTimeout,
        }),
      { initialProps: { enabled: true } },
    );

    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe(1);
    rerender({ enabled: false });
    expect(result.current).toBeNull();
  });
});
