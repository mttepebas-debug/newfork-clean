import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DrawerState, ShiftDraft } from "../state/drawerMachine";
import { ShiftDrawer } from "./ShiftDrawer";

const context = {
  employee_id: null,
  location_id: "location-1",
  scheduled_date: "2026-05-01",
};
const draft: ShiftDraft = {
  ...context,
  start_time: "09:00",
  end_time: "17:00",
};

function renderDrawer(state: DrawerState, dispatch = vi.fn()) {
  const onReload = vi.fn();
  render(
    <ShiftDrawer
      state={state}
      dispatch={dispatch}
      onReload={onReload}
      renderForm={() => <form aria-label="Shift details">form body</form>}
    />,
  );
  return { dispatch, onReload };
}

describe("ShiftDrawer", () => {
  it("stays unmounted while closed", () => {
    renderDrawer({ kind: "closed" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes clean drawers from the backdrop and close button", () => {
    const dispatch = vi.fn();
    const state: DrawerState = {
      kind: "open-clean",
      mode: "create",
      context,
      draft,
    };
    renderDrawer(state, dispatch);

    fireEvent.click(screen.getByLabelText("Close shift drawer"));
    fireEvent.click(screen.getByLabelText("Close drawer"));

    expect(dispatch).toHaveBeenCalledWith({ type: "CLOSE" });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("uses an explicit title for paste drawers", () => {
    render(
      <ShiftDrawer
        state={{
          kind: "open-clean",
          mode: "create",
          context,
          draft,
        }}
        title="Paste shift"
        dispatch={vi.fn()}
        onReload={vi.fn()}
        renderForm={() => <form aria-label="Shift details">form body</form>}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Paste shift" })).toBeTruthy();
    expect(screen.queryByText(/Use the selected cell context/i)).toBeNull();
    expect(screen.queryByText(/Update the shift details/i)).toBeNull();
  });

  it("requires explicit discard before closing dirty drawers", () => {
    const dispatch = vi.fn();
    const state: DrawerState = {
      kind: "open-dirty",
      mode: "edit",
      context,
      draft,
      warnings: [],
    };
    renderDrawer(state, dispatch);

    fireEvent.click(screen.getByLabelText("Close drawer"));

    expect(dispatch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();

    fireEvent.click(screen.getByLabelText("Close shift drawer"));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "DISCARD" });
  });

  it("uses Escape for the same clean and dirty close semantics", () => {
    const cleanDispatch = vi.fn();
    const cleanState: DrawerState = {
      kind: "open-clean",
      mode: "create",
      context,
      draft,
    };
    const { unmount } = render(
      <ShiftDrawer
        state={cleanState}
        dispatch={cleanDispatch}
        onReload={vi.fn()}
        renderForm={() => <form aria-label="Shift details">form body</form>}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(cleanDispatch).toHaveBeenCalledWith({ type: "CLOSE" });
    unmount();

    const dirtyDispatch = vi.fn();
    renderDrawer(
      {
        kind: "error",
        mode: "edit",
        context,
        draft,
        error: { code: "save_failed", message: "Save failed" },
      },
      dirtyDispatch,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(dirtyDispatch).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("renders opening, vanished, and stale states", () => {
    const { rerender } = render(
      <ShiftDrawer
        state={{ kind: "opening", mode: "edit", context, shiftId: "shift-1" }}
        dispatch={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    expect(screen.getByText("Loading...")).toBeTruthy();

    rerender(
      <ShiftDrawer
        state={{ kind: "shift-vanished", context, lastKnownDraft: draft }}
        dispatch={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    expect(
      screen.getByText("This shift was removed by another user."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Your in-progress edits below are not saved anywhere. Copy them out if you need them, then close.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("09:00–17:00")).toBeTruthy();

    const onReload = vi.fn();
    rerender(
      <ShiftDrawer
        state={{
          kind: "stale-blocked",
          context,
          draft,
          serverShift: { id: "shift-1", updated_at: "z" },
        }}
        dispatch={vi.fn()}
        onReload={onReload}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Shift updated by another user.")).toBeTruthy();
    expect(
      screen.getByText(
        "Reload to fetch the latest version (your draft will be replaced) or discard your edits.",
      ),
    ).toBeTruthy();
  });
});
