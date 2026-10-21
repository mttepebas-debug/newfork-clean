import { Button } from "@newfork/ui";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  isScheduleLayerTarget,
  isTextEditingTarget,
} from "../lib/scheduleInteractionTargets";
import "./schedule-search.css";

const SEARCH_DELAY_MS = 150;

/**
 * The manager Schedule's search (KARARLAR S-228 (2)): "/" focuses it, Esc
 * clears it and, once empty, leaves it. Typing reaches the address after a
 * short pause, so the grid narrows once per word rather than per key.
 */
export function ScheduleSearchField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const sentRef = useRef(value);
  // The page hands a new function every render; the pause must not restart.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // A change from elsewhere (Clear search, the back button) replaces the
  // draft; our own, sent a moment ago, never overwrites newer typing.
  useEffect(() => {
    if (value === sentRef.current) return;
    sentRef.current = value;
    setDraft(value);
  }, [value]);
  useEffect(() => {
    if (draft === sentRef.current) return undefined;
    const timer = window.setTimeout(() => {
      sentRef.current = draft;
      onChangeRef.current(draft);
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    const focusOnSlash = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextEditingTarget(event.target) || isScheduleLayerTarget(event.target)) return;
      if (document.querySelector("[aria-modal='true']")) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", focusOnSlash);
    return () => window.removeEventListener("keydown", focusOnSlash);
  }, []);
  const clear = () => {
    setDraft("");
    sentRef.current = "";
    onChange("");
  };

  return (
    <label className="schedule-search" data-has-value={draft ? "true" : undefined}>
      <Search size={15} aria-hidden />
      <input
        ref={inputRef}
        type="search"
        aria-label="Search the schedule"
        placeholder="Search people, jobs, shifts"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (draft) clear();
          else event.currentTarget.blur();
        }}
      />
      {draft ? (
        <button
          type="button"
          className="schedule-search-clear"
          aria-label="Clear search"
          title="Clear search"
          onClick={() => {
            clear();
            inputRef.current?.focus();
          }}
        >
          <X size={14} aria-hidden />
        </button>
      ) : (
        <kbd className="schedule-search-key" aria-hidden title="Press / to search">
          /
        </kbd>
      )}
    </label>
  );
}

/** No one left on the grid (S-228 (3)): say so above it, with the way back. */
export function ScheduleSearchEmpty({
  term,
  matchesOutsideFilters,
  onClear,
  onShowAllFilters,
}: {
  readonly term: string;
  readonly matchesOutsideFilters: boolean;
  readonly onClear: () => void;
  readonly onShowAllFilters: () => void;
}) {
  return (
    <div className="schedule-search-empty" role="status">
      <strong>No one matches “{term}”.</strong>
      {matchesOutsideFilters ? (
        <span>Someone matches outside your filters.</span>
      ) : null}
      <div className="schedule-search-empty-actions">
        <Button className="secondary-button" onClick={onClear}>
          Clear search
        </Button>
        {matchesOutsideFilters ? (
          <Button onClick={onShowAllFilters}>Show all filters</Button>
        ) : null}
      </div>
    </div>
  );
}
