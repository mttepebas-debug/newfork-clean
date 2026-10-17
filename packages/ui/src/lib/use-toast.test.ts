import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "./use-toast";

const sonnerToast = vi.hoisted(() =>
  Object.assign(vi.fn(() => "action-id"), {
    error: vi.fn(() => "error-id"),
    info: vi.fn(() => "info-id"),
    success: vi.fn(() => "success-id"),
    warning: vi.fn(() => "warning-id"),
  }),
);

vi.mock("sonner", () => ({
  toast: sonnerToast,
}));

describe("toast facade", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T12:00:00.000Z"));
    vi.clearAllMocks();
  });

  it("uses the standard durations and dismissible sonner options", () => {
    toast.success("Saved");
    toast.info("Paste mode on");
    toast.warning("Availability conflict");
    toast.error("Could not save");
    toast.action("Undo available", {
      actionLabel: "Undo",
      onAction: () => undefined,
    });

    expect(sonnerToast.success).toHaveBeenCalledWith(
      "Saved",
      expect.objectContaining({ dismissible: true, duration: 4_000 }),
    );
    expect(sonnerToast.info).toHaveBeenCalledWith(
      "Paste mode on",
      expect.objectContaining({ dismissible: true, duration: 6_000 }),
    );
    expect(sonnerToast.warning).toHaveBeenCalledWith(
      "Availability conflict",
      expect.objectContaining({ dismissible: true, duration: 10_000 }),
    );
    expect(sonnerToast.error).toHaveBeenCalledWith(
      "Could not save",
      expect.objectContaining({ dismissible: true, duration: 14_000 }),
    );
    expect(sonnerToast).toHaveBeenCalledWith(
      "Undo available",
      expect.objectContaining({ dismissible: true, duration: 12_000 }),
    );
  });

  it("an action toast can warn, carry a second line and a short timer line", () => {
    const onAction = vi.fn();
    toast.action("Shift added to Maria Lopez.", {
      actionLabel: "Undo",
      onAction,
      tone: "warning",
      description: "Maria prefers not to work Mon after 6:00 PM.",
      durationMs: 5_000,
      dedupeKey: "assign-notice",
    });
    expect(sonnerToast.warning).toHaveBeenCalledWith(
      "Shift added to Maria Lopez.",
      expect.objectContaining({
        description: "Maria prefers not to work Mon after 6:00 PM.",
        duration: 5_000,
        className: "newfork-toast--timed",
        style: { "--toast-duration": "5000ms" },
        action: expect.objectContaining({ label: "Undo", onClick: onAction }),
      }),
    );
    expect(sonnerToast).not.toHaveBeenCalled();
  });

  it("updates the same toast when a dedupe key repeats", () => {
    toast.error("Could not save", {
      dedupeKey: "save-failed",
      description: "Try again.",
    });
    toast.error("Could not save", {
      dedupeKey: "save-failed",
      description: "Try again.",
    });

    expect(sonnerToast.error).toHaveBeenNthCalledWith(
      2,
      "Could not save",
      expect.objectContaining({ id: "error-id" }),
    );
  });

  it("dedupes matching type, title, and description for two seconds", () => {
    toast.warning("Availability conflict", {
      description: "This shift overlaps unavailable hours.",
    });
    toast.warning("Availability conflict", {
      description: "This shift overlaps unavailable hours.",
    });
    vi.advanceTimersByTime(2_001);
    toast.warning("Availability conflict", {
      description: "This shift overlaps unavailable hours.",
    });

    expect(sonnerToast.warning).toHaveBeenNthCalledWith(
      2,
      "Availability conflict",
      expect.objectContaining({ id: "warning-id" }),
    );
    expect(sonnerToast.warning).toHaveBeenNthCalledWith(
      3,
      "Availability conflict",
      expect.not.objectContaining({ id: "warning-id" }),
    );
  });
});
