import { describe, expect, it } from "vitest";

import {
  drawerReducer,
  initialDrawerState,
  type DrawerState,
  type ShiftDraft,
  type ShiftRow,
} from "./drawerMachine";

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

describe("drawerReducer", () => {
  it("opens in create mode from closed", () => {
    const next = drawerReducer(initialDrawerState, {
      type: "OPEN_CREATE",
      context,
    });

    expect(next.kind).toBe("opening");
    if (next.kind === "opening") expect(next.mode).toBe("create");
  });

  it("opens in edit mode with shiftId", () => {
    const next = drawerReducer(initialDrawerState, {
      type: "OPEN_EDIT",
      context,
      shiftId: "shift-1",
    });

    expect(next.kind).toBe("opening");
    if (next.kind === "opening") {
      expect(next.mode).toBe("edit");
      expect(next.shiftId).toBe("shift-1");
    }
  });

  it("hydrates opening into open-clean via READY", () => {
    const opening = drawerReducer(initialDrawerState, {
      type: "OPEN_CREATE",
      context,
    });

    expect(drawerReducer(opening, { type: "READY", draft }).kind).toBe(
      "open-clean",
    );
  });

  it("ignores READY outside opening", () => {
    const state: DrawerState = { kind: "closed" };

    expect(drawerReducer(state, { type: "READY", draft })).toBe(state);
  });

  it("moves open-clean to open-dirty when the draft changes", () => {
    const state: DrawerState = {
      kind: "open-clean",
      mode: "create",
      context,
      draft,
    };

    expect(
      drawerReducer(state, { type: "DRAFT_CHANGED", draft, warnings: [] }).kind,
    ).toBe("open-dirty");
  });

  it("starts saving from open-clean or open-dirty", () => {
    const dirty: DrawerState = {
      kind: "open-dirty",
      mode: "edit",
      context,
      draft,
      warnings: [],
    };

    expect(drawerReducer(dirty, { type: "SAVE_START" }).kind).toBe("saving");
  });

  it("saves successfully from saving", () => {
    const state: DrawerState = {
      kind: "saving",
      mode: "create",
      context,
      draft,
    };
    const savedShift: ShiftRow = {
      id: "shift-1",
      updated_at: "2026-05-01T12:00:00Z",
    };

    expect(drawerReducer(state, { type: "SAVE_OK", savedShift }).kind).toBe(
      "saved",
    );
  });

  it("maps save failures and blocking conflicts to their drawer states", () => {
    const state: DrawerState = {
      kind: "saving",
      mode: "edit",
      context,
      draft,
    };

    expect(
      drawerReducer(state, {
        type: "SAVE_ERROR",
        error: { code: "boom", message: "boom" },
        warnings: [],
      }).kind,
    ).toBe("error");
    expect(drawerReducer(state, { type: "CONFLICT_BLOCK", warnings: [] }).kind).toBe(
      "conflict-block",
    );
  });

  it("transitions open states to shift-vanished on remote delete", () => {
    const state: DrawerState = {
      kind: "open-dirty",
      mode: "edit",
      context,
      draft,
      warnings: [],
    };

    expect(drawerReducer(state, { type: "REMOTE_DELETED" }).kind).toBe(
      "shift-vanished",
    );
    expect(drawerReducer(initialDrawerState, { type: "REMOTE_DELETED" })).toBe(
      initialDrawerState,
    );
  });

  it("moves saving to stale-blocked on IF_MATCH_FAILED", () => {
    const state: DrawerState = {
      kind: "saving",
      mode: "edit",
      context,
      draft,
    };
    const serverShift: ShiftRow = {
      id: "shift-1",
      updated_at: "2026-05-01T12:00:00Z",
    };
    const next = drawerReducer(state, { type: "IF_MATCH_FAILED", serverShift });

    expect(next.kind).toBe("stale-blocked");
    if (next.kind === "stale-blocked") expect(next.serverShift).toBe(serverShift);
  });

  it("blocks close while dirty, saving, errored, or conflict-blocked", () => {
    const dirty: DrawerState = {
      kind: "open-dirty",
      mode: "create",
      context,
      draft,
      warnings: [],
    };

    expect(drawerReducer(dirty, { type: "CLOSE" })).toBe(dirty);
  });

  it("closes clean, saved, vanished, stale, or discarded states", () => {
    const clean: DrawerState = {
      kind: "open-clean",
      mode: "create",
      context,
      draft,
    };
    const saved: DrawerState = {
      kind: "saved",
      mode: "create",
      context,
      draft,
      savedShift: { id: "shift-1", updated_at: "z" },
    };
    const vanished: DrawerState = {
      kind: "shift-vanished",
      context,
      lastKnownDraft: draft,
    };
    const stale: DrawerState = {
      kind: "stale-blocked",
      context,
      draft,
      serverShift: { id: "shift-1", updated_at: "z" },
    };

    expect(drawerReducer(clean, { type: "CLOSE" }).kind).toBe("closed");
    expect(drawerReducer(saved, { type: "CLOSE" }).kind).toBe("closed");
    expect(drawerReducer(vanished, { type: "CLOSE" }).kind).toBe("closed");
    expect(drawerReducer(stale, { type: "CLOSE" }).kind).toBe("closed");
    expect(drawerReducer(clean, { type: "DISCARD" }).kind).toBe("closed");
  });

  it("creates another shift from the saved state", () => {
    const saved: DrawerState = {
      kind: "saved",
      mode: "edit",
      context,
      draft,
      savedShift: { id: "shift-1", updated_at: "z" },
    };
    const next = drawerReducer(saved, { type: "CREATE_ANOTHER" });

    expect(next.kind).toBe("opening");
    if (next.kind === "opening") expect(next.mode).toBe("create");
  });

  it("keeps the current draft position on remote update", () => {
    const state: DrawerState = {
      kind: "open-dirty",
      mode: "edit",
      context,
      draft,
      warnings: [],
    };

    expect(
      drawerReducer(state, {
        type: "REMOTE_UPDATED",
        updated: { id: "shift-1", updated_at: "z" },
      }),
    ).toBe(state);
  });
});
