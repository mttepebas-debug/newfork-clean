// Item 5: what opens from the Export button. Stands in for
// apps/web/src/schedule/export-v2/ExportSettingsPanel: the original side panel
// or one of five prototypes. All use the real ExportController underneath
// (same preferences, preview rendering, download and print).
import {
  Check, ChevronLeft, ChevronRight, Download, ExternalLink, FileDown, FileImage, FileSpreadsheet, FileText,
  Image as ImageIcon, PanelLeftClose, PanelLeftOpen, Printer, RotateCcw, Settings2, X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AppSidebarPanel } from "../../../src/shell/AppSidebarPanel";
import { formatDateNumber } from "../../../src/schedule/lib/scheduleDateTime";
import { useCloseOnEscape } from "../../../src/schedule/lib/useCloseOnEscape";
import { ExportSettingsPanel as Original, type ExportSettingsPanelProps } from "../../../src/schedule/export-v2/ExportSettingsPanel";
import type { ExportPreferences } from "../../../src/schedule/export-v2/preferences";
import { Anchored, plural } from "./common";
import { useChoice } from "./store";
import "./variants.css";

type Props = ExportSettingsPanelProps;
type Format = ExportPreferences["format"];

export function ExportSettingsPanel(props: Props) {
  const choice = useChoice("export");
  if (choice === "original") return <Original {...props} />;
  if (choice === "v1") return <QuickDropdown {...props} />;
  if (choice === "v2") return <TidyPanel {...props} />;
  if (choice === "v3") return <BigPreview {...props} />;
  if (choice === "v4") return <ThreeSteps {...props} />;
  return <ReadyMade {...props} />;
}

const formats: { value: Format; label: string; hint: string; icon: typeof FileText }[] = [
  { value: "pdf", label: "PDF", hint: "Print-ready pages", icon: FileText },
  { value: "png", label: "Image", hint: "PNG, one per page", icon: FileImage },
  { value: "xlsx", label: "Excel", hint: "Merged, per location, Data", icon: FileSpreadsheet },
];
const formatName = (format: Format) => (format === "xlsx" ? "Excel" : format.toUpperCase());

/** Runs an action after a preferences change has re-rendered the controller. */
function useLatest(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  return (change: Partial<ExportPreferences> | null, action: "export" | "preview") => {
    if (change) latest.current.onChange({ ...latest.current.preferences, ...change });
    window.setTimeout(() => (action === "export" ? latest.current.onExport() : latest.current.onPreview()), 60);
  };
}

function sourceLine(props: Props): string {
  const { result } = props;
  if (result.status !== "ready") return result.reason === "edit" ? "Save a draft to export this schedule." : "Getting the schedule ready…";
  const { source, dates, locations, rows, shifts } = result.snapshot;
  const first = dates[0]!, last = dates.at(-1)!;
  const range = first === last ? formatDateNumber(first) : `${formatDateNumber(first)} – ${formatDateNumber(last)}`;
  return `${source.kind === "draft" ? `Draft “${source.name}”` : "Published"} · ${range} · ${plural(locations.length, "location")} · ${plural(rows.filter((row) => row.id !== null).length, "employee")} · ${plural(shifts.length, "shift")}`;
}

function SourceChip(props: Props) {
  const ready = props.result.status === "ready";
  const draft = ready && props.result.status === "ready" && props.result.snapshot.source.kind === "draft";
  return <p className="stv-ex-source" data-draft={draft} aria-live="polite"><i aria-hidden />{sourceLine(props)}</p>;
}

