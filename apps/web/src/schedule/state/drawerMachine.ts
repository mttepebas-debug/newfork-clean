import type { ConflictWarning } from "@newfork/scheduling-shared";

export interface CellContext {
  readonly employee_id: string | null;
  readonly location_id: string;
  readonly scheduled_date: string;
}

export interface ShiftDraft extends CellContext {
  readonly shift_type_id?: string | null;
  readonly job_id?: string | null;
  readonly start_time: string;
  readonly end_time: string;
  readonly note?: string | null;
}

export interface ShiftRow {
  readonly id: string;
  readonly revision?: number;
  readonly updated_at?: string;
}

export type DrawerMode = "create" | "edit";

export type DrawerState =
  | { kind: "closed" }
  | { kind: "opening"; mode: DrawerMode; context: CellContext; shiftId?: string }
  | {
      kind: "open-clean";
      mode: DrawerMode;
      context: CellContext;
      draft: ShiftDraft;
      original?: ShiftRow;
    }
  | {
      kind: "open-dirty";
      mode: DrawerMode;
      context: CellContext;
      draft: ShiftDraft;
      original?: ShiftRow;
      warnings: ConflictWarning[];
    }
  | { kind: "saving"; mode: DrawerMode; context: CellContext; draft: ShiftDraft }
  | {
      kind: "saved";
      mode: DrawerMode;
      context: CellContext;
      draft: ShiftDraft;
      savedShift: ShiftRow;
    }
  | {
      kind: "error";
      mode: DrawerMode;
      context: CellContext;
      draft: ShiftDraft;
      error: { code: string; message: string };
      warnings?: ConflictWarning[];
    }
  | {
      kind: "conflict-block";
      mode: DrawerMode;
      context: CellContext;
      draft: ShiftDraft;
      warnings: ConflictWarning[];
    }
  | { kind: "shift-vanished"; context: CellContext; lastKnownDraft: ShiftDraft }
  | { kind: "stale-blocked"; context: CellContext; draft: ShiftDraft; serverShift: ShiftRow };

export type DrawerEvent =
  | { type: "OPEN_CREATE"; context: CellContext }
  | { type: "OPEN_EDIT"; context: CellContext; shiftId: string }
  | { type: "READY"; draft: ShiftDraft; original?: ShiftRow }
  | { type: "DRAFT_CHANGED"; draft: ShiftDraft; warnings: ConflictWarning[] }
  | { type: "SAVE_START" }
  | { type: "SAVE_OK"; savedShift: ShiftRow }
  | { type: "SAVE_ERROR"; error: { code: string; message: string }; warnings?: ConflictWarning[] }
  | { type: "CONFLICT_BLOCK"; warnings: ConflictWarning[] }
  | { type: "REMOTE_UPDATED"; updated: ShiftRow }
  | { type: "REMOTE_DELETED" }
  | { type: "IF_MATCH_FAILED"; serverShift: ShiftRow }
  | { type: "DISCARD" }
  | { type: "CREATE_ANOTHER" }
  | { type: "CLOSE" };

export const initialDrawerState: DrawerState = { kind: "closed" };

export function drawerReducer(state: DrawerState, event: DrawerEvent): DrawerState {
  switch (event.type) {
    case "OPEN_CREATE":
      return { kind: "opening", mode: "create", context: event.context };

    case "OPEN_EDIT":
      return { kind: "opening", mode: "edit", context: event.context, shiftId: event.shiftId };

    case "READY":
      if (state.kind !== "opening") return state;
      return event.original
        ? {
            kind: "open-clean",
            mode: state.mode,
            context: state.context,
            draft: event.draft,
            original: event.original,
          }
        : { kind: "open-clean", mode: state.mode, context: state.context, draft: event.draft };

    case "DRAFT_CHANGED": {
      if (
        state.kind !== "open-clean" &&
        state.kind !== "open-dirty" &&
        state.kind !== "error" &&
        state.kind !== "conflict-block"
      ) {
        return state;
      }
      const original = "original" in state ? state.original : undefined;
      return original
        ? {
            kind: "open-dirty",
            mode: state.mode,
            context: state.context,
            draft: event.draft,
            warnings: event.warnings,
            original,
          }
        : {
            kind: "open-dirty",
            mode: state.mode,
            context: state.context,
            draft: event.draft,
            warnings: event.warnings,
          };
    }

    case "SAVE_START":
      if (state.kind !== "open-dirty" && state.kind !== "open-clean") return state;
      return { kind: "saving", mode: state.mode, context: state.context, draft: state.draft };

    case "SAVE_OK":
      if (state.kind !== "saving") return state;
      return {
        kind: "saved",
        mode: state.mode,
        context: state.context,
        draft: state.draft,
        savedShift: event.savedShift,
      };

    case "SAVE_ERROR":
      if (state.kind !== "saving") return state;
      return event.warnings
        ? {
            kind: "error",
            mode: state.mode,
            context: state.context,
            draft: state.draft,
            error: event.error,
            warnings: event.warnings,
          }
        : {
            kind: "error",
            mode: state.mode,
            context: state.context,
            draft: state.draft,
            error: event.error,
          };

    case "CONFLICT_BLOCK":
      if (state.kind !== "saving") return state;
      return {
        kind: "conflict-block",
        mode: state.mode,
        context: state.context,
        draft: state.draft,
        warnings: event.warnings,
      };

    case "REMOTE_DELETED": {
      if (state.kind === "closed") return state;
      const draft =
        "draft" in state ? state.draft : "lastKnownDraft" in state ? state.lastKnownDraft : null;
      if (!draft || !("context" in state)) return state;
      return { kind: "shift-vanished", context: state.context, lastKnownDraft: draft };
    }

    case "IF_MATCH_FAILED":
      if (state.kind !== "saving") return state;
      return {
        kind: "stale-blocked",
        context: state.context,
        draft: state.draft,
        serverShift: event.serverShift,
      };

    case "REMOTE_UPDATED":
      return state;

    case "DISCARD":
      return { kind: "closed" };

    case "CREATE_ANOTHER":
      if (state.kind !== "saved") return state;
      return { kind: "opening", mode: "create", context: state.context };

    case "CLOSE":
      if (
        state.kind === "open-dirty" ||
        state.kind === "saving" ||
        state.kind === "error" ||
        state.kind === "conflict-block"
      ) {
        return state;
      }
      return { kind: "closed" };

    default:
      return state;
  }
}
