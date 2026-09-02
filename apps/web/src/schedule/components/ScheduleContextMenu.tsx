import type { ScheduleEditableShift } from "@newfork/shared/schedule";
import {
  ClipboardPaste,
  CloudOff,
  Copy,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

export interface ShiftContextMenuTarget {
  readonly shiftId: string;
  readonly x: number;
  readonly y: number;
  readonly publicationState?: ShiftPublicationState | null;
}

export type ShiftPublicationState =
  | "locked"
  | "staged-removed"
  | "unlocked-modified";

export interface CellContextMenuTarget {
  readonly locationId: string;
  readonly employeeId: string | null;
  readonly jobId: string | null;
  readonly date: string;
  readonly x: number;
  readonly y: number;
}

export interface CellPresetMenuItem {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly disabledReason?: string;
}

const contextMenuSize = {
  width: 176,
  minHeight: 88,
  itemHeight: 36,
  separatorHeight: 9,
  padding: 8,
};

export function ScheduleContextMenu({
  target,
  shifts,
  onEdit,
  onCopy,
  onDelete,
  onUnpublish,
  onRestore,
  onDismiss,
  publicationStateForShift,
}: {
  readonly target: ShiftContextMenuTarget | null;
  readonly shifts: readonly ScheduleEditableShift[];
  readonly onEdit: (shift: ScheduleEditableShift) => void;
  readonly onCopy: (shift: ScheduleEditableShift) => void;
  readonly onDelete: (shiftId: string) => void;
  readonly onUnpublish?: (shiftId: string) => void;
  readonly onRestore?: (shiftId: string) => void;
  readonly onDismiss: () => void;
  readonly publicationStateForShift: (
    shift: ScheduleEditableShift,
  ) => ShiftPublicationState | null;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissFloatingMenu(Boolean(target), menuRef, onDismiss);
  if (!target) return null;
  const shift = shifts.find((item) => item.id === target.shiftId);
  if (!shift) return null;
  const position = clampContextMenu(target.x, target.y);
  const publicationState =
    target.publicationState ?? publicationStateForShift(shift);

  return (
    <div
      ref={menuRef}
      className="schedule-context-menu"
      role="menu"
      aria-label="Shift actions"
      style={{ top: position.y, left: position.x }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {publicationState !== "staged-removed" ? (
        <ScheduleContextMenuItem
          icon={<Pencil size={16} aria-hidden />}
          label="Edit shift"
          onSelect={() => {
            onEdit(shift);
            onDismiss();
          }}
        />
      ) : null}
      <ScheduleContextMenuItem
        icon={<Copy size={15} aria-hidden />}
        label="Copy shift"
        onSelect={() => {
          onCopy(shift);
          onDismiss();
        }}
      />
      {publicationState === "staged-removed" ? (
        <ScheduleContextMenuItem
          icon={<RotateCcw size={15} aria-hidden />}
          label="Restore shift"
          onSelect={() => {
            onRestore?.(shift.id);
            onDismiss();
          }}
        />
      ) : publicationState === "locked" ||
        publicationState === "unlocked-modified" ? (
        <ScheduleContextMenuItem
          icon={<CloudOff size={15} aria-hidden />}
          label="Unpublish shift"
          danger
          onSelect={() => {
            onUnpublish?.(shift.id);
            onDismiss();
          }}
        />
      ) : (
        <ScheduleContextMenuItem
          icon={<Trash2 size={15} aria-hidden />}
          label="Delete shift"
          danger
          onSelect={() => {
            onDelete(shift.id);
            onDismiss();
          }}
        />
      )}
    </div>
  );
}

export function ScheduleCellContextMenu({
  target,
  canPaste,
  presetItems = [],
  onPaste,
  onPresetSelect,
  onDismiss,
}: {
  readonly target: CellContextMenuTarget | null;
  readonly canPaste: boolean;
  readonly presetItems?: readonly CellPresetMenuItem[];
  readonly onPaste: (target: CellContextMenuTarget) => void;
  readonly onPresetSelect?: (
    target: CellContextMenuTarget,
    shiftTypeId: string,
  ) => void;
  readonly onDismiss: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissFloatingMenu(Boolean(target), menuRef, onDismiss);
  if (!target) return null;
  const estimatedHeight = Math.max(
    contextMenuSize.minHeight,
    contextMenuSize.itemHeight * (1 + presetItems.length) +
      (presetItems.length ? contextMenuSize.separatorHeight : 0),
  );
  const position = clampContextMenu(target.x, target.y, estimatedHeight);

  return (
    <div
      ref={menuRef}
      className="schedule-context-menu"
      role="menu"
      aria-label="Cell actions"
      style={{ top: position.y, left: position.x }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <ScheduleContextMenuItem
        icon={<ClipboardPaste size={15} aria-hidden />}
        label="Paste shift"
        disabled={!canPaste}
        onSelect={() => {
          onPaste(target);
          onDismiss();
        }}
      />
      {presetItems.length ? (
        <>
          <div className="schedule-context-menu-separator" role="separator" />
          {presetItems.map((preset) => (
            <ScheduleContextMenuItem
              key={preset.id}
              icon={<Plus size={15} aria-hidden />}
              label={preset.label}
              disabled={Boolean(preset.disabledReason)}
              title={preset.disabledReason}
              iconColor={preset.color}
              onSelect={() => {
                onPresetSelect?.(target, preset.id);
                onDismiss();
              }}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

function ScheduleContextMenuItem({
  icon,
  label,
  onSelect,
  danger = false,
  disabled = false,
  title,
  iconColor,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly onSelect: () => void;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly iconColor?: string;
}) {
  const handledMouseDownRef = useRef(false);
  const run = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    onSelect();
  };
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      data-danger={danger}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        handledMouseDownRef.current = true;
        run(event);
      }}
      onClick={(event) => {
        if (handledMouseDownRef.current) {
          handledMouseDownRef.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        run(event);
      }}
    >
      <span style={iconColor ? { color: iconColor } : undefined}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function useDismissFloatingMenu(
  open: boolean,
  menuRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onDismiss();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onDismiss();
    };
    const handleScroll = () => onDismiss();
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [menuRef, onDismiss, open]);
}

function clampContextMenu(
  x: number,
  y: number,
  height = contextMenuSize.minHeight,
) {
  const safeX = Number.isFinite(x) ? x : contextMenuSize.padding;
  const safeY = Number.isFinite(y) ? y : contextMenuSize.padding;
  return {
    x: Math.max(
      contextMenuSize.padding,
      Math.min(
        safeX,
        window.innerWidth - contextMenuSize.width - contextMenuSize.padding,
      ),
    ),
    y: Math.max(
      contextMenuSize.padding,
      Math.min(safeY, window.innerHeight - height - contextMenuSize.padding),
    ),
  };
}
