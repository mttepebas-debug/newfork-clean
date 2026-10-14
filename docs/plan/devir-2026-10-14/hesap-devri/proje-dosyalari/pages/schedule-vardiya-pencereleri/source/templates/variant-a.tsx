// Variant A · Library: one large window. Templates on the left, the chosen
// template's week on the right, and the apply choices with their effect under
// it. "Save this week" lives in the same list, as its first row.
import type { ScheduleTemplateSummary } from "@newfork/shared/schedule";
import { ConfirmButton } from "@newfork/ui";
import { Layers, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCloseOnEscape } from "../../../src/schedule/lib/useCloseOnEscape";
import {
  DepartmentChips, Empty, Impact, ModeChoice, SaveWeekForm, ShiftTypeLegend, WeekTable, editThenApply, errorText,
  plural, summarize, takePendingApply, updatedLabel, useApplyPreview, useDepartmentSelection, useReference,
  useTemplateDetail, useTemplateList, weekLabel, type Mode, type TemplatesDialogProps,
} from "./shared";

export function VariantA(props: TemplatesDialogProps) {
  const { session, onClose } = props;
  useCloseOnEscape(onClose);
  const reference = useReference(session);
  const { templates, refresh } = useTemplateList(props.templates);
  const [view, setView] = useState<"template" | "save">(props.initialDraftId || !props.templates.length ? "save" : "template");
  const [selectedId, setSelectedId] = useState(props.templates[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const detail = useTemplateDetail(selected);
  const summary = useMemo(() => (detail && reference ? summarize(detail, reference) : null), [detail, reference]);
  const departments = useDepartmentSelection(summary);
  const [mode, setMode] = useState<Mode>("merge");
  const weekStart = reference?.weekStart ?? null;
  const { preview, loading, error: previewError } = useApplyPreview(view === "template" ? selected?.id ?? null : null, mode, departments.forApply, session, weekStart);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);
  useEffect(() => {
    if (!templates.some((template) => template.id === selectedId) && templates[0]) setSelectedId(templates[0].id);
  }, [templates, selectedId]);
  // A choice made in view mode applies once the edit has started.
  useEffect(() => {
    const waiting = takePendingApply(session);
    if (!waiting) return;
    setSelectedId(waiting.templateId);
    setMode(waiting.mode);
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
  const visible = templates.filter((template) => template.name.toLowerCase().includes(query.trim().toLowerCase()));
  const apply = () => {
    if (!selected) return;
    if (!session) {
      void editThenApply({ templateId: selected.id, mode, departmentKeys: departments.forApply }, onClose);
      return;
    }
    void run(() => props.onApply(selected.id, mode, departments.forApply));
  };
  const weekText = weekStart ? weekLabel(weekStart) : "this week";
  const applyLabel = mode === "merge" ? `Add to ${weekText}` : `Replace ${weekText}`;

  return (
    <div className="schedule-dialog-layer tpl-layer" role="presentation" data-schedule-quiet-dialog>
      <button type="button" className="schedule-dialog-backdrop" aria-label="Close templates" onClick={onClose} />
      <section ref={dialog} className="tpl-a" role="dialog" aria-modal="true" aria-labelledby="tpl-a-title">
        <header className="tpl-a-header">
          <div>
            <h2 id="tpl-a-title">Templates</h2>
            <p>Reusable weeks. Pick one to see what it holds, then add it to {weekText}.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="tpl-a-body">
          <nav className="tpl-a-list" aria-label="Templates">
            <button type="button" className={`tpl-a-new${view === "save" ? " is-on" : ""}`} aria-pressed={view === "save"} onClick={() => setView("save")}>
              <Plus size={16} aria-hidden="true" /> Save this week as a template
            </button>
            {templates.length > 4 ? (
              <label className="tpl-a-search">
                <Search size={15} aria-hidden="true" />
                <span className="sr-only">Find a template</span>
                <input id="tpl-a-search" value={query} placeholder="Find a template" onChange={(event) => setQuery(event.target.value)} />
              </label>
            ) : null}
            <ul>
              {visible.map((template) => (
                <li key={template.id}>
                  <button type="button" data-autofocus={template.id === selectedId && view === "template" ? "" : undefined}
                    aria-current={view === "template" && template.id === selectedId ? "true" : undefined}
                    onClick={() => { setSelectedId(template.id); setView("template"); setRenaming(false); setError(null); }}>
                    <Layers size={16} aria-hidden="true" />
                    <span>
                      <strong>{template.name}</strong>
                      <small>{plural(template.shift_count, "shift")}{template.open_slot_count ? ` · ${template.open_slot_count} open` : ""}</small>
                      <small>{template.created_by_name} · {updatedLabel(template.updated_at)}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {!templates.length ? <p className="tpl-a-none">No templates yet.</p> : null}
          </nav>

          <div className="tpl-a-main">
            {view === "save" ? (
              <div className="tpl-a-pane">
                <div className="tpl-a-title">
                  <h3>Save this week as a template</h3>
                  <p>Use it later to start any week with these shifts.</p>
                </div>
                <SaveWeekForm session={session} drafts={props.drafts} initialDraftId={props.initialDraftId ?? null} weekStart={weekStart}
                  onCancel={templates.length ? () => setView("template") : undefined}
                  onSaved={async (template: ScheduleTemplateSummary) => {
                    await refresh();
                    setSelectedId(template.id);
                    setView("template");
                  }} />
              </div>
            ) : selected ? (
              <>
                <div className="tpl-a-pane">
                  <div className="tpl-a-title">
                    {renaming ? (
                      <form className="tpl-a-rename" onSubmit={(event) => {
                        event.preventDefault();
                        if (!name.trim()) return;
                        void run(async () => { await props.onRename(selected, name.trim()); await refresh(); setRenaming(false); });
                      }}>
                        <label className="sr-only" htmlFor="tpl-a-rename">Template name</label>
                        <input id="tpl-a-rename" value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)}
                          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setRenaming(false); } }} />
                        <button type="submit" className="nf-button" disabled={pending || !name.trim()}>Save</button>
                        <button type="button" className="nf-button secondary-button" onClick={() => setRenaming(false)}>Cancel</button>
                      </form>
                    ) : (
                      <div className="tpl-a-name">
                        <h3>{selected.name}</h3>
                        <div className="tpl-a-tools">
                          <button type="button" className="tpl-icon-text" onClick={() => { setName(selected.name); setRenaming(true); }}>
                            <Pencil size={14} aria-hidden="true" /> Rename
                          </button>
                          <ConfirmButton unstyled className="tpl-icon-text is-danger" disabled={pending}
                            confirmLabel={<><Trash2 size={14} aria-hidden="true" /> Confirm delete</>}
                            onConfirm={() => void run(async () => { await props.onDelete(selected); await refresh(); })}>
                            <Trash2 size={14} aria-hidden="true" /> Delete
                          </ConfirmButton>
                        </div>
                      </div>
                    )}
                    {summary ? (
                      <ul className="tpl-facts" aria-label="What this template holds">
                        <li><strong>{summary.shiftCount}</strong> shifts</li>
                        <li><strong>{summary.peopleCount}</strong> people</li>
                        <li><strong>{summary.openCount}</strong> open</li>
                        <li><strong>{summary.hours}</strong> hours</li>
                        <li>{summary.locations.map((location) => location.name).join(" · ")}</li>
                      </ul>
                    ) : null}
                  </div>
                  {summary && reference ? (
                    <>
                      <WeekTable summary={summary} weekStart={weekStart} caption={`Shifts in ${selected.name} by department and day`} />
                      <ShiftTypeLegend reference={reference} />
                    </>
                  ) : <div className="tpl-skeleton" aria-busy="true" />}
                </div>
                <footer className="tpl-a-apply">
                  <div className="tpl-a-apply-choices">
                    <ModeChoice mode={mode} onChange={setMode} weekLabelText={weekText} />
                    {summary && summary.departments.length > 1 ? (
                      <DepartmentChips options={summary.departments} selected={departments.selected} onChange={departments.setSelected} />
                    ) : null}
                  </div>
                  <div className="tpl-a-apply-result">
                    <h4>On {weekText}</h4>
                    <Impact preview={preview} loading={loading} error={previewError} weekStart={weekStart} />
                    {error ? <p className="tpl-field-error" role="alert">{error}</p> : null}
                    <div className="tpl-a-apply-actions">
                      {!session ? <p className="tpl-hint">Applying starts editing this week. Nothing is published until you publish.</p> : <p className="tpl-hint">Added shifts stay in this edit until you publish.</p>}
                      {mode === "overwrite" ? (
                        <ConfirmButton className="danger-button" disabled={pending || !departments.selected.length}
                          confirmLabel={`Confirm replace${preview?.removed_shift_count ? ` (${preview.removed_shift_count} removed)` : ""}`} onConfirm={apply}>
                          {applyLabel}
                        </ConfirmButton>
                      ) : (
                        <button type="button" className="nf-button" disabled={pending || !departments.selected.length} onClick={apply}>
                          {pending ? "Applying…" : applyLabel}
                        </button>
                      )}
                    </div>
                  </div>
                </footer>
              </>
            ) : (
              <Empty>
                <Layers size={28} aria-hidden="true" />
                <p>No templates yet. Save a week you like and reuse it for any week.</p>
                <button type="button" className="nf-button" onClick={() => setView("save")}>Save this week as a template</button>
              </Empty>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
