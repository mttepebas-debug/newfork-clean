// Stands in for apps/web/src/schedule/components/ShiftQuickEditor on the test
// page: main's own window ("Original (main)") or the new one, whichever the
// "Test page" menu has chosen. Pasting a shift always uses main's window.
import { ShiftQuickEditor as Original } from "../../../src/schedule/components/ShiftQuickEditor";
import { windowKind, type EditorProps } from "./brain";
import { NewShiftWindow } from "./pro";
import { useChoices } from "./store";
import "./pro.css";

export { formatShiftNoteRemaining, shiftNoteMaxLength } from "../../../src/schedule/components/ShiftQuickEditor";

export function ShiftQuickEditor(props: EditorProps) {
  const choices = useChoices();
  if (choices.window === "main" || windowKind(props.state) === "paste") return <Original {...props} />;
  return <NewShiftWindow props={props} />;
}
