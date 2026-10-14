// Variant B's on-grid preview: the template's shifts drawn faded into the real
// Schedule grid's cells, and the cards a Replace would remove crossed out.
// The grid is the app's own React tree, so the preview paints plain DOM into
// it and repaints whenever the grid redraws.
import { useEffect, useState } from "react";
import type { GhostShift } from "./shared";

const GHOST_LAYER = "tpl-ghosts";

function clock(value: string): string {
  const [hours, minutes] = value.split(":").map(Number) as [number, number];
  const suffix = hours >= 12 && hours < 24 ? "PM" : "AM";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function cellFor(ghost: GhostShift): HTMLElement | null {
  const where = `[data-date="${ghost.scheduled_date}"][data-location-id="${ghost.location_id}"]`;
  return document.querySelector<HTMLElement>(ghost.employee_id
    ? `.schedule-cell${where}[data-employee-id="${ghost.employee_id}"]`
    : `.schedule-cell${where}[data-unassigned-cell="true"]`);
}

function clear(): void {
  document.querySelectorAll(`.${GHOST_LAYER}`).forEach((node) => node.remove());
  document.querySelectorAll("[data-tpl-remove]").forEach((node) => node.removeAttribute("data-tpl-remove"));
}

/** Paints the preview; returns how many template shifts have no row on screen. */
function paint(added: readonly GhostShift[], removedIds: readonly string[]): number {
  clear();
  let hidden = 0;
  const byCell = new Map<HTMLElement, GhostShift[]>();
  for (const ghost of added) {
    const cell = cellFor(ghost);
    if (!cell) { hidden += 1; continue; }
    byCell.set(cell, [...(byCell.get(cell) ?? []), ghost]);
  }
  for (const [cell, ghosts] of byCell) {
    const layer = document.createElement("div");
    layer.className = GHOST_LAYER;
    layer.setAttribute("aria-hidden", "true");
    for (const ghost of ghosts) {
      const card = document.createElement("div");
      card.className = `tpl-ghost${ghost.converted ? " is-converted" : ""}`;
      card.style.setProperty("--shift-color", ghost.color);
      const title = document.createElement("strong");
      title.textContent = ghost.title;
      const time = document.createElement("span");
      time.textContent = `${clock(ghost.start_time)} - ${clock(ghost.end_time)}`;
      card.append(title, time);
      if (ghost.converted) {
        const note = document.createElement("em");
        note.textContent = ghost.was_name ? `Was ${ghost.was_name}` : "Was assigned";
        card.append(note);
      }
      layer.append(card);
    }
    cell.append(layer);
  }
  for (const id of removedIds) {
    document.querySelectorAll(`[data-shift-id="${id}"]`).forEach((node) => node.setAttribute("data-tpl-remove", "true"));
  }
  return hidden;
}

export function useGridPreview(added: readonly GhostShift[] | null, removedIds: readonly string[] | null): { hidden: number } {
  const [hidden, setHidden] = useState(0);
  useEffect(() => {
    if (!added) { clear(); setHidden(0); return; }
    const grid = document.querySelector(".schedule-page") ?? document.body;
    let frame = 0;
    const observer = new MutationObserver((records) => {
      // Our own paint is not a reason to paint again.
      const ours = records.every((record) => [...record.addedNodes, ...record.removedNodes].every((node) =>
        node instanceof HTMLElement && node.classList.contains(GHOST_LAYER)) && record.type === "childList");
      if (ours || frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        observer.disconnect();
        setHidden(paint(added, removedIds ?? []));
        observer.observe(grid, { childList: true, subtree: true });
      });
    });
    setHidden(paint(added, removedIds ?? []));
    // Bring the first change into view; the grid scrolls sideways by location.
    document.querySelector(".tpl-ghost, [data-tpl-remove]")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    observer.observe(grid, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      clear();
    };
  }, [added, removedIds]);
  return { hidden };
}
