// Small pieces the prototypes share: the prototype data route, number and time
// words, and a layer anchored under a top-bar button.
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const BASE = import.meta.env.VITE_API_URL as string;

export async function call<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { headers: { Authorization: "Bearer demo" } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error((body as { error?: string } | null)?.error ?? "Request failed");
  return body as T;
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: "Bearer demo", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data as { error?: string } | null)?.error ?? "Request failed");
  return data as T;
}

export interface ScheduleFacts {
  readonly shift_count: number;
  readonly open_shift_count: number;
  readonly employee_count: number;
  readonly hours: number;
  readonly location_ids: readonly string[];
  readonly by_location: readonly { location_id: string; shift_count: number; employee_count: number }[];
}
export interface ScheduleList {
  readonly week_start: string;
  readonly locations: readonly { id: string; name: string; color: string }[];
  readonly published: (ScheduleFacts & { published_at: string; published_by_name: string }) | null;
  readonly drafts: readonly (ScheduleFacts & { id: string; updated_by_name: string })[];
}

/** GET /prototype/schedule-list: not in the real API yet (see README). */
export function useScheduleList(weekStart: string | null, refresh: unknown = null): ScheduleList | null {
  const [list, setList] = useState<ScheduleList | null>(null);
  useEffect(() => {
    let alive = true;
    void call<ScheduleList>(`/prototype/schedule-list${weekStart ? `?week_start=${weekStart}` : ""}`)
      .then((data) => alive && setList(data))
      .catch(() => alive && setList(null));
    return () => {
      alive = false;
    };
  }, [weekStart, refresh]);
  return list;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function hoursText(hours: number): string {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

export function ago(isoTime: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(isoTime)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function shortDateTime(isoTime: string): string {
  return new Date(isoTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** A layer fixed under a top-bar button; follows it on resize and scroll. */
export function Anchored({ selector, align = "right", width, children, className }: {
  readonly selector: string;
  readonly align?: "left" | "right";
  readonly width: number;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const anchor = document.querySelector(selector);
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const wanted = align === "right" ? rect.right - width : rect.left;
      setBox({ top: rect.bottom + 6, left: Math.max(8, Math.min(wanted, window.innerWidth - width - 8)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [align, selector, width]);
  if (!box) return null;
  return createPortal(
    <div className={className} style={{ position: "fixed", top: box.top, left: box.left, width: Math.min(width, window.innerWidth - 16), zIndex: 1200 }}>
      {children}
    </div>,
    document.body,
  );
}
