import { useCallback, useEffect, useRef, useState } from "react";

/** Serializes draft writes so a slow response never overwrites newer typing. */
export function useLineupAutosave<T>({
  value,
  save,
  validate = () => "",
  enabled = true,
}: {
  value: T;
  save: (value: T) => Promise<void>;
  validate?: (value: T) => string;
  enabled?: boolean;
}) {
  const key = JSON.stringify(value);
  const saved = useRef(key);
  const latest = useRef({ value, key, save, validate, enabled });
  latest.current = { value, key, save, validate, enabled };
  const pending = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);
  const [state, setState] = useState({
    saving: false,
    error: "",
    savedKey: key,
    hasSaved: false,
  });
  const update = useCallback((patch: Partial<typeof state>) => {
    if (mounted.current) setState((old) => ({ ...old, ...patch }));
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const flush = useCallback(
    (force = false): Promise<boolean> => {
      if (pending.current) return pending.current;
      const write = async () => {
        while (
          mounted.current &&
          latest.current.enabled &&
          (force || latest.current.key !== saved.current)
        ) {
          const next = latest.current;
          const invalid = next.validate(next.value);
          if (invalid) {
            update({ error: invalid });
            return false;
          }
          update({ saving: true, error: "" });
          try {
            await next.save(next.value);
            saved.current = next.key;
            update({ savedKey: next.key, hasSaved: true });
            force = false;
          } catch (error) {
            update({
              error:
                error instanceof Error
                  ? error.message
                  : "Could not save. Your changes are still here.",
            });
            return false;
          }
        }
        return true;
      };
      pending.current = write().finally(() => {
        pending.current = null;
        update({ saving: false });
      });
      return pending.current;
    },
    [update],
  );
  useEffect(() => {
    if (!enabled || key === saved.current) return;
    // A failed write is retried only after another edit or an explicit retry.
    const timer = window.setTimeout(() => {
      if (!latest.current.validate(latest.current.value)) void flush();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [key, enabled, flush]);
  const dirty = enabled && key !== state.savedKey;
  useEffect(() => {
    if (!dirty && !state.saving) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, state.saving]);
  return { ...state, dirty, flush };
}

export function LineupSaveStatus({
  state,
  onDiscard,
}: {
  state: {
    saving: boolean;
    dirty: boolean;
    error: string;
    hasSaved: boolean;
    flush: () => Promise<boolean>;
  };
  onDiscard?: () => void;
}) {
  return state.error ? (
    <div className="lu-error" role="alert">
      <p>{state.error} Your changes are still here.</p>
      <button
        type="button"
        className="nf-button secondary"
        disabled={state.saving}
        onClick={() => void state.flush()}
      >
        Retry save
      </button>
      {onDiscard ? (
        <button
          type="button"
          className="nf-button secondary"
          disabled={state.saving}
          onClick={onDiscard}
        >
          Discard unsaved changes
        </button>
      ) : null}
    </div>
  ) : (
    <p className="lu-field-help" role="status" aria-live="polite">
      {state.saving
        ? "Saving draft…"
        : state.dirty
          ? "Changes waiting to save…"
          : state.hasSaved
            ? "Draft saved · Share when the team is ready."
            : "Changes save automatically. Share when the team is ready."}
    </p>
  );
}
