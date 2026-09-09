// Keep focus restoration intact, but do not turn Escape into a visual selection.
export function installEscapeFocus(win: Window, doc: Document) {
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape")
      doc.documentElement.dataset.escapeFocus = "true";
    else if (!["Shift", "Control", "Alt", "Meta"].includes(event.key))
      delete doc.documentElement.dataset.escapeFocus;
  };
  const pointerdown = () => {
    delete doc.documentElement.dataset.escapeFocus;
  };
  win.addEventListener("keydown", keydown, true);
  win.addEventListener("pointerdown", pointerdown, true);
  return () => {
    win.removeEventListener("keydown", keydown, true);
    win.removeEventListener("pointerdown", pointerdown, true);
    delete doc.documentElement.dataset.escapeFocus;
  };
}
