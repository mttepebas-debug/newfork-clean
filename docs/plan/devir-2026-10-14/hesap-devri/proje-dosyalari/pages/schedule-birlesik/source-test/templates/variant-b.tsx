// Variant B · Side panel: Templates opens in the left menu's place, like
// Export. The week stays in view and usable while choosing; every choice is a
// menu row with a check, and the effect on the week sits above the button.
import type { ScheduleTemplateSummary } from "@newfork/shared/schedule";
import { ConfirmButton } from "@newfork/ui";
import { Check, Eye, EyeOff, Layers, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppSidebarPanel } from "../../../src/shell/AppSidebarPanel";
import { useGridPreview } from "./grid-preview";
import {
  Impact, SaveWeekForm, type ApplyPreview, WeekSpark, editThenApply, errorText, plural, summarize, takePendingApply, useApplyPreview,
  useDepartmentSelection, useReference, useTemplateDetail, useTemplateList, weekLabel, type Mode, type TemplatesDialogProps,
} from "./shared";

export function VariantB(props: TemplatesDialogProps) {
  const { session, onClose } = props;
  const reference = useReference(session);
  const { templates, refresh } = useTemplateList(props.templates);
  const [selectedId, setSelectedId] = useState(props.templates[0]?.id ?? "");
  const [saving, setSaving] = useState(Boolean(props.initialDraftId) || !props.templates.length);
  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const detail = useTemplateDetail(selected);
  const summary = useMemo(() => (detail && reference ? summarize(detail, reference) : null), [detail, reference]);
  const carriedDepartments = useRef<readonly string[] | null>(null);
  const departments = useDepartmentSelection(summary, carriedDepartments);
  const [mode, setMode] = useState<Mode>("merge");
  const weekStart = reference?.weekStart ?? null;
  const { preview, loading, error: previewError } = useApplyPreview(saving ? null : selected?.id ?? null, mode, departments.forApply, session, weekStart);
  // The grid keeps the last answer while a new one loads, so cards don't blink.
  const [onGrid, setOnGrid] = useState(true);
  const [shown, setShown] = useState<ApplyPreview | null>(null);
  useEffect(() => { if (preview) setShown(preview); }, [preview]);
  const painted = onGrid && !saving && selected && departments.selected.length ? shown : null;
  const { hidden } = useGridPreview(painted?.added ?? null, painted?.removed_shift_ids ?? null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!templates.some((template) => template.id === selectedId) && templates[0]) setSelectedId(templates[0].id);
  }, [templates, selectedId]);
  useEffect(() => {
    const waiting = takePendingApply(session);
    if (!waiting) return;
    setSelectedId(waiting.templateId);
    setMode(waiting.mode);
    if (waiting.departmentKeys) {
      carriedDepartments.current = waiting.departmentKeys;
      departments.setSelected(waiting.departmentKeys);
    }
    if (waiting.apply === false) return;
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
  const label = mode === "merge" ? `Add to ${weekText}` : `Replace ${weekText}`;

  return (
    <AppSidebarPanel>{({ collapsed, onToggle }) => (
      // A nonmodal window: presses inside it belong to it, not to the page's
      // "press outside closes the top menus" rule.
      <section className="tpl-b" role="dialog" aria-modal="false" aria-label="Templates"
        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
        <header className="tpl-b-heading">
          {!collapsed ? <h2><Layers size={18} aria-hidden="true" />Templates</h2> : null}
          <button type="button" className="icon-button" aria-label={collapsed ? "Expand templates" : "Minimize templates"} onClick={onToggle}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button type="button" className="icon-button" aria-label="Close templates" onClick={onClose}><X size={18} /></button>
        </header>
        {collapsed ? null : (
          <>
            <dl className="tpl-b-target">
              <div><dt>Week</dt><dd>{weekText}</dd></div>
              <div><dt>Applies to</dt><dd>{session ? "The week you are editing" : "Starts editing this week"}</dd></div>
            </dl>

            {saving ? (
              <div className="tpl-b-section">
                <strong>Save this week as a template</strong>
                <SaveWeekForm session={session} drafts={props.drafts} initialDraftId={props.initialDraftId ?? null} weekStart={weekStart}
                  onCancel={templates.length ? () => setSaving(false) : undefined}
                  onSaved={async (template: ScheduleTemplateSummary) => { await refresh(); setSelectedId(template.id); setSaving(false); }} />
              </div>
            ) : (
              <>
                <div className="tpl-b-section">
                  <strong>Template</strong>
                  <div className="tpl-b-menu" role="radiogroup" aria-label="Template">
                    {templates.map((template) => {
                      const on = template.id === selectedId;
                      if (renamingId === template.id) {
                        return (
                          <form key={template.id} className="tpl-b-rename" onSubmit={(event) => {
                            event.preventDefault();
                            if (!name.trim()) return;
                            void run(async () => { await props.onRename(template, name.trim()); await refresh(); setRenamingId(null); });
                          }}>
                            <label className="sr-only" htmlFor="tpl-b-rename">Template name</label>
                            <input id="tpl-b-rename" value={name} autoFocus maxLength={80} onChange={(event) => setName(event.target.value)}
                              onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setRenamingId(null); } }} />
                            <button type="submit" className="tpl-b-mini" disabled={!name.trim() || pending}>Save</button>
                          </form>
                        );
                      }
                      return (
                        <div key={template.id} className={`tpl-b-row${on ? " is-on" : ""}`}>
                          <button type="button" role="radio" aria-checked={on} onClick={() => setSelectedId(template.id)}>
                            <span>
                              {template.name}
                              <small>{plural(template.shift_count, "shift")}{template.open_slot_count ? ` · ${template.open_slot_count} open` : ""}</small>
                            </span>
                            {on ? <Check size={16} aria-hidden="true" /> : null}
                          </button>
                          <span className="tpl-b-row-tools">
                            <button type="button" aria-label={`Rename ${template.name}`} onClick={() => { setName(template.name); setRenamingId(template.id); }}>
                              <Pencil size={14} />
                            </button>
                            <ConfirmButton unstyled aria-label={`Delete ${template.name}`} confirmName={`Confirm delete ${template.name}`}
                              confirmLabel="Delete?" className="is-danger"
                              onConfirm={() => void run(async () => { await props.onDelete(template); await refresh(); })}>
                              <Trash2 size={14} />
                            </ConfirmButton>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" className="tpl-b-add" onClick={() => setSaving(true)}><Plus size={15} aria-hidden="true" />Save this week as a template</button>
                </div>

                {selected && summary ? (
                  <div className="tpl-b-section">
                    <strong>In this template</strong>
                    <div className="tpl-b-shape">
                      <WeekSpark perDay={summary.perDay} label={`Shifts per day: ${summary.perDay.join(", ")}`} />
                      <p>{plural(summary.shiftCount, "shift")} · {plural(summary.peopleCount, "person", "people")} · {summary.openCount} open<br />{summary.locations.map((location) => location.name).join(" · ")}</p>
                    </div>
                  </div>
                ) : null}

                <div className="tpl-b-section">
                  <strong>How to apply</strong>
                  <div className="tpl-b-menu" role="radiogroup" aria-label="How to apply">
                    {([
                      ["merge", "Add to the week", "Keeps every shift already there"],
                      ["overwrite", "Replace the week", "Clears this template's departments first"],
                    ] as const).map(([value, title, hint]) => (
                      <div key={value} className={`tpl-b-row${mode === value ? " is-on" : ""}`}>
                        <button type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)}>
                          <span>{title}<small>{hint}</small></span>
                          {mode === value ? <Check size={16} aria-hidden="true" /> : null}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {summary && summary.departments.length > 1 ? (
                  <div className="tpl-b-section">
                    <strong>Departments</strong>
                    <div className="tpl-b-menu" role="group" aria-label="Departments">
                      {summary.departments.map((department) => {
                        const on = departments.selected.includes(department.key);
                        return (
                          <div key={department.key} className={`tpl-b-row${on ? " is-on" : ""}`}>
                            <button type="button" role="checkbox" aria-checked={on}
                              onClick={() => departments.setSelected(on ? departments.selected.filter((key) => key !== department.key) : [...departments.selected, department.key])}>
                              <span>{department.name}<small>{plural(department.count, "shift")}</small></span>
                              {on ? <Check size={16} aria-hidden="true" /> : null}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {!departments.selected.length ? <p className="tpl-field-error">Pick at least one department.</p> : null}
                  </div>
                ) : null}

                {selected ? (
                  <div className="tpl-b-section">
                    <strong>Effect on the week</strong>
                    <Impact preview={preview} loading={loading} error={previewError} weekStart={weekStart} />
                    <div className={`tpl-b-row tpl-b-grid-toggle${onGrid ? " is-on" : ""}`}>
                      <button type="button" role="switch" aria-checked={onGrid} onClick={() => setOnGrid((value) => !value)}>
                        {onGrid ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
                        <span>Show on the grid<small>{onGrid ? "Dashed cards are added. Crossed-out cards go." : "Off: the grid shows the week as it is."}</small></span>
                      </button>
                    </div>
                    {onGrid && hidden ? (
                      <div className="tpl-b-hidden">
                        <p className="tpl-hint">
                          {plural(hidden, "shift")} {hidden === 1 ? "isn't" : "aren't"} on the grid: {session
                            ? "a filter hides the row."
                            : "open shifts need the Unassigned row, which shows while editing."}
                        </p>
                        {!session && selected ? (
                          <button type="button" className="tpl-b-add"
                            onClick={() => void editThenApply({ templateId: selected.id, mode, departmentKeys: departments.forApply, apply: false }, onClose)}>
                            <Pencil size={14} aria-hidden="true" />Start editing to see all of it
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="tpl-b-footer">
                  {error ? <p className="tpl-field-error" role="alert">{error}</p> : null}
                  {mode === "overwrite" ? (
                    <ConfirmButton unstyled className="tpl-b-primary is-danger" disabled={!selected || pending || !departments.selected.length}
                      confirmLabel={`Confirm replace${preview?.removed_shift_count ? ` (${preview.removed_shift_count} removed)` : ""}`} onConfirm={apply}>
                      {label}
                    </ConfirmButton>
                  ) : (
                    <button type="button" className="tpl-b-primary" disabled={!selected || pending || !departments.selected.length} onClick={apply}>
                      {pending ? "Applying…" : label}
                    </button>
                  )}
                  <p className="tpl-hint">{session ? "Shifts stay in this edit until you publish." : "Nothing is published until you publish."}</p>
                </div>
              </>
            )}
          </>
        )}
      </section>
    )}</AppSidebarPanel>
  );
}
