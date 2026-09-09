import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLineupAutosave } from "./useLineupAutosave";
import { BriefDialog } from "./LineupDialogs";
import { LineupNotes } from "./LineupNotes";
import { saveLineupNote } from "../lineup-data";
import type {
  ScheduleLineupReadModel,
  ScheduleLineupLocation,
} from "@newfork/shared";

vi.mock("../lineup-data", () => ({ saveLineupNote: vi.fn() }));
Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value: function () {
    this.setAttribute("open", "");
  },
});
Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value: function () {
    this.removeAttribute("open");
  },
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
async function tick() {
  await act(() => vi.advanceTimersByTimeAsync(1000));
}

describe("Line Up draft autosave", () => {
  it("does not write on open and debounces typing into one write", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ value }) => useLineupAutosave({ value, save }),
      { initialProps: { value: "old" } },
    );
    await tick();
    expect(save).not.toHaveBeenCalled();
    rerender({ value: "ne" });
    rerender({ value: "new" });
    await tick();
    expect(save).toHaveBeenCalledExactlyOnceWith("new");
    expect(result.current.dirty).toBe(false);
  });

  it("queues the latest edit behind a slow write and close waits for both", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ value }) => useLineupAutosave({ value, save }),
      { initialProps: { value: "old" } },
    );
    rerender({ value: "first" });
    await tick();
    rerender({ value: "second" });
    rerender({ value: "latest" });
    let closed = false;
    let closing!: Promise<boolean>;
    act(() => {
      closing = result.current.flush().then((ok) => {
        closed = ok;
        return ok;
      });
    });
    expect(closed).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await closing;
    });
    expect(save.mock.calls.map(([draft]) => draft)).toEqual([
      "first",
      "latest",
    ]);
    expect(closed).toBe(true);
    expect(result.current.dirty).toBe(false);
  });

  it("keeps a rejected draft without a retry loop and retries explicitly", async () => {
    vi.useFakeTimers();
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("stale revision"))
      .mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ value }) => useLineupAutosave({ value, save }),
      { initialProps: { value: "old" } },
    );
    rerender({ value: "unsaved" });
    await tick();
    expect(result.current.error).toBe("stale revision");
    expect(result.current.dirty).toBe(true);
    await tick();
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      expect(await result.current.flush()).toBe(true);
    });
    expect(save).toHaveBeenLastCalledWith("unsaved");
    expect(result.current.error).toBe("");
  });

  it("blocks invalid saves and closing, then saves the corrected value", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const validate = (value: string) => (value.trim() ? "" : "Enter a note");
    const { result, rerender } = renderHook(
      ({ value }) => useLineupAutosave({ value, save, validate }),
      { initialProps: { value: "old" } },
    );
    rerender({ value: "" });
    await tick();
    await act(async () => {
      expect(await result.current.flush()).toBe(false);
    });
    expect(save).not.toHaveBeenCalled();
    rerender({ value: "corrected" });
    await tick();
    expect(save).toHaveBeenCalledExactlyOnceWith("corrected");
  });

  it("cancels pending typing on unmount and disabled operational forms do not autosave", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ value, enabled }) => useLineupAutosave({ value, save, enabled }),
      { initialProps: { value: "old", enabled: false } },
    );
    rerender({ value: "new", enabled: false });
    await tick();
    expect(save).not.toHaveBeenCalled();
    rerender({ value: "new", enabled: true });
    unmount();
    await tick();
    expect(save).not.toHaveBeenCalled();
  });

  it("uses each returned brief revision and flushes before Done", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const onClose = vi.fn();
    render(
      <BriefDialog
        typeName="Dinner"
        brief={undefined}
        onSave={onSave}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByLabelText("Specials"), {
      target: { value: "First draft" },
    });
    await tick();
    expect(onSave).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ specials: "First draft" }),
      null,
    );
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Specials"), {
      target: { value: "Final draft" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    expect(onSave).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ specials: "Final draft" }),
      1,
    );
    expect(onClose).toHaveBeenCalledOnce();
    await tick();
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("creates a note once, then updates its saved identity without closing the editor", async () => {
    vi.useFakeTimers();
    const location = {
      id: "location",
      name: "Main",
      briefs: [],
    } as unknown as ScheduleLineupLocation;
    const model = {
      locations: [location],
      sections: [],
      shift_types: [],
    } as unknown as ScheduleLineupReadModel;
    vi.mocked(saveLineupNote)
      .mockResolvedValueOnce({ id: "note", revision: 1 } as Awaited<
        ReturnType<typeof saveLineupNote>
      >)
      .mockResolvedValueOnce({ id: "note", revision: 2 } as Awaited<
        ReturnType<typeof saveLineupNote>
      >);
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(
      <LineupNotes
        workspaceId="workspace"
        date="2031-06-02"
        location={location}
        serviceId={null}
        model={model}
        canManage
        refresh={refresh}
        onBrief={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    fireEvent.change(screen.getByLabelText("Note", { exact: true }), {
      target: { value: "First note" },
    });
    await tick();
    expect(saveLineupNote).toHaveBeenNthCalledWith(
      1,
      "workspace",
      expect.objectContaining({ content: "First note" }),
      null,
      null,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Note", { exact: true }), {
      target: { value: "Updated note" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    expect(saveLineupNote).toHaveBeenNthCalledWith(
      2,
      "workspace",
      expect.objectContaining({ content: "Updated note" }),
      "note",
      1,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
