// The address is the state (BEHAVIOR §1.2). Filter keys keep the order they
// were applied in: setting one deletes it and appends it again, so it
// becomes the newest, and Escape peels the newest first (rule 3, 111).
import type { ViewMode } from "./model";

export const FILTER_KEYS = ["hideUnscheduled", "locations", "shiftTypes", "jobs", "employees", "q"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export const FOCUS_KEYS = ["shiftTypes", "jobs", "employees"] as const;

export type UrlState = {
  date: string | null;
  view: ViewMode;
  layout: "separate" | "unified";
  hideUnscheduled: boolean;
  locations: string[];
  shiftTypes: string[];
  jobs: string[];
  employees: string[];
  q: string;
  editing: boolean;
  /** Filter keys present, oldest first. */
  filterOrder: FilterKey[];
};

const list = (value: string | null) => (value ? value.split(",").filter(Boolean) : []);

export function readUrl(params: URLSearchParams): UrlState {
  const filterOrder: FilterKey[] = [];
  for (const key of params.keys()) {
    if ((FILTER_KEYS as readonly string[]).includes(key) && !filterOrder.includes(key as FilterKey)) {
      filterOrder.push(key as FilterKey);
    }
  }
  const date = params.get("date");
  return {
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    view: params.get("view") === "day" ? "day" : "week",
    layout: params.get("layout") === "unified" ? "unified" : "separate",
    hideUnscheduled: params.get("hideUnscheduled") === "true",
    locations: list(params.get("locations")),
    shiftTypes: list(params.get("shiftTypes")),
    jobs: list(params.get("jobs")),
    employees: list(params.get("employees")),
    q: params.get("q") ?? "",
    editing: params.get("mode") === "edit",
    filterOrder: filterOrder.filter((key) => key !== "hideUnscheduled" || params.get(key) === "true"),
  };
}

/** A small builder so every change reads as one sentence. */
export class UrlDraft {
  readonly params: URLSearchParams;
  constructor(source: URLSearchParams) {
    this.params = new URLSearchParams(source);
  }
  set(key: string, value: string | string[] | null | boolean) {
    this.params.delete(key);
    if (value === null || value === false) return this;
    if (Array.isArray(value)) {
      if (value.length) this.params.append(key, value.join(","));
      return this;
    }
    this.params.append(key, value === true ? "true" : value);
    return this;
  }
  drop(...keys: string[]) {
    for (const key of keys) this.params.delete(key);
    return this;
  }
}
