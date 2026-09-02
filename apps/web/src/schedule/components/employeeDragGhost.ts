import type { DragEvent } from "react";

export function attachEmployeeDragGhost(
  event: DragEvent,
  name: string,
  accentColor: string | null,
): void {
  const color = accentColor ?? "#e0e7ff";
  const border = accentColor ?? "#6366f1";
  const ghost = document.createElement("div");

  ghost.style.cssText = [
    "position:fixed",
    "top:-9999px",
    "left:-9999px",
    "padding:6px 12px",
    `border:1px solid ${border}`,
    "border-radius:6px",
    "background:#1a1a2a",
    `color:${color}`,
    "font-size:12px",
    "font-weight:700",
    "font-family:inherit",
  ].join(";");
  ghost.innerText = `👤 ${name}`;
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(
    ghost,
    ghost.offsetWidth / 2,
    ghost.offsetHeight / 2,
  );
  window.setTimeout(() => ghost.remove(), 0);
  event.dataTransfer.effectAllowed = "copy";
}
