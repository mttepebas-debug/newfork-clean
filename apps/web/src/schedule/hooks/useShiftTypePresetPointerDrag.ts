import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type {
  PresetDragSource,
  PresetDragState,
  PresetDropEvaluation,
  PresetDropTarget,
} from "../components/SchedulePresetRows";
import {
  isPrimaryDragActivation,
  shiftDropTargetKey,
} from "../lib/scheduleDragTargets";

export interface ResolvedPresetDropTarget
  extends PresetDropTarget,
    PresetDropEvaluation {
  readonly targetKey: string;
}

export function useShiftTypePresetPointerDrag({
  enabled,
  evaluateTarget,
  onDropAttempt,
  onDrop,
}: {
  readonly enabled: boolean;
  readonly evaluateTarget: (target: PresetDropTarget) => PresetDropEvaluation;
  readonly onDropAttempt: (target: ResolvedPresetDropTarget | null) => void;
  readonly onDrop: (
    target: PresetDropTarget,
    point: { readonly clientX: number; readonly clientY: number },
  ) => void;
}): {
  readonly dragState: PresetDragState | null;
  readonly onPresetPointerDown: (
    preset: PresetDragSource,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  readonly onPresetMouseDown: (
    preset: PresetDragSource,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
} {
  const [dragState, setDragState] = useState<PresetDragState | null>(null);
  const pendingRef = useRef<
    | (PresetDragSource & {
        readonly pointerId: number | null;
        readonly startX: number;
        readonly startY: number;
        readonly previewWidth: number;
        readonly previewHeight: number;
      })
    | null
  >(null);
  const draggingRef = useRef(false);
  const currentTargetRef = useRef<ResolvedPresetDropTarget | null>(null);
  const clickSuppressorRef = useRef<
    ((event: globalThis.MouseEvent) => void) | null
  >(null);
  const clearSessionRef = useRef<(suppressClick: boolean) => void>(() => {});

  const clearClickSuppressor = useCallback(() => {
    const suppressor = clickSuppressorRef.current;
    if (!suppressor) return;
    window.removeEventListener("click", suppressor, true);
    clickSuppressorRef.current = null;
  }, []);

  const clearSession = useCallback(
    (suppressClick: boolean) => {
      pendingRef.current = null;
      currentTargetRef.current = null;
      draggingRef.current = false;
      setDragState(null);
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
    [clearClickSuppressor],
  );

  useEffect(() => clearClickSuppressor, [clearClickSuppressor]);
  useEffect(() => {
    clearSessionRef.current = clearSession;
  }, [clearSession]);
  useEffect(() => () => clearSessionRef.current(false), []);

  const resolveTargetAtPoint = useCallback(
    (
      point: { readonly clientX: number; readonly clientY: number },
      pending: PresetDragSource,
    ): ResolvedPresetDropTarget | null => {
      const hit = document.elementFromPoint(point.clientX, point.clientY);
      const cell =
        hit instanceof HTMLElement
          ? hit.closest<HTMLElement>(
              "[data-preset-drop-cell='true'],[data-drop-cell='true']",
            )
          : null;
      if (!cell?.dataset.locationId || !cell.dataset.date) return null;
      const employeeId =
        cell.dataset.unassignedCell === "true"
          ? null
          : (cell.dataset.employeeId || null);
      const target = {
        ...pending,
        employeeId,
        locationId: cell.dataset.locationId,
        date: cell.dataset.date,
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
    (point: { readonly clientX: number; readonly clientY: number }): void => {
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
      if (!draggingRef.current && delta < 6) return;
      draggingRef.current = true;
      const target = resolveTargetAtPoint({ clientX, clientY }, pending);
      currentTargetRef.current = target;
      setDragState({
        jobId: pending.jobId,
        shiftTypeId: pending.shiftTypeId,
        label: pending.label,
        color: pending.color,
        startTime: pending.startTime,
        endTime: pending.endTime,
        pointerX: clientX,
        pointerY: clientY,
        previewWidth: pending.previewWidth,
        previewHeight: pending.previewHeight,
        targetKey: target?.targetKey ?? null,
        targetStatus:
          target?.targetStatus ??
          (target ? (target.allowed ? "allowed" : "blocked") : null),
        reason: target?.allowed === false ? (target.reason ?? null) : null,
      });
    },
    [resolveTargetAtPoint],
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
      updateDragAtPoint({ clientX: event.clientX, clientY: event.clientY });
      event.preventDefault();
    };
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      if (!pendingRef.current) return;
      updateDragAtPoint({ clientX: event.clientX, clientY: event.clientY });
      event.preventDefault();
    };
    const finishDrag = (clientX: number, clientY: number) => {
      const pending = pendingRef.current;
      if (!pending) return;
      if (!draggingRef.current) {
        const delta = Math.hypot(
          clientX - pending.startX,
          clientY - pending.startY,
        );
        if (delta >= 6) draggingRef.current = true;
      }
      const target = draggingRef.current
        ? (resolveTargetAtPoint({ clientX, clientY }, pending) ??
          currentTargetRef.current)
        : null;
      if (draggingRef.current) onDropAttempt(target);
      if (draggingRef.current && target?.allowed)
        onDrop(target, { clientX, clientY });
      clearSession(draggingRef.current);
    };
    const handlePointerUp = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (
        !pending ||
        (pending.pointerId !== null && event.pointerId !== pending.pointerId)
      )
        return;
      finishDrag(event.clientX, event.clientY);
    };
    const handlePointerCancel = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (
        !pending ||
        (pending.pointerId !== null && event.pointerId !== pending.pointerId)
      )
        return;
      clearSession(false);
    };
    const handleMouseUp = (event: globalThis.MouseEvent) => {
      if (!pendingRef.current) return;
      finishDrag(event.clientX, event.clientY);
    };
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerCancel, true);
    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", handlePointerCancel, true);
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mouseup", handleMouseUp, true);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerCancel, true);
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handlePointerCancel, true);
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("mouseup", handleMouseUp, true);
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
      preset: PresetDragSource,
      element: HTMLElement,
      clientX: number,
      clientY: number,
      pointerId: number | null,
    ) => {
      const bounds =
        typeof element.getBoundingClientRect === "function"
          ? element.getBoundingClientRect()
          : { width: 126, height: 28 };
      pendingRef.current = {
        ...preset,
        pointerId,
        startX: Number.isFinite(clientX) ? clientX : 0,
        startY: Number.isFinite(clientY) ? clientY : 0,
        previewWidth: bounds.width,
        previewHeight: bounds.height,
      };
    },
    [],
  );

  const onPresetPointerDown = useCallback(
    (preset: PresetDragSource, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (
        !enabled ||
        !isPrimaryDragActivation(event.button, event.buttons) ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const pointerId = Number.isFinite(event.pointerId)
        ? event.pointerId
        : null;
      startPendingDrag(
        preset,
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

  const onPresetMouseDown = useCallback(
    (preset: PresetDragSource, event: MouseEvent<HTMLButtonElement>) => {
      if (
        !enabled ||
        !isPrimaryDragActivation(event.button, event.buttons) ||
        event.shiftKey ||
        event.altKey
      )
        return;
      startPendingDrag(
        preset,
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

  return { dragState, onPresetPointerDown, onPresetMouseDown };
}
