import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type {
  WeeklyCommitmentPreview,
  WeeklyPreferenceSave,
} from "@newfork/shared";
import { formatAvailabilityClock } from "./AvailabilityClockInput";

const names = {
  cover: "Cover request",
  open_pickup: "Shift pickup",
  swap: "Shift swap",
};

export function WeeklyCommitmentReview({
  items,
  timeFormat,
  onCancel,
  onContinue,
}: {
  items: WeeklyCommitmentPreview["items"];
  timeFormat: "12h" | "24h";
  onCancel: () => void;
  onContinue: (
    decisions: NonNullable<WeeklyPreferenceSave["decisions"]>,
  ) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [choices, setChoices] = useState<Record<string, "keep" | "cancel">>({});
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  const complete = items.every((item) => choices[`${item.kind}:${item.id}`]);
  return createPortal(
    <dialog
      ref={ref}
      className="weekly-preferences-panel weekly-commitment-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <header>
        <h2 id={titleId}>Review pending requests</h2>
        <button
          type="button"
          className="weekly-form-icon"
          aria-label="Close request review"
          onClick={onCancel}
        >
          <X size={18} />
        </button>
      </header>
      <p>
        Your new availability overlaps these requests. Choose which ones to keep
        before saving.
      </p>
      <div className="weekly-commitment-list">
        {items.map((item) => {
          const key = `${item.kind}:${item.id}`;
          return (
            <fieldset key={key}>
              <legend>{names[item.request_type]}</legend>
              <p>
                <time dateTime={item.date}>{item.date}</time> ·{" "}
                {item.location_name}
              </p>
              <p>
                {formatAvailabilityClock(item.start_time, timeFormat)} -{" "}
                {formatAvailabilityClock(item.end_time, timeFormat)}
              </p>
              <div className="weekly-commitment-choices">
                {(["keep", "cancel"] as const).map((action) => (
                  <label key={action}>
                    <input
                      type="radio"
                      name={key}
                      value={action}
                      checked={choices[key] === action}
                      onChange={() => setChoices({ ...choices, [key]: action })}
                    />
                    {action === "keep" ? "Keep request" : "Cancel request"}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
      <footer>
        <button type="button" onClick={onCancel}>
          Back
        </button>
        <button
          type="button"
          className="weekly-primary"
          disabled={!complete}
          onClick={() =>
            onContinue(
              items.map((item) => ({
                kind: item.kind,
                id: item.id,
                fingerprint: item.fingerprint,
                action: choices[`${item.kind}:${item.id}`]!,
              })),
            )
          }
        >
          Save availability
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}