/** The real thumbnail: the controller renders ExportPreview into this frame. */
function Preview({ props, height, scale, onOpen }: { readonly props: Props; readonly height: number; readonly scale: number; readonly onOpen?: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const { onInlineTarget } = props;
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    doc.head.innerHTML = "<style>header{display:none!important}html,body{overflow:hidden;margin:0}iframe{height:100vh!important}</style>";
    const root = doc.createElement("main");
    doc.body.replaceChildren(root);
    onInlineTarget(root);
    return () => onInlineTarget(null);
  }, [onInlineTarget]);
  const files = props.inline.files.filter((file) => file.name.endsWith(`.${props.preferences.format}`));
  const status = props.result.status !== "ready" ? "Waiting…" : props.inline.loading ? "Updating…"
    : props.preferences.format === "xlsx" ? `Workbook · ${props.result.snapshot.locations.length + 2} sheets`
    : props.preferences.format === "png" ? plural(files.length || 1, "image") : "PDF";
  return (
    <div className="stv-ex-preview" style={{ height }}>
      <iframe ref={frame} title="Export preview" tabIndex={-1} style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})` }} />
      <span className="stv-ex-preview-status">{status}</span>
      {onOpen ? <button type="button" className="stv-ex-preview-open" disabled={props.result.status !== "ready"} onClick={onOpen}><ExternalLink size={13} aria-hidden />Open full preview</button> : null}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: {
  readonly value: T; readonly label: string; readonly onChange: (value: T) => void;
  readonly options: readonly { value: T; label: ReactNode; disabled?: boolean }[];
}) {
  return (
    <div className="stv-seg is-tight" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} aria-selected={value === option.value} disabled={option.disabled} onClick={() => onChange(option.value)}>{option.label}</button>
      ))}
    </div>
  );
}

function Switch({ on, label, hint, onChange, disabled }: { readonly on: boolean; readonly label: string; readonly hint?: string; readonly onChange: () => void; readonly disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="stv-switch" disabled={disabled} onClick={onChange}>
      <span><b>{label}</b>{hint ? <small>{hint}</small> : null}</span>
      <i aria-hidden />
    </button>
  );
}

function Layout({ props }: { readonly props: Props }) {
  const { preferences: prefs, onChange, result } = props;
  if (prefs.format === "xlsx") return <p className="stv-muted">One workbook: a Merged sheet, one sheet per location, and a Data sheet.</p>;
  const unified = result.status === "ready" && result.snapshot.layout === "unified";
  if (prefs.destination === "print") {
    return (
      <Segmented label="Paper" value={prefs.paper} onChange={(paper) => onChange({ ...prefs, paper })}
        options={[{ value: "LETTER", label: "US Letter" }, { value: "A4", label: "A4" }]} />
    );
  }
  return (
    <div className="stv-switches">
      {!unified ? <Switch on={prefs.combineHorizontally} label="Locations side by side" hint="All on one page width" onChange={() => onChange({ ...prefs, combineHorizontally: !prefs.combineHorizontally })} /> : null}
      <Switch on={prefs.combineVertically} label="One long page" hint="No page breaks between rows" onChange={() => onChange({ ...prefs, combineVertically: !prefs.combineVertically })} />
    </div>
  );
}

function MainButton({ props, wide = true }: { readonly props: Props; readonly wide?: boolean }) {
  const { preferences: prefs, busy, result } = props;
  const print = prefs.destination === "print" && prefs.format !== "xlsx";
  return (
    <button type="button" className={`stv-ex-main${wide ? " is-wide" : ""}`} disabled={busy || result.status !== "ready"} onClick={props.onExport}>
      {print ? <Printer size={15} aria-hidden /> : <Download size={15} aria-hidden />}
      {busy ? "Preparing…" : `${print ? "Print" : "Download"} ${formatName(prefs.format)}`}
    </button>
  );
}

function ErrorLine({ props }: { readonly props: Props }) {
  return props.error ? <p role="alert" className="stv-un-error">{props.error}</p> : null;
}

function Modal({ props, className, label, children }: { readonly props: Props; readonly className: string; readonly label: string; readonly children: ReactNode }) {
  useCloseOnEscape(props.onClose);
  return createPortal(
    <div className="schedule-unpublish-layer stv-ex-layer" role="presentation">
      <button type="button" aria-label="Close export" className="schedule-unpublish-backdrop" onClick={props.onClose} />
      <section className={`stv-panel ${className}`} role="dialog" aria-modal="true" aria-label={label}>{children}</section>
    </div>,
    document.body,
  );
}

// ---------- 1 · Quick dropdown ----------
function QuickDropdown(props: Props) {
  const run = useLatest(props);
  const layer = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);
  useCloseOnEscape(props.onClose);
  useEffect(() => {
    const away = (event: PointerEvent) => {
      const target = event.target as Element;
      if (layer.current?.contains(target) || target.closest?.('[data-schedule-top-action-trigger="export"]')) return;
      props.onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  });
  const ready = props.result.status === "ready" && !props.busy;
  const items: { key: string; icon: ReactNode; label: string; hint: string; go: () => void }[] = [
    { key: "pdf", icon: <FileText size={16} aria-hidden />, label: "Download PDF", hint: "Print-ready pages", go: () => run({ format: "pdf", destination: "download" }, "export") },
    { key: "png", icon: <ImageIcon size={16} aria-hidden />, label: "Download image", hint: "PNG, easy to text or post", go: () => run({ format: "png", destination: "download" }, "export") },
    { key: "xlsx", icon: <FileSpreadsheet size={16} aria-hidden />, label: "Download Excel", hint: "For payroll and sorting", go: () => run({ format: "xlsx", destination: "download" }, "export") },
    { key: "print", icon: <Printer size={16} aria-hidden />, label: "Print", hint: "Opens the print preview", go: () => run({ format: "pdf", destination: "print" }, "export") },
  ];
  return (
    <Anchored selector='[data-schedule-top-action-trigger="export"]' width={320} align="right">
      <div ref={layer} className="stv-panel stv-ex1" role="dialog" aria-label="Export">
        <p className="stv-ex1-what">{sourceLine(props)}</p>
        <div className="stv-ex1-list">
          {items.map((item) => (
            <button key={item.key} type="button" disabled={!ready} onClick={item.go}>
              {item.icon}<span><b>{item.label}</b><small>{item.hint}</small></span>
            </button>
          ))}
        </div>
        <button type="button" className="stv-ex1-more" aria-expanded={more} onClick={() => setMore(!more)}>
          <Settings2 size={14} aria-hidden />Page layout {more ? "▴" : "▾"}
        </button>
        {more ? <div className="stv-ex1-layout"><Layout props={{ ...props, preferences: { ...props.preferences, destination: "download", format: props.preferences.format === "xlsx" ? "pdf" : props.preferences.format } }} /></div> : null}
        <div className="stv-ex1-foot">
          <button type="button" className="stv-link" disabled={props.result.status !== "ready"} onClick={() => run(null, "preview")}><ExternalLink size={13} aria-hidden />Preview first</button>
        </div>
        <ErrorLine props={props} />
        {props.footer}
      </div>
    </Anchored>
  );
}

// ---------- 2 · Tidy side panel ----------
function TidyPanel(props: Props) {
  const { preferences: prefs, onChange } = props;
  return (
    <AppSidebarPanel>{({ collapsed, onToggle }) => (
      <section className="schedule-export-v2 stv-ex2" aria-label="Export settings" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); props.onClose(); } }}>
        <header className="export-v2-heading">
          {!collapsed ? <h2><FileDown size={18} aria-hidden="true" />Export</h2> : null}
          <button type="button" className="icon-button" aria-label={collapsed ? "Expand export settings" : "Minimize export settings"} onClick={onToggle}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
          <button type="button" className="icon-button" aria-label="Close export" onClick={props.onClose}><X size={18} /></button>
        </header>
        {!collapsed ? <>
          <SourceChip {...props} />
          <Preview props={props} height={190} scale={0.24} onOpen={props.onPreview} />
          <div className="stv-ex2-block">
            <strong>File</strong>
            <Segmented label="File" value={prefs.format} onChange={(format) => onChange({ ...prefs, format, destination: format === "xlsx" ? "download" : prefs.destination })}
              options={formats.map((item) => ({ value: item.value, label: item.label }))} />
          </div>
          {prefs.format !== "xlsx" ? (
            <div className="stv-ex2-block">
              <strong>Send to</strong>
              <Segmented label="Send to" value={prefs.destination} onChange={(destination) => onChange({ ...prefs, destination })}
                options={[{ value: "download", label: <><Download size={13} aria-hidden /> Download</> }, { value: "print", label: <><Printer size={13} aria-hidden /> Printer</> }]} />
            </div>
          ) : null}
          <div className="stv-ex2-block"><strong>{prefs.destination === "print" && prefs.format !== "xlsx" ? "Paper" : "Layout"}</strong><Layout props={props} /></div>
          <ErrorLine props={props} />
          <div className="stv-ex2-foot">
            <MainButton props={props} />
            <button type="button" className="stv-link" onClick={props.onReset}><RotateCcw size={13} aria-hidden />Reset to default</button>
          </div>
          {props.footer}
        </> : null}
      </section>
    )}</AppSidebarPanel>
  );
}

// ---------- 3 · Big preview window ----------
function BigPreview(props: Props) {
  const { preferences: prefs, onChange } = props;
  return (
    <Modal props={props} className="stv-ex3" label="Export">
      <div className="stv-ex3-preview">
        <Preview props={props} height={560} scale={0.62} />
      </div>
      <div className="stv-ex3-side">
        <header>
          <h2>Export schedule</h2>
          <button type="button" className="icon-button" aria-label="Close export" onClick={props.onClose}><X size={18} aria-hidden /></button>
        </header>
        <SourceChip {...props} />
        <div className="stv-ex2-block">
          <strong>File</strong>
          <div className="stv-ex3-formats">
            {formats.map(({ value, label, hint, icon: Icon }) => (
              <button key={value} type="button" role="radio" aria-checked={prefs.format === value} onClick={() => onChange({ ...prefs, format: value, destination: value === "xlsx" ? "download" : prefs.destination })}>
                <Icon size={18} aria-hidden /><b>{label}</b><small>{hint}</small>
              </button>
            ))}
          </div>
        </div>
        {prefs.format !== "xlsx" ? (
          <div className="stv-ex2-block">
            <strong>Send to</strong>
            <Segmented label="Send to" value={prefs.destination} onChange={(destination) => onChange({ ...prefs, destination })}
              options={[{ value: "download", label: "Download" }, { value: "print", label: "Printer" }]} />
          </div>
        ) : null}
        <div className="stv-ex2-block"><strong>{prefs.destination === "print" && prefs.format !== "xlsx" ? "Paper" : "Layout"}</strong><Layout props={props} /></div>
        <ErrorLine props={props} />
        <div className="stv-ex3-foot">
          <button type="button" className="secondary-button stv-btn" onClick={props.onPreview} disabled={props.result.status !== "ready"}><ExternalLink size={14} aria-hidden />Open in a tab</button>
          <MainButton props={props} wide={false} />
        </div>
        {props.footer}
      </div>
    </Modal>
  );
}

// ---------- 4 · Three steps ----------
function ThreeSteps(props: Props) {
  const { preferences: prefs, onChange } = props;
  const [step, setStep] = useState(0);
  const steps = prefs.format === "xlsx" ? ["File", "Get it"] : ["File", "Layout", "Get it"];
  const last = steps.length - 1;
  const current = Math.min(step, last);
  return (
    <Modal props={props} className="stv-ex4" label="Export">
      <header className="stv-ex4-head">
        <h2>Export schedule</h2>
        <button type="button" className="icon-button" aria-label="Close export" onClick={props.onClose}><X size={18} aria-hidden /></button>
      </header>
      <ol className="stv-steps">
        {steps.map((name, index) => <li key={name} data-state={index < current ? "done" : index === current ? "now" : "next"}><span>{index < current ? <Check size={12} aria-hidden /> : index + 1}</span>{name}</li>)}
      </ol>
      <div className="stv-ex4-body">
        {current === 0 ? (
          <div className="stv-ex4-cards">
            {formats.map(({ value, label, hint, icon: Icon }) => (
              <button key={value} type="button" role="radio" aria-checked={prefs.format === value} onClick={() => { onChange({ ...prefs, format: value, destination: value === "xlsx" ? "download" : prefs.destination }); setStep(1); }}>
                <Icon size={26} aria-hidden /><b>{label}</b><small>{hint}</small>
              </button>
            ))}
          </div>
        ) : null}
        {current === 1 && prefs.format !== "xlsx" ? (
          <div className="stv-ex4-layout">
            <p className="stv-muted">How should the pages look?</p>
            <Layout props={{ ...props, preferences: { ...prefs, destination: "download" } }} />
            <p className="stv-muted">For printing you choose the paper size in the next step.</p>
          </div>
        ) : null}
        {current === last ? (
          <div className="stv-ex4-get">
            <Preview props={props} height={170} scale={0.3} />
            <SourceChip {...props} />
            {prefs.format !== "xlsx" ? (
              <>
                <Segmented label="Send to" value={prefs.destination} onChange={(destination) => onChange({ ...prefs, destination })}
                  options={[{ value: "download", label: <><Download size={13} aria-hidden /> Download</> }, { value: "print", label: <><Printer size={13} aria-hidden /> Print</> }]} />
                {prefs.destination === "print" ? <Layout props={props} /> : null}
              </>
            ) : null}
            <ErrorLine props={props} />
            {props.footer}
          </div>
        ) : null}
      </div>
      <footer className="stv-ex4-foot">
        <button type="button" className="secondary-button stv-btn" onClick={() => (current === 0 ? props.onClose() : setStep(current - 1))}>
          {current === 0 ? "Cancel" : <><ChevronLeft size={14} aria-hidden />Back</>}
        </button>
        {current < last ? (
          <button type="button" className="stv-ex-main" onClick={() => setStep(current + 1)}>Next<ChevronRight size={14} aria-hidden /></button>
        ) : <MainButton props={props} wide={false} />}
      </footer>
    </Modal>
  );
}

// ---------- 5 · Ready-made uses ----------
function ReadyMade(props: Props) {
  const run = useLatest(props);
  const [custom, setCustom] = useState(false);
  const ready = props.result.status === "ready" && !props.busy;
  const uses: { key: string; icon: ReactNode; title: string; text: string; change: Partial<ExportPreferences> }[] = [
    { key: "wall", icon: <Printer size={20} aria-hidden />, title: "Print for the wall", text: "US Letter, one location per page", change: { format: "pdf", destination: "print", paper: "LETTER" } },
    { key: "chat", icon: <ImageIcon size={20} aria-hidden />, title: "Send to the team chat", text: "One image, locations side by side", change: { format: "png", destination: "download", combineHorizontally: true, combineVertically: true } },
    { key: "pdf", icon: <FileText size={20} aria-hidden />, title: "Save a PDF copy", text: "For your records or email", change: { format: "pdf", destination: "download" } },
    { key: "xlsx", icon: <FileSpreadsheet size={20} aria-hidden />, title: "Hours for payroll", text: "Excel with a Data sheet", change: { format: "xlsx", destination: "download" } },
  ];
  return (
    <AppSidebarPanel>{({ collapsed, onToggle }) => (
      <section className="schedule-export-v2 stv-ex5" aria-label="Export" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); props.onClose(); } }}>
        <header className="export-v2-heading">
          {!collapsed ? <h2><FileDown size={18} aria-hidden="true" />Export</h2> : null}
          <button type="button" className="icon-button" aria-label={collapsed ? "Expand export settings" : "Minimize export settings"} onClick={onToggle}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
          <button type="button" className="icon-button" aria-label="Close export" onClick={props.onClose}><X size={18} /></button>
        </header>
        {!collapsed ? <>
          <SourceChip {...props} />
          <p className="stv-ex5-ask">What do you need it for?</p>
          <div className="stv-ex5-uses">
            {uses.map((use) => (
              <button key={use.key} type="button" disabled={!ready} onClick={() => run(use.change, "export")}>
                {use.icon}<span><b>{use.title}</b><small>{use.text}</small></span><ChevronRight size={15} aria-hidden />
              </button>
            ))}
          </div>
          <button type="button" className="stv-ex1-more" aria-expanded={custom} onClick={() => setCustom(!custom)}><Settings2 size={14} aria-hidden />Choose the settings myself {custom ? "▴" : "▾"}</button>
          {custom ? (
            <div className="stv-ex5-custom">
              <Segmented label="File" value={props.preferences.format} onChange={(format) => props.onChange({ ...props.preferences, format, destination: format === "xlsx" ? "download" : props.preferences.destination })}
                options={formats.map((item) => ({ value: item.value, label: item.label }))} />
              {props.preferences.format !== "xlsx" ? (
                <Segmented label="Send to" value={props.preferences.destination} onChange={(destination) => props.onChange({ ...props.preferences, destination })}
                  options={[{ value: "download", label: "Download" }, { value: "print", label: "Printer" }]} />
              ) : null}
              <Layout props={props} />
              <MainButton props={props} />
              <button type="button" className="stv-link" onClick={props.onPreview} disabled={props.result.status !== "ready"}><ExternalLink size={13} aria-hidden />Preview first</button>
            </div>
          ) : null}
          <ErrorLine props={props} />
          {props.footer}
        </> : null}
      </section>
    )}</AppSidebarPanel>
  );
}

