import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  isPrimaryDragActivation,
  shiftDropTargetKey,
} from "../lib/scheduleDragTargets";

const DRAG_THRESHOLD_PX = 6;

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
      scheduleDragState({
        activeShiftId: pending.shiftId,
        label: resolveLabel(pending.shiftId),
        pointerX: clientX,
        pointerY: clientY,
        previewWidth: pending.previewWidth,
        previewHeight: pending.previewHeight,
        targetKey: target?.targetKey ?? null,
        targetLocationId: target?.locationId ?? null,
        targetDate: target?.date ?? null,
        targetStatus:
          target?.targetStatus ??
          (target ? (target.allowed ? "allowed" : "blocked") : null),
        reason: target?.allowed === false ? (target.reason ?? null) : null,
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
    window.addEventListener("keydown", handleModifier, true);
    window.addEventListener("keyup", handleModifier, true);
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerCancel, true);
    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    return () => {
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
    ) => {
      const bounds =
        typeof element.getBoundingClientRect === "function"
          ? element.getBoundingClientRect()
          : { width: 126, height: 58 };
      pendingRef.current = {
        shiftId,
        pointerId,
        startX: Number.isFinite(clientX) ? clientX : 0,
        startY: Number.isFinite(clientY) ? clientY : 0,
        previewWidth: bounds.width,
        previewHeight: bounds.height,
      };
    },
    [],
  );

  const onShiftPointerDown = useCallback(
    (shiftId: string, event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === "touch") {
        ignoreCompatibilityMouseUntilRef.current = Date.now() + 800;
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
    [enabled, startPendingDrag],
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
