// Keep focus restoration intact, but do not turn Escape into a visual selection.
// BL-899: also marks whether the last input came from the keyboard, so a
// drawer opened from the keyboard keeps its first focus ring.
// Mert's phone notes 2026-10-17 #3: also marks a finger in use, so a sheet
// that takes focus as it opens draws no ring under a tap (styles.css). The
// screen's keyboard typing in a field keeps the mark; a physical keyboard
// (Tab, or a key outside a field) takes it away and the rings come back.
const editable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input, textarea, select"));

export function installEscapeFocus(win: Window, doc: Document) {
  const keydown = (event: KeyboardEvent) => {
    doc.documentElement.dataset.keyboardInput = "true";
    if (event.key === "Tab" || !editable(event.target))
      delete doc.documentElement.dataset.touchInput;
    if (event.key === "Escape")
      doc.documentElement.dataset.escapeFocus = "true";
    else if (!["Shift", "Control", "Alt", "Meta"].includes(event.key))
      delete doc.documentElement.dataset.escapeFocus;
  };
  const pointerdown = (event: Event) => {
    delete doc.documentElement.dataset.escapeFocus;
    delete doc.documentElement.dataset.keyboardInput;
    const type = (event as PointerEvent).pointerType;
    if (type === "touch" || type === "pen")
      doc.documentElement.dataset.touchInput = "true";
    else delete doc.documentElement.dataset.touchInput;
  };
  win.addEventListener("keydown", keydown, true);
  win.addEventListener("pointerdown", pointerdown, true);
  return () => {
    win.removeEventListener("keydown", keydown, true);
    win.removeEventListener("pointerdown", pointerdown, true);
    delete doc.documentElement.dataset.escapeFocus;
    delete doc.documentElement.dataset.keyboardInput;
    delete doc.documentElement.dataset.touchInput;
  };
}
