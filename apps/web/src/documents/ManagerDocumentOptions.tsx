import { BellRing, CalendarClock, ChevronDown, ShieldCheck } from "lucide-react";
import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { DrawerSection } from "../views/RequestDrawer";
import { extendPicks, type ExtendPick, type OptionPanel } from "./review-options";

// More options at the end of the manager's Details (A2 Tur 6, mockup-spec 8-10; Mert 23 Oct: "extend ve excuse
// kısmında seçim belli olmuyor … aç kapa"). Each card is one selectable head (a radio-like ring that fills, a 2 px
// accent edge, the head on the accent's soft tone, the label bold, the chevron up) with its panel inside it. A click
// on a closed head opens that card and closes the other; a click on the open head closes it. Nothing here sends:
// the dock's Save does, one change at a time.

export type OptionsTyped = {
  pick: ExtendPick | null;
  other: string;
  extendReason: string;
  excuseReason: string;
  againReason: string;
};

type Reasoned = "extendReason" | "excuseReason" | "againReason";

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function Field({
  label,
  hint,
  bad = false,
  children,
}: {
  label: string;
  hint: string;
  bad?: boolean;
  children: (ids: { input: string; hint: string }) => ReactNode;
}) {
  const id = useId();
  const ids = { input: `${id}-input`, hint: `${id}-hint` };
  // The hint sits beside the label (the mockup's line), and is the field's description, not part of its name.
  return (
    <div className="docr-field">
      <span className="docr-field-head">
        <label htmlFor={ids.input}>{label}</label>{" "}
        <small id={ids.hint} className={bad ? "docr-hint is-bad" : "docr-hint"}>
          {hint}
        </small>
      </span>
      {children(ids)}
    </div>
  );
}

export function ManagerDocumentOptions({
  cards,
  panel,
  first,
  phone,
  busy,
  due,
  newDue,
  otherBad,
  typed,
  onToggle,
  onPick,
  onOther,
  onReason,
  onCancel,
}: {
  cards: readonly OptionPanel[];
  panel: OptionPanel | null;
  first: string;
  phone: boolean;
  busy: boolean;
  /** The due date now, for Extend's head and its date line. */
  due: string | null;
  /** The due date the picked days give, once they are good. */
  newDue: string | null;
  /** Other's days are typed and not 1 to 3,650. */
  otherBad: boolean;
  typed: OptionsTyped;
  onToggle: (panel: OptionPanel) => void;
  onPick: (pick: ExtendPick | null) => void;
  onOther: (text: string) => void;
  onReason: (key: Reasoned, text: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const cardsRef = useRef(new Map<OptionPanel, HTMLDivElement>());
  const otherInput = useRef<HTMLInputElement>(null);
  const reveal = useRef<OptionPanel | null>(null);
  const focusOther = useRef(false);
  // An opened card comes into view, head first (a short phone pushed its head out of sight).
  useLayoutEffect(() => {
    const opened = reveal.current;
    if (opened) {
      reveal.current = null;
      cardsRef.current.get(opened)?.scrollIntoView?.({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
    }
    if (focusOther.current) {
      focusOther.current = false;
      otherInput.current?.focus();
    }
  });
  const toggle = (key: OptionPanel) => {
    if (panel !== key) reveal.current = key;
    onToggle(key);
  };
  const cancel = (
    <div className="docr-panel-foot">
      <button type="button" className="docr-textbtn" data-guard="" disabled={busy} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
  const reason = (key: Reasoned, placeholder: string, hint: string) => (
    <Field label="Reason" hint={hint}>
      {(ids) => (
        <textarea
          id={ids.input}
          aria-describedby={ids.hint}
          aria-required="true"
          maxLength={500}
          rows={2}
          placeholder={placeholder}
          value={typed[key]}
          disabled={busy}
          onChange={(event) => onReason(key, event.target.value)}
        />
      )}
    </Field>
  );
  const body = (key: OptionPanel) => {
    if (key === "extend")
      return (
        <>
          <div className="docr-field">
            <span id={`${id}-add`}>Add time</span>
            <div className="docr-seg docr-seg-fill" role="group" aria-labelledby={`${id}-add`}>
              {extendPicks.map((pick) => (
                <button
                  key={pick.value}
                  type="button"
                  aria-pressed={typed.pick === pick.value}
                  data-label={pick.label}
                  data-guard=""
                  disabled={busy}
                  onClick={() => {
                    const next = typed.pick === pick.value ? null : pick.value;
                    if (next === "other") focusOther.current = true;
                    onPick(next);
                  }}
                >
                  {pick.label}
                </button>
              ))}
            </div>
          </div>
          {typed.pick === "other" ? (
            <Field label="Days to add" hint="1 to 3,650" bad={otherBad}>
              {(ids) => (
                <input
                  ref={otherInput}
                  id={ids.input}
                  aria-describedby={ids.hint}
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  value={typed.other}
                  disabled={busy}
                  onChange={(event) => onOther(event.target.value)}
                />
              )}
            </Field>
          ) : null}
          <p className="docr-due">
            {newDue ? (
              <>
                New due date: <b>{newDue}</b>
              </>
            ) : (
              <>
                Due now: <b>{due}</b>
              </>
            )}
          </p>
          {reason("extendReason", `Why ${first} needs more time`, `${first} sees this in the document's history`)}
          {cancel}
        </>
      );
    if (key === "excuse")
      return (
        <>
          <p className="docr-info">
            <b>What happens:</b> {first} won't be asked for this document. You can ask again later.
          </p>
          {reason("excuseReason", `Why ${first} doesn't need it`, "Kept in the history")}
          {cancel}
        </>
      );
    return (
      <>
        <p className="docr-info">
          <b>What happens:</b> {first} is asked for this document again. If they still need it, the full time to send
          it starts again. A valid approved copy stays on file.
        </p>
        {reason("againReason", `Why ${first} needs it now`, "Kept in the history")}
        {cancel}
      </>
    );
  };
  const head = (key: OptionPanel): { icon: ReactNode; label: string; aside: string } =>
    key === "extend"
      ? { icon: <CalendarClock size={18} aria-hidden />, label: "Extend deadline", aside: due ? `Due ${due}` : "" }
      : key === "excuse"
        ? {
            icon: <ShieldCheck size={18} aria-hidden />,
            label: `Excuse ${first}`,
            aside: phone ? "Stop asking for it" : "Stop asking for this document",
          }
        : {
            icon: <BellRing size={18} aria-hidden />,
            label: "Ask for it again",
            aside: phone ? "Start asking for it" : "Start asking for this document",
          };
  return (
    <DrawerSection title="More options">
      <div className="docr-cards">
        {cards.map((key) => {
          const open = panel === key;
          const { icon, label, aside } = head(key);
          const panelId = `${id}-panel-${key}`;
          return (
            <div
              key={key}
              ref={(element) => {
                if (element) cardsRef.current.set(key, element);
                else cardsRef.current.delete(key);
              }}
              className={open ? "docr-card is-open" : "docr-card"}
            >
              <button
                type="button"
                className="docr-card-head"
                data-option={key}
                data-guard=""
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                disabled={busy}
                onClick={() => toggle(key)}
              >
                <span className="docr-radio" aria-hidden="true" />
                <span className="docr-card-icon">{icon}</span>
                <span className="docr-card-label">{label}</span>{" "}
                <span className="docr-card-aside">{aside}</span>
                <ChevronDown size={16} aria-hidden className="docr-card-chevron" />
              </button>
              {open ? (
                <div className="docr-panel" id={panelId} role="group" aria-label={label}>
                  {body(key)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </DrawerSection>
  );
}
