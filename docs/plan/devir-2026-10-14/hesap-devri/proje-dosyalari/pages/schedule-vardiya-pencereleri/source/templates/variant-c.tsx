// Variant C · Step by step: one decision per screen. 1 Choose a template,
// 2 choose how and what to apply, 3 review the effect, then apply. Saving and
// managing templates are their own short paths from step 1.
import type { ScheduleTemplateSummary } from "@newfork/shared/schedule";
import { ConfirmButton } from "@newfork/ui";
import { ArrowLeft, Check, Layers, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCloseOnEscape } from "../../../src/schedule/lib/useCloseOnEscape";
import {
  DepartmentChips, Impact, ModeChoice, SaveWeekForm, ShiftTypeLegend, WeekSpark, WeekTable, editThenApply, errorText,
  plural, summarize, takePendingApply, updatedLabel, useApplyPreview, useDepartmentSelection, useReference,
  useTemplateDetail, useTemplateList, weekLabel, type Mode, type TemplatesDialogProps,
} from "./shared";

type Step = 1 | 2 | 3 | "save" | "manage";

export function VariantC(props: TemplatesDialogProps) {
  const { session, onClose } = props;
  useCloseOnEscape(onClose);
  const reference = useReference(session);
  const { templates, refresh } = useTemplateList(props.templates);
  const [step, setStep] = useState<Step>(props.initialDraftId || !props.templates.length ? "save" : 1);
  const [selectedId, setSelectedId] = useState(props.templates[0]?.id ?? "");
  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const detail = useTemplateDetail(selected);
  const summary = useMemo(() => (detail && reference ? summarize(detail, reference) : null), [detail, reference]);
  const departments = useDepartmentSelection(summary);
  const [mode, setMode] = useState<Mode>("merge");
  const weekStart = reference?.weekStart ?? null;
  const { preview, loading, error: previewError } = useApplyPreview(step === 2 || step === 3 ? selected?.id ?? null : null, mode, departments.forApply, session, weekStart);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.querySelector<HTMLElement>("[data-autofocus], button, input")?.focus();
  }, [step]);
  useEffect(() => {
    const waiting = takePendingApply(session);
    if (!waiting) return;
    setSelectedId(waiting.templateId);
    setMode(waiting.mode);
    setStep(3);
    void run(() => props.onApply(waiting.templateId, waiting.mode, waiting.departmentKeys));
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setPending(false);
    }
  };
  const weekText = weekStart ? weekLabel(weekStart) : "this week";
  const apply = () => {
    if (!selected) return;
    if (!session) {
      void editThenApply({ templateId: selected.id, mode, departmentKeys: departments.forApply }, onClose);
      return;
    }
    void run(() => props.onApply(selected.id, mode, departments.forApply));
  };
  const steps = [
    { id: 1, label: "Template" },
    { id: 2, label: "What to apply" },
    { id: 3, label: "Review" },
  ] as const;
  const numbered = step === 1 || step === 2 || step === 3;
  const stepNumber = typeof step === "number" ? step : 0;
  const title = step === "save" ? "Save this week as a template" : step === "manage" ? "Manage templates" : `Apply a template to ${weekText}`;

  return (
    <div className="schedule-dialog-layer tpl-layer" role="presentation" data-schedule-quiet-dialog>
      <button type="button" className="schedule-dialog-backdrop" aria-label="Close templates" onClick={onClose} />
      <section className="tpl-c" role="dialog" aria-modal="true" aria-labelledby="tpl-c-title">
        <header className="tpl-c-header">
          {!numbered ? (
            <button type="button" className="icon-button" aria-label="Back to templates" onClick={() => setStep(1)}><ArrowLeft size={18} /></button>
          ) : null}
          <h2 id="tpl-c-title">{title}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        {numbered ? (
          <ol className="tpl-c-steps" aria-label="Steps">
            {steps.map((item) => (
              <li key={item.id} className={item.id === stepNumber ? "is-current" : item.id < stepNumber ? "is-done" : ""} aria-current={item.id === stepNumber ? "step" : undefined}>
                <span aria-hidden="true">{item.id < stepNumber ? <Check size={13} /> : item.id}</span>{item.label}
              </li>
            ))}
          </ol>
        ) : null}

        <div className="tpl-c-body" ref={body}>
          {step === 1 ? (
            <>
              <div className="tpl-c-cards" role="radiogroup" aria-label="Templates">
                {templates.map((template) => (
                  <TemplateCard key={template.id} template={template} selected={template.id === selectedId}
                    onSelect={() => setSelectedId(template.id)} onOpen={() => { setSelectedId(template.id); setStep(2); }} />
                ))}
                <button type="button" className="tpl-c-card is-new" onClick={() => setStep("save")}>
                  <Plus size={20} aria-hidden="true" />
                  <strong>Save this week</strong>
                  <small>Turn the week on screen into a template</small>
                </button>
              </div>
              {templates.length ? (
                <button type="button" className="tpl-c-link" onClick={() => setStep("manage")}><Settings2 size={15} aria-hidden="true" />Rename or delete templates</button>
              ) : null}
            </>
          ) : null}

          {step === 2 && selected ? (
            <div className="tpl-c-two">
              <div className="tpl-c-summary">
                <h3>{selected.name}</h3>
                {summary && reference ? (
                  <>
                    <p>{plural(summary.shiftCount, "shift")} · {plural(summary.peopleCount, "person", "people")} · {summary.openCount} open · {summary.hours} hours</p>
                    <WeekTable summary={summary} weekStart={weekStart} caption={`Shifts in ${selected.name} by department and day`} />
                    <ShiftTypeLegend reference={reference} />
                  </>
                ) : <div className="tpl-skeleton" aria-busy="true" />}
              </div>
              <div className="tpl-c-choices">
                <ModeChoice mode={mode} onChange={setMode} weekLabelText={weekText} />
                {summary && summary.departments.length > 1 ? (
                  <DepartmentChips options={summary.departments} selected={departments.selected} onChange={departments.setSelected} />
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 3 && selected ? (
            <div className="tpl-c-review">
              <p className="tpl-c-sentence">
                {mode === "merge" ? "Add" : "Replace with"} <strong>{selected.name}</strong>
                {departments.forApply ? <> ({summary?.departments.filter((d) => departments.selected.includes(d.key)).map((d) => d.name).join(", ")})</> : null}
                {" "}on <strong>{weekText}</strong>{session ? "" : ", starting an edit of this week"}.
              </p>
              <Impact preview={preview} loading={loading} error={previewError} weekStart={weekStart} open />
              <p className="tpl-hint">{session ? "Shifts stay in this edit until you publish. Undo takes the whole change back." : "Nothing is published until you publish."}</p>
            </div>
          ) : null}

          {step === "save" ? (
            <SaveWeekForm session={session} drafts={props.drafts} initialDraftId={props.initialDraftId ?? null} weekStart={weekStart}
              onCancel={templates.length ? () => setStep(1) : undefined}
              onSaved={async (template: ScheduleTemplateSummary) => { await refresh(); setSelectedId(template.id); setStep(1); }} />
          ) : null}

          {step === "manage" ? (
            <ManageList templates={templates} pending={pending}
              onRename={(template, name) => run(async () => { await props.onRename(template, name); await refresh(); })}
              onDelete={(template) => run(async () => { await props.onDelete(template); await refresh(); })} />
          ) : null}
          {error ? <p className="tpl-field-error" role="alert">{error}</p> : null}
        </div>

        {numbered ? (
          <footer className="tpl-c-footer">
            {step === 1 ? <button type="button" className="nf-button secondary-button" onClick={onClose}>Cancel</button>
              : <button type="button" className="nf-button secondary-button" onClick={() => setStep(step === 3 ? 2 : 1)}>Back</button>}
            {step === 1 ? (
              <button type="button" className="nf-button" disabled={!selected} onClick={() => setStep(2)}>Next</button>
            ) : step === 2 ? (
              <button type="button" className="nf-button" disabled={!departments.selected.length} onClick={() => setStep(3)}>Review</button>
            ) : mode === "overwrite" ? (
              <ConfirmButton className="danger-button" disabled={pending || !preview}
                confirmLabel={`Confirm replace${preview?.removed_shift_count ? ` (${preview.removed_shift_count} removed)` : ""}`} onConfirm={apply}>
                {`Replace ${weekText}`}
              </ConfirmButton>
            ) : (
              <button type="button" className="nf-button" disabled={pending || !preview} onClick={apply}>
                {pending ? "Applying…" : `Add to ${weekText}`}
              </button>
            )}
          </footer>
        ) : null}
      </section>
    </div>
  );
}

function TemplateCard({ template, selected, onSelect, onOpen }: {
  readonly template: ScheduleTemplateSummary;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onOpen: () => void;
}) {
  const detail = useTemplateDetail(template);
  const perDay = useMemo(() => {
    const days = [0, 0, 0, 0, 0, 0, 0];
    detail?.shifts.forEach((shift) => { days[shift.day_offset]! += 1; });
    return days;
  }, [detail]);
  return (
    <button type="button" role="radio" aria-checked={selected} className={`tpl-c-card${selected ? " is-on" : ""}`}
      data-autofocus={selected ? "" : undefined} onClick={onSelect} onDoubleClick={onOpen}>
      <span className="tpl-c-card-top">
        <Layers size={16} aria-hidden="true" />
        <strong>{template.name}</strong>
        {selected ? <Check size={16} aria-hidden="true" className="tpl-c-check" /> : null}
      </span>
      <WeekSpark perDay={perDay} label={`Shifts per day: ${perDay.join(", ")}`} />
      <small>{plural(template.shift_count, "shift")}{template.open_slot_count ? ` · ${template.open_slot_count} open` : ""}</small>
      <small>{template.created_by_name} · {updatedLabel(template.updated_at)}</small>
    </button>
  );
}

function ManageList({ templates, pending, onRename, onDelete }: {
  readonly templates: readonly ScheduleTemplateSummary[];
  readonly pending: boolean;
  readonly onRename: (template: ScheduleTemplateSummary, name: string) => Promise<unknown>;
  readonly onDelete: (template: ScheduleTemplateSummary) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  return (
    <ul className="tpl-c-manage">
      {templates.map((template) => (
        <li key={template.id}>
          {editing === template.id ? (
            <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) void onRename(template, name.trim()).then(() => setEditing(null)); }}>
              <label className="sr-only" htmlFor="tpl-c-rename">Template name</label>
              <input id="tpl-c-rename" value={name} autoFocus maxLength={80} onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setEditing(null); } }} />
              <button type="submit" className="nf-button" disabled={!name.trim() || pending}>Save</button>
              <button type="button" className="nf-button secondary-button" onClick={() => setEditing(null)}>Cancel</button>
            </form>
          ) : (
            <>
              <span><strong>{template.name}</strong><small>{plural(template.shift_count, "shift")} · {template.created_by_name}</small></span>
              <button type="button" className="tpl-icon-text" onClick={() => { setName(template.name); setEditing(template.id); }}><Pencil size={14} aria-hidden="true" />Rename</button>
              <ConfirmButton unstyled className="tpl-icon-text is-danger" disabled={pending}
                confirmLabel={<><Trash2 size={14} aria-hidden="true" />Confirm delete</>} onConfirm={() => void onDelete(template)}>
                <Trash2 size={14} aria-hidden="true" />Delete
              </ConfirmButton>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
