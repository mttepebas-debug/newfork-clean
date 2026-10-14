import type {
  ScheduleDraftSummary,
  ScheduleEditSession,
  ScheduleReadModel,
  ScheduleTemplateSummary,
} from "@newfork/shared/schedule";
import { ConfirmButton, useConfirmClick } from "@newfork/ui";
import { ArrowLeft, CalendarCheck2, CalendarDays, FilePlus2, Layers, MoreHorizontal, Pencil, TextCursorInput, Trash2 } from "lucide-react";
import { type JSX, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { requestErrorText } from "../../lib/request-error";
import { scheduleRefusalReason } from "../lib/scheduleRefusalReason";
import { agoText, plural } from "./newScheduleWindowText";

export const TEMPLATE_NO_DEPARTMENT_KEY = "__no_department__";

export type NewScheduleTemplatesStep = { readonly kind: "list" } | { readonly kind: "use"; readonly templateId: string };

/** Where "Use" puts a template when no edit is open: a schedule of this week, or a new blank draft. */
export type TemplateUseTarget =
  | { readonly kind: "live" }
  | { readonly kind: "draft"; readonly draftId: string }
  | { readonly kind: "blank" };

export interface TemplateUseOption {
  readonly key: string;
  readonly label: string;
  readonly target: TemplateUseTarget;
  readonly live: boolean;
  readonly viewing: boolean;
}

export interface NewScheduleTemplatesProps {
  readonly templates: readonly ScheduleTemplateSummary[];
  readonly loading: boolean;
  /** Why the list did not load, with Retry; never shown as "No templates yet". */
  readonly loadError: string | null;
  readonly onRetry: () => void;
  /** Save template, Use, Rename and Delete; a role that only reads templates sees the list. */
  readonly canManage: boolean;
  readonly drafts: readonly ScheduleDraftSummary[];
  /** The open edit, if any: Use then goes straight to Add or Replace. */
  readonly session: ScheduleEditSession | null;
  readonly departments: ScheduleReadModel["departments"];
  /** The Save template form under the list; opened by the window's green button. */
  readonly saving: boolean;
  readonly onSavingChange: (saving: boolean) => void;
  /** The draft on screen, picked first in the Save template form. */
  readonly draftOnScreen: string | null;
  readonly step: NewScheduleTemplatesStep;
  readonly onStepChange: (step: NewScheduleTemplatesStep) => void;
  /** Schedules of this week a template can go into, and whether one can be opened for editing now. */
  readonly useOptions: readonly TemplateUseOption[];
  readonly canStartEdit: boolean;
  readonly onUseInto: (templateId: string, target: TemplateUseTarget) => void;
  readonly onCreate: (draftId: string, name: string, stripAssignments: boolean) => Promise<unknown>;
  readonly onRename: (template: ScheduleTemplateSummary, name: string) => Promise<unknown>;
  readonly onDelete: (template: ScheduleTemplateSummary) => Promise<unknown>;
  readonly onApply: (templateId: string, mode: "merge" | "overwrite", departmentKeys: readonly string[] | null) => Promise<unknown>;
  /** How many shifts Replace would remove, counted by the database. */
  readonly onPreviewReplace: (templateId: string, departmentKeys: readonly string[] | null) => Promise<number>;
}

/** The Templates tab of the New Schedule window: the list, Save template, and Use. */
export function NewScheduleTemplates(props: NewScheduleTemplatesProps): JSX.Element {
  const { step } = props;
  if (step.kind === "use") {
    const back = () => props.onStepChange({ kind: "list" });
    const template = props.templates.find((item) => item.id === step.templateId) ?? null;
    return (
      <>
        <button type="button" className="new-schedule-window-back" onClick={back}>
          <ArrowLeft size={15} aria-hidden />All templates
        </button>
        {!template ? (
          <p className="new-schedule-window-empty">This template is gone. Go back to the list.</p>
        ) : props.session ? (
          <UseInEdit {...props} template={template} />
        ) : (
          <UseTarget {...props} template={template} />
        )}
      </>
    );
  }
  return (
    <>
      <TemplateRows {...props} />
      {props.saving ? (
        <section className="new-schedule-window-section" aria-label="Save a draft as a template" ref={(node) => node?.scrollIntoView?.({ block: "nearest" })}>
          <h3>Save a draft as a template</h3>
          <SaveTemplate {...props} />
        </section>
      ) : null}
    </>
  );
}

function TemplateRows(props: NewScheduleTemplatesProps): JSX.Element {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const loadError = props.loadError ? (
    <p className="new-schedule-window-error" role="alert">
      {props.loadError}{" "}
      <button type="button" className="new-schedule-window-link" onClick={props.onRetry}>Retry</button>
    </p>
  ) : null;
  if (props.loading && !props.templates.length) return <p className="new-schedule-window-empty">Loading templates…</p>;
  if (loadError && !props.templates.length) return loadError;
  if (!props.templates.length) {
    return <p className="new-schedule-window-empty">No templates yet. Save a draft as a template to reuse its week.</p>;
  }
  const rename = (template: ScheduleTemplateSummary) => {
    setError(null);
    return props.onRename(template, name.trim()).then(() => setRenaming(null), (caught: unknown) => setError(templateMutationError(caught, "rename")));
  };
  // A failed delete says so in its toast (Schedule page); the row stays.
  const remove = (template: ScheduleTemplateSummary) => {
    setError(null);
    return props.onDelete(template).catch(() => undefined);
  };
  return (
    <>
      <ul className="new-schedule-window-rows is-templates">
        {props.templates.map((template) => (
          <li key={template.id} data-template-row>
            {renaming === template.id ? (
              <form
                className="new-schedule-window-rename"
                onSubmit={(event) => {
                  event.preventDefault();
                  void rename(template);
                }}
              >
                <label className="sr-only" htmlFor={`template-rename-${template.id}`}>Template name</label>
                <input id={`template-rename-${template.id}`} value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} />
                <button type="submit" className="nf-button new-schedule-window-button" disabled={!name.trim()}>Save</button>
                <button type="button" className="secondary-button new-schedule-window-button" onClick={() => setRenaming(null)}>Cancel</button>
              </form>
            ) : (
              <>
                <span className="new-schedule-window-name">
                  <Layers size={14} aria-hidden />
                  <b>{template.name}</b>
                  <small>{templateLine(template)}</small>
                </span>
                {props.canManage ? <>
                <button
                  type="button"
                  className="secondary-button new-schedule-window-button"
                  aria-label={`Use template ${template.name}`}
                  onClick={() => props.onStepChange({ kind: "use", templateId: template.id })}
                >
                  Use
                </button>
                <RowMenu label={`More for ${template.name}`}>
                  {(closeMenu) => (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          closeMenu();
                          setName(template.name);
                          setRenaming(template.id);
                        }}
                      >
                        <TextCursorInput size={14} aria-hidden />Rename
                      </button>
                      <ConfirmButton
                        unstyled
                        role="menuitem"
                        className="new-schedule-window-menu-danger"
                        aria-label={`Delete template ${template.name}`}
                        confirmName={`Confirm delete template ${template.name}`}
                        confirmLabel={<><Trash2 size={14} aria-hidden />Click again to delete</>}
                        onConfirm={() => {
                          closeMenu();
                          void remove(template);
                        }}
                      >
                        <Trash2 size={14} aria-hidden />Delete
                      </ConfirmButton>
                    </>
                  )}
                </RowMenu>
                </> : null}
              </>
            )}
          </li>
        ))}
      </ul>
      {error ? <p className="new-schedule-window-error" role="alert">{error}</p> : null}
      {loadError}
    </>
  );
}

