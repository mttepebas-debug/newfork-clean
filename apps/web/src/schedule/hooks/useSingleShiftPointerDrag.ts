import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  grabPoint,
  isPrimaryDragActivation,
  shiftDropTargetKey,
} from "../lib/scheduleDragTargets";

const DRAG_THRESHOLD_PX = 6;
// A finger held this long on a card lifts it (Mert, 2026-10-20); a finger
// that moves further first is scrolling the page.
const LONG_PRESS_MS = 350;
const TOUCH_SLOP_PX = 10;

export interface ShiftDropTarget {
  readonly shiftId: string;
  readonly employeeId: string | null;
  readonly locationId: string;
  readonly date: string;
  readonly copy: boolean;
}

export interface ShiftDropEvaluation {
  readonly allowed: boolean;
  readonly reason?: string;
  /** One or two words for the dragged card; `reason` is the full sentence. */
  readonly shortReason?: string;
  readonly messages?: readonly string[];
  readonly targetStatus?: "allowed" | "warning" | "blocked" | null;
}

export interface ShiftDragState {
  readonly activeShiftId: string;
  readonly label: string;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly previewWidth: number;
  readonly previewHeight: number;
  /** Where on the card the press landed, from its top-left corner. */
  readonly grabX: number;
  readonly grabY: number;
  readonly targetKey: string | null;
  readonly targetLocationId: string | null;
  readonly targetDate: string | null;
  readonly targetStatus: "allowed" | "warning" | "blocked" | null;
  readonly reason: string | null;
  readonly copy: boolean;
}

export interface ResolvedShiftDropTarget
  extends ShiftDropTarget,
    ShiftDropEvaluation {
  readonly targetKey: string;
}

