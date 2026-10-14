// Stands in for apps/web/src/schedule/components/ShiftQuickEditor on the test
// page: main's own window ("Original (main)") or one of the five families,
// whichever the "Test page" menu has chosen for this window. Pasting a shift
// always uses main's window (not part of items 12–14).
import { useEffect } from "react";
import { ShiftQuickEditor as Original } from "../../../src/schedule/components/ShiftQuickEditor";
import { useShiftEditorBrain, windowKind, type EditorProps } from "./brain";
import { FamilyCompact, FamilyGrow, FamilyKeyboard, FamilySidePanel, FamilyTimeline, type FamilyProps } from "./families";
import { useChoices, type CellMark, type WindowVariant } from "./store";
import "./editor.css";

export { formatShiftNoteRemaining, shiftNoteMaxLength } from "../../../src/schedule/components/ShiftQuickEditor";

export function ShiftQuickEditor(props: EditorProps) {
  const choices = useChoices();
  const kind = windowKind(props.state);
  const variant: WindowVariant = kind === "edit" ? choices.edit : kind === "add" ? choices.add : kind === "addUnassigned" ? choices.addUnassigned : "main";
  useCellMark(kind === "edit" && props.state.mode === "edit" ? props.state.shift.id : null, choices.cellMark);
  // A new family mounts fresh when the menu changes while the window is open.
  if (variant === "main") return <Original {...props} />;
  return <Family key={variant} variant={variant} props={props} />;
}

function Family({ variant, props }: { readonly variant: Exclude<WindowVariant, "main">; readonly props: EditorProps }) {
  const brain = useShiftEditorBrain(props);
  const familyProps: FamilyProps = { brain, props, format: props.timeFormat };
  if (variant === "1") return <FamilyCompact {...familyProps} />;
  if (variant === "2") return <FamilySidePanel {...familyProps} />;
  if (variant === "3") return <FamilyKeyboard {...familyProps} />;
  if (variant === "4") return <FamilyTimeline {...familyProps} />;
  return <FamilyGrow {...familyProps} />;
}

/** Item 11: how the shift whose Edit shift window is open is marked on the grid. */
function useCellMark(shiftId: string | null, mark: CellMark) {
  useEffect(() => {
    if (!shiftId || mark === "main") return undefined;
    const badge = `[data-shift-badge="true"][data-shift-id="${shiftId}"]:not([data-ghost="true"])`;
    const style = document.createElement("style");
    style.dataset.stCellMark = mark;
    style.textContent = cellMarkCss(mark, badge, shiftId);
    document.head.append(style);
    return () => style.remove();
  }, [shiftId, mark]);
}

function cellMarkCss(mark: Exclude<CellMark, "main">, badge: string, shiftId: string): string {
  const cell = `.schedule-cell:has(${badge})`;
  if (mark === "pulse") {
    return `
      ${badge} { z-index: 3; }
      ${cell} { background: color-mix(in srgb, var(--theme-accent) 6%, transparent); transition: background .3s ease; }
      @media (prefers-reduced-motion: no-preference) {
        ${badge} { animation: stx-mark-pulse 1.8s ease-in-out infinite; }
      }
      @media (prefers-reduced-motion: reduce) {
        ${badge} { box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 30%, transparent); }
      }`;
  }
  if (mark === "spotlight") {
    return `
      [data-shift-badge="true"] { transition: opacity .25s ease, filter .25s ease, transform .25s ease, box-shadow .25s ease; }
      [data-shift-badge="true"]:not([data-shift-id="${shiftId}"]), [data-shift-badge="true"][data-ghost="true"] { opacity: .45; filter: saturate(.55); }
      ${badge} { z-index: 4; transform: translateY(-2px) scale(1.03); box-shadow: 0 10px 22px rgb(23 34 30 / .2), 0 0 0 2px var(--theme-surface); }
      ${cell} { background: var(--theme-surface); }
      @media (prefers-reduced-motion: reduce) {
        [data-shift-badge="true"] { transition: none; }
        ${badge} { transform: none; }
      }`;
  }
  return `
    ${badge} .schedule-shift-selection-ring {
      box-shadow: none;
      --ant: color-mix(in srgb, var(--shift-color) 55%, #173e34);
      background:
        linear-gradient(90deg, var(--ant) 55%, transparent 0) repeat-x 0 0 / 10px 2px,
        linear-gradient(90deg, var(--ant) 55%, transparent 0) repeat-x 0 100% / 10px 2px,
        linear-gradient(0deg, var(--ant) 55%, transparent 0) repeat-y 0 0 / 2px 10px,
        linear-gradient(0deg, var(--ant) 55%, transparent 0) repeat-y 100% 0 / 2px 10px;
    }
    @media (prefers-reduced-motion: no-preference) {
      ${badge} .schedule-shift-selection-ring { animation: stx-mark-ants .7s linear infinite; }
    }`;
}