/**
 * BL-1044: what a refused rename or delete says. The refusal's key, not any
 * 409 and not the server's words: another tab changed the template, or the
 * name is taken.
 */
export function templateMutationError(error: unknown, action: "rename" | "delete"): string {
  const body = (error as { body?: unknown } | null)?.body;
  if (body && typeof body === "object" && (body as { status?: unknown }).status === "name_taken") {
    return "A template with this name already exists.";
  }
  if (scheduleRefusalReason(error) === "schedule.template_changed") return "This template changed. Refresh and try again.";
  return action === "rename" ? "The template could not be renamed. Try again." : "The template could not be deleted.";
}

function templateLine(template: ScheduleTemplateSummary): string {
  return `${plural(template.shift_count, "shift")} · ${template.open_slot_count} open · saved by ${template.created_by_name}, ${agoText(template.updated_at)}`;
}

/**
 * A small menu next to its button. It sits on <body> so the window's scroll
 * never cuts it; the Schedule counts it as part of the window.
 */
function RowMenu({ label, children }: { readonly label: string; readonly children: (close: () => void) => ReactNode }): JSX.Element {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!at) return;
    const away = (event: PointerEvent) => {
      if (menu.current?.contains(event.target as Node) || button.current?.contains(event.target as Node)) return;
      setAt(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if ((event.target as Element | null)?.closest?.('[data-confirming="true"]')) return;
      // The menu closes first; the window stays.
      event.stopPropagation();
      setAt(null);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape, true);
    };
  }, [at]);
  useLayoutEffect(() => {
    if (at) menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [at]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="new-schedule-window-icon"
        aria-label={label}
        title="More"
        aria-haspopup="menu"
        aria-expanded={Boolean(at)}
        onClick={() => {
          if (at) return setAt(null);
          const rect = button.current!.getBoundingClientRect();
          setAt({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        }}
      >
        <MoreHorizontal size={15} aria-hidden />
      </button>
      {at
        ? createPortal(
            <div ref={menu} className="new-schedule-window-menu" role="menu" aria-label={label} style={{ top: at.top, right: at.right }}>
              {children(() => setAt(null))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function SaveTemplate(props: NewScheduleTemplatesProps): JSX.Element {
  const [draftId, setDraftId] = useState(
    props.drafts.some((draft) => draft.id === props.draftOnScreen) ? props.draftOnScreen! : (props.drafts[0]?.id ?? ""),
  );
  const [name, setName] = useState("");
  // BL-038 K3: a template keeps who works each shift unless asked not to.
  const [strip, setStrip] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="new-schedule-window-form"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        props
          .onCreate(draftId, name.trim(), strip)
          .then(
            () => {
              setName("");
              props.onSavingChange(false);
            },
            (caught: unknown) => setError(requestErrorText(caught)),
          )
          .finally(() => setPending(false));
      }}
    >
      <label>
        <span>Draft</span>
        <select value={draftId} onChange={(event) => setDraftId(event.target.value)}>
          <option value="">Select draft</option>
          {props.drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.name}</option>)}
        </select>
      </label>
      <label>
        <span>Template name</span>
        <input value={name} maxLength={80} required placeholder="Regular week" autoFocus onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="new-schedule-window-check">
        <input type="checkbox" checked={strip} onChange={(event) => setStrip(event.target.checked)} />
        Remove employee names (save as open shifts)
      </label>
      {error ? <p className="new-schedule-window-error" role="alert">{error}</p> : null}
      <div className="new-schedule-window-actions">
        <button type="button" className="secondary-button new-schedule-window-button" onClick={() => props.onSavingChange(false)}>Cancel</button>
        <button type="submit" className="nf-button new-schedule-window-button" disabled={pending || !draftId || !name.trim()}>
          {pending ? "Saving…" : "Save template"}
        </button>
      </div>
    </form>
  );
}

function templateWhat(template: ScheduleTemplateSummary): ReactNode {
  return <><b>{template.name}</b>: {plural(template.shift_count, "shift")}, {template.open_slot_count} open.</>;
}

/** Use while editing: Add keeps the schedule's shifts, Replace first removes the ones the template covers. */
function UseInEdit(props: NewScheduleTemplatesProps & { readonly template: ScheduleTemplateSummary }): JSX.Element {
  const { template, departments } = props;
  const options = useMemo(
    () => [
      ...departments.map((department) => ({ key: department.id, label: department.name })),
      ...(departments.length ? [{ key: TEMPLATE_NO_DEPARTMENT_KEY, label: "No department" }] : []),
    ],
    [departments],
  );
  // BL-038 K4: every department applies unless narrowed here.
  const [chosen, setChosen] = useState<readonly string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keys = chosen ?? options.map((option) => option.key);
  const keysForApply = keys.length === options.length ? null : keys;
  // With no departments there is nothing to narrow: the whole template applies.
  const noneChosen = options.length > 0 && !keys.length;
  const hasShifts = Boolean(props.session?.shifts.length);
  const apply = (mode: "merge" | "overwrite") => {
    setPending(true);
    setError(null);
    props.onApply(template.id, mode, keysForApply).then(
      () => setPending(false),
      (caught: unknown) => {
        setPending(false);
        setError(requestErrorText(caught));
      },
    );
  };
  return (
    <div className="new-schedule-window-use">
      <p>{templateWhat(template)} It goes into the schedule you are editing; employees see it after you publish.</p>
      {options.length ? (
        <details className="new-schedule-window-departments" data-apply-template-departments>
          <summary>Only some departments</summary>
          <div>
            {options.map((option) => (
              <label key={option.key}>
                <input
                  type="checkbox"
                  checked={keys.includes(option.key)}
                  onChange={() => setChosen(keys.includes(option.key) ? keys.filter((key) => key !== option.key) : [...keys, option.key])}
                />
                {option.label}
              </label>
            ))}
          </div>
          {!keys.length ? <p className="new-schedule-window-note">Select at least one department to apply.</p> : null}
        </details>
      ) : null}
      {hasShifts ? (
        <p className="new-schedule-window-note">This schedule already has shifts. Add keeps them; Replace first removes the ones this template covers that haven't started.</p>
      ) : null}
      {error ? <p className="new-schedule-window-error" role="alert">{error}</p> : null}
      <div className="new-schedule-window-actions is-start">
        {hasShifts ? (
          <ReplaceShiftsButton
            countRemoved={() => props.onPreviewReplace(template.id, keysForApply)}
            disabled={pending || noneChosen}
            onConfirm={() => apply("overwrite")}
          />
        ) : null}
        <button type="button" className="nf-button new-schedule-window-button" disabled={pending || noneChosen} onClick={() => apply("merge")}>
          {hasShifts ? "Add to current shifts" : "Apply template"}
        </button>
      </div>
    </div>
  );
}

/**
 * KK-162 (BL-694): Replace asks twice; its first click says what it removes.
 * The database counts it (the template's locations and departments, never a
 * started shift); without the count the warning still names what goes.
 */
function ReplaceShiftsButton({ countRemoved, disabled, onConfirm }: {
  readonly countRemoved: () => Promise<number>;
  readonly disabled: boolean;
  readonly onConfirm: () => void;
}): JSX.Element {
  const { armed, confirmProps } = useConfirmClick(onConfirm);
  const [removed, setRemoved] = useState<number | "counting" | "unknown">("counting");
  const countRemovedRef = useRef(countRemoved);
  countRemovedRef.current = countRemoved;
  useEffect(() => {
    if (!armed) return undefined;
    let current = true;
    setRemoved("counting");
    countRemovedRef.current().then(
      (count) => current && setRemoved(count),
      () => current && setRemoved("unknown"),
    );
    return () => {
      current = false;
    };
  }, [armed]);
  return (
    <>
      {armed ? (
        <span className="new-schedule-window-impact" role="status">
          {removed === "counting"
            ? "Counting the shifts it removes…"
            : removed === "unknown"
              ? "Shifts this template covers will be removed. Draft only, not published."
              : `${plural(removed, "shift")} will be removed. Draft only, not published.`}
        </span>
      ) : null}
      <button
        type="button"
        className={`new-schedule-window-button new-schedule-window-danger${armed ? " is-armed" : ""}`}
        disabled={disabled}
        data-confirming={armed}
        {...confirmProps}
      >
        {armed ? "Confirm replace" : "Replace current shifts"}
      </button>
    </>
  );
}

/** Use with no edit open: which schedule the template goes into. It opens for editing, then Add or Replace. */
function UseTarget(props: NewScheduleTemplatesProps & { readonly template: ScheduleTemplateSummary }): JSX.Element {
  const { template, useOptions } = props;
  const blank: TemplateUseOption = { key: "blank", label: "New blank draft", target: { kind: "blank" }, live: false, viewing: false };
  const options = [...useOptions, blank];
  // The schedule on screen when it can be edited; otherwise a new blank draft.
  const first = options.find((option) => option.viewing) ?? blank;
  const [key, setKey] = useState(first.key);
  const picked = options.find((option) => option.key === key) ?? first;
  return (
    <div className="new-schedule-window-use">
      <p>{templateWhat(template)}</p>
      <fieldset className="new-schedule-window-target">
        <legend>Which schedule should it go into?</legend>
        {options.map((option) => (
          <label key={option.key}>
            <input type="radio" name={`template-use-${template.id}`} checked={option.key === key} onChange={() => setKey(option.key)} />
            {option.target.kind === "blank" ? <FilePlus2 size={14} aria-hidden /> : option.live ? <CalendarCheck2 size={14} aria-hidden className="is-live" /> : <CalendarDays size={14} aria-hidden />}
            <span title={option.label}>{option.label}</span>
            {option.live ? <small className="is-live">Live</small> : null}
            {option.viewing ? <small>On screen</small> : null}
          </label>
        ))}
      </fieldset>
      <p className="new-schedule-window-note">It opens for editing, then you choose to add the template's shifts or replace the ones it covers. Employees see nothing until you publish.</p>
      <div className="new-schedule-window-actions is-start">
        <button type="button" className="nf-button new-schedule-window-button" disabled={!props.canStartEdit} onClick={() => props.onUseInto(template.id, picked.target)}>
          <Pencil size={14} aria-hidden />Open for editing
        </button>
      </div>
    </div>
  );
}