export function useSingleShiftPointerDrag({
  enabled,
  resolveLabel,
  evaluateTarget,
  onDragStart,
  onDropAttempt,
  onDragEnd,
  onDrop,
}: {
  readonly enabled: boolean;
  readonly resolveLabel: (shiftId: string) => string;
  readonly evaluateTarget: (target: ShiftDropTarget) => ShiftDropEvaluation;
  readonly onDragStart: (shiftId: string) => void;
  readonly onDropAttempt: (target: ResolvedShiftDropTarget | null) => void;
  readonly onDragEnd: () => void;
  readonly onDrop: (target: ShiftDropTarget) => void;
}): {
  readonly dragState: ShiftDragState | null;
  readonly onShiftPointerDown: (
    shiftId: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  readonly onShiftMouseDown: (
    shiftId: string,
    event: MouseEvent<HTMLElement>,
  ) => void;
  readonly endDrag: () => void;
} {
  const [dragState, setDragState] = useState<ShiftDragState | null>(null);
  const pendingRef = useRef<{
    readonly shiftId: string;
    readonly pointerId: number | null;
    readonly startX: number;
    readonly startY: number;
    readonly previewWidth: number;
    readonly previewHeight: number;
    readonly grabX: number;
    readonly grabY: number;
    /** A finger: lifted by holding still, not by moving. */
    readonly touch?: { timer: number | null; lifted: boolean; moved: boolean; element: HTMLElement };
  } | null>(null);
  const draggingRef = useRef(false);
  const lastPointRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const clickSuppressorRef = useRef<
    ((event: globalThis.MouseEvent) => void) | null
  >(null);
  const clearSessionRef = useRef<(suppressClick: boolean) => void>(() => {});
  const dragStateFrameRef = useRef<number | null>(null);
  const pendingDragStateRef = useRef<ShiftDragState | null>(null);
  const ignoreCompatibilityMouseUntilRef = useRef(0);
  const menuEventRef = useRef<globalThis.MouseEvent | null>(null);
  // The card's own right-click menu, for a finger held and let go in place.
  const openMenu = useCallback((element: HTMLElement, clientX: number, clientY: number) => {
    if (!element.isConnected) return;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY, button: 2 });
    menuEventRef.current = event;
    element.dispatchEvent(event);
    menuEventRef.current = null;
  }, []);

  const clearClickSuppressor = useCallback(() => {
    const suppressor = clickSuppressorRef.current;
    if (!suppressor) return;
    window.removeEventListener("click", suppressor, true);
    clickSuppressorRef.current = null;
  }, []);

  const cancelPendingDragState = useCallback(() => {
    if (dragStateFrameRef.current !== null) {
      window.cancelAnimationFrame(dragStateFrameRef.current);
      dragStateFrameRef.current = null;
    }
    pendingDragStateRef.current = null;
  }, []);

  const scheduleDragState = useCallback((nextState: ShiftDragState) => {
    pendingDragStateRef.current = nextState;
    if (dragStateFrameRef.current !== null) return;
    dragStateFrameRef.current = window.requestAnimationFrame(() => {
      dragStateFrameRef.current = null;
      const pending = pendingDragStateRef.current;
      pendingDragStateRef.current = null;
      if (pending) setDragState(pending);
    });
  }, []);

  const clearSession = useCallback(
    (suppressClick: boolean) => {
      const hadDrag = draggingRef.current;
      const touch = pendingRef.current?.touch;
      if (touch?.timer != null) window.clearTimeout(touch.timer);
      pendingRef.current = null;
      draggingRef.current = false;
      lastPointRef.current = null;
      cancelPendingDragState();
      setDragState(null);
      if (hadDrag) onDragEnd();
      clearClickSuppressor();
      if (!suppressClick) return;
      const swallowClick = (event: globalThis.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        window.removeEventListener("click", swallowClick, true);
        clickSuppressorRef.current = null;
      };
      clickSuppressorRef.current = swallowClick;
      window.addEventListener("click", swallowClick, true);
    },
    [cancelPendingDragState, clearClickSuppressor, onDragEnd],
  );

  useEffect(() => clearClickSuppressor, [clearClickSuppressor]);
  useEffect(() => {
    clearSessionRef.current = clearSession;
  }, [clearSession]);
  useEffect(() => () => clearSessionRef.current(false), []);

  const resolveTargetAtPoint = useCallback(
    (
      point: {
        readonly clientX: number;
        readonly clientY: number;
        readonly copy: boolean;
      },
      shiftId: string,
    ): ResolvedShiftDropTarget | null => {
      const hit = document.elementFromPoint(point.clientX, point.clientY);
      const cell =
        hit instanceof HTMLElement
          ? hit.closest<HTMLElement>("[data-drop-cell='true']")
          : null;
      if (!cell?.dataset.locationId || !cell.dataset.date) return null;
      const employeeId = cell.dataset.employeeId || null;
      const target = {
        shiftId,
        employeeId,
        locationId: cell.dataset.locationId,
        date: cell.dataset.date,
        copy: point.copy,
      };
      return {
        ...target,
        ...evaluateTarget(target),
        targetKey: shiftDropTargetKey(
          employeeId,
          target.locationId,
          target.date,
        ),
      };
    },
    [evaluateTarget],
  );

  const updateDragAtPoint = useCallback(
    (point: {
      readonly clientX: number;
      readonly clientY: number;
      readonly ctrlKey: boolean;
      readonly metaKey: boolean;
      readonly shiftKey: boolean;
    }): void => {
      const pending = pendingRef.current;
      if (!pending) return;
      const clientX = Number.isFinite(point.clientX)
        ? point.clientX
        : pending.startX;
      const clientY = Number.isFinite(point.clientY)
        ? point.clientY
        : pending.startY;
      const delta = Math.hypot(
        clientX - pending.startX,
        clientY - pending.startY,
      );
      if (!draggingRef.current && delta < DRAG_THRESHOLD_PX) return;
      if (!draggingRef.current) {
        draggingRef.current = true;
        onDragStart(pending.shiftId);
      }
      const copy = point.ctrlKey || point.metaKey || point.shiftKey;
      lastPointRef.current = { clientX, clientY };
      const target = resolveTargetAtPoint(
        { clientX, clientY, copy },
        pending.shiftId,
      );
      // A target with no colour (null), the shift's own cell, is not
      // highlighted at all.
      const shown = target?.targetStatus === null ? null : target;
      scheduleDragState({
        activeShiftId: pending.shiftId,
        label: resolveLabel(pending.shiftId),
        pointerX: clientX,
        pointerY: clientY,
        previewWidth: pending.previewWidth,
        previewHeight: pending.previewHeight,
        grabX: pending.grabX,
        grabY: pending.grabY,
        targetKey: shown?.targetKey ?? null,
        targetLocationId: shown?.locationId ?? null,
        targetDate: shown?.date ?? null,
        targetStatus:
          shown?.targetStatus ??
          (shown ? (shown.allowed ? "allowed" : "blocked") : null),
        reason: target?.allowed === false ? (target.shortReason ?? target.reason ?? null) : null,
        copy,
      });
    },
    [onDragStart, resolveLabel, resolveTargetAtPoint, scheduleDragState],
  );

  useEffect(() => {
    if (!enabled) {
      clearSession(false);
      return undefined;
    }
    const handlePointerMove = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (
        !pending ||
        (pending.pointerId !== null && event.pointerId !== pending.pointerId)
      )
        return;
      if (pending.touch) {
        const far = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > TOUCH_SLOP_PX;
        // Moving before the hold ends is a scroll: let the page have it.
        if (!pending.touch.lifted) {
          if (far) clearSession(false);
          return;
        }
        if (far) pending.touch.moved = true;
      }
      updateDragAtPoint({
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      });
      event.preventDefault();
    };
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      if (!pendingRef.current || pendingRef.current.pointerId !== null) return;
      updateDragAtPoint({
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      });
      event.preventDefault();
    };
    const handlePointerUp = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (
        !pending ||
        (pending.pointerId !== null && event.pointerId !== pending.pointerId)
      )
        return;
      if (pending.touch && !pending.touch.moved) {
        // A tap stays a tap; a hold let go in place opens the card's menu,
        // as a right click does.
        const { element, lifted } = pending.touch;
        clearSession(lifted);
        if (lifted) openMenu(element, event.clientX, event.clientY);
        return;
      }
      const clientX = Number.isFinite(event.clientX)
        ? event.clientX
        : pending.startX;
      const clientY = Number.isFinite(event.clientY)
        ? event.clientY
        : pending.startY;
      const copy = event.ctrlKey || event.metaKey || event.shiftKey;
      if (!draggingRef.current) {
        const delta = Math.hypot(
          clientX - pending.startX,
          clientY - pending.startY,
        );
        if (delta >= DRAG_THRESHOLD_PX) {
          draggingRef.current = true;
          onDragStart(pending.shiftId);
        }
      }
      const target = draggingRef.current
        ? resolveTargetAtPoint({ clientX, clientY, copy }, pending.shiftId)
        : null;
      if (draggingRef.current) onDropAttempt(target);
      if (draggingRef.current && target?.allowed)
        onDrop({ ...target, copy });
      clearSession(draggingRef.current);
    };
    const handlePointerCancel = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (
        !pending ||
        (pending.pointerId !== null && event.pointerId !== pending.pointerId)
      )
        return;
      clearSession(draggingRef.current);
    };
    const handleMouseUp = (event: globalThis.MouseEvent) => {
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== null) return;
      const clientX = Number.isFinite(event.clientX)
        ? event.clientX
        : pending.startX;
      const clientY = Number.isFinite(event.clientY)
        ? event.clientY
        : pending.startY;
      const copy = event.ctrlKey || event.metaKey || event.shiftKey;
      if (!draggingRef.current) {
        const delta = Math.hypot(
          clientX - pending.startX,
          clientY - pending.startY,
        );
        if (delta >= DRAG_THRESHOLD_PX) {
          draggingRef.current = true;
          onDragStart(pending.shiftId);
        }
      }
      const target = draggingRef.current
        ? resolveTargetAtPoint({ clientX, clientY, copy }, pending.shiftId)
        : null;
      if (draggingRef.current) onDropAttempt(target);
      if (draggingRef.current && target?.allowed)
        onDrop({ ...target, copy });
      clearSession(draggingRef.current);
    };
    const handleModifier = (event: KeyboardEvent) => {
      if (!draggingRef.current || !lastPointRef.current || !["Control", "Shift", "Meta"].includes(event.key)) return;
      updateDragAtPoint({ ...lastPointRef.current, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey });
    };
    // A lifted card holds the page still, and the browser's own long-press
    // menu never opens over it.
    const handleTouchMove = (event: TouchEvent) => {
      if (pendingRef.current?.touch?.lifted) event.preventDefault();
    };
    const handleContextMenu = (event: globalThis.MouseEvent) => {
      if (!pendingRef.current?.touch || menuEventRef.current === event) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
    window.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("keydown", handleModifier, true);
    window.addEventListener("keyup", handleModifier, true);
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerCancel, true);
    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    return () => {
      window.removeEventListener("touchmove", handleTouchMove, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("keydown", handleModifier, true);
      window.removeEventListener("keyup", handleModifier, true);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerCancel, true);
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
    };
  }, [
    clearSession,
    enabled,
    openMenu,
    onDrop,
    onDropAttempt,
    resolveTargetAtPoint,
    updateDragAtPoint,
  ]);

  const startPendingDrag = useCallback(
    (
      shiftId: string,
      element: HTMLElement,
      clientX: number,
      clientY: number,
      pointerId: number | null,
      touch = false,
    ) => {
      const bounds =
        typeof element.getBoundingClientRect === "function"
          ? element.getBoundingClientRect()
          : { left: 0, top: 0, width: 126, height: 58 };
      const startX = Number.isFinite(clientX) ? clientX : 0;
      const startY = Number.isFinite(clientY) ? clientY : 0;
      pendingRef.current = {
        shiftId,
        pointerId,
        startX,
        startY,
        previewWidth: bounds.width,
        previewHeight: bounds.height,
        ...grabPoint(bounds, startX, startY),
        ...(touch ? { touch: { timer: null, lifted: false, moved: false, element } } : {}),
      };
    },
    [],
  );

  const onShiftPointerDown = useCallback(
    (shiftId: string, event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === "touch") {
        ignoreCompatibilityMouseUntilRef.current = Date.now() + LONG_PRESS_MS + 800;
        if (!enabled || event.altKey) return;
        startPendingDrag(shiftId, event.currentTarget, event.clientX, event.clientY,
          Number.isFinite(event.pointerId) ? event.pointerId : null, true);
        const pending = pendingRef.current;
        if (!pending?.touch) return;
        const touch = pending.touch;
        touch.timer = window.setTimeout(() => {
          touch.timer = null;
          if (pendingRef.current?.touch !== touch) return;
          touch.lifted = true;
          draggingRef.current = true;
          onDragStart(shiftId);
          navigator.vibrate?.(10);
          updateDragAtPoint({ clientX: pending.startX, clientY: pending.startY, ctrlKey: false, metaKey: false, shiftKey: false });
        }, LONG_PRESS_MS);
        // No preventDefault: a quick swipe still scrolls the grid.
        return;
      }
      if (
        !enabled ||
        !isPrimaryDragActivation(event.button, event.buttons) ||
        event.altKey
      )
        return;
      const pointerId = Number.isFinite(event.pointerId)
        ? event.pointerId
        : null;
      startPendingDrag(
        shiftId,
        event.currentTarget,
        event.clientX,
        event.clientY,
        pointerId,
      );
      if (pointerId !== null) {
        try {
          event.currentTarget.setPointerCapture?.(pointerId);
        } catch {
          // Some test/browser surfaces expose pointer events without capture support.
        }
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [enabled, onDragStart, startPendingDrag, updateDragAtPoint],
  );
  const onShiftMouseDown = useCallback(
    (shiftId: string, event: MouseEvent<HTMLElement>) => {
      if (Date.now() < ignoreCompatibilityMouseUntilRef.current) return;
      if (pendingRef.current && pendingRef.current.pointerId !== null) return;
      if (
        !enabled ||
        !isPrimaryDragActivation(event.button, event.buttons) ||
        event.altKey
      )
        return;
      startPendingDrag(
        shiftId,
        event.currentTarget,
        event.clientX,
        event.clientY,
        null,
      );
      event.preventDefault();
      event.stopPropagation();
    },
    [enabled, startPendingDrag],
  );

  return {
    dragState,
    onShiftPointerDown,
    onShiftMouseDown,
    endDrag: () => clearSession(false),
  };
}
