import { Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { scheduleModel } from "./fixtures";
import { LabBanner, useVariant, type LabSet } from "./lab";
import { ScheduleStage } from "./ScheduleStage";

export const s1Set: LabSet = {
  id: "s1",
  title: "Availability on / off while editing",
  screen: "Schedule → edit a week → the switch hides the orange marks only; red approved time off stays",
  variants: {
    a: { name: "Edit toolbar", hint: "A pressed button in the green edit toolbar, next to \"Paste mode\". It only exists while editing, like the rule it serves." },
    b: { name: "Top bar", hint: "An eye button beside \"Hide Unscheduled\" in the top bar, same size and wording." },
    c: { name: "Settings menu", hint: "A row in the top bar's Settings menu (open it), with the other show / hide choices." },
  },
};

export function S1AvailabilityToggle() {
  const variant = useVariant(s1Set);
  const [hidden, setHidden] = useState(false);
  const model = useMemo(() => scheduleModel(), []);
  const stage = useRef<HTMLElement>(null);
  const toggle = () => setHidden((value) => !value);
  return (
    <>
      <LabBanner set={s1Set} variant={variant}>
        <p>
          Orange: KadıköyGarson2 Tue after 5:00 PM and all Sat, KadıköyGarson1 Mon until 2:00 PM, KadıköyBarmen1 Fri after 6:00 PM.
          Red: KadıköyGarson1's approved time off on Thu. The orange "!" on KadıköyGarson2's Tue card belongs to a placed shift and stays.
        </p>
      </LabBanner>
      <ScheduleStage
        model={model}
        stageRef={stage}
        hideAvailability={hidden}
        banner={
          variant === "a" ? (
            <button type="button" aria-pressed={!hidden} onClick={toggle}>
              {hidden ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
              {hidden ? "Availability off" : "Availability on"}
            </button>
          ) : null
        }
      />
      {variant === "b" ? <TopBarToggle stage={stage} hidden={hidden} onToggle={toggle} /> : null}
      {variant === "c" ? <SettingsMenuToggle stage={stage} hidden={hidden} onToggle={toggle} /> : null}
    </>
  );
}

type ToggleProps = {
  readonly stage: RefObject<HTMLElement | null>;
  readonly hidden: boolean;
  readonly onToggle: () => void;
};

// Sits right after the real "Hide Unscheduled" button.
function TopBarToggle({ stage, hidden, onToggle }: ToggleProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const anchor = stage.current?.querySelector(".schedule-hide-unscheduled");
    if (!anchor) return undefined;
    const span = document.createElement("span");
    span.className = "avail-topbar-slot";
    anchor.after(span);
    setSlot(span);
    return () => span.remove();
  }, [stage]);
  if (!slot) return null;
  return createPortal(
    <button type="button" className="schedule-hide-unscheduled" aria-pressed={hidden} onClick={onToggle}>
      {hidden ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
      {hidden ? "Show Availability" : "Hide Availability"}
    </button>,
    slot,
  );
}

// Joins the real Settings panel while it is open.
function SettingsMenuToggle({ stage, hidden, onToggle }: ToggleProps) {
  const [panel, setPanel] = useState<Element | null>(null);
  useEffect(() => {
    const root = stage.current;
    if (!root) return undefined;
    const look = () => setPanel(root.querySelector(".schedule-settings-menu-panel"));
    const observer = new MutationObserver(look);
    observer.observe(root, { childList: true, subtree: true });
    look();
    return () => observer.disconnect();
  }, [stage]);
  if (!panel) return null;
  return createPortal(
    <>
      <div className="schedule-menu-separator" />
      <strong>Availability</strong>
      <button type="button" aria-pressed={!hidden} className="schedule-settings-row" data-pressed={!hidden} onClick={onToggle}>
        {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
        <span aria-hidden className="schedule-settings-row-bullet" />
        <span className="schedule-settings-row-label">{hidden ? "Show Availability" : "Hide Availability"}</span>
      </button>
    </>,
    panel,
  );
}
